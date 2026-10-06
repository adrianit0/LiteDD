package dev.litedd.httpnotes;

import dev.litedd.http.ApiError;
import dev.litedd.httpnotes.HttpNoteContent.Body;
import dev.litedd.httpnotes.HttpNoteContent.Generated;
import dev.litedd.httpnotes.HttpNoteContent.Row;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Variables #{nombre} de una nota HTTP (H-12, H-18, ADR-0022): la misma sintaxis que en SQL, en el
 * endpoint, params, cabeceras, cuerpo raw y form-data. Un nombre repetido usa el mismo valor.
 */
public final class Variables {

    static final Pattern VARIABLE = Pattern.compile("#\\{([^{}]+)}");
    /** H-18: la forma antigua {nombre}, que ya no es variable. */
    private static final Pattern OLD_VARIABLE = Pattern.compile("(?<!#)\\{([^{}/]+)}");

    private Variables() {
    }

    /** H-12: nombres en orden de aparición, sin repetir; solo de lo que se envía. */
    public static List<String> names(HttpNoteContent c) {
        Set<String> names = new LinkedHashSet<>();
        collect(c.endpoint(), names);
        for (Row r : active(c.params())) {
            collect(r.key(), names);
            collect(r.value(), names);
        }
        for (Row r : active(c.headers())) {
            collect(r.key(), names);
            collect(r.value(), names);
        }
        for (Generated g : c.generated().values()) {
            if (g.enabled() == null || g.enabled()) {
                collect(g.value(), names);
            }
        }
        if ("raw".equals(c.body().mode())) {
            collect(c.body().raw(), names);
        } else if ("form-data".equals(c.body().mode())) {
            for (Row r : active(c.body().form())) {
                collect(r.key(), names);
                collect(r.value(), names);
            }
        }
        return List.copyOf(names);
    }

    /** H-12: cualquier variable vacía impide enviar. H-18: una {nombre} antigua en el endpoint se avisa. */
    static void requireAll(HttpNoteContent c, Map<String, String> values) {
        Matcher old = OLD_VARIABLE.matcher(VARIABLE.matcher(c.endpoint()).replaceAll(""));
        if (old.find()) {
            throw new ApiError(400, "old_variable",
                    "Las variables se escriben #{nombre}: cambia {" + old.group(1) + "} por #{" + old.group(1) + "}");
        }
        List<String> missing = new ArrayList<>();
        for (String name : names(c)) {
            String v = values.get(name);
            if (v == null || v.isEmpty()) {
                missing.add(name);
            }
        }
        if (!missing.isEmpty()) {
            throw new ApiError(400, "missing_value", "Falta el valor de " + String.join(", ", missing), missing);
        }
    }

    /**
     * H-18: params, cabeceras y cuerpo con los valores puestos tal cual. El endpoint no se toca: su
     * sustitución codifica el valor (LocalUrls.compose).
     */
    static HttpNoteContent fill(HttpNoteContent c, Map<String, String> values) {
        Map<String, Generated> generated = new LinkedHashMap<>();
        c.generated().forEach((name, g) -> generated.put(name, new Generated(fill(g.value(), values), g.enabled())));
        Body b = c.body();
        Body body = new Body(b.mode(), b.rawType(), fill(b.raw(), values), fill(b.form(), values));
        return new HttpNoteContent(c.method(), c.endpoint(), c.pathValues(), fill(c.params(), values), fill(c.headers(), values),
                generated, body, c.login(), c.user(), c.hideGenerated());
    }

    /** H-12, H-18: sustitución de un texto; quote transforma el valor antes de ponerlo. */
    static String fill(String text, Map<String, String> values, java.util.function.UnaryOperator<String> quote) {
        if (text == null) {
            return null;
        }
        Matcher m = VARIABLE.matcher(text);
        StringBuilder out = new StringBuilder();
        while (m.find()) {
            String value = values.getOrDefault(m.group(1).strip(), "");
            m.appendReplacement(out, Matcher.quoteReplacement(quote.apply(value)));
        }
        m.appendTail(out);
        return out.toString();
    }

    static String fill(String text, Map<String, String> values) {
        return fill(text, values, v -> v);
    }

    private static List<Row> fill(List<Row> rows, Map<String, String> values) {
        return rows.stream().map(r -> new Row(fill(r.key(), values), fill(r.value(), values), r.enabled())).toList();
    }

    private static List<Row> active(List<Row> rows) {
        return rows.stream().filter(Row::active).toList();
    }

    private static void collect(String text, Set<String> names) {
        if (text == null) {
            return;
        }
        Matcher m = VARIABLE.matcher(text);
        while (m.find()) {
            String name = m.group(1).strip();
            if (!name.isEmpty()) {
                names.add(name);
            }
        }
    }
}
