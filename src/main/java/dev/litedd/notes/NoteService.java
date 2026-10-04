package dev.litedd.notes;

import dev.litedd.http.ApiError;
import dev.litedd.notes.NoteMapper.NoteRow;
import dev.litedd.store.Store;
import org.apache.ibatis.session.SqlSession;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/** Operaciones sobre notas y árbol. Cada operación va en una transacción (D-03). */
public final class NoteService {

    public static final String DEFAULT_TITLE = "Sin título";
    private static final Set<String> TYPES = Set.of("md", "sql");

    private final Store store;

    public NoteService(Store store) {
        this.store = store;
    }

    public List<TreeNode> tree() {
        return store.read(s -> s.getMapper(NoteMapper.class).selectTree().stream()
                .map(r -> new TreeNode(r.id(), r.parentId(), r.position(), r.type(), r.title(), r.favorite(),
                        r.tags() == null ? List.of() : Arrays.asList(r.tags().split(NoteMapper.TAG_SEPARATOR))))
                .toList());
    }

    public Note get(String id) {
        return store.read(s -> load(s, id));
    }

    /** N-05, N-06: la nota nueva va al final de sus hermanas. */
    public Note create(String parentId, String type, String title) {
        if (type == null || !TYPES.contains(type)) {
            throw new ApiError(400, "invalid_type", "Tipo de nota no válido: debe ser «md» o «sql»");
        }
        String finalTitle = title == null || title.isBlank() ? DEFAULT_TITLE : title.strip();
        return store.write(s -> {
            NoteMapper m = s.getMapper(NoteMapper.class);
            if (parentId != null && m.selectActive(parentId) == null) {
                throw notFound();
            }
            String now = now();
            NoteRow row = new NoteRow(UUID.randomUUID().toString(), parentId, m.countChildren(parentId), type,
                    finalTitle, "", false, 1, now, now);
            m.insert(row);
            return load(s, row.id());
        });
    }

    /** N-40, N-42: guarda título y contenido si la versión de partida sigue vigente. */
    public Note save(String id, String title, String content, long baseVersion) {
        if (title == null || title.isBlank()) {
            throw new ApiError(400, "invalid_title", "El título no puede estar vacío");
        }
        String finalContent = content == null ? "" : content;
        return store.write(s -> {
            int updated = s.getMapper(NoteMapper.class).updateContent(id, title.strip(), finalContent, baseVersion, now());
            if (updated == 0) {
                Note current = load(s, id);
                throw new ApiError(409, "conflict",
                        "La nota ha cambiado desde que se abrió. Recárgala o sobrescríbela.", current);
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
            if (parentId != null) {
                if (m.selectActive(parentId) == null) {
                    throw new ApiError(404, "not_found", "La nota de destino no existe");
                }
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

    /** N-50, N-51: a la papelera; con hijas, solo si se suben un nivel (promote). */
    public void delete(String id, boolean promoteChildren) {
        store.write(s -> {
            NoteMapper m = s.getMapper(NoteMapper.class);
            NoteRow note = m.selectActive(id);
            if (note == null) {
                throw notFound();
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
            m.markDeleted(id, now());
            m.deleteTabs(id);
            renumber(m, siblings);
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
            if (m.countTrashed(id) == 0) {
                throw new ApiError(404, "not_found", "La nota no está en la papelera");
            }
            String parent = m.selectTrashedParent(id);
            if (parent != null && m.selectActive(parent) == null) {
                parent = null;
            }
            m.markRestored(id, parent, m.countChildren(parent));
            return load(s, id);
        });
    }

    /** N-55: eliminación definitiva; historial, variables y pestañas caen en cascada. */
    public void purge(String id) {
        store.write(s -> {
            NoteMapper m = s.getMapper(NoteMapper.class);
            m.detachTrashedChildren(id);
            if (m.deleteTrashed(id) == 0) {
                throw new ApiError(404, "not_found", "La nota no está en la papelera");
            }
            return null;
        });
    }

    /** N-52: vaciar la papelera. */
    public void emptyTrash() {
        store.write(s -> {
            NoteMapper m = s.getMapper(NoteMapper.class);
            m.detachAllTrashedChildren();
            m.deleteAllTrashed();
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
        return new Note(r.id(), r.parentId(), r.position(), r.type(), r.title(), r.content(), r.favorite(),
                r.version(), r.createdAt(), r.updatedAt(), m.selectTags(id));
    }

    private static ApiError notFound() {
        return new ApiError(404, "not_found", "La nota no existe");
    }

    private static String now() {
        return Instant.now().truncatedTo(ChronoUnit.MILLIS).toString();
    }
}
