package dev.litedd.notes;

import dev.litedd.http.ApiError;
import dev.litedd.notes.NoteService.SearchQuery;
import dev.litedd.store.Store;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Historial (N-44, N-45), búsqueda (N-70 a N-74), etiquetas (N-80) y favoritas (N-81). */
class ContentFeaturesTest {

    @TempDir
    Path dir;
    Store store;
    NoteService notes;
    MutableClock clock = new MutableClock(Instant.parse("2026-10-04T08:00:00Z"));

    /** Reloj que la prueba adelanta a mano. */
    static final class MutableClock extends Clock {
        Instant now;

        MutableClock(Instant now) {
            this.now = now;
        }

        void advance(Duration d) {
            now = now.plus(d);
        }

        @Override
        public ZoneOffset getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }

    @BeforeEach
    void open() {
        store = Store.open(dir.resolve("litedd.db"), dir.resolve("backups"));
        notes = new NoteService(store, clock);
    }

    @AfterEach
    void close() {
        store.close();
    }

    private Note md(String title, String content) {
        Note n = notes.create(null, "md", title);
        return notes.save(n.id(), title, content, n.version(), false);
    }

    // --- N-44, N-45 ---

    @Test
    void n44_leaving_edit_mode_saves_a_version_only_if_something_changed() {
        Note n = notes.create(null, "md", "A");
        n = notes.save(n.id(), "A", "uno", n.version(), true);
        n = notes.save(n.id(), "A", "uno", n.version(), true);
        assertThat(notes.versions(n.id())).hasSize(1);
        notes.save(n.id(), "A", "dos", n.version(), true);
        assertThat(notes.versions(n.id())).extracting(NoteVersion::content).containsExactly("dos", "uno");
    }

    @Test
    void n44_snapshot_without_changes_keeps_the_note_version() {
        Note n = notes.create(null, "md", "A");
        n = notes.save(n.id(), "A", "uno", n.version(), false);
        clock.advance(Duration.ofSeconds(10));
        Note again = notes.save(n.id(), "A", "uno", n.version(), true);
        assertThat(again.version()).isEqualTo(n.version());
        assertThat(again.updatedAt()).isEqualTo(n.updatedAt());
        assertThat(notes.versions(n.id())).extracting(NoteVersion::content).containsExactly("uno");
    }

    @Test
    void n44_long_edit_saves_at_most_one_version_every_five_minutes() {
        Note n = notes.create(null, "md", "A");
        for (int i = 0; i < 20; i++) {
            n = notes.save(n.id(), "A", "texto " + i, n.version(), false);
            clock.advance(Duration.ofSeconds(30));
        }
        // 20 guardados en 10 minutos: la primera y, como mucho, dos más.
        assertThat(notes.versions(n.id())).hasSizeBetween(2, 3);
    }

    @Test
    void n44_keeps_the_last_twenty_versions() {
        Note n = notes.create(null, "md", "A");
        for (int i = 0; i < 25; i++) {
            n = notes.save(n.id(), "A", "v" + i, n.version(), true);
        }
        List<NoteVersion> versions = notes.versions(n.id());
        assertThat(versions).hasSize(20);
        assertThat(versions.getFirst().content()).isEqualTo("v24");
        assertThat(versions.getLast().content()).isEqualTo("v5");
    }

    @Test
    void n45_restore_brings_back_a_version_and_keeps_the_current_one() {
        Note n = notes.create(null, "md", "A");
        n = notes.save(n.id(), "Título viejo", "viejo", n.version(), true);
        long oldVersion = notes.versions(n.id()).getFirst().id();
        n = notes.save(n.id(), "Título nuevo", "nuevo", n.version(), false);

        Note restored = notes.restoreVersion(n.id(), oldVersion, n.version());

        assertThat(restored.content()).isEqualTo("viejo");
        assertThat(restored.title()).isEqualTo("Título viejo");
        assertThat(notes.versions(n.id())).extracting(NoteVersion::content).contains("nuevo");
    }

    @Test
    void n45_restore_with_stale_base_version_conflicts() {
        Note n = notes.create(null, "md", "A");
        n = notes.save(n.id(), "A", "uno", n.version(), true);
        long v = notes.versions(n.id()).getFirst().id();
        Note current = notes.save(n.id(), "A", "dos", n.version(), false);
        long stale = n.version();
        assertThatThrownBy(() -> notes.restoreVersion(current.id(), v, stale))
                .isInstanceOfSatisfying(ApiError.class, e -> assertThat(e.status()).isEqualTo(409));
    }

    // --- N-70 a N-74 ---

