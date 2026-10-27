package dev.litedd.workflow;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.cfg.JsonNodeFeature;
import com.fasterxml.jackson.databind.json.JsonMapper;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.function.Function;

/**
 * Referencias `$Nombre.ruta` a los valores de los nodos anteriores (W-30 a W-35, ADR-0031). Módulo puro: el valor
 * de cada nodo llega ya como JSON.
 */
public final class References {

    /** Un trozo de texto: literal o referencia. */
    public sealed interface Part permits Text, Ref {
    }

    public record Text(String text) implements Part {
    }

    /**
     * @param source tal como se escribió, para los mensajes: `$Conn1.data.test`
     * @param node   nombre del nodo
     * @param path   pasos: String para una clave, Integer para una posición
     */
    public record Ref(String source, String node, List<Object> path) implements Part {
    }

    /**
     * @param value   texto resuelto; null si la referencia ocupa todo el campo y vale null (W-34)
     * @param missing referencias que no existen (W-35), tal como se escribieron
     */
    public record Resolved(String value, List<String> missing) {
    }

    /** W-34: los decimales se conservan como se escribieron (`1.50`). */
    static final ObjectMapper JSON = JsonMapper.builder()
            .enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS)
            .disable(JsonNodeFeature.STRIP_TRAILING_BIGDECIMAL_ZEROES)
            .build();

    private References() {
    }

    /** W-30, W-31: trocea un campo en texto y referencias. `$$` es un `$`; un `$` sin letra detrás es texto. */
    public static List<Part> parse(String text) {
        List<Part> parts = new ArrayList<>();
        StringBuilder literal = new StringBuilder();
        int i = 0;
        while (i < text.length()) {
            char c = text.charAt(i);
            if (c != '$') {
                literal.append(c);
                i++;
                continue;
            }
            if (i + 1 < text.length() && text.charAt(i + 1) == '$') {
                literal.append('$');
                i += 2;
                continue;
            }
            int end = nameEnd(text, i + 1);
            if (end == i + 1) {
                literal.append('$');
                i++;
                continue;
            }
            String node = text.substring(i + 1, end);
            List<Object> path = new ArrayList<>();
            int pos = end;
            while (true) {
                int next = step(text, pos, path);
                if (next == pos) {
                    break;
                }
                pos = next;
            }
            if (!literal.isEmpty()) {
                parts.add(new Text(literal.toString()));
                literal.setLength(0);
            }
            parts.add(new Ref(text.substring(i, pos), node, List.copyOf(path)));
            i = pos;
        }
        if (!literal.isEmpty()) {
            parts.add(new Text(literal.toString()));
        }
        return parts;
    }

    /** Las referencias de un campo. */
    public static List<Ref> refs(String text) {
        return parse(text).stream().filter(p -> p instanceof Ref).map(p -> (Ref) p).toList();
    }

    /**
     * W-34, W-35: sustituye cada referencia por el texto de su valor. nodeValue da el valor de un nodo que ya lo
     * tiene (W-33), o vacío.
     */
    public static Resolved resolve(String text, Function<String, Optional<JsonNode>> nodeValue) {
        List<Part> parts = parse(text);
        List<String> missing = new ArrayList<>();
        if (parts.size() == 1 && parts.getFirst() instanceof Ref ref) {
            Optional<JsonNode> v = lookup(ref, nodeValue);
            if (v.isEmpty()) {
                missing.add(ref.source());
            }
            return new Resolved(v.map(References::asText).orElse(null), missing);
        }
        StringBuilder out = new StringBuilder();
        for (Part p : parts) {
            if (p instanceof Text t) {
                out.append(t.text());
            } else if (p instanceof Ref ref) {
                Optional<JsonNode> v = lookup(ref, nodeValue);
                if (v.isEmpty()) {
                    missing.add(ref.source());
                }
                String s = v.map(References::asText).orElse(null);
                out.append(s == null ? "null" : s);
            }
        }
        return new Resolved(out.toString(), missing);
    }

    /** W-35: vacío si el nodo no tiene valor o la ruta no lleva a nada. Un null de JSON sí existe. */
    static Optional<JsonNode> lookup(Ref ref, Function<String, Optional<JsonNode>> nodeValue) {
        Optional<JsonNode> root = nodeValue.apply(ref.node());
        if (root.isEmpty()) {
            return Optional.empty();
        }
        JsonNode current = root.get();
        for (Object step : ref.path()) {
            JsonNode next = null;
            if (step instanceof Integer index && current.isArray()) {
                next = current.get(index);
            } else if (step instanceof String key && current.isObject()) {
                next = current.get(key);
            }
            if (next == null || next.isMissingNode()) {
                return Optional.empty();
            }
            current = next;
        }
        return Optional.of(current);
    }

    /** W-34: cadenas tal cual, números y booleanos como en JSON, objetos y listas como JSON compacto; null es null. */
    static String asText(JsonNode v) {
        if (v.isNull()) {
            return null;
        }
        if (v.isTextual()) {
            return v.textValue();
        }
        if (v.isBigDecimal()) {
            return v.decimalValue().toPlainString();
        }
        if (v.isValueNode()) {
            return v.asText();
        }
        return v.toString();
    }

    private static int nameEnd(String text, int from) {
        if (from >= text.length() || !isLetter(text.charAt(from))) {
            return from;
        }
        int i = from + 1;
        while (i < text.length() && isWord(text.charAt(i))) {
            i++;
        }
        return i;
    }

    /** Un paso de la ruta desde pos: `.clave`, `[n]` o `["clave"]`. Devuelve pos si no hay paso. */
    private static int step(String text, int pos, List<Object> path) {
        if (pos >= text.length()) {
            return pos;
        }
        char c = text.charAt(pos);
        if (c == '.') {
            int i = pos + 1;
            while (i < text.length() && isWord(text.charAt(i))) {
                i++;
            }
            if (i == pos + 1) {
                return pos;
            }
            path.add(text.substring(pos + 1, i));
            return i;
        }
        if (c != '[' || pos + 1 >= text.length()) {
            return pos;
        }
        if (text.charAt(pos + 1) >= '0' && text.charAt(pos + 1) <= '9') {
            int i = pos + 1;
            while (i < text.length() && text.charAt(i) >= '0' && text.charAt(i) <= '9') {
                i++;
            }
            if (i >= text.length() || text.charAt(i) != ']' || i - pos - 1 > 9) {
                return pos;
            }
            path.add(Integer.parseInt(text.substring(pos + 1, i)));
            return i + 1;
        }
        if (text.charAt(pos + 1) == '"') {
            StringBuilder key = new StringBuilder();
            int i = pos + 2;
            while (i < text.length()) {
                char k = text.charAt(i);
                if (k == '\\' && i + 1 < text.length()) {
                    key.append(text.charAt(i + 1));
                    i += 2;
                } else if (k == '"') {
                    if (i + 1 < text.length() && text.charAt(i + 1) == ']') {
                        path.add(key.toString());
                        return i + 2;
                    }
                    return pos;
                } else {
                    key.append(k);
                    i++;
                }
            }
        }
        return pos;
    }

    private static boolean isLetter(char c) {
        return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z');
    }

    private static boolean isWord(char c) {
        return isLetter(c) || (c >= '0' && c <= '9') || c == '_';
    }
}
