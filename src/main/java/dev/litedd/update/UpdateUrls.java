package dev.litedd.update;

import dev.litedd.http.ApiError;

import java.net.URI;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** URL del repositorio de «Ajustes» y rutas de sus releases (R-11, R-23). */
public final class UpdateUrls {

    private static final Pattern REPOSITORY =
            Pattern.compile("https://github\\.com/([A-Za-z0-9-]+/[A-Za-z0-9_][A-Za-z0-9._-]*?)(?:\\.git)?/?");

    private UpdateUrls() {
    }

    public static boolean isRepository(String url) {
        return REPOSITORY.matcher(url).matches();
    }

    /** Lo último publicado, sin pasar por api.github.com. */
    static URI latest(String repository, String file) {
        return URI.create(base(repository) + "/releases/latest/download/" + file);
    }

    /** R-23: el JAR se pide por su build, para que sea el del manifiesto verificado. */
    static URI ofBuild(String repository, long build, String file) {
        return URI.create(base(repository) + "/releases/download/build-" + build + "/" + file);
    }

    private static String base(String repository) {
        Matcher m = REPOSITORY.matcher(repository);
        if (!m.matches()) {
            throw new ApiError(409, "update_not_configured", "La URL del repositorio no es válida");
        }
        return "https://github.com/" + m.group(1);
    }
}
