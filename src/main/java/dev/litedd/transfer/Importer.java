package dev.litedd.transfer;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.litedd.http.ApiError;
import dev.litedd.notes.AttachmentMapper;
import dev.litedd.notes.AttachmentsApi;
import dev.litedd.notes.ContentMapper;
import dev.litedd.notes.NoteMapper;
import dev.litedd.notes.NoteMapper.NoteRow;
import dev.litedd.notes.NoteService;
import dev.litedd.store.Store;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Importación del ZIP (X-05 a X-07). Todo se valida antes de tocar nada (X-06) y la importación va
 * en una transacción. El manifiesto manda sobre el árbol de carpetas (X-07).
 */
public final class Importer {

    public enum Mode {
        /** Reemplazar todo, con copia previa. */
        REPLACE,
        /** Añadir como rama bajo una nota raíz nueva. */
        BRANCH
    }

    /** @param rootId nota raíz creada en modo rama; null al reemplazar */
    public record ImportResult(int notes, int attachments, String rootId) {
    }

    /** X-06 */
    public static final long MAX_BYTES = 500L * 1024 * 1024;

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final DateTimeFormatter ROOT_STAMP = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
    private static final Pattern LINK = Pattern.compile("litedd://(note|attachment)/([0-9A-Za-z-]+)");

    private final Store store;
    private final Backups backups;
    private final Clock clock;
    private final long maxBytes;

    public Importer(Store store, Backups backups, Clock clock, long maxBytes) {
        this.store = store;
        this.backups = backups;
        this.clock = clock;
        this.maxBytes = maxBytes;
    }

    public ImportResult importZip(InputStream in, Mode mode) {
        Map<String, byte[]> entries = read(in);
        Manifest manifest = validate(entries);
        if (mode == Mode.REPLACE) {
            // X-05, X-09: copia antes de reemplazar.
            backups.preReplace();
        }
        return store.write(s -> {
            NoteMapper notes = s.getMapper(NoteMapper.class);
            ContentMapper content = s.getMapper(ContentMapper.class);
            AttachmentMapper attachments = s.getMapper(AttachmentMapper.class);
            String now = clock.instant().truncatedTo(ChronoUnit.MILLIS).toString();

            Map<String, String> noteIds = new HashMap<>();
            Map<String, String> attachmentIds = new HashMap<>();
            String rootId = null;
            if (mode == Mode.REPLACE) {
                wipe(s.getMapper(TransferMapper.class));
                manifest.notes().forEach(n -> noteIds.put(n.id(), n.id()));
                safeList(manifest.attachments()).forEach(a -> attachmentIds.put(a.id(), a.id()));
            } else {
                manifest.notes().forEach(n -> noteIds.put(n.id(), UUID.randomUUID().toString()));
                safeList(manifest.attachments()).forEach(a -> attachmentIds.put(a.id(), UUID.randomUUID().toString()));
                rootId = UUID.randomUUID().toString();
                String title = "Importado " + LocalDateTime.now(clock).format(ROOT_STAMP);
                notes.insert(new NoteRow(rootId, null, notes.countChildren(null), "md", title, "", "", false, 1, now, now));
            }

            // Por niveles: una nota se inserta después de su madre (clave foránea).
            Map<String, List<Manifest.Note>> children = new HashMap<>();
            manifest.notes().forEach(n -> children.computeIfAbsent(n.parentId(), k -> new ArrayList<>()).add(n));
            children.values().forEach(list -> list.sort(Comparator.comparingInt(Manifest.Note::position)));
            Deque<String> parents = new ArrayDeque<>();
            parents.add("");
            while (!parents.isEmpty()) {
                String parent = parents.poll();
                List<Manifest.Note> kids = children.getOrDefault(parent.isEmpty() ? null : parent, List.of());
                for (int i = 0; i < kids.size(); i++) {
                    Manifest.Note n = kids.get(i);
                    String id = noteIds.get(n.id());
                    String parentId = n.parentId() == null ? rootId : noteIds.get(n.parentId());
                    String text = new String(entries.get(n.file()), StandardCharsets.UTF_8);
                    if (mode == Mode.BRANCH) {
                        text = relink(text, noteIds, attachmentIds);
                    }
                    notes.insert(new NoteRow(id, parentId, i, n.type(), n.title().strip(), description(n), text, n.favorite(), 1,
                            orNow(n.createdAt(), now), orNow(n.updatedAt(), now)));
                    for (String tag : tags(n.tags())) {
                        content.insertTag(tag);
                        content.insertNoteTag(id, content.selectTagId(tag));
                    }
                    parents.add(n.id());
                }
            }
            for (Manifest.Attachment a : safeList(manifest.attachments())) {
                byte[] data = entries.get(a.file());
                String noteId = a.noteId() == null ? null : noteIds.get(a.noteId());
                attachments.insert(attachmentIds.get(a.id()), noteId, a.name(), AttachmentsApi.detect(data), data, now);
            }
            return new ImportResult(manifest.notes().size(), safeList(manifest.attachments()).size(), rootId);
        });
    }

