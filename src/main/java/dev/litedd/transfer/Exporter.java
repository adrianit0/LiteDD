package dev.litedd.transfer;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import dev.litedd.AppInfo;
import dev.litedd.store.Store;
import dev.litedd.transfer.TransferMapper.ExportAttachment;
import dev.litedd.transfer.TransferMapper.ExportNote;
import dev.litedd.transfer.TransferMapper.NoteTagRow;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/**
 * Exportación a un ZIP legible (X-01 a X-04): manifest.json, una nota por fichero .md o .sql en
 * carpetas que reproducen el árbol, y los adjuntos. No incluye papelera, historial, pestañas,
 * valores, ajustes ni conexión.
 */
public final class Exporter {

    private static final ObjectMapper JSON = new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT);
    private static final DateTimeFormatter FILE_STAMP = DateTimeFormatter.ofPattern("yyyyMMdd-HHmm");
    private static final int MAX_SLUG = 60;

    private final Store store;
    private final Clock clock;

    public Exporter(Store store, Clock clock) {
        this.store = store;
        this.clock = clock;
    }

    /** X-01: litedd-export-AAAAMMDD-HHmm.zip */
    public static String fileName(Clock clock) {
        return "litedd-export-" + LocalDateTime.now(clock).format(FILE_STAMP) + ".zip";
    }

    public byte[] export() {
        record Data(List<ExportNote> notes, List<NoteTagRow> tags, List<ExportAttachment> attachments) {
        }
        Data data = store.read(s -> {
            TransferMapper m = s.getMapper(TransferMapper.class);
            return new Data(m.selectActiveNotes(), m.selectActiveTags(), m.selectActiveAttachments());
        });

        Map<String, List<String>> tags = new HashMap<>();
        data.tags().forEach(t -> tags.computeIfAbsent(t.noteId(), k -> new ArrayList<>()).add(t.name()));
        Map<String, List<ExportNote>> children = new HashMap<>();
        data.notes().forEach(n -> children.computeIfAbsent(n.parentId(), k -> new ArrayList<>()).add(n));
        children.values().forEach(list -> list.sort(Comparator.comparingInt(ExportNote::position)));

        Map<String, String> files = new HashMap<>();
        assignFiles(children, null, "notes/", files);

        List<Manifest.Note> manifestNotes = new ArrayList<>();
        for (ExportNote n : data.notes()) {
            manifestNotes.add(new Manifest.Note(n.id(), n.parentId(), n.position(), n.type(), n.title(), n.description(),
                    tags.getOrDefault(n.id(), List.of()), n.favorite(), n.createdAt(), n.updatedAt(), files.get(n.id())));
        }
        List<Manifest.Attachment> manifestAttachments = new ArrayList<>();
        for (ExportAttachment a : data.attachments()) {
            manifestAttachments.add(new Manifest.Attachment(a.id(), a.noteId(), a.name(), a.mime(), attachmentFile(a.id(), a.mime())));
        }
        Manifest manifest = new Manifest(Manifest.FORMAT_VERSION, AppInfo.VERSION,
                clock.instant().truncatedTo(ChronoUnit.SECONDS).toString(), manifestNotes, manifestAttachments);

        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(bytes, StandardCharsets.UTF_8)) {
            put(zip, "manifest.json", JSON.writeValueAsBytes(manifest));
            for (ExportNote n : data.notes()) {
                // X-03: el contenido idéntico al de la nota, sin cabeceras.
                put(zip, files.get(n.id()), n.content().getBytes(StandardCharsets.UTF_8));
            }
            for (ExportAttachment a : data.attachments()) {
                put(zip, attachmentFile(a.id(), a.mime()), a.data());
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return bytes.toByteArray();
    }

    /** X-03: posición con dos cifras (o más) y el título saneado; las hijas en una carpeta con el mismo nombre. */
    private static void assignFiles(Map<String, List<ExportNote>> children, String parentId, String folder, Map<String, String> files) {
        List<ExportNote> kids = children.getOrDefault(parentId, List.of());
        int width = Math.max(2, String.valueOf(kids.size()).length());
        for (int i = 0; i < kids.size(); i++) {
            ExportNote n = kids.get(i);
            String base = String.format("%0" + width + "d", i + 1) + "-" + slug(n.title());
            files.put(n.id(), folder + base + "." + n.type());
            assignFiles(children, n.id(), folder + base + "/", files);
        }
    }

    /** T-47: sin acentos, en minúsculas, con guiones; «nota» si se queda vacío. */
    static String slug(String title) {
        String plain = Normalizer.normalize(title, Normalizer.Form.NFD).replaceAll("\\p{M}+", "");
        String s = plain.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("^-+|-+$", "");
        if (s.length() > MAX_SLUG) {
            s = s.substring(0, MAX_SLUG).replaceAll("-+$", "");
        }
        return s.isEmpty() ? "nota" : s;
    }

    static String attachmentFile(String id, String mime) {
        String ext = switch (mime) {
            case "image/jpeg" -> "jpg";
            case "image/gif" -> "gif";
            case "image/webp" -> "webp";
            default -> "png";
        };
        return "attachments/" + id + "." + ext;
    }

    private static void put(ZipOutputStream zip, String name, byte[] data) throws IOException {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(data);
        zip.closeEntry();
    }
}
