package dev.litedd.sqlengine;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.format.ResolverStyle;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Convierte los valores del formulario, que llegan como texto, a su tipo (Q-21, Q-22, Q-31).
 * Un campo vacío es null, sin excepciones.
 */
public final class ValueConverter {

    /** @param errors variable → mensaje para el campo (Q-93) */
    public record Converted(Map<String, Object> params, Map<String, String> errors) {
    }

    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("uuuu-MM-dd").withResolverStyle(ResolverStyle.STRICT);
    private static final DateTimeFormatter DATETIME = DateTimeFormatter.ofPattern("uuuu-MM-dd HH:mm:ss")
            .withResolverStyle(ResolverStyle.STRICT);
    private static final Set<String> TRUE = Set.of("true", "1", "sí", "si");
    private static final Set<String> FALSE = Set.of("false", "0", "no");

    private ValueConverter() {
    }

    public static Converted convert(List<Variable> variables, Map<String, String> raw) {
        Map<String, Object> params = new HashMap<>();
        Map<String, String> errors = new LinkedHashMap<>();
        for (Variable v : variables) {
            String text = raw == null ? null : raw.get(v.name());
            if (text == null || text.isEmpty()) {
                params.put(v.name(), null);
                continue;
            }
            try {
                params.put(v.name(), v.type() == SqlType.LIST ? list(text, v.elementType()) : scalar(text, v.type()));
            } catch (IllegalArgumentException e) {
                errors.put(v.name(), e.getMessage());
            }
        }
        return new Converted(params, errors);
    }

    private static List<Object> list(String text, SqlType elementType) {
        SqlType type = elementType == null ? SqlType.STRING : elementType;
        List<Object> out = new ArrayList<>();
        for (String part : text.split(",", -1)) {
            String item = part.strip();
            if (item.isEmpty()) {
                throw new IllegalArgumentException("Se esperaba una lista de valores separados por comas, sin elementos vacíos");
            }
            try {
                out.add(scalar(item, type));
            } catch (IllegalArgumentException e) {
                throw new IllegalArgumentException("«" + item + "»: " + e.getMessage());
            }
        }
        return out;
    }

    private static Object scalar(String text, SqlType type) {
        String t = text.strip();
        try {
            return switch (type) {
                case STRING, LIST -> text;
                case INT -> Integer.valueOf(t);
                case LONG -> Long.valueOf(t);
                case DECIMAL -> {
                    if (!t.matches("[+-]?(\\d+(\\.\\d*)?|\\.\\d+)")) {
                        throw new NumberFormatException();
                    }
                    yield new BigDecimal(t);
                }
                case BOOLEAN -> {
                    String b = t.toLowerCase(Locale.ROOT);
                    if (TRUE.contains(b)) {
                        yield Boolean.TRUE;
                    }
                    if (FALSE.contains(b)) {
                        yield Boolean.FALSE;
                    }
                    throw new IllegalArgumentException("Se esperaba sí o no (boolean)");
                }
                case DATE -> {
                    LocalDate.parse(t, DATE);
                    yield t;
                }
                case DATETIME -> {
                    LocalDateTime.parse(t, DATETIME);
                    yield t;
                }
            };
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException(switch (type) {
                case INT -> "Se esperaba un número entero (int)";
                case LONG -> "Se esperaba un número entero (long)";
                default -> "Se esperaba un número con punto decimal (decimal)";
            });
        } catch (DateTimeParseException e) {
            throw new IllegalArgumentException(type == SqlType.DATE
                    ? "Se esperaba una fecha yyyy-MM-dd (date)"
                    : "Se esperaba una fecha y hora yyyy-MM-dd HH:mm:ss (datetime)");
        }
    }
}
