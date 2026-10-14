package dev.litedd.notes;

import dev.litedd.http.ApiError;
import dev.litedd.store.Store;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Notas XML MyBatis y sus hijas generadas (M-10 a M-32). */
class MybatisNotesTest {

    static final String MAPPER = """
            <mapper namespace="demo.BookMapper">
              <sql id="cols">b.id, b.title</sql>
              <select id="byAuthor">SELECT <include refid="cols"/> FROM book b WHERE b.author_id = #{authorId,int}</select>
              <select id="byYear">SELECT <include refid="cols"/> FROM book b WHERE b.year = #{year,int}</select>
              <update id="rename">UPDATE book SET title = #{title} WHERE id = #{id,int}</update>
            </mapper>""";

    @TempDir
    Path dir;
    Store store;
    NoteService notes;
    VariableValues values;

    @BeforeEach
    void open() {
        store = Store.open(dir.resolve("litedd.db"), dir.resolve("backups"));
        notes = new NoteService(store);
        values = new VariableValues(store);
    }

    @AfterEach
    void close() {
        store.close();
    }

    private Note mapper(String parent, String content) {
        Note n = notes.create(parent, "xml", "Libros");
        return notes.save(n.id(), "Libros", content, n.version());
    }

    private Note saveMapper(Note xml, String content) {
        return notes.save(xml.id(), xml.title(), content, notes.get(xml.id()).version());
    }

    private List<TreeNode> children(String parent) {
        return notes.tree().stream().filter(n -> parent.equals(n.parentId()))
                .sorted((a, b) -> Integer.compare(a.position(), b.position())).toList();
    }

    private TreeNode child(String parent, String statementId) {
        return children(parent).stream().filter(n -> statementId.equals(n.statementId())).findFirst().orElseThrow();
    }

    @Test
    void m10_m11_one_sql_child_per_statement_in_order() {
        Note xml = mapper(null, MAPPER);
        List<TreeNode> kids = children(xml.id());
        assertThat(kids).extracting(TreeNode::title).containsExactly("byAuthor", "byYear", "rename");
        assertThat(kids).extracting(TreeNode::type).containsOnly("sql");
        assertThat(kids).extracting(TreeNode::statementKind).containsExactly("select", "select", "update");
        Note byAuthor = notes.get(kids.getFirst().id());
        assertThat(byAuthor.content()).isEqualTo("SELECT b.id, b.title FROM book b WHERE b.author_id = #{authorId,int}");
        assertThat(byAuthor.generated()).isTrue();
    }

    @Test
    void m12_changing_the_fragment_updates_children_and_keeps_their_values() {
        Note xml = mapper(null, MAPPER);
        TreeNode byAuthor = child(xml.id(), "byAuthor");
        values.save(byAuthor.id(), List.of("authorId"), Map.of("authorId", "3"));
        long before = notes.get(byAuthor.id()).version();

        saveMapper(xml, MAPPER.replace("b.id, b.title", "b.id, b.title, b.year"));

        Note updated = notes.get(byAuthor.id());
        assertThat(updated.content()).startsWith("SELECT b.id, b.title, b.year FROM book b");
        assertThat(updated.version()).isEqualTo(before + 1);
        assertThat(notes.get(child(xml.id(), "byYear").id()).content()).startsWith("SELECT b.id, b.title, b.year");
        assertThat(values.load(byAuthor.id())).containsEntry("authorId", "3");
    }

    @Test
    void m12_unchanged_statement_keeps_its_version() {
        Note xml = mapper(null, MAPPER);
        TreeNode rename = child(xml.id(), "rename");
        long before = notes.get(rename.id()).version();
        saveMapper(xml, MAPPER.replace("b.id, b.title", "b.id"));
        assertThat(notes.get(rename.id()).version()).isEqualTo(before);
    }

    @Test
    void m12_removed_or_renamed_statement_deletes_its_child_for_good() {
        Note xml = mapper(null, MAPPER);
        TreeNode byYear = child(xml.id(), "byYear");
        values.save(byYear.id(), List.of("year"), Map.of("year", "2001"));

        saveMapper(xml, MAPPER.replace("id=\"byYear\"", "id=\"byPublicationYear\"").replace("<update id=\"rename\">UPDATE book SET title = #{title} WHERE id = #{id,int}</update>", ""));

        assertThat(children(xml.id())).extracting(TreeNode::title).containsExactly("byAuthor", "byPublicationYear");
        assertThatThrownBy(() -> notes.get(byYear.id())).isInstanceOf(ApiError.class);
        assertThat(notes.trash()).isEmpty();
        assertThat(values.load(byYear.id())).isEmpty();
    }

