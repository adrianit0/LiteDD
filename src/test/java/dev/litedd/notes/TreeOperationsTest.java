package dev.litedd.notes;

import dev.litedd.http.ApiError;
import dev.litedd.store.Store;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Operaciones de árbol: mover, eliminar, papelera y restaurar. */
class TreeOperationsTest {

    @TempDir
    Path dir;
    Store store;
    NoteService notes;

    @BeforeEach
    void open() {
        store = Store.open(dir.resolve("litedd.db"), dir.resolve("backups"));
        notes = new NoteService(store);
    }

    @AfterEach
    void close() {
        store.close();
    }

    private String create(String parent, String title) {
        return notes.create(parent, "md", title).id();
    }

    /** Títulos de las hijas activas en orden. */
    private List<String> children(String parent) {
        return notes.tree().stream()
                .filter(n -> parent == null ? n.parentId() == null : parent.equals(n.parentId()))
                .sorted((a, b) -> Integer.compare(a.position(), b.position()))
                .map(TreeNode::title)
                .toList();
    }

    private void assertContiguous() {
        Map<String, List<Integer>> bySiblings = notes.tree().stream().collect(Collectors.groupingBy(
                n -> String.valueOf(n.parentId()), Collectors.mapping(TreeNode::position, Collectors.toList())));
        bySiblings.values().forEach(p -> assertThat(p.stream().sorted().toList())
                .containsExactlyElementsOf(IntStream.range(0, p.size()).boxed().toList()));
    }

    private static int status(Throwable e) {
        return ((ApiError) e).status();
    }

    @Test
    void n61_moves_a_note_with_all_its_descendants() {
        String a = create(null, "A");
        String a1 = create(a, "A1");
        String a11 = create(a1, "A11");
        create(a11, "A111");
        String b = create(null, "B");

        notes.move(a, b, 0);

        assertThat(children(null)).containsExactly("B");
        assertThat(children(b)).containsExactly("A");
        assertThat(children(a)).containsExactly("A1");
        assertThat(children(a1)).containsExactly("A11");
        assertThat(children(a11)).containsExactly("A111");
        assertContiguous();
    }

    @Test
    void n60_move_before_after_and_inside_siblings() {
        String a = create(null, "A");
        create(null, "B");
        String c = create(null, "C");

        notes.move(c, null, 0);
        assertThat(children(null)).containsExactly("C", "A", "B");
        notes.move(c, null, 2);
        assertThat(children(null)).containsExactly("A", "B", "C");
        notes.move(c, a, 0);
        assertThat(children(null)).containsExactly("A", "B");
        assertThat(children(a)).containsExactly("C");
        assertContiguous();
    }

    @Test
    void move_clamps_position_to_the_end() {
        String a = create(null, "A");
        create(null, "B");
        notes.move(a, null, 99);
        assertThat(children(null)).containsExactly("B", "A");
    }

    @Test
    void d05_n62_t40_cannot_move_into_itself_or_a_descendant() {
        String a = create(null, "A");
        String a1 = create(a, "A1");
        String a11 = create(a1, "A11");

        assertThatThrownBy(() -> notes.move(a, a, 0)).satisfies(e -> assertThat(status(e)).isEqualTo(409));
        assertThatThrownBy(() -> notes.move(a, a1, 0)).satisfies(e -> assertThat(status(e)).isEqualTo(409));
        assertThatThrownBy(() -> notes.move(a, a11, 0)).satisfies(e -> assertThat(status(e)).isEqualTo(409));
        assertThat(children(null)).containsExactly("A");
        assertThat(children(a)).containsExactly("A1");
    }

    @Test
    void move_rejects_missing_or_trashed_destination() {
        String a = create(null, "A");
        String b = create(null, "B");
        notes.delete(b, false);
        assertThatThrownBy(() -> notes.move(a, b, 0)).satisfies(e -> assertThat(status(e)).isEqualTo(404));
        assertThatThrownBy(() -> notes.move(a, "no-existe", 0)).satisfies(e -> assertThat(status(e)).isEqualTo(404));
    }

    @Test
    void move_does_not_change_version() {
        String a = create(null, "A");
        String b = create(null, "B");
        notes.move(a, b, 0);
        assertThat(notes.get(a).version()).isEqualTo(1);
    }

    @Test
    void n50_note_without_children_goes_to_trash() {
        String a = create(null, "A");
        create(null, "B");
        notes.delete(a, false);
        assertThat(children(null)).containsExactly("B");
        assertThat(notes.trash()).extracting(TrashItem::title).containsExactly("A");
        assertContiguous();
    }

    @Test
    void n51_note_with_children_requires_promote() {
        String a = create(null, "A");
        create(a, "A1");
        assertThatThrownBy(() -> notes.delete(a, false)).satisfies(e -> {
            assertThat(status(e)).isEqualTo(409);
            assertThat(((ApiError) e).body().code()).isEqualTo("has_children");
        });
        assertThat(children(null)).containsExactly("A");
    }

    @Test
    void n51_t42_promoted_children_take_the_place_in_order() {
        create(null, "X");
        String a = create(null, "A");
        create(a, "A1");
        String a2 = create(a, "A2");
        create(a2, "A21");
        create(a, "A3");
        create(null, "Y");

        notes.delete(a, true);

        assertThat(children(null)).containsExactly("X", "A1", "A2", "A3", "Y");
        assertThat(children(a2)).containsExactly("A21");
        assertContiguous();
    }