    private static void wipe(TransferMapper m) {
        m.deleteVersions();
        m.deleteVariableValues();
        m.deleteTabs();
        m.deleteNoteTags();
        m.deleteTags();
        m.deleteAttachments();
        m.deleteNotes();
    }

    /** X-05: enlaces e imágenes apuntan a los identificadores nuevos. */
    private static String relink(String text, Map<String, String> noteIds, Map<String, String> attachmentIds) {
        Matcher m = LINK.matcher(text);
        StringBuilder out = new StringBuilder();
        while (m.find()) {
            Map<String, String> ids = m.group(1).equals("note") ? noteIds : attachmentIds;
            String replacement = ids.containsKey(m.group(2)) ? "litedd://" + m.group(1) + "/" + ids.get(m.group(2)) : m.group();
            m.appendReplacement(out, Matcher.quoteReplacement(replacement));
        }
        m.appendTail(out);
        return out.toString();
    }

    /** Lee el ZIP en memoria con el límite de tamaño y rechaza rutas peligrosas (X-06, T-46). */
    private Map<String, byte[]> read(InputStream in) {
        Map<String, byte[]> entries = new LinkedHashMap<>();
        long total = 0;
        byte[] buffer = new byte[64 * 1024];
        try (ZipInputStream zip = new ZipInputStream(in, StandardCharsets.UTF_8)) {
            for (ZipEntry e = zip.getNextEntry(); e != null; e = zip.getNextEntry()) {
                checkPath(e.getName());
                if (e.isDirectory()) {
                    continue;
                }
                java.io.ByteArrayOutputStream data = new java.io.ByteArrayOutputStream();
                for (int n = zip.read(buffer); n > 0; n = zip.read(buffer)) {
                    total += n;
                    if (total > maxBytes) {
                        throw new ApiError(413, "too_large", "El archivo supera el tamaño máximo de 500 MB");
                    }
                    data.write(buffer, 0, n);
                }
                entries.put(e.getName(), data.toByteArray());
            }
        } catch (IOException e) {
            throw new ApiError(400, "invalid_archive", "El archivo no es un ZIP válido: " + e.getMessage());
        }
        if (entries.isEmpty()) {
            throw new ApiError(400, "invalid_archive", "El archivo no es un ZIP válido o está vacío");
        }
        return entries;
    }

    private static void checkPath(String path) {
        if (path == null || path.isBlank() || path.startsWith("/") || path.startsWith("\\") || path.contains("\\")
                || path.matches("^[A-Za-z]:.*") || List.of(path.split("/")).contains("..")) {
            throw new ApiError(400, "unsafe_path", "Ruta no permitida en el archivo: " + path);
        }
    }

