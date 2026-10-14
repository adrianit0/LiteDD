package dev.litedd.notes;

import dev.litedd.http.ApiError;
import dev.litedd.notes.NoteMapper.NoteRow;
import dev.litedd.notes.NoteMapper.StatementRow;
import dev.litedd.sqlengine.MapperSource;
import dev.litedd.sqlengine.MapperSource.Library;
import dev.litedd.sqlengine.MapperSource.MapperFile;
import dev.litedd.sqlengine.MapperSource.ParsedMapper;
import dev.litedd.store.Store;
import org.apache.ibatis.session.SqlSession;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Operaciones sobre notas y árbol. Cada operación va en una transacción (D-03). */
public final class NoteService {

    public static final String DEFAULT_TITLE = "Sin título";
    /** N-07 */
    public static final int DESCRIPTION_MAX = 200;
    private static final String XML = "xml";
    private static final Set<String> TYPES = Set.of("md", "sql", "http", XML);

    /** N-44 */
    static final int VERSIONS_KEPT = 20;
    static final Duration VERSION_INTERVAL = Duration.ofMinutes(5);
    private static final Pattern SEARCH_WORD = Pattern.compile("[\\p{L}\\p{N}_]+");

    /**
     * N-70, N-72. text vacío busca solo por filtros.
     *
     * @param since fecha ISO-8601 UTC mínima de modificación, o null
     */
    public record SearchQuery(String text, String type, List<String> tags, boolean favorite, String since) {

        public static SearchQuery text(String text) {
            return new SearchQuery(text, null, List.of(), false, null);
        }
    }

    /** @param fragment y titleMarked con lo encontrado entre \u0002 y \u0003 (N-71) */
    public record SearchHit(String id, String parentId, String type, String title, boolean favorite, String updatedAt,
                            String fragment, String titleMarked) {
    }

    public record TagCount(String name, int count) {
    }

    private final Store store;
    private final Clock clock;

    public NoteService(Store store) {
        this(store, Clock.systemUTC());
    }

    public NoteService(Store store, Clock clock) {
        this.store = store;
        this.clock = clock;
    }

    public List<TreeNode> tree() {
        return store.read(s -> s.getMapper(NoteMapper.class).selectTree().stream()
                .map(r -> new TreeNode(r.id(), r.parentId(), r.position(), r.type(), r.title(), r.description(), r.favorite(),
                        r.tags() == null ? List.of() : Arrays.asList(r.tags().split(NoteMapper.TAG_SEPARATOR)),
                        r.statementId(), r.statementKind()))
                .toList());
    }

    public Note get(String id) {
        return store.read(s -> load(s, id));
    }

    /** N-05, N-06: la nota nueva va al final de sus hermanas. */
    public Note create(String parentId, String type, String title) {
        if (type == null || !TYPES.contains(type)) {
            throw new ApiError(400, "invalid_type", "Tipo de nota no válido: debe ser «md», «sql», «http» o «xml»");
        }
        String finalTitle = title == null || title.isBlank() ? DEFAULT_TITLE : title.strip();
        return store.write(s -> {
            NoteMapper m = s.getMapper(NoteMapper.class);
            if (parentId != null) {
                NoteRow parent = m.selectActive(parentId);
                if (parent == null) {
                    throw notFound();
                }
                rejectChildrenOf(parent);
            }
            String now = now();
            NoteRow row = new NoteRow(UUID.randomUUID().toString(), parentId, m.countChildren(parentId), type,
                    finalTitle, "", "", false, 1, now, now, null, null);
            m.insert(row);
            return load(s, row.id());
        });
    }

    /** N-40, N-42: guarda título y contenido si la versión de partida sigue vigente. */
    public Note save(String id, String title, String content, long baseVersion) {
        return save(id, title, null, content, baseVersion, false);
    }

    /**
     * N-44: con snapshot (al salir del modo edición) se guarda una versión si algo cambió; sin él, como
     * mucho una cada 5 minutos.
     */
    public Note save(String id, String title, String content, long baseVersion, boolean snapshot) {
        return save(id, title, null, content, baseVersion, snapshot);
    }