    @Test
    void d04_trashed_notes_keep_parent_and_leave_the_tree() {
        String a = create(null, "A");
        String a1 = create(a, "A1");
        notes.delete(a1, false);
        assertThat(notes.trash()).singleElement().satisfies(t -> {
            assertThat(t.parentId()).isEqualTo(a);
            assertThat(t.type()).isEqualTo("md");
            assertThat(t.deletedAt()).endsWith("Z");
        });
        assertThat(children(a)).isEmpty();
    }

    @Test
    void n53_restore_returns_to_parent_at_the_end() {
        String a = create(null, "A");
        String a1 = create(a, "A1");
        create(a, "A2");
        notes.delete(a1, false);
        create(a, "A3");

        Note restored = notes.restore(a1);

        assertThat(restored.parentId()).isEqualTo(a);
        assertThat(children(a)).containsExactly("A2", "A3", "A1");
        assertContiguous();
    }

    @Test
    void n53_t43_restore_goes_to_root_when_parent_is_trashed_or_gone() {
        String a = create(null, "A");
        String a1 = create(a, "A1");
        notes.delete(a1, false);
        notes.delete(a, false);

        assertThat(notes.restore(a1).parentId()).isNull();
        assertThat(children(null)).containsExactly("A1");

        String b = create(null, "B");
        String b1 = create(b, "B1");
        notes.delete(b1, false);
        notes.delete(b, false);
        notes.purge(b);
        assertThat(notes.restore(b1).parentId()).isNull();
        assertContiguous();
    }

    @Test
    void restore_rejects_active_notes() {
        String a = create(null, "A");
        assertThatThrownBy(() -> notes.restore(a)).satisfies(e -> assertThat(status(e)).isEqualTo(404));
    }

    @Test
    void n55_purge_removes_note_history_variables_and_tabs() {
        String a = create(null, "A");
        store.write(s -> {
            exec(s, "INSERT INTO note_version(note_id, title, content, saved_at) VALUES ('" + a + "', 'A', '', 'x')");
            exec(s, "INSERT INTO variable_value(note_id, name, value) VALUES ('" + a + "', 'v', '1')");
            return exec(s, "INSERT INTO tab(id, note_id, position, active, mode) VALUES ('t', '" + a + "', 0, 1, 'view')");
        });
        notes.delete(a, false);
        assertThat(count("SELECT count(*) FROM tab")).isZero();

        notes.purge(a);

        assertThat(notes.trash()).isEmpty();
        assertThat(count("SELECT count(*) FROM note")).isZero();
        assertThat(count("SELECT count(*) FROM note_version")).isZero();
        assertThat(count("SELECT count(*) FROM variable_value")).isZero();
    }

    @Test
    void n55_purge_only_works_on_trashed_notes() {
        String a = create(null, "A");
        assertThatThrownBy(() -> notes.purge(a)).satisfies(e -> assertThat(status(e)).isEqualTo(404));
    }

    @Test
    void n52_empty_trash_removes_everything_in_it() {
        String a = create(null, "A");
        String a1 = create(a, "A1");
        create(null, "B");
        notes.delete(a1, false);
        notes.delete(a, false);

        notes.emptyTrash();

        assertThat(notes.trash()).isEmpty();
        assertThat(children(null)).containsExactly("B");
    }

    @Test
    void n55_orphan_attachments_are_purged() {
        String a = create(null, "A");
        store.write(s -> {
            exec(s, "INSERT INTO attachment(id, note_id, mime, data, created_at) VALUES ('keep', '" + a + "', 'image/png', x'00', 'x')");
            return exec(s, "INSERT INTO attachment(id, note_id, mime, data, created_at) VALUES ('orphan', NULL, 'image/png', x'00', 'x')");
        });
        assertThat(notes.purgeOrphanAttachments()).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM attachment")).isEqualTo(1);
    }

    @Test
    void d03_t41_random_moves_deletes_and_restores_keep_positions_contiguous() {
        Random random = new Random(42);
        List<String> ids = new java.util.ArrayList<>();
        for (int i = 0; i < 12; i++) {
            String parent = ids.isEmpty() || random.nextBoolean() ? null : ids.get(random.nextInt(ids.size()));
            ids.add(create(parent, "N" + i));
        }
        for (int step = 0; step < 300; step++) {
            String id = ids.get(random.nextInt(ids.size()));
            try {
                switch (random.nextInt(4)) {
                    case 0, 1 -> {
                        String target = random.nextInt(4) == 0 ? null : ids.get(random.nextInt(ids.size()));
                        notes.move(id, target, random.nextInt(6));
                    }
                    case 2 -> notes.delete(id, true);
                    default -> notes.restore(id);
                }
            } catch (ApiError expected) {
                // Ciclos, notas en la papelera o activas: se rechazan sin cambiar nada.
            }
            assertContiguous();
        }
    }

    private int count(String sql) {
        return store.read(s -> {
            try (Statement st = s.getConnection().createStatement(); ResultSet rs = st.executeQuery(sql)) {
                rs.next();
                return rs.getInt(1);
            } catch (SQLException e) {
                throw new RuntimeException(e);
            }
        });
    }

    private static Void exec(org.apache.ibatis.session.SqlSession s, String sql) {
        try (Statement st = s.getConnection().createStatement()) {
            st.executeUpdate(sql);
            return null;
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }
}