    @Test
    void n70_searches_title_and_content_by_prefix_ignoring_case_and_accents() {
        md("Préstamos de libros", "Consultas sobre la tabla loan");
        md("Autores", "Lista de AUTORAS y su catálogo");
        md("Otra", "nada que ver");

        assertThat(titles(SearchQuery.text("prest"))).containsExactly("Préstamos de libros");
        assertThat(titles(SearchQuery.text("PRÉSTAMOS"))).containsExactly("Préstamos de libros");
        assertThat(titles(SearchQuery.text("catalog"))).containsExactly("Autores");
        assertThat(titles(SearchQuery.text("autoras lista"))).containsExactly("Autores");
    }

    @Test
    void n08_duplicate_copies_the_note_below_the_original_with_the_next_number() {
        Note parent = md("Carpeta", "");
        Note a = notes.create(parent.id(), "sql", "Informe");
        notes.save(a.id(), "Informe", "Ventas", "SELECT 1", a.version(), false);
        notes.setTags(a.id(), List.of("ventas", "mensual"));
        notes.setFavorite(a.id(), true);
        Note b = notes.create(parent.id(), "md", "Otra");

        Note copy = notes.duplicate(a.id());
        assertThat(copy.id()).isNotEqualTo(a.id());
        assertThat(copy).extracting(Note::parentId, Note::type, Note::title, Note::description, Note::content, Note::favorite, Note::version)
                .containsExactly(parent.id(), "sql", "Informe (2)", "Ventas", "SELECT 1", true, 1L);
        assertThat(copy.tags()).containsExactlyInAnyOrder("ventas", "mensual");
        // Justo debajo de la original; las demás hermanas se desplazan.
        assertThat(notes.tree().stream().filter(n -> parent.id().equals(n.parentId()))
                .sorted(java.util.Comparator.comparingInt(TreeNode::position)).map(TreeNode::title))
                .containsExactly("Informe", "Informe (2)", "Otra");
        assertThat(notes.get(b.id()).position()).isEqualTo(2);

        // Cada duplicado lleva el siguiente número libre, también al duplicar una copia.
        assertThat(notes.duplicate(a.id()).title()).isEqualTo("Informe (3)");
        assertThat(notes.duplicate(copy.id()).title()).isEqualTo("Informe (4)");
        // La original no cambia.
        assertThat(notes.get(a.id()).title()).isEqualTo("Informe");
    }

    @Test
    void n08_copy_title_rules() {
        assertThat(NoteService.copyTitle("Informe", List.of("Informe"))).isEqualTo("Informe (2)");
        assertThat(NoteService.copyTitle("Informe (2)", List.of("Informe", "Informe (2)"))).isEqualTo("Informe (3)");
        assertThat(NoteService.copyTitle("Informe", List.of("Informe", "Informe (7)", "Otro (9)"))).isEqualTo("Informe (8)");
        assertThat(NoteService.copyTitle("Año (2026)", List.of("Año (2026)"))).isEqualTo("Año (2026) (2)");
        assertThat(NoteService.copyTitle("Año (2026) (2)", List.of("Año (2026)", "Año (2026) (2)"))).isEqualTo("Año (2026) (3)");
    }

    @Test
    void n08_duplicate_does_not_copy_children_and_needs_an_active_note() {
        Note a = md("Madre", "x");
        notes.create(a.id(), "md", "Hija");
        Note copy = notes.duplicate(a.id());
        assertThat(notes.tree().stream().filter(n -> copy.id().equals(n.parentId()))).isEmpty();
        assertThatThrownBy(() -> notes.duplicate("no-existe")).isInstanceOf(ApiError.class);
    }

    @Test
    void n07_n70_search_also_finds_the_description() {
        Note n = md("Clientes", "SELECT 1");
        notes.save(n.id(), "Clientes", "Altas del último trimestre", "SELECT 1", notes.get(n.id()).version(), false);
        md("Otra", "nada que ver");
        assertThat(titles(SearchQuery.text("trimestre"))).containsExactly("Clientes");
        assertThat(titles(SearchQuery.text("ULTIMO"))).containsExactly("Clientes");
    }

