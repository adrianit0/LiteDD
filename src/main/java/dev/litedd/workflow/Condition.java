package dev.litedd.workflow;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import dev.litedd.workflow.References.Ref;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.function.Function;
import java.util.regex.Pattern;

/**
 * Condición de un nodo Condición (W-91, W-92, ADR-0041): valores, referencias, comparaciones, `&&`, `||`, `!` y
 * paréntesis. Módulo puro: el valor de cada nodo llega ya como JSON.
 */
public final class Condition {

    /** Una expresión ya analizada. */
    public sealed interface Expr permits Literal, Reference, Not, And, Or, Compare {
    }

    record Literal(JsonNode value) implements Expr {
    }

    record Reference(Ref ref) implements Expr {
    }

    record Not(Expr operand) implements Expr {
    }

    record And(Expr left, Expr right) implements Expr {
    }

    record Or(Expr left, Expr right) implements Expr {
    }

    record Compare(String op, Expr left, Expr right) implements Expr {
    }

    /**
     * @param value   si se cumple
     * @param missing referencias que no existían (W-35), tal como se escribieron
     */
    public record Result(boolean value, List<String> missing) {
    }

    /** W-92: un texto que es un número se compara como número. */
    private static final Pattern NUMBER = Pattern.compile("-?\\d+(\\.\\d+)?([eE][+-]?\\d+)?");
    private static final List<String> COMPARISONS = List.of("==", "!=", ">=", "<=", ">", "<");
    private static final JsonNodeFactory NODES = JsonNodeFactory.instance;

    private final String text;
    private int pos;

    private Condition(String text) {
        this.text = text;
    }

    /**
     * W-91: analiza la condición.
     *
     * @throws IllegalArgumentException con el motivo si está vacía o mal escrita
     */
    public static Expr parse(String text) {
        if (text == null || text.isBlank()) {
            throw new IllegalArgumentException("La condición está vacía");
        }
        Condition c = new Condition(text);
        Expr e = c.or();
        c.skipSpaces();
        if (c.pos < text.length()) {
            throw c.error("Sobra «" + c.rest() + "»");
        }
        return e;
    }

    /** W-36, W-61: el motivo por el que la condición no es válida, o null. */
    public static String problem(String text) {
        try {
            parse(text);
            return null;
        } catch (IllegalArgumentException e) {
            return e.getMessage();
        }
    }

    /** W-92: evalúa la condición con los valores de los nodos. */
    public static Result evaluate(Expr e, Function<String, Optional<JsonNode>> nodeValue) {
        List<String> missing = new ArrayList<>();
        boolean value = truthy(eval(e, nodeValue, missing));
        return new Result(value, missing);
    }

    // --- Análisis: or := and ('||' and)*; and := cmp ('&&' cmp)*; cmp := unary (op unary)?; unary := '!' unary | primary

    private Expr or() {
        Expr left = and();
        while (accept("||")) {
            left = new Or(left, and());
        }
        return left;
    }

    private Expr and() {
        Expr left = comparison();
        while (accept("&&")) {
            left = new And(left, comparison());
        }
        return left;
    }

    private Expr comparison() {
        Expr left = unary();
        String op = comparisonOperator();
        if (op == null) {
            return left;
        }
        Expr result = new Compare(op, left, unary());
        if (comparisonOperator() != null) {
            throw error("Dos comparaciones seguidas necesitan paréntesis");
        }
        return result;
    }

    private String comparisonOperator() {
        skipSpaces();
        for (String op : COMPARISONS) {
            if (text.startsWith(op, pos)) {
                pos += op.length();
                return op;
            }
        }
        return null;
    }

    private Expr unary() {
        skipSpaces();
        if (pos < text.length() && text.charAt(pos) == '!' && !text.startsWith("!=", pos)) {
            pos++;
            return new Not(unary());
        }
        return primary();
    }

    private Expr primary() {
        skipSpaces();
        if (pos >= text.length()) {
            throw error("Falta un valor al final");
        }
        char c = text.charAt(pos);
        if (c == '(') {
            pos++;
            Expr inner = or();
            if (!accept(")")) {
                throw error("Falta un paréntesis de cierre");
            }
            return inner;
        }
        if (c == '$') {
            Ref ref = References.refAt(text, pos);
            if (ref == null) {
                throw error("Tras «$» va el nombre de un nodo");
            }
            pos += ref.source().length();
            return new Reference(ref);
        }
        if (c == '"') {
            return new Literal(NODES.textNode(string()));
        }
        if (c == '-' || Character.isDigit(c)) {
            var m = NUMBER.matcher(text).region(pos, text.length());
            if (!m.lookingAt()) {
                throw error("Número no válido");
            }
            pos = m.end();
            return new Literal(NODES.numberNode(new BigDecimal(m.group())));
        }
        for (String word : List.of("true", "false", "null")) {
            if (text.startsWith(word, pos) && !isWord(pos + word.length())) {
                pos += word.length();
                return new Literal(word.equals("null") ? NODES.nullNode() : NODES.booleanNode(word.equals("true")));
            }
        }
        throw error(c == ')' ? "Sobra «)»" : "No se esperaba «" + rest() + "»: los textos van entre comillas");
    }

