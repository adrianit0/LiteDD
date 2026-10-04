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