    @Test
    void n07_description_is_saved_shown_in_the_tree_and_kept_when_omitted() {
        Note n = md("Clientes", "uno");
        Note saved = notes.save(n.id(), "Clientes", "  Consultas de altas  ", "uno", n.version(), false);
        assertThat(saved.description()).isEqualTo("Consultas de altas");
        assertThat(saved.version()).isEqualTo(n.version() + 1);
        assertThat(notes.tree()).extracting(TreeNode::description).containsExactly("Consultas de altas");

        // Un guardado sin descripción (renombrar desde el árbol) la conserva.
        Note renamed = notes.save(n.id(), "Clientes 2", "uno", saved.version());
        assertThat(renamed.description()).isEqualTo("Consultas de altas");

        // Restaurar una versión no cambia la descripción (ADR-0020).
        NoteVersion first = notes.versions(n.id()).getLast();
        assertThat(notes.restoreVersion(n.id(), first.id(), renamed.version()).description()).isEqualTo("Consultas de altas");

        assertThatThrownBy(() -> notes.save(n.id(), "Clientes", "x".repeat(201), "uno", notes.get(n.id()).version(), false))
                .isInstanceOf(ApiError.class).hasMessageContaining("200");
        assertThat(notes.save(n.id(), "Clientes", "", "uno", notes.get(n.id()).version(), false).description()).isEmpty();
    }

    @Test
    void n71_hit_has_a_highlighted_fragment() {
        md("Préstamos", "Primera línea. Consultas sobre la tabla loan y sus fechas.");
        NoteService.SearchHit hit = notes.search(SearchQuery.text("tabla")).getFirst();
        assertThat(hit.fragment()).contains("\u0002tabla\u0003");
    }

    @Test
    void d04_trashed_notes_are_not_found() {
        Note n = md("Borrada", "palabra única");
        notes.delete(n.id(), false);
        assertThat(notes.search(SearchQuery.text("palabra"))).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {"\"", "'", "-", "*", "#{", "a\"b", "NEAR(", "AND", "OR -x", "^", ":", "(", "{}", "\u0002"})
    void n74_t45_any_character_is_safe(String q) {
        md("Comillas \"y\" guiones - y *", "#{variable} y AND OR");
        notes.search(SearchQuery.text(q));
    }

    @Test
    void n72_filters_combine_type_tags_favorite_and_date() {
        Note a = md("A", "x");
        Note b = notes.create(null, "sql", "B");
        Note c = md("C", "x");
        notes.setTags(a.id(), List.of("demo", "libros"));
        notes.setTags(b.id(), List.of("demo"));
        notes.setFavorite(a.id(), true);
        clock.advance(Duration.ofDays(10));
        md("D", "x");

        assertThat(titles(new SearchQuery("", "sql", List.of(), false, null))).containsExactly("B");
        assertThat(titles(new SearchQuery("", null, List.of("demo"), false, null))).containsExactlyInAnyOrder("A", "B");
        assertThat(titles(new SearchQuery("", null, List.of("DEMO", "libros"), false, null))).containsExactly("A");
        assertThat(titles(new SearchQuery("", null, List.of(), true, null))).containsExactly("A");
        assertThat(titles(new SearchQuery("", null, List.of(), false, "2026-10-10T00:00:00Z"))).containsExactly("D");
        assertThat(titles(new SearchQuery("x", "md", List.of("demo"), true, null))).containsExactly("A");
        assertThat(c).isNotNull();
    }

    private List<String> titles(SearchQuery q) {
        return notes.search(q).stream().map(NoteService.SearchHit::title).toList();
    }

    // --- N-80, N-81 ---

    @Test
    void n80_tags_are_created_on_use_and_removed_when_unused() {
        Note a = md("A", "");
        Note b = md("B", "");
        notes.setTags(a.id(), List.of("demo", " Libros ", "libros"));
        notes.setTags(b.id(), List.of("DEMO"));
        assertThat(notes.get(a.id()).tags()).containsExactly("demo", "Libros");
        assertThat(notes.tags()).extracting(NoteService.TagCount::name).containsExactly("demo", "Libros");
        assertThat(notes.tags().getFirst().count()).isEqualTo(2);

        notes.setTags(a.id(), List.of());
        assertThat(notes.tags()).extracting(NoteService.TagCount::name).containsExactly("demo");
        notes.setTags(b.id(), List.of());
        assertThat(notes.tags()).isEmpty();
    }

    @Test
    void n80_n81_tags_and_favorite_do_not_change_the_version() {
        Note a = md("A", "");
        notes.setTags(a.id(), List.of("x"));
        notes.setFavorite(a.id(), true);
        Note after = notes.get(a.id());
        assertThat(after.version()).isEqualTo(a.version());
        assertThat(after.favorite()).isTrue();
        assertThat(notes.tree().getFirst().favorite()).isTrue();
        notes.setFavorite(a.id(), false);
        assertThat(notes.get(a.id()).favorite()).isFalse();
    }

    @Test
    void n80_purged_notes_release_their_tags() {
        Note a = md("A", "");
        notes.setTags(a.id(), List.of("solo"));
        notes.delete(a.id(), false);
        assertThat(notes.tags()).extracting(NoteService.TagCount::name).containsExactly("solo");
        notes.purge(a.id());
        assertThat(notes.tags()).isEmpty();
    }
}
