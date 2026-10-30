package dev.litedd.update;

import dev.litedd.http.ApiError;
import dev.litedd.settings.AppConfig;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class UpdateUrlsTest {

    private static AppConfig withRepository(String url) {
        AppConfig d = AppConfig.DEFAULT;
        return new AppConfig(d.defaultPageSize(), d.rowCap(), d.queryTimeoutSeconds(), d.port(), d.autoShutdownMinutes(),
                d.autosave(), d.http(), url);
    }

    @Test
    void r11_admits_a_github_repository_with_optional_suffix() {
        for (String good : List.of("https://github.com/demo/app", "https://github.com/demo/app/",
                "https://github.com/demo/app.git", "https://github.com/demo-org/my_app.v2")) {
            assertThat(UpdateUrls.isRepository(good)).as(good).isTrue();
        }
    }

    @Test
    void r11_rejects_anything_else() {
        for (String bad : List.of("http://github.com/demo/app", "https://github.com/demo",
                "https://github.com/demo/app/releases", "https://github.com/demo/app?x=1", "https://github.com/demo/app#x",
                "https://user@github.com/demo/app", "https://evil.example/demo/app", "https://github.com.evil.example/demo/app",
                "https://github.com/demo/..", "github.com/demo/app", "")) {
            assertThat(UpdateUrls.isRepository(bad)).as(bad).isFalse();
        }
    }

    @Test
    void r23_the_urls_come_from_the_repository_and_the_build() {
        for (String repository : List.of("https://github.com/demo/app", "https://github.com/demo/app/", "https://github.com/demo/app.git")) {
            assertThat(UpdateUrls.latest(repository, "latest.json"))
                    .hasToString("https://github.com/demo/app/releases/latest/download/latest.json");
            assertThat(UpdateUrls.ofBuild(repository, 42, "litedd.jar"))
                    .hasToString("https://github.com/demo/app/releases/download/build-42/litedd.jar");
        }
    }

    @Test
    void r11_the_url_is_empty_by_default_and_a_blank_one_counts_as_empty() {
        assertThat(AppConfig.DEFAULT.updateRepository()).isNull();
        assertThat(withRepository("   ").updateRepository()).isNull();
        assertThat(withRepository(" https://github.com/demo/app ").validate().updateRepository()).isEqualTo("https://github.com/demo/app");
    }

    @Test
    void r11_another_url_prevents_saving() {
        assertThatThrownBy(() -> withRepository("https://evil.example/demo/app").validate())
                .isInstanceOf(ApiError.class).hasMessageContaining("https://github.com/");
    }
}
