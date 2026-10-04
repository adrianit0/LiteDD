package dev.litedd.sqlengine;

import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.xml.sax.ErrorHandler;
import org.xml.sax.InputSource;
import org.xml.sax.SAXException;
import org.xml.sax.SAXParseException;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;
import java.io.IOException;
import java.io.StringReader;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Prepara el contenido de una nota SQL para MyBatis: valida el XML (Q-04), quita el elemento
 * envolvente (Q-02), rechaza &lt;include&gt; (Q-03), detecta variables y tipos (Q-10 a Q-17) y quita
 * los tipos de los tokens (Q-12).
 */
public final class NoteSource {

    /**
     * @param body      cuerpo listo para MyBatis, sin envoltorio y con los tokens sin tipo
     * @param variables en orden de aparición
     */
    public record PreparedNote(String body, List<Variable> variables, List<SqlError> errors) {
    }

    private static final String OPEN = "<script>";
    private static final Set<String> WRAPPERS = Set.of("select", "insert", "update", "delete");
    private static final Pattern TOKEN = Pattern.compile("([#$])\\{([^}]*)}");
    private static final Pattern WRAPPED = Pattern.compile(
            "^\\s*(?:<!--.*?-->\\s*)*<(select|insert|update|delete)\\b[^>]*>(.*)</\\1\\s*>\\s*(?:<!--.*?-->\\s*)*$",
            Pattern.DOTALL);
    private static final Pattern IDENTIFIER = Pattern.compile("[A-Za-z_$][A-Za-z0-9_$]*");
    /** Q-11: palabras y literales de OGNL. */
    private static final Set<String> OGNL_WORDS = Set.of("null", "true", "false", "and", "or", "not", "in", "eq",
            "neq", "lt", "lte", "gt", "gte", "shl", "shr", "ushr", "band", "bor", "xor", "instanceof", "new");
    private static final Set<String> RESERVED = Set.of("_parameter", "_databaseId");

    private NoteSource() {
    }

    public static PreparedNote prepare(String content) {
        Document doc;
        try {
            doc = parse(OPEN + content + "</script>");
        } catch (SAXParseException e) {
            int line = e.getLineNumber();
            int column = line == 1 ? Math.max(1, e.getColumnNumber() - OPEN.length()) : e.getColumnNumber();
            String message = "XML no válido en la línea " + line + ", columna " + column + ": " + e.getMessage();
            return failed(content, new SqlError("xml", message, line, column, null));
        } catch (SAXException | IOException e) {
            return failed(content, new SqlError("xml", "XML no válido: " + e.getMessage(), null, null, null));
        }

        Element root = doc.getDocumentElement();
        if (root.getElementsByTagName("include").getLength() > 0) {
            return failed(content, SqlError.of("include", "La etiqueta <include> no está admitida: no admitido en esta versión"));
        }

        Element container = root;
        String body = content;
        List<Element> topElements = new ArrayList<>();
        boolean textOutside = false;
        for (Node n = root.getFirstChild(); n != null; n = n.getNextSibling()) {
            if (n.getNodeType() == Node.ELEMENT_NODE) {
                topElements.add((Element) n);
            } else if ((n.getNodeType() == Node.TEXT_NODE || n.getNodeType() == Node.CDATA_SECTION_NODE)
                    && !n.getNodeValue().isBlank()) {
                textOutside = true;
            }
        }
        if (topElements.stream().anyMatch(e -> WRAPPERS.contains(e.getTagName()))) {
            Matcher m = WRAPPED.matcher(content);
            if (topElements.size() != 1 || textOutside || !m.matches()) {
                return failed(content, SqlError.of("wrapper",
                        "Solo se admite un elemento <select>, <insert>, <update> o <delete> envolvente, sin texto fuera de él"));
            }
            container = topElements.getFirst();
            body = m.group(2);
        }

        Analysis analysis = new Analysis();
        analysis.collectLocals(container);
        analysis.walk(container);
        List<Variable> variables = analysis.variables();
        return new PreparedNote(stripTypes(body), variables, analysis.errors);
    }

    private static PreparedNote failed(String content, SqlError error) {
        return new PreparedNote(content, List.of(), List.of(error));
    }

    /** Q-12: #{nombre,tipo} y #{nombre, javaType=tipo} pasan a MyBatis como #{nombre}. */
    private static String stripTypes(String body) {
        return TOKEN.matcher(body).replaceAll(m -> Matcher.quoteReplacement(
                m.group(1) + "{" + m.group(2).split(",", 2)[0].strip() + "}"));
    }

