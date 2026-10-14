package dev.litedd.sqlengine;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Constantes Java de OGNL, @paquete.Clase@CAMPO (M-60 a M-64, ADR-0025). LiteDD no carga clases: cada referencia
 * pasa a MyBatis como una variable interna con el valor que ha dado el usuario.
 */
public final class JavaConstants {

    /** Contenido con las referencias cambiadas por variables internas y sus valores. */
    public record Applied(String content, Map<String, Object> params, List<SqlError> errors) {
    }

    /** Prefijo de las variables internas; NoteSource no las trata como variables de la nota (M-64). */
    public static final String PREFIX = "__constant_";
    /** M-60: sin «(» detrás, porque eso es una llamada a un método estático. */
    private static final Pattern REFERENCE = Pattern.compile(
            "@([A-Za-z_$][\\w$]*(?:\\.[A-Za-z_$][\\w$]*)*)@([A-Za-z_$][\\w$]*)\\b(?!\\s*\\()");
    private static final Pattern NAME = Pattern.compile("[A-Za-z_$][\\w$]*(?:\\.[A-Za-z_$][\\w$]*)*@[A-Za-z_$][\\w$]*");
    private static final Pattern INTEGER = Pattern.compile("-?(?:0|[1-9]\\d*)");
    private static final Pattern DECIMAL = Pattern.compile("-?(?:0|[1-9]\\d*)\\.\\d+");

    private JavaConstants() {
    }

    /** M-61: nombres «paquete.Clase@CAMPO» en orden de aparición. */
    public static Set<String> find(String content) {
        Set<String> out = new LinkedHashSet<>();
        Matcher m = REFERENCE.matcher(content);
        while (m.find()) {
            out.add(m.group(1) + "@" + m.group(2));
        }
        return out;
    }

    public static boolean isName(String name) {
        return name != null && NAME.matcher(name).matches();
    }

    /** «Clase.CAMPO», sin el paquete. */
    public static String shortName(String name) {
        int at = name.indexOf('@');
        String type = name.substring(0, at);
        return type.substring(type.lastIndexOf('.') + 1) + "." + name.substring(at + 1);
    }

    /** M-62, M-63: sustituye cada referencia; las que no tienen valor dan un error y valen null. */
    public static Applied apply(String content, Map<String, String> values) {
        Map<String, String> variables = new HashMap<>();
        Map<String, Object> params = new LinkedHashMap<>();
        List<SqlError> errors = new ArrayList<>();
        Matcher m = REFERENCE.matcher(content);
        String replaced = m.replaceAll(r -> {
            String name = r.group(1) + "@" + r.group(2);
            String variable = variables.computeIfAbsent(name, k -> {
                String v = PREFIX + variables.size();
                String value = values.get(k);
                if (value == null) {
                    errors.add(SqlError.of("constant", "La constante «" + shortName(k) + "» no tiene valor. Dale uno en «Constantes»."));
                }
                params.put(v, typed(value));
                return v;
            });
            return Matcher.quoteReplacement(variable);
        });
        return new Applied(replaced, params, errors);
    }

    /** M-62: un entero o un decimal es un número; cualquier otro valor, texto. */
    static Object typed(String value) {
        if (value == null) {
            return null;
        }
        if (INTEGER.matcher(value).matches()) {
            BigDecimal n = new BigDecimal(value);
            try {
                return n.intValueExact();
            } catch (ArithmeticException e) {
                try {
                    return n.longValueExact();
                } catch (ArithmeticException tooBig) {
                    return n;
                }
            }
        }
        if (DECIMAL.matcher(value).matches()) {
            return new BigDecimal(value);
        }
        return value;
    }
}
