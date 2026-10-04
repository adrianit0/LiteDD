package dev.litedd.sqlengine;

import org.apache.ibatis.builder.BuilderException;
import org.apache.ibatis.mapping.BoundSql;
import org.apache.ibatis.mapping.ParameterMapping;
import org.apache.ibatis.mapping.SqlSource;
import org.apache.ibatis.reflection.MetaObject;
import org.apache.ibatis.scripting.LanguageDriver;
import org.apache.ibatis.scripting.xmltags.XMLLanguageDriver;
import org.apache.ibatis.session.Configuration;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Genera el SQL con el motor real de MyBatis (Q-30): no se reimplementa ninguna etiqueta. La
 * ejecución es JDBC directo (Q-32); aquí solo se obtiene el SQL con «?» y sus parámetros en orden.
 */
public final class SqlRenderer {

    public record BoundParameter(int index, Object value, String type) {
    }

    public record RenderedSql(String sql, List<BoundParameter> parameters) {
    }

    private static final int CACHE_SIZE = 200;
    private static final Pattern EXPRESSION = Pattern.compile("Error evaluating expression '(.*?)'", Pattern.DOTALL);

    /** Única y reutilizada. */
    private final Configuration configuration = new Configuration();
    private final LanguageDriver driver = new XMLLanguageDriver();
    /** Q-33: SqlSource por hash del contenido. */
    private final Map<String, SqlSource> cache = Collections.synchronizedMap(new LinkedHashMap<>(16, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, SqlSource> eldest) {
            return size() > CACHE_SIZE;
        }
    });

    public RenderedSql render(String body, Map<String, Object> params) {
        SqlSource source = cache.computeIfAbsent(hash(body), k -> createSource(body));
        BoundSql bound;
        try {
            bound = source.getBoundSql(params);
        } catch (RuntimeException e) {
            throw translate(e);
        }
        MetaObject meta = configuration.newMetaObject(params);
        List<BoundParameter> out = new ArrayList<>();
        int index = 1;
        for (ParameterMapping pm : bound.getParameterMappings()) {
            String prop = pm.getProperty();
            Object value;
            try {
                value = bound.hasAdditionalParameter(prop) ? bound.getAdditionalParameter(prop) : meta.getValue(prop);
            } catch (RuntimeException e) {
                throw new SqlException(SqlError.of("mybatis", "No se puede leer el parámetro «" + prop + "»: " + rootMessage(e)));
            }
            out.add(new BoundParameter(index++, value, typeOf(value)));
        }
        return new RenderedSql(bound.getSql(), out);
    }

    int cacheSize() {
        return cache.size();
    }

    private SqlSource createSource(String body) {
        try {
            return driver.createSqlSource(configuration, "<script>" + body + "</script>", Map.class);
        } catch (RuntimeException e) {
            throw translate(e);
        }
    }

    /** Q-91: la expresión y el error de OGNL. */
    private static SqlException translate(RuntimeException e) {
        String message = e.getMessage() == null ? e.toString() : e.getMessage();
        Matcher m = EXPRESSION.matcher(message);
        if (e instanceof BuilderException && m.find()) {
            boolean syntax = causeChainContains(e, "ExpressionSyntaxException");
            return new SqlException(new SqlError(syntax ? "ognl" : "ognl_runtime",
                    "Expresión no válida «" + m.group(1) + "»: " + rootMessage(e), null, null, null));
        }
        return new SqlException(SqlError.of("mybatis", "MyBatis no puede procesar la nota: " + rootMessage(e)));
    }

    private static boolean causeChainContains(Throwable e, String simpleName) {
        for (Throwable t = e; t != null; t = t.getCause()) {
            if (t.getClass().getSimpleName().equals(simpleName)) {
                return true;
            }
        }
        return false;
    }

    private static String rootMessage(Throwable e) {
        Throwable t = e;
        while (t.getCause() != null && t.getCause() != t) {
            t = t.getCause();
        }
        String m = t.getMessage();
        return m == null ? t.getClass().getSimpleName() : m.strip();
    }

    /** Tipo para la vista «Con parámetros» (Q-71). */
    static String typeOf(Object value) {
        if (value == null) {
            return "null";
        }
        if (value instanceof Integer) {
            return SqlType.INT.label();
        }
        if (value instanceof Long) {
            return SqlType.LONG.label();
        }
        if (value instanceof BigDecimal) {
            return SqlType.DECIMAL.label();
        }
        if (value instanceof Boolean) {
            return SqlType.BOOLEAN.label();
        }
        if (value instanceof String) {
            return SqlType.STRING.label();
        }
        return value.getClass().getSimpleName().toLowerCase();
    }

    private static String hash(String body) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(body.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
