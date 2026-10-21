package dev.litedd.notes;

import dev.litedd.http.ApiError;
import dev.litedd.notes.NoteService.SearchHit;
import dev.litedd.notes.NoteService.SearchQuery;
import dev.litedd.store.Store;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;

import static dev.litedd.notes.BoardPngs.dataUrl;
import static dev.litedd.notes.BoardPngs.png;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Notas pizarra en el servidor (B-01, B-30 a B-33). */
class BoardNotesTest {

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

    private Note board(String title, String content) {
        Note n = notes.create(null, "board", title);
        return notes.save(n.id(), title, content, n.version());
    }

    @Test
    void b01_creates_an_empty_board_note() {
        Note n = notes.create(null, "board", null);
        assertThat(n.type()).isEqualTo("board");
        assertThat(n.content()).isEmpty();
        assertThat(notes.tree()).extracting(TreeNode::type).containsExactly("board");
    }

    @Test
    void b30_saves_the_png_as_data_url_with_history_and_duplicate() {
        String first = dataUrl(png(1200, 800));
        Note n = board("Esquema", first);
        assertThat(notes.get(n.id()).content()).isEqualTo(first);

        String second = dataUrl(png(600, 400));
        n = notes.save(n.id(), "Esquema", second, n.version(), true);
        assertThat(notes.versions(n.id())).extracting(NoteVersion::content).contains(first, second);
        assertThat(notes.duplicate(n.id()).content()).isEqualTo(second);
        // Vaciarla también vale.
        assertThat(notes.save(n.id(), "Esquema", "", n.version()).content()).isEmpty();
    }

    @Test
    void b31_rejects_content_that_is_not_a_valid_png_and_keeps_the_note() {
        String valid = dataUrl(png(10, 10));
        Note n = board("Esquema", valid);
        byte[] header = Arrays.copyOf(png(10, 10), 24);
        List<String> wrong = List.of(
                "texto",
                "data:image/jpeg;base64,/9j/4AAQ",
                BoardImage.PREFIX + "no es base64!",
                dataUrl("GIF89a......".getBytes()),
                dataUrl(Arrays.copyOf(header, 12)),
                dataUrl(png(BoardImage.MAX_SIDE + 1, 10)),
                dataUrl(png(10, BoardImage.MAX_SIDE + 1)));
        for (String content : wrong) {
            long version = notes.get(n.id()).version();
            assertThatThrownBy(() -> notes.save(n.id(), "Esquema", content, version)).as(content)
                    .isInstanceOfSatisfying(ApiError.class, e -> {
                        assertThat(e.status()).isEqualTo(400);
                        assertThat(e.body().code()).isEqualTo("invalid_board");
                    });
        }
        String huge = BoardImage.PREFIX + "A".repeat(14 * 1024 * 1024);
        assertThatThrownBy(() -> notes.save(n.id(), "Esquema", huge, notes.get(n.id()).version()))
                .isInstanceOfSatisfying(ApiError.class, e -> assertThat(e.status()).isEqualTo(413));
        assertThat(notes.get(n.id()).content()).isEqualTo(valid);
        // El máximo exacto sí se admite.
        assertThat(notes.save(n.id(), "Esquema", dataUrl(png(BoardImage.MAX_SIDE, 1)), notes.get(n.id()).version()).content())
                .startsWith(BoardImage.PREFIX);
    }

    @Test
    void b31_other_note_types_keep_any_text() {
        Note md = notes.create(null, "md", "Texto");
        assertThat(notes.save(md.id(), "Texto", "data:image/png;base64,no-validado", md.version()).content())
                .isEqualTo("data:image/png;base64,no-validado");
    }

    @Test
    void b33_search_finds_boards_by_title_and_description_without_indexing_the_image() {
        String content = dataUrl(png(20, 20));
        Note n = board("Esquema de préstamos", content);
        notes.save(n.id(), "Esquema de préstamos", "flujo de devoluciones", content, notes.get(n.id()).version(), false);
        // Un trozo del base64 encuentra la nota Markdown que lo contiene, pero no la pizarra.
        String token = content.substring(BoardImage.PREFIX.length(), BoardImage.PREFIX.length() + 11);
        Note md = notes.create(null, "md", "Texto");
        notes.save(md.id(), "Texto", "copia: " + token, md.version());

        List<SearchHit> byTitle = notes.search(SearchQuery.text("esquema"));
        assertThat(byTitle).extracting(SearchHit::id).containsExactly(n.id());
        assertThat(byTitle.getFirst().fragment()).isEmpty();
        assertThat(notes.search(SearchQuery.text("devoluciones"))).extracting(SearchHit::id).containsExactly(n.id());
        assertThat(notes.search(SearchQuery.text(token))).extracting(SearchHit::id).containsExactly(md.id());
        // Solo con filtros tampoco hay fragmento.
        List<SearchHit> byType = notes.search(new SearchQuery("", "board", List.of(), false, null));
        assertThat(byType).extracting(SearchHit::fragment).containsExactly("");

        // Cambiar y purgar la pizarra deja el índice coherente.
        notes.save(n.id(), "Plano", dataUrl(png(30, 30)), notes.get(n.id()).version());
        assertThat(notes.search(SearchQuery.text("esquema"))).isEmpty();
        assertThat(notes.search(SearchQuery.text("plano"))).extracting(SearchHit::id).containsExactly(n.id());
        notes.delete(n.id(), false);
        notes.purge(n.id());
        assertThat(notes.search(SearchQuery.text("plano"))).isEmpty();
        assertThat(notes.search(SearchQuery.text(token))).extracting(SearchHit::id).containsExactly(md.id());
    }
}
