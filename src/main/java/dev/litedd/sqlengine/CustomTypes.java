package dev.litedd.sqlengine;

import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Q-110, Q-111, ADR-0050: los nombres de los tipos personalizados de «Ajustes», como «lang» o «catalogo#{id}», y cómo
 * se resuelve su uso en un token, como «catalogo5».
 */
public final class CustomTypes {

    /** Q-110: identificador con un parámetro opcional al final. */
    public static final Pattern NAME = Pattern.compile("([A-Za-z_][A-Za-z0-9_]*)(?:#\\{\\s*([A-Za-z_][A-Za-z0-9_]*)\\s*})?");
    public static final int MAX_NAME = 64;
    public static final CustomTypes NONE = new CustomTypes(List.of());

    /**
     * @param name      el nombre tal como está en «Ajustes»
     * @param parameter nombre del parámetro, o null si el tipo no tiene
     * @param value     valor del parámetro en este uso, o null si el tipo no tiene
     */
    public record Resolved(String name, String parameter, String value) {
    }

    private record Definition(String name, String prefix, String parameter) {
    }

    private final List<Definition> definitions;

    private CustomTypes(List<Definition> definitions) {
        this.definitions = definitions;
    }

    /** Los nombres que no son válidos se ignoran: la validación de «Ajustes» ya los rechaza. */
    public static CustomTypes of(List<String> names) {
        return new CustomTypes(names.stream()
                .map(n -> n == null ? null : NAME.matcher(n.strip()))
                .filter(m -> m != null && m.matches())
                .map(m -> new Definition(m.group(0), m.group(1), m.group(2)))
                // Q-111: con varios tipos con parámetro, el de nombre más largo.
                .sorted(Comparator.comparingInt((Definition d) -> d.prefix().length()).reversed())
                .toList());
    }

    /** Q-110: el prefijo, sin el parámetro, de un nombre válido; vacío si no lo es. */
    public static Optional<String> prefix(String name) {
        Matcher m = NAME.matcher(name == null ? "" : name.strip());
        return m.matches() ? Optional.of(m.group(1)) : Optional.empty();
    }

    /** Q-111: el tipo de un uso, primero sin parámetro y después con él. */
    public Optional<Resolved> resolve(String usage) {
        String u = usage.strip();
        for (Definition d : definitions) {
            if (d.parameter() == null && d.prefix().equalsIgnoreCase(u)) {
                return Optional.of(new Resolved(d.name(), null, null));
            }
        }
        String lower = u.toLowerCase(Locale.ROOT);
        for (Definition d : definitions) {
            if (d.parameter() != null && u.length() > d.prefix().length()
                    && lower.startsWith(d.prefix().toLowerCase(Locale.ROOT))) {
                return Optional.of(new Resolved(d.name(), d.parameter(), u.substring(d.prefix().length())));
            }
        }
        return Optional.empty();
    }
}
