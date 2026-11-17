package dev.litedd.settings;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.litedd.http.ApiError;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Q-100: referencias de claves foráneas en config.json (ADR-0048). */
class AppConfigReferencesTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    private static AppConfig with(AppConfig.Reference... references) {
        AppConfig d = AppConfig.DEFAULT;
        return new AppConfig(d.defaultPageSize(), d.rowCap(), d.queryTimeoutSeconds(), d.port(), d.autoShutdownMinutes(),
                d.autosave(), d.http(), null, List.of(references));
    }

    @Test
    void q100_a_config_without_references_has_none() throws Exception {
        assertThat(AppConfig.DEFAULT.references()).isEmpty();
        AppConfig old = JSON.readValue("{\"defaultPageSize\":20,\"rowCap\":10000,\"queryTimeoutSeconds\":30,\"port\":47600}",
                AppConfig.class);
        assertThat(old.references()).isEmpty();
    }

    @Test
    void q100_a_reference_has_table_color_and_note_and_is_born_cerulean() throws Exception {
        AppConfig.Reference r = new AppConfig.Reference(" author ", null, " n1 ");
        assertThat(r).isEqualTo(new AppConfig.Reference("author", "#007ba7", "n1"));
        assertThat(new AppConfig.Reference("author", "#00AAFF", "n1").color()).isEqualTo("#00aaff");

        AppConfig saved = with(r, new AppConfig.Reference("book", "#ff0000", "n2")).validate();
        AppConfig read = JSON.readValue(JSON.writeValueAsString(saved), AppConfig.class);
        assertThat(read.references()).containsExactly(r, new AppConfig.Reference("book", "#ff0000", "n2"));
        // Q-107: se busca sin distinguir mayúsculas.
        assertThat(read.reference("AUTHOR")).contains(r);
        assertThat(read.reference("loan")).isEmpty();
    }

    @Test
    void q100_invalid_references_are_rejected() {
        List<AppConfig> bad = List.of(
                with(new AppConfig.Reference("", null, "n1")),
                with(new AppConfig.Reference("a".repeat(65), null, "n1")),
                with(new AppConfig.Reference("auth\nor", null, "n1")),
                with(new AppConfig.Reference("author", null, "n1"), new AppConfig.Reference("Author", null, "n2")),
                with(new AppConfig.Reference("author", "blue", "n1")),
                with(new AppConfig.Reference("author", "#12345", "n1")),
                with(new AppConfig.Reference("author", null, " ")));
        for (AppConfig config : bad) {
            assertThatThrownBy(config::validate).as(config.references().toString()).isInstanceOf(ApiError.class)
                    .hasFieldOrPropertyWithValue("code", "invalid_config");
        }
        assertThatThrownBy(() -> with(new AppConfig.Reference("author", null, "n1"), new AppConfig.Reference("AUTHOR", null, "n2"))
                .validate()).hasMessage("La tabla objetivo «AUTHOR» está repetida");
        assertThatThrownBy(() -> with(new AppConfig.Reference("author", null, null)).validate())
                .hasMessage("La referencia «author» necesita una nota SQL");
    }
}