    private static Manifest validate(Map<String, byte[]> entries) {
        byte[] raw = entries.get("manifest.json");
        if (raw == null) {
            throw new ApiError(400, "invalid_archive", "Falta manifest.json en el archivo");
        }
        Manifest manifest;
        try {
            manifest = JSON.readValue(raw, Manifest.class);
        } catch (IOException e) {
            throw new ApiError(400, "invalid_manifest", "manifest.json no es válido: " + e.getMessage());
        }
        if (manifest.formatVersion() != Manifest.FORMAT_VERSION) {
            throw new ApiError(400, "unsupported_version", "La versión del formato no está admitida: " + manifest.formatVersion());
        }
        if (manifest.notes() == null) {
            throw new ApiError(400, "invalid_manifest", "manifest.json no tiene la lista de notas");
        }
        Set<String> ids = new HashSet<>();
        for (Manifest.Note n : manifest.notes()) {
            if (n.id() == null || n.id().isBlank() || !ids.add(n.id())) {
                throw new ApiError(400, "invalid_manifest", "Identificador de nota ausente o repetido: " + n.id());
            }
            if (!"md".equals(n.type()) && !"sql".equals(n.type())) {
                throw new ApiError(400, "invalid_manifest", "Tipo de nota no válido en «" + n.title() + "»");
            }
            if (n.title() == null || n.title().isBlank()) {
                throw new ApiError(400, "invalid_manifest", "Una nota no tiene título: " + n.id());
            }
            requireFile(entries, n.file());
        }
        Map<String, String> parents = new HashMap<>();
        for (Manifest.Note n : manifest.notes()) {
            if (n.parentId() != null && !ids.contains(n.parentId())) {
                throw new ApiError(400, "invalid_manifest", "La madre de «" + n.title() + "» no está en el archivo");
            }
            parents.put(n.id(), n.parentId());
        }
        for (String id : ids) {
            // D-05: ninguna nota puede ser descendiente de sí misma.
            Set<String> seen = new HashSet<>();
            for (String p = id; p != null; p = parents.get(p)) {
                if (!seen.add(p)) {
                    throw new ApiError(400, "invalid_manifest", "El árbol del archivo tiene un ciclo");
                }
            }
        }
        for (Manifest.Attachment a : safeList(manifest.attachments())) {
            requireFile(entries, a.file());
            if (AttachmentsApi.detect(entries.get(a.file())) == null) {
                throw new ApiError(400, "invalid_manifest", "El adjunto " + a.file() + " no es una imagen admitida");
            }
        }
        return manifest;
    }

    private static void requireFile(Map<String, byte[]> entries, String file) {
        if (file == null) {
            throw new ApiError(400, "invalid_manifest", "Falta la ruta de un fichero en manifest.json");
        }
        checkPath(file);
        if (!entries.containsKey(file)) {
            throw new ApiError(400, "missing_file", "Falta en el archivo el fichero " + file);
        }
    }

    private static List<String> tags(List<String> raw) {
        Map<String, String> clean = new LinkedHashMap<>();
        for (String t : safeList(raw)) {
            if (t != null && !t.isBlank()) {
                clean.putIfAbsent(t.strip().toLowerCase(), t.strip());
            }
        }
        return new ArrayList<>(clean.values());
    }

    /** N-07: los archivos anteriores no traen descripción. */
    private static String description(Manifest.Note n) {
        if (n.description() == null) {
            return "";
        }
        String d = n.description().strip();
        return d.length() > NoteService.DESCRIPTION_MAX ? d.substring(0, NoteService.DESCRIPTION_MAX) : d;
    }

    private static String orNow(String iso, String now) {
        try {
            return iso == null ? now : Instant.parse(iso).toString();
        } catch (RuntimeException e) {
            return now;
        }
    }

    private static <T> List<T> safeList(List<T> list) {
        return list == null ? List.of() : list;
    }
}