    /** N-07: description null conserva la descripción actual. */
    public Note save(String id, String title, String description, String content, long baseVersion, boolean snapshot) {
        if (title == null || title.isBlank()) {
            throw new ApiError(400, "invalid_title", "El título no puede estar vacío");
        }
        String finalContent = content == null ? "" : content;
        String newDescription = description == null ? null : description.strip();
        if (newDescription != null && newDescription.length() > DESCRIPTION_MAX) {
            throw new ApiError(400, "invalid_description",
                    "La descripción no puede tener más de " + DESCRIPTION_MAX + " caracteres");
        }
        return store.write(s -> {
            Note current = load(s, id);
            rejectGenerated(current);
            String finalDescription = newDescription == null ? current.description() : newDescription;
            // Sin cambios no se toca la nota: así un snapshot al salir de edición no altera la versión.
            boolean unchanged = current.version() == baseVersion && current.title().equals(title.strip())
                    && current.description().equals(finalDescription) && current.content().equals(finalContent);
            if (!unchanged) {
                update(s, id, title.strip(), finalDescription, finalContent, baseVersion);
            }
            Note saved = unchanged ? current : load(s, id);
            if (!unchanged) {
                syncMappers(s, saved.type());
            }
            recordVersion(s, saved, snapshot);
            return saved;
        });
    }

    /** M-05: los fragmentos de las notas XML activas, sin la nota indicada (la que se analiza). */
    public Library mapperLibrary(String excludeId) {
        return store.read(s -> Library.of(s.getMapper(NoteMapper.class).selectMapperFiles()).without(excludeId));
    }

    /**
     * M-16: si cambia una nota XML, se regeneran las hijas de todas las notas XML activas, porque pueden usar sus
     * fragmentos. Cada nota se analiza una sola vez para la biblioteca.
     */
    private void syncMappers(SqlSession s, String changedType) {
        if (!XML.equals(changedType)) {
            return;
        }
        List<MapperFile> files = s.getMapper(NoteMapper.class).selectMapperFiles();
        Library library = Library.of(files);
        for (MapperFile f : files) {
            syncStatements(s, f.noteId(), f.content(), library.without(f.noteId()));
        }
    }

    /**
     * M-10 a M-13: una hija SQL por sentencia del mapper, emparejadas por id de sentencia. Con errores, las
     * hijas no se tocan.
     */
    private void syncStatements(SqlSession s, String noteId, String content, Library others) {
        ParsedMapper mapper = MapperSource.parse(content, others);
        if (!mapper.valid()) {
            return;
        }
        NoteMapper m = s.getMapper(NoteMapper.class);
        Map<String, StatementRow> existing = new LinkedHashMap<>();
        m.selectStatementChildren(noteId).forEach(r -> existing.put(r.statementId(), r));
        Set<String> current = new HashSet<>();
        mapper.statements().forEach(st -> current.add(st.id()));
        // ADR-0023: las hijas de sentencias que ya no están se borran definitivamente.
        existing.values().stream().filter(r -> !current.contains(r.statementId())).forEach(r -> m.deleteStatement(r.id()));
        String now = now();
        List<MapperSource.Statement> statements = mapper.statements();
        for (int i = 0; i < statements.size(); i++) {
            MapperSource.Statement st = statements.get(i);
            StatementRow row = existing.get(st.id());
            if (row == null) {
                m.insert(new NoteRow(UUID.randomUUID().toString(), noteId, i, "sql", st.id(), "", st.body(), false, 1, now,
                        now, st.id(), st.kind()));
                continue;
            }
            if (!row.content().equals(st.body()) || !row.statementKind().equals(st.kind())) {
                m.updateStatement(row.id(), st.kind(), st.body(), now);
            }
            m.setPosition(row.id(), i);
        }
    }

    /** M-20: las hijas generadas no se editan, no se mueven y no se eliminan. */
    private static void rejectGenerated(Note note) {
        if (note.generated()) {
            throw new ApiError(409, "generated_note",
                    "Esta nota se genera desde su nota XML MyBatis. Para cambiarla, edita la sentencia en el mapper.");
        }
    }

    /** M-20, M-22: ni la nota XML ni sus hijas admiten otras hijas. */
    private static void rejectChildrenOf(NoteRow parent) {
        if (XML.equals(parent.type())) {
            throw new ApiError(409, "xml_children", "Una nota XML MyBatis solo tiene como hijas las sentencias de su mapper");
        }
        if (parent.statementId() != null) {
            throw new ApiError(409, "generated_children", "Una sentencia generada no admite hijas");
        }
    }

