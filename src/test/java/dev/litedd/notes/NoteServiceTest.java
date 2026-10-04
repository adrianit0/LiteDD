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
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class NoteServiceTest {

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

    @Test
    void n05_creates_at_root_at_the_end() {
        Note a = notes.create(null, "md", null);
        Note b = notes.create(null, "sql", null);
        assertThat(a.parentId()).isNull();
        assertThat(a.position()).isZero();
        assertThat(b.position()).isEqualTo(1);
    }

    @Test
    void n06_new_note_is_called_sin_titulo() {
        Note n = notes.create(null, "md", null);
        assertThat(n.title()).isEqualTo("Sin título");
        assertThat(n.content()).isEmpty();
        assertThat(n.version()).isEqualTo(1);
        assertThat(n.id()).matches("[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}");
    }

    @Test
    void n02_children_of_any_type_without_depth_limit() {
        String parent = notes.create(null, "md", "raíz").id();
        for (int depth = 0; depth < 50; depth++) {
            String type = depth % 2 == 0 ? "sql" : "md";
            parent = notes.create(parent, type, "nivel " + depth).id();
        }
        List<TreeNode> tree = notes.tree();
        assertThat(tree).hasSize(51);
        assertThat(tree.stream().map(TreeNode::type).distinct()).containsExactlyInAnyOrder("md", "sql");
    }

    @Test
    void d03_t41_sibling_positions_are_contiguous_from_zero() {
        String p = notes.create(null, "md", "madre").id();
        for (int i = 0; i < 5; i++) {
            notes.create(p, i % 2 == 0 ? "md" : "sql", "hija " + i);
            notes.create(null, "md", "raíz " + i);
        }
        Map<String, List<Integer>> bySibling = notes.tree().stream().collect(Collectors.groupingBy(
                n -> String.valueOf(n.parentId()),
                Collectors.mapping(TreeNode::position, Collectors.toList())));
        bySibling.values().forEach(positions ->
                assertThat(positions).containsExactlyElementsOf(java.util.stream.IntStream.range(0, positions.size()).boxed().toList()));
    }

    @Test
    void d03_create_rejects_unknown_parent_and_type() {
        assertThatThrownBy(() -> notes.create("no-existe", "md", null))
                .isInstanceOf(ApiError.class).extracting(e -> ((ApiError) e).status()).isEqualTo(404);
        assertThatThrownBy(() -> notes.create(null, "txt", null))
                .isInstanceOf(ApiError.class).extracting(e -> ((ApiError) e).status()).isEqualTo(400);
    }

    @Test
    void d04_trashed_notes_are_not_in_the_tree_nor_valid_parents() {
        Note keep = notes.create(null, "md", "visible");
        Note trashed = notes.create(null, "md", "papelera");
        store.write(s -> exec(s, "UPDATE note SET deleted_at = '2026-10-04T00:00:00Z' WHERE id = '" + trashed.id() + "'"));
        assertThat(notes.tree()).extracting(TreeNode::id).containsExactly(keep.id());
        assertThatThrownBy(() -> notes.create(trashed.id(), "md", null)).isInstanceOf(ApiError.class);
        assertThatThrownBy(() -> notes.get(trashed.id())).isInstanceOf(ApiError.class);
    }

    @Test
    void n01_tree_is_ordered_by_position_and_has_tags() {
        Note a = notes.create(null, "md", "A");
        notes.create(a.id(), "md", "A1");
        notes.create(a.id(), "sql", "A2");
        store.write(s -> {
            exec(s, "INSERT INTO tag(id, name) VALUES (1, 'demo'), (2, 'libros')");
            return exec(s, "INSERT INTO note_tag(note_id, tag_id) VALUES ('" + a.id() + "', 1), ('" + a.id() + "', 2)");
        });
        List<TreeNode> tree = notes.tree();
        TreeNode root = tree.stream().filter(n -> n.id().equals(a.id())).findFirst().orElseThrow();
        assertThat(root.tags()).containsExactly("demo", "libros");
        assertThat(tree.stream().filter(n -> a.id().equals(n.parentId())).map(TreeNode::title)).containsExactly("A1", "A2");
    }

    @Test
    void n40_save_updates_content_title_and_version() {
        Note n = notes.create(null, "md", null);
        Note saved = notes.save(n.id(), "Guía", "# Hola", n.version());
        assertThat(saved.title()).isEqualTo("Guía");
        assertThat(saved.content()).isEqualTo("# Hola");
        assertThat(saved.version()).isEqualTo(2);
        assertThat(notes.get(n.id())).isEqualTo(saved);
    }

    @Test
    void n42_t44_second_save_with_same_base_version_conflicts() {
        Note n = notes.create(null, "md", null);
        notes.save(n.id(), "uno", "1", n.version());
        assertThatThrownBy(() -> notes.save(n.id(), "dos", "2", n.version()))
                .isInstanceOfSatisfying(ApiError.class, e -> {
                    assertThat(e.status()).isEqualTo(409);
                    // ADR-0007: details lleva la nota guardada.
                    assertThat(e.body().details()).isInstanceOfSatisfying(Note.class,
                            current -> assertThat(current.title()).isEqualTo("uno"));
                });
    }

    @Test
    void n13_save_rejects_blank_title() {
        Note n = notes.create(null, "md", null);
        assertThatThrownBy(() -> notes.save(n.id(), "  ", "", n.version()))
                .isInstanceOfSatisfying(ApiError.class, e -> assertThat(e.status()).isEqualTo(400));
    }

    @Test
    void save_keeps_full_text_index_in_sync() {
        Note n = notes.create(null, "md", "Préstamos");
        notes.save(n.id(), "Préstamos", "libros de autor", n.version());
        assertThat(readScalar("SELECT count(*) FROM note_fts WHERE note_fts MATCH 'prestamos AND autor'")).isEqualTo("1");
    }

    String readScalar(String sql) {
        return store.read(s -> query(s, sql));
    }

    static String query(org.apache.ibatis.session.SqlSession s, String sql) {
        try (Statement st = s.getConnection().createStatement(); ResultSet rs = st.executeQuery(sql)) {
            rs.next();
            return rs.getString(1);
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    static Void exec(org.apache.ibatis.session.SqlSession s, String sql) {
        try (Statement st = s.getConnection().createStatement()) {
            st.executeUpdate(sql);
            return null;
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }
}