    private String string() {
        StringBuilder out = new StringBuilder();
        int i = pos + 1;
        while (i < text.length()) {
            char k = text.charAt(i);
            if (k == '\\' && i + 1 < text.length()) {
                out.append(text.charAt(i + 1));
                i += 2;
            } else if (k == '"') {
                pos = i + 1;
                return out.toString();
            } else {
                out.append(k);
                i++;
            }
        }
        throw error("Falta la comilla de cierre de un texto");
    }

    private boolean accept(String token) {
        skipSpaces();
        if (text.startsWith(token, pos)) {
            pos += token.length();
            return true;
        }
        return false;
    }

    private void skipSpaces() {
        while (pos < text.length() && Character.isWhitespace(text.charAt(pos))) {
            pos++;
        }
    }

    private boolean isWord(int i) {
        return i < text.length() && (Character.isLetterOrDigit(text.charAt(i)) || text.charAt(i) == '_');
    }

    private String rest() {
        String r = text.substring(pos).strip();
        return r.length() > 20 ? r.substring(0, 20) + "…" : r;
    }

    private IllegalArgumentException error(String message) {
        return new IllegalArgumentException(message);
    }

    // --- Evaluación

    private static JsonNode eval(Expr e, Function<String, Optional<JsonNode>> nodeValue, List<String> missing) {
        return switch (e) {
            case Literal l -> l.value();
            case Reference r -> {
                Optional<JsonNode> v = References.lookup(r.ref(), nodeValue);
                if (v.isEmpty() && !missing.contains(r.ref().source())) {
                    missing.add(r.ref().source());
                }
                yield v.orElse(NODES.nullNode());
            }
            case Not n -> NODES.booleanNode(!truthy(eval(n.operand(), nodeValue, missing)));
            case And a -> NODES.booleanNode(truthy(eval(a.left(), nodeValue, missing)) && truthy(eval(a.right(), nodeValue, missing)));
            case Or o -> NODES.booleanNode(truthy(eval(o.left(), nodeValue, missing)) || truthy(eval(o.right(), nodeValue, missing)));
            case Compare c -> NODES.booleanNode(compare(c.op(), eval(c.left(), nodeValue, missing), eval(c.right(), nodeValue, missing)));
        };
    }

    /** W-92: falso si vale null, false, 0, texto vacío o lista vacía. */
    static boolean truthy(JsonNode v) {
        if (v == null || v.isNull() || v.isMissingNode()) {
            return false;
        }
        if (v.isBoolean()) {
            return v.booleanValue();
        }
        BigDecimal n = number(v);
        if (n != null) {
            return n.signum() != 0;
        }
        if (v.isTextual()) {
            return !v.textValue().isEmpty();
        }
        if (v.isArray()) {
            return !v.isEmpty();
        }
        return true;
    }

    /** W-92: como números si los dos lo son; si no, como texto. null solo es igual a null y no se ordena. */
    static boolean compare(String op, JsonNode left, JsonNode right) {
        boolean leftNull = left.isNull() || left.isMissingNode();
        boolean rightNull = right.isNull() || right.isMissingNode();
        if (leftNull || rightNull) {
            return switch (op) {
                case "==" -> leftNull && rightNull;
                case "!=" -> leftNull != rightNull;
                default -> false;
            };
        }
        BigDecimal a = number(left);
        BigDecimal b = number(right);
        int cmp = a != null && b != null ? a.compareTo(b) : References.asText(left).compareTo(References.asText(right));
        return switch (op) {
            case "==" -> cmp == 0;
            case "!=" -> cmp != 0;
            case ">" -> cmp > 0;
            case ">=" -> cmp >= 0;
            case "<" -> cmp < 0;
            default -> cmp <= 0;
        };
    }

    private static BigDecimal number(JsonNode v) {
        if (v.isNumber()) {
            return v.decimalValue();
        }
        if (v.isTextual() && NUMBER.matcher(v.textValue()).matches()) {
            return new BigDecimal(v.textValue());
        }
        return null;
    }
}
