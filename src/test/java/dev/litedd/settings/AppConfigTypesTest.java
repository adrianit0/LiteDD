package dev.litedd.settings;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.litedd.http.ApiError;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Q-110: tipos personalizados de variable en config.json (ADR-0050). */
class AppConfigTypesTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    private static AppConfig with(AppConfig.CustomType... types) {
        AppConfig d = AppConfig.DEFAULT;
        return new AppConfig(d.defaultPageSize(), d.rowCap(), d.queryTimeoutSeconds(), d.port(), d.autoShutdownMinutes(),
                d.autosave(), d.http(), null, List.of(), List.of(types));
    }

    @Test
    void q110_a_config_without_types_has_none() throws Exception {
        assertThat(AppConfig.DEFAULT.types()).isEmpty();
        AppConfig old = JSON.readValue("{\"defaultPageSize\":20,\"rowCap\":10000,\"queryTimeoutSeconds\":30,\"port\":47600}",
                AppConfig.class);
        assertThat(old.types()).isEmpty();
        assertThat(old.customTypes().resolve("lang")).isEmpty();
    }

    @Test
    void q110_a_type_has_name_and_note_and_is_saved_in_order() throws Exception {
        AppConfig.CustomType lang = new AppConfig.CustomType(" lang ", " n1 ");
        assertThat(lang).isEqualTo(new AppConfig.CustomType("lang", "n1"));
        AppConfig saved = with(lang, new AppConfig.CustomType("catalogo#{id}", "n2"), new AppConfig.CustomType("lang#{id}", "n3"))
                .validate();
        String text = JSON.writeValueAsString(saved);
        assertThat(text).doesNotContain("customTypes");
        AppConfig read = JSON.readValue(text, AppConfig.class);
        assertThat(read.types()).containsExactly(lang, new AppConfig.CustomType("catalogo#{id}", "n2"),
                new AppConfig.CustomType("lang#{id}", "n3"));
        // Q-111: el motor ve los nombres.
        assertThat(read.customTypes().resolve("Catalogo5").orElseThrow().value()).isEqualTo("5");
        assertThat(read.customType("catalogo#{id}").orElseThrow().noteId()).isEqualTo("n2");
    }

    @Test
    void q110_invalid_types_are_rejected() {
        List<AppConfig> bad = List.of(
                with(new AppConfig.CustomType("", "n1")),
                with(new AppConfig.CustomType("5lang", "n1")),
                with(new AppConfig.CustomType("la ng", "n1")),
                with(new AppConfig.CustomType("cat#{id}x", "n1")),
                with(new AppConfig.CustomType("a".repeat(65), "n1")),
                with(new AppConfig.CustomType("int", "n1")),
                with(new AppConfig.CustomType("Boolean", "n1")),
                with(new AppConfig.CustomType("lang", "n1"), new AppConfig.CustomType("LANG", "n2")),
                with(new AppConfig.CustomType("cat#{id}", "n1"), new AppConfig.CustomType("Cat#{x}", "n2")),
                with(new AppConfig.CustomType("lang", " ")));
        for (AppConfig config : bad) {
            assertThatThrownBy(config::validate).as(config.types().toString()).isInstanceOf(ApiError.class)
                    .hasFieldOrPropertyWithValue("code", "invalid_config");
        }
        assertThatThrownBy(() -> with(new AppConfig.CustomType("lang", "n1"), new AppConfig.CustomType("Lang", "n2")).validate())
                .hasMessage("El tipo «Lang» está repetido");
        assertThatThrownBy(() -> with(new AppConfig.CustomType("lang", null)).validate())
                .hasMessage("El tipo «lang» necesita una nota SQL");
        assertThatThrownBy(() -> with(new AppConfig.CustomType("date", "n1")).validate())
                .hasMessage("El tipo «date» ya es un tipo de LiteDD");
        // Un tipo con parámetro puede empezar como uno de LiteDD: «int5» no es int y los de LiteDD se buscan antes.
        with(new AppConfig.CustomType("int#{id}", "n1")).validate();
    }
}
