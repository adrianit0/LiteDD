package dev.litedd.mysql;

import dev.litedd.http.ApiError;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Set;

/** URL de C-05. Los parámetros adicionales van después y no pueden reabrir lo que se cierra aquí. */
public final class JdbcUrl {

    static final String FIXED = "useSSL=false&allowPublicKeyRetrieval=true&characterEncoding=UTF-8&allowMultiQueries=false"
            + "&tinyInt1isBit=false&zeroDateTimeBehavior=CONVERT_TO_NULL&connectTimeout=5000";

    /** C-05, C-08, ADR-0012 */
    private static final Set<String> FORBIDDEN = Set.of("allowmultiqueries", "autoreconnect", "allowloadlocalinfile",
            "allowloadlocalinfileinpath", "allowurlinlocalinfile");

    private JdbcUrl() {
    }

    public static String build(ConnectionSettings s, boolean withSchema) {
        String schema = withSchema ? URLEncoder.encode(s.schemaOrEmpty(), StandardCharsets.UTF_8) : "";
        String extra = clean(s.extraParams());
        return "jdbc:mysql://" + s.host().strip() + ":" + s.port() + "/" + schema + "?" + FIXED
                + (extra.isEmpty() ? "" : "&" + extra);
    }

    public static void validateExtra(String extraParams) {
        for (String pair : clean(extraParams).split("&")) {
            if (pair.isBlank()) {
                continue;
            }
            String key = pair.split("=", 2)[0].strip().toLowerCase(Locale.ROOT);
            if (FORBIDDEN.contains(key)) {
                throw new ApiError(400, "forbidden_parameter", "El parámetro JDBC «" + pair.split("=", 2)[0].strip()
                        + "» no se puede usar: LiteDD lo mantiene desactivado por seguridad");
            }
        }
    }

    private static String clean(String extra) {
        if (extra == null) {
            return "";
        }
        String e = extra.strip();
        while (e.startsWith("?") || e.startsWith("&")) {
            e = e.substring(1);
        }
        return e;
    }
}