    public List<NoteVersion> versions(String id) {
        return store.read(s -> {
            load(s, id);
            return s.getMapper(ContentMapper.class).selectVersions(id);
        });
    }

    /** N-45: restaura una versión; la actual se guarda antes como versión. */
    public Note restoreVersion(String id, long versionId, long baseVersion) {
        return store.write(s -> {
            ContentMapper c = s.getMapper(ContentMapper.class);
            NoteVersion v = c.selectVersion(id, versionId);
            if (v == null) {
                throw new ApiError(404, "not_found", "La versión no existe");
            }
            Note current = load(s, id);
            rejectGenerated(current);
            recordVersion(s, current, true);
            // El historial guarda título y contenido; la descripción no cambia (ADR-0020).
            update(s, id, v.title(), current.description(), v.content(), baseVersion);
            Note restored = load(s, id);
            syncMappers(s, restored.type()); // M-14, M-16
            return restored;
        });
    }

    private void update(SqlSession s, String id, String title, String description, String content, long baseVersion) {
        int updated = s.getMapper(NoteMapper.class).updateContent(id, title, description, content, baseVersion, now());
        if (updated == 0) {
            Note current = load(s, id);
            throw new ApiError(409, "conflict", "La nota ha cambiado desde que se abrió. Recárgala o sobrescríbela.", current);
        }
    }

    private void recordVersion(SqlSession s, Note note, boolean snapshot) {
        ContentMapper c = s.getMapper(ContentMapper.class);
        NoteVersion latest = c.selectLatestVersion(note.id());
        if (latest != null && latest.title().equals(note.title()) && latest.content().equals(note.content())) {
            return;
        }
        boolean due = latest == null
                || !Instant.parse(latest.savedAt()).plus(VERSION_INTERVAL).isAfter(clock.instant());
        if (snapshot || due) {
            c.insertVersion(note.id(), note.title(), note.content(), now());
            c.pruneVersions(note.id(), VERSIONS_KEPT);
        }
    }

    /** N-70 a N-74 */
    public List<SearchHit> search(SearchQuery q) {
        String match = null;
        if (q.text() != null && !q.text().isBlank()) {
            // N-74: solo letras y números, cada palabra entre comillas y por prefijo.
            List<String> words = new ArrayList<>();
            Matcher m = SEARCH_WORD.matcher(q.text());
            while (m.find()) {
                words.add("\"" + m.group() + "\"*");
            }
            if (words.isEmpty()) {
                return List.of();
            }
            match = String.join(" ", words);
        }
        Map<String, String> tags = new LinkedHashMap<>();
        for (String t : q.tags() == null ? List.<String>of() : q.tags()) {
            if (!t.isBlank()) {
                tags.putIfAbsent(t.strip().toLowerCase(Locale.ROOT), t.strip());
            }
        }
        String finalMatch = match;
        String type = q.type() == null || q.type().isBlank() ? null : q.type();
        return store.read(s -> s.getMapper(ContentMapper.class).search(finalMatch, type, q.favorite(),
                q.since() == null || q.since().isBlank() ? null : q.since(), List.copyOf(tags.values()), tags.size()));
    }

    private static final Pattern COPY_SUFFIX = Pattern.compile("^(.*?) \\((\\d+)\\)$");

    /**
     * N-08: copia la nota (sin hijas) justo debajo de la original, con su contenido, descripción, tipo,
     * etiquetas y favorita, y el título con el siguiente «(n)» libre entre sus hermanas. M-31: la copia de una
     * nota XML genera sus propias hijas; la de una hija es una nota SQL normal, justo debajo de la nota XML.
     */
    public Note duplicate(String id) {
        return store.write(s -> {
            NoteMapper m = s.getMapper(NoteMapper.class);
            Note original = load(s, id);
            // La copia de una hija no puede quedarse dentro de la nota XML: va tras ella.
            Note anchor = original.generated() ? load(s, original.parentId()) : original;
            List<String> siblings = new ArrayList<>(m.selectChildIds(anchor.parentId()));
            String now = now();
            NoteRow copy = new NoteRow(UUID.randomUUID().toString(), anchor.parentId(), anchor.position() + 1,
                    original.type(), copyTitle(original.title(), m.selectChildTitles(anchor.parentId())),
                    original.description(), original.content(), original.favorite(), 1, now, now, null, null);
            m.insert(copy);
            siblings.add(siblings.indexOf(anchor.id()) + 1, copy.id());
            renumber(m, siblings);
            ContentMapper c = s.getMapper(ContentMapper.class);
            for (String tag : original.tags()) {
                c.insertNoteTag(copy.id(), c.selectTagId(tag));
            }
            Note created = load(s, copy.id());
            syncMappers(s, created.type());
            return created;
        });
    }