    @Test
    void m12_reordering_statements_reorders_children() {
        Note xml = mapper(null, MAPPER);
        String reordered = MAPPER.replace(
                "  <select id=\"byAuthor\">SELECT <include refid=\"cols\"/> FROM book b WHERE b.author_id = #{authorId,int}</select>\n", "")
                .replace("</mapper>", "  <select id=\"byAuthor\">SELECT 1</select>\n</mapper>");
        saveMapper(xml, reordered);
        assertThat(children(xml.id())).extracting(TreeNode::title).containsExactly("byYear", "rename", "byAuthor");
    }

    @Test
    void m13_mapper_with_errors_is_saved_and_children_stay() {
        Note xml = mapper(null, MAPPER);
        String broken = MAPPER.replace("refid=\"cols\"", "refid=\"missing\"");
        Note saved = saveMapper(xml, broken);
        assertThat(saved.content()).isEqualTo(broken);
        assertThat(children(xml.id())).extracting(TreeNode::title).containsExactly("byAuthor", "byYear", "rename");
        assertThat(notes.get(child(xml.id(), "byAuthor").id()).content()).contains("b.id, b.title");
    }

    @Test
    void m14_restoring_a_version_regenerates_children() {
        Note xml = mapper(null, MAPPER);
        notes.save(xml.id(), "Libros", MAPPER, notes.get(xml.id()).version(), true);
        saveMapper(xml, "<mapper><select id=\"other\">SELECT 1</select></mapper>");
        assertThat(children(xml.id())).extracting(TreeNode::title).containsExactly("other");

        NoteVersion first = notes.versions(xml.id()).stream().filter(v -> v.content().equals(MAPPER)).findFirst().orElseThrow();
        notes.restoreVersion(xml.id(), first.id(), notes.get(xml.id()).version());
        assertThat(children(xml.id())).extracting(TreeNode::title).containsExactly("byAuthor", "byYear", "rename");
    }

    @Test
    void m20_children_are_read_only() {
        Note xml = mapper(null, MAPPER);
        Note child = notes.get(child(xml.id(), "byAuthor").id());
        assertThatThrownBy(() -> notes.save(child.id(), "Otro", "SELECT 2", child.version()))
                .isInstanceOfSatisfying(ApiError.class, e -> assertThat(e.body().code()).isEqualTo("generated_note"));
        assertThatThrownBy(() -> notes.move(child.id(), null, 0))
                .isInstanceOfSatisfying(ApiError.class, e -> assertThat(e.body().code()).isEqualTo("generated_note"));
        assertThatThrownBy(() -> notes.delete(child.id(), true))
                .isInstanceOfSatisfying(ApiError.class, e -> assertThat(e.body().code()).isEqualTo("generated_note"));
        assertThatThrownBy(() -> notes.create(child.id(), "md", "Hija"))
                .isInstanceOfSatisfying(ApiError.class, e -> assertThat(e.body().code()).isEqualTo("generated_children"));
        // Favorita y etiquetas sí.
        assertThat(notes.setFavorite(child.id(), true).favorite()).isTrue();
        assertThat(notes.setTags(child.id(), List.of("demo")).tags()).containsExactly("demo");
    }

    @Test
    void m22_xml_note_admits_no_other_children() {
        Note xml = mapper(null, MAPPER);
        String other = notes.create(null, "md", "Suelta").id();
        assertThatThrownBy(() -> notes.create(xml.id(), "sql", "Nueva"))
                .isInstanceOfSatisfying(ApiError.class, e -> assertThat(e.body().code()).isEqualTo("xml_children"));
        assertThatThrownBy(() -> notes.move(other, xml.id(), 0))
                .isInstanceOfSatisfying(ApiError.class, e -> assertThat(e.body().code()).isEqualTo("xml_children"));
    }

    @Test
    void m30_xml_note_goes_to_trash_with_its_children_and_comes_back() {
        Note xml = mapper(null, MAPPER);
        TreeNode byAuthor = child(xml.id(), "byAuthor");
        values.save(byAuthor.id(), List.of("authorId"), Map.of("authorId", "3"));

        notes.delete(xml.id(), false);
        assertThat(notes.tree()).isEmpty();
        assertThat(notes.trash()).extracting(TrashItem::id).containsExactly(xml.id());

        notes.restore(xml.id());
        assertThat(children(xml.id())).extracting(TreeNode::id).contains(byAuthor.id());
        assertThat(values.load(byAuthor.id())).containsEntry("authorId", "3");
    }