    /** Q-04: XML seguro, sin DTD ni entidades externas. */
    private static Document parse(String xml) throws SAXException, IOException {
        try {
            DocumentBuilderFactory f = DocumentBuilderFactory.newInstance();
            f.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            f.setFeature("http://xml.org/sax/features/external-general-entities", false);
            f.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
            f.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            f.setXIncludeAware(false);
            f.setExpandEntityReferences(false);
            f.setNamespaceAware(false);
            DocumentBuilder b = f.newDocumentBuilder();
            b.setErrorHandler(new ErrorHandler() {
                @Override
                public void warning(SAXParseException e) {
                    // Las advertencias no impiden usar la nota.
                }

                @Override
                public void error(SAXParseException e) throws SAXException {
                    throw e;
                }

                @Override
                public void fatalError(SAXParseException e) throws SAXException {
                    throw e;
                }
            });
            return b.parse(new InputSource(new StringReader(xml)));
        } catch (ParserConfigurationException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Recorrido del documento para Q-10 a Q-17. */
    private static final class Analysis {

        private final Map<String, Usage> usages = new LinkedHashMap<>();
        private final Set<String> locals = new HashSet<>();
        /** item de foreach → variable de su collection */
        private final Map<String, String> itemCollection = new HashMap<>();
        private final Map<String, Set<SqlType>> itemTypes = new HashMap<>();
        private final Map<String, Set<SqlType>> commentTypes = new HashMap<>();
        private final List<SqlError> errors = new ArrayList<>();

        private static final class Usage {
            final Set<SqlType> declared = new LinkedHashSet<>();
            boolean textual;
            boolean collection;
        }

        /** Q-11: item e index de foreach y name de bind son locales en toda la nota. */
        void collectLocals(Element container) {
            List<Element> all = new ArrayList<>();
            all.add(container);
            for (int i = 0; i < all.size(); i++) {
                Element e = all.get(i);
                switch (e.getTagName()) {
                    case "foreach" -> {
                        addLocal(e.getAttribute("item"));
                        addLocal(e.getAttribute("index"));
                    }
                    case "bind" -> addLocal(e.getAttribute("name"));
                    default -> {
                    }
                }
                for (Node n = e.getFirstChild(); n != null; n = n.getNextSibling()) {
                    if (n.getNodeType() == Node.ELEMENT_NODE) {
                        all.add((Element) n);
                    }
                }
            }
        }

        private void addLocal(String name) {
            if (!name.isBlank()) {
                locals.add(name.strip());
            }
        }

        void walk(Node node) {
            for (Node n = node.getFirstChild(); n != null; n = n.getNextSibling()) {
                switch (n.getNodeType()) {
                    case Node.TEXT_NODE, Node.CDATA_SECTION_NODE -> tokens(n.getNodeValue(), false);
                    case Node.COMMENT_NODE -> tokens(n.getNodeValue(), true);
                    case Node.ELEMENT_NODE -> element((Element) n);
                    default -> {
                    }
                }
            }
        }

        private void element(Element e) {
            switch (e.getTagName()) {
                case "if", "when" -> ognl(e.getAttribute("test"));
                case "foreach" -> {
                    List<String> roots = ognlRoots(e.getAttribute("collection"));
                    if (!roots.isEmpty()) {
                        String collection = roots.getFirst();
                        use(collection).collection = true;
                        String item = e.getAttribute("item").strip();
                        if (!item.isEmpty()) {
                            itemCollection.put(item, collection);
                        }
                    }
                }
                case "bind" -> ognl(e.getAttribute("value"));
                default -> {
                }
            }
            walk(e);
        }

        /** Q-10, Q-12, Q-15: tokens #{…} y ${…} en texto; en comentarios solo dan tipo. */
        private void tokens(String text, boolean comment) {
            Matcher m = TOKEN.matcher(text);
            while (m.find()) {
                String[] parts = m.group(2).split(",");
                String root = root(parts[0]);
                if (root.isEmpty() || RESERVED.contains(root)) {
                    continue;
                }
                SqlType declared = declaredType(parts, root);
                if (locals.contains(root)) {
                    if (declared != null && !comment) {
                        itemTypes.computeIfAbsent(root, k -> new LinkedHashSet<>()).add(declared);
                    }
                    continue;
                }
                if (comment) {
                    if (declared != null) {
                        commentTypes.computeIfAbsent(root, k -> new LinkedHashSet<>()).add(declared);
                    }
                    continue;
                }
                Usage u = use(root);
                u.textual |= m.group(1).equals("$");
                if (declared != null) {
                    u.declared.add(declared);
                }
            }
        }

        /** Tipo de #{x,tipo} o #{x, javaType=tipo}; null si no se declara. */
        private SqlType declaredType(String[] parts, String root) {
            SqlType found = null;
            for (int i = 1; i < parts.length; i++) {
                String option = parts[i].strip();
                String name;
                if (option.contains("=")) {
                    String[] kv = option.split("=", 2);
                    if (!kv[0].strip().equalsIgnoreCase("javaType")) {
                        continue;
                    }
                    name = kv[1].strip();
                } else {
                    name = option;
                }
                SqlType type = SqlType.fromName(name);
                if (type == null) {
                    errors.add(new SqlError("type", "Tipo desconocido «" + name + "» en la variable «" + root + "»",
                            null, null, root));
                } else {
                    found = type;
                }
            }
            return found;
        }

        private void ognl(String expression) {
            for (String root : ognlRoots(expression)) {
                use(root);
            }
        }

        /** Q-10, Q-11: identificadores de una expresión OGNL, sin literales, palabras ni métodos. */
        private List<String> ognlRoots(String expression) {
            List<String> out = new ArrayList<>();
            String expr = expression.replaceAll("'(?:[^'\\\\]|\\\\.)*'|\"(?:[^\"\\\\]|\\\\.)*\"", " ");
            Matcher m = IDENTIFIER.matcher(expr);
            while (m.find()) {
                String id = m.group();
                char before = previousNonSpace(expr, m.start());
                if (before == '.' || before == '@' || before == '#' || Character.isDigit(before)) {
                    continue;
                }
                if (OGNL_WORDS.contains(id) || RESERVED.contains(id) || locals.contains(id)) {
                    continue;
                }
                if (!out.contains(id)) {
                    out.add(id);
                }
            }
            return out;
        }

        private static char previousNonSpace(String s, int index) {
            for (int i = index - 1; i >= 0; i--) {
                if (!Character.isWhitespace(s.charAt(i))) {
                    return s.charAt(i);
                }
            }
            return ' ';
        }

        /** La raíz: antes de un punto o un corchete. */
        private static String root(String expression) {
            String e = expression.strip();
            int cut = e.length();
            for (char c : new char[]{'.', '['}) {
                int i = e.indexOf(c);
                if (i >= 0) {
                    cut = Math.min(cut, i);
                }
            }
            return e.substring(0, cut).strip();
        }

        private Usage use(String name) {
            return usages.computeIfAbsent(name, k -> new Usage());
        }

        /** Q-13, Q-14, Q-16, Q-17: tipo final de cada variable. */
        List<Variable> variables() {
            List<Variable> out = new ArrayList<>();
            usages.forEach((name, u) -> {
                Set<SqlType> declared = new LinkedHashSet<>(u.declared);
                // ADR-0011: el comentario solo tipa variables que aparecen en otro sitio.
                declared.addAll(commentTypes.getOrDefault(name, Set.of()));
                SqlType type;
                SqlType element = null;
                if (u.collection) {
                    declared.remove(SqlType.LIST);
                    if (!declared.isEmpty()) {
                        conflict(name, "es la colección de un <foreach> y por tanto list", declared);
                    }
                    type = SqlType.LIST;
                    Set<SqlType> elements = new LinkedHashSet<>();
                    itemCollection.forEach((item, collection) -> {
                        if (collection.equals(name)) {
                            elements.addAll(itemTypes.getOrDefault(item, Set.of()));
                        }
                    });
                    if (elements.size() > 1) {
                        conflict(name, "tiene elementos con tipos contradictorios", elements);
                    }
                    element = elements.isEmpty() ? SqlType.STRING : elements.iterator().next();
                } else if (u.textual) {
                    declared.remove(SqlType.STRING);
                    if (!declared.isEmpty()) {
                        conflict(name, "se usa en ${…}, que siempre es string", declared);
                    }
                    type = SqlType.STRING;
                } else if (declared.size() > 1) {
                    conflict(name, "tiene tipos contradictorios", declared);
                    type = declared.iterator().next();
                } else {
                    type = declared.isEmpty() ? SqlType.STRING : declared.iterator().next();
                    if (type == SqlType.LIST) {
                        element = SqlType.STRING;
                    }
                }
                out.add(new Variable(name, type, element, u.textual));
            });
            return out;
        }

        private void conflict(String name, String why, Set<SqlType> types) {
            String list = types.stream().map(SqlType::label).collect(Collectors.joining(", "));
            errors.add(new SqlError("type", "La variable «" + name + "» " + why + ": " + list, null, null, name));
        }
    }
}