    /**
     * N-08: «Informe» → «Informe (2)»; el número es el mayor de las hermanas con ese nombre, más uno. Un
     * «(n)» final solo cuenta como copia si hay una hermana con el nombre base: «Año (2026)» → «Año (2026) (2)».
     */
    static String copyTitle(String title, List<String> siblingTitles) {
        Matcher own = COPY_SUFFIX.matcher(title);
        String base = own.matches() && siblingTitles.contains(own.group(1)) ? own.group(1) : title;
        int highest = 1;
        for (String t : siblingTitles) {
            Matcher other = COPY_SUFFIX.matcher(t);
            if (other.matches() && other.group(1).equals(base)) {
                try {
                    highest = Math.max(highest, Integer.parseInt(other.group(2)));
                } catch (NumberFormatException e) {
                    // Un número enorme no cuenta.
                }
            }
        }
        return base + " (" + (highest + 1) + ")";
    }

    /** N-80: sustituye las etiquetas; se crean al usarlas y desaparecen sin notas. */
    public Note setTags(String id, List<String> names) {
        Map<String, String> clean = new LinkedHashMap<>();
        for (String n : names == null ? List.<String>of() : names) {
            String t = n == null ? "" : n.strip();
            if (t.length() > 50) {
                throw new ApiError(400, "invalid_tag", "Una etiqueta no puede tener más de 50 caracteres");
            }
            if (!t.isEmpty()) {
                clean.putIfAbsent(t.toLowerCase(Locale.ROOT), t);
            }
        }
        return store.write(s -> {
            load(s, id);
            ContentMapper c = s.getMapper(ContentMapper.class);
            c.deleteNoteTags(id);
            for (String name : clean.values()) {
                c.insertTag(name);
                c.insertNoteTag(id, c.selectTagId(name));
            }
            c.deleteOrphanTags();
            return load(s, id);
        });
    }

    public List<TagCount> tags() {
        return store.read(s -> s.getMapper(ContentMapper.class).selectTags());
    }

    /** N-81 */
    public Note setFavorite(String id, boolean favorite) {
        return store.write(s -> {
            if (s.getMapper(ContentMapper.class).updateFavorite(id, favorite) == 0) {
                throw notFound();
            }
            return load(s, id);
        });
    }

    /**
     * N-60, N-61: mueve la nota con su descendencia. position es el índice entre las nuevas hermanas,
     * sin contar la propia nota; se ajusta al final si es mayor.
     */
    public Note move(String id, String parentId, int position) {
        return store.write(s -> {
            NoteMapper m = s.getMapper(NoteMapper.class);
            NoteRow note = m.selectActive(id);
            if (note == null) {
                throw notFound();
            }
            if (note.statementId() != null) {
                throw new ApiError(409, "generated_note", "Una sentencia generada no se mueve: va siempre con su nota XML MyBatis");
            }
            if (parentId != null) {
                NoteRow parent = m.selectActive(parentId);
                if (parent == null) {
                    throw new ApiError(404, "not_found", "La nota de destino no existe");
                }
                rejectChildrenOf(parent);
                // D-05, N-62: ni sobre sí misma ni sobre una descendiente.
                if (m.countInAncestry(id, parentId) > 0) {
                    throw new ApiError(409, "cycle",
                            "No se puede mover una nota dentro de sí misma ni de una de sus descendientes");
                }
            }
            List<String> siblings = new ArrayList<>(m.selectChildIds(parentId));
            siblings.remove(id);
            siblings.add(Math.max(0, Math.min(position, siblings.size())), id);
            m.place(id, parentId, 0);
            renumber(m, siblings);
            if (!sameParent(note.parentId(), parentId)) {
                renumber(m, m.selectChildIds(note.parentId()));
            }
            return load(s, id);
        });
    }