    @Test
    void m30_purging_the_xml_note_deletes_its_children() {
        Note xml = mapper(null, MAPPER);
        String byAuthor = child(xml.id(), "byAuthor").id();
        notes.delete(xml.id(), false);
        notes.purge(xml.id());
        assertThat(notes.trash()).isEmpty();
        assertThat((int) store.read(s -> s.getMapper(NoteMapper.class).countTrashed(byAuthor))).isZero();
        assertThatThrownBy(() -> notes.restore(byAuthor)).isInstanceOf(ApiError.class);

        Note again = mapper(null, MAPPER);
        notes.delete(again.id(), false);
        notes.emptyTrash();
        assertThat(notes.trash()).isEmpty();
    }

    @Test
    void m31_duplicate_xml_generates_new_children_and_duplicate_child_is_plain_sql() {
        String folder = notes.create(null, "md", "Carpeta").id();
        Note xml = mapper(folder, MAPPER);
        notes.create(folder, "md", "Después");

        Note copy = notes.duplicate(xml.id());
        assertThat(copy.title()).isEqualTo("Libros (2)");
        assertThat(children(copy.id())).extracting(TreeNode::title).containsExactly("byAuthor", "byYear", "rename");
        assertThat(children(copy.id())).extracting(TreeNode::id).doesNotContainAnyElementsOf(
                children(xml.id()).stream().map(TreeNode::id).toList());

        Note plain = notes.duplicate(child(xml.id(), "rename").id());
        assertThat(plain.generated()).isFalse();
        assertThat(plain.type()).isEqualTo("sql");
        assertThat(plain.parentId()).isEqualTo(folder);
        assertThat(children(folder)).extracting(TreeNode::title).containsExactly("Libros", "rename (2)", "Libros (2)", "Después");
        // Ya es una nota normal: se edita.
        assertThat(notes.save(plain.id(), "rename (2)", "SELECT 1", plain.version()).content()).isEqualTo("SELECT 1");
    }

    @Test
    void m32_xml_note_moves_with_its_children() {
        Note xml = mapper(null, MAPPER);
        String folder = notes.create(null, "md", "Carpeta").id();
        notes.move(xml.id(), folder, 0);
        assertThat(notes.get(xml.id()).parentId()).isEqualTo(folder);
        assertThat(children(xml.id())).hasSize(3);
    }

    static final String USES_AUTHORS = """
            <mapper namespace="demo.BookMapper">
              <select id="withAuthor">SELECT b.id, <include refid="demo.AuthorMapper.cols"/> FROM book b JOIN author a ON a.id = b.author_id</select>
            </mapper>""";

    private static String authors(String cols) {
        return "<mapper namespace=\"demo.AuthorMapper\"><sql id=\"cols\">" + cols + "</sql></mapper>";
    }

    private String body(String parent, String statementId) {
        return notes.get(child(parent, statementId).id()).content();
    }

    @Test
    void m05_m16_saving_the_fragment_mapper_regenerates_the_mappers_that_use_it() {
        Note books = mapper(null, USES_AUTHORS);
        // Sin la nota de autores, el mapper tiene errores y no genera hijas (M-13).
        assertThat(children(books.id())).isEmpty();

        Note authors = notes.create(null, "xml", "Autores");
        authors = notes.save(authors.id(), "Autores", authors("a.name"), authors.version());
        assertThat(body(books.id(), "withAuthor")).isEqualTo("SELECT b.id, a.name FROM book b JOIN author a ON a.id = b.author_id");

        saveMapper(authors, authors("a.name, a.country"));
        assertThat(body(books.id(), "withAuthor")).contains("a.name, a.country");
    }

    @Test
    void m16_trash_restore_and_duplicate_of_the_fragment_mapper() {
        Note authors = notes.create(null, "xml", "Autores");
        authors = notes.save(authors.id(), "Autores", authors("a.name"), authors.version());
        Note books = mapper(null, USES_AUTHORS);
        String childId = child(books.id(), "withAuthor").id();

        // En la papelera no aporta fragmentos: las hijas se quedan como estaban.
        notes.delete(authors.id(), false);
        assertThat(notes.get(childId).content()).contains("a.name");
        notes.restore(authors.id());
        saveMapper(authors, authors("a.id"));
        assertThat(notes.get(childId).content()).contains("SELECT b.id, a.id FROM");

        // Con el namespace repetido, error: las hijas tampoco cambian.
        Note copy = notes.duplicate(authors.id());
        saveMapper(copy, authors("a.other"));
        assertThat(notes.get(childId).content()).contains("SELECT b.id, a.id FROM");
        notes.delete(copy.id(), false);
        saveMapper(authors, authors("a.last"));
        assertThat(notes.get(childId).content()).contains("SELECT b.id, a.last FROM");
    }
}