    /** N-50, N-51: a la papelera; con hijas, solo si se suben un nivel (promote). M-30: la nota XML, con sus hijas. */
    public void delete(String id, boolean promoteChildren) {
        store.write(s -> {
            NoteMapper m = s.getMapper(NoteMapper.class);
            NoteRow note = m.selectActive(id);
            if (note == null) {
                throw notFound();
            }
            if (note.statementId() != null) {
                throw new ApiError(409, "generated_note",
                        "Una sentencia generada no se elimina: quítala del mapper de su nota XML MyBatis");
            }
            String now = now();
            if (XML.equals(note.type())) {
                m.deleteStatementTabs(id);
                m.markStatementsDeleted(id, now);
            }
            List<String> children = m.selectChildIds(id);
            if (!children.isEmpty() && !promoteChildren) {
                throw new ApiError(409, "has_children",
                        "La nota tiene hijas. Súbelas un nivel para poder eliminarla.", children.size());
            }
            // Las hijas ocupan el lugar de la nota, en su mismo orden.
            List<String> siblings = new ArrayList<>(m.selectChildIds(note.parentId()));
            int at = siblings.indexOf(id);
            siblings.remove(at);
            siblings.addAll(at, children);
            for (String child : children) {
                m.place(child, note.parentId(), 0);
            }
            m.markDeleted(id, now);
            m.deleteTabs(id);
            renumber(m, siblings);
            syncMappers(s, note.type()); // M-16
            return null;
        });
    }

    public List<TrashItem> trash() {
        return store.read(s -> s.getMapper(NoteMapper.class).selectTrash());
    }

    /** N-53: vuelve a su madre, al final; a la raíz si la madre ya no está activa. */
    public Note restore(String id) {
        return store.write(s -> {
            NoteMapper m = s.getMapper(NoteMapper.class);
            if (m.countTrashed(id) == 0 || m.countStatement(id) > 0) {
                throw new ApiError(404, "not_found", "La nota no está en la papelera");
            }
            String parent = m.selectTrashedParent(id);
            if (parent != null && m.selectActive(parent) == null) {
                parent = null;
            }
            m.markRestored(id, parent, m.countChildren(parent));
            // M-30: la nota XML vuelve con sus hijas.
            m.markStatementsRestored(id);
            Note restored = load(s, id);
            syncMappers(s, restored.type());
            return restored;
        });
    }

    /** N-55: eliminación definitiva; historial, variables y pestañas caen en cascada. */
    public void purge(String id) {
        store.write(s -> {
            NoteMapper m = s.getMapper(NoteMapper.class);
            if (m.countStatement(id) > 0) {
                throw new ApiError(404, "not_found", "La nota no está en la papelera");
            }
            // M-30: las hijas de una nota XML se borran con ella.
            if (m.countTrashed(id) > 0) {
                m.deleteStatements(id);
            }
            m.detachTrashedChildren(id);
            if (m.deleteTrashed(id) == 0) {
                throw new ApiError(404, "not_found", "La nota no está en la papelera");
            }
            s.getMapper(ContentMapper.class).deleteOrphanTags();
            return null;
        });
    }

    /** N-52: vaciar la papelera. */
    public void emptyTrash() {
        store.write(s -> {
            NoteMapper m = s.getMapper(NoteMapper.class);
            m.detachAllTrashedChildren();
            m.deleteAllTrashed();
            s.getMapper(ContentMapper.class).deleteOrphanTags();
            return null;
        });
    }

    /** N-55: se ejecuta al arrancar. */
    public int purgeOrphanAttachments() {
        return store.write(s -> s.getMapper(NoteMapper.class).deleteOrphanAttachments());
    }

    /** D-03: posiciones contiguas desde 0 en el orden dado. */
    private static void renumber(NoteMapper m, List<String> orderedIds) {
        for (int i = 0; i < orderedIds.size(); i++) {
            m.setPosition(orderedIds.get(i), i);
        }
    }

    private static boolean sameParent(String a, String b) {
        return a == null ? b == null : a.equals(b);
    }

    private static Note load(SqlSession s, String id) {
        NoteMapper m = s.getMapper(NoteMapper.class);
        NoteRow r = m.selectActive(id);
        if (r == null) {
            throw notFound();
        }
        return new Note(r.id(), r.parentId(), r.position(), r.type(), r.title(), r.description(), r.content(), r.favorite(),
                r.version(), r.createdAt(), r.updatedAt(), m.selectTags(id), r.statementId(), r.statementKind());
    }

    private static ApiError notFound() {
        return new ApiError(404, "not_found", "La nota no existe");
    }

    private String now() {
        return clock.instant().truncatedTo(ChronoUnit.MILLIS).toString();
    }
}
