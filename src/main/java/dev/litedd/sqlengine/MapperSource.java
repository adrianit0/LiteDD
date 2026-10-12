package dev.litedd.sqlengine;

import org.apache.ibatis.builder.BuilderException;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.apache.ibatis.builder.xml.XMLIncludeTransformer;
import org.apache.ibatis.parsing.XNode;
import org.apache.ibatis.parsing.XPathParser;
import org.apache.ibatis.session.Configuration;
import org.w3c.dom.Attr;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NamedNodeMap;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.SAXException;
import org.xml.sax.SAXParseException;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Analiza una nota XML MyBatis (M-02 a M-06, M-40): valida el mapper, resuelve los &lt;include&gt; con el
 * XMLIncludeTransformer de MyBatis y devuelve el cuerpo de cada sentencia listo para una nota SQL (M-11).
 */
public final class MapperSource {

    /**
     * @param kind select, insert, update o delete
     * @param body cuerpo con los include resueltos y sin sangría común; null si el mapper tiene errores
     */
    public record Statement(String id, String kind, String body) {
    }

    /** Las sentencias aparecen aunque haya errores, para listarlas en el editor (M-41). */
    public record ParsedMapper(List<Statement> statements, List<SqlError> errors) {

        public boolean valid() {
            return errors.isEmpty();
        }
    }

    public static final Set<String> STATEMENTS = Set.of("select", "insert", "update", "delete");
    private static final String DEFAULT_NAMESPACE = "litedd";
    private static final Pattern DOCTYPE = Pattern.compile("<!DOCTYPE\\b(?:[^>\\[]|\\[[^]]*])*>", Pattern.CASE_INSENSITIVE);
    /** Orden de atributos habitual en los mappers; el DOM los devuelve en orden alfabético. */
    private static final List<String> ATTRIBUTE_ORDER = List.of("name", "test", "collection", "item", "index", "open",
            "separator", "close", "prefix", "prefixOverrides", "suffix", "suffixOverrides", "value", "refid");

    private MapperSource() {
    }

    public static ParsedMapper parse(String content) {
        Document doc;
        try {
            doc = NoteSource.parse(blankDoctype(content));
        } catch (SAXParseException e) {
            return failed(new SqlError("xml", "XML no válido en la línea " + e.getLineNumber() + ", columna "
                    + e.getColumnNumber() + ": " + e.getMessage(), e.getLineNumber(), e.getColumnNumber(), null));
        } catch (SAXException | IOException e) {
            return failed(SqlError.of("xml", "XML no válido: " + e.getMessage()));
        }
        Element root = doc.getDocumentElement();
        if (!root.getTagName().equals("mapper")) {
            return failed(SqlError.of("mapper", "El elemento raíz debe ser <mapper> y es <" + root.getTagName() + ">"));
        }

        List<SqlError> errors = new ArrayList<>();
        Configuration cfg = new Configuration();
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(cfg, "mapper");
        String namespace = root.getAttribute("namespace").strip();
        assistant.setCurrentNamespace(namespace.isEmpty() ? DEFAULT_NAMESPACE : namespace);
        XPathParser parser = new XPathParser(doc);

        // M-04, M-05: fragmentos y sentencias, hijos directos de <mapper>.
        Map<String, Element> fragments = new LinkedHashMap<>();
        Map<String, Element> statements = new LinkedHashMap<>();
        List<Statement> found = new ArrayList<>();
        Map<String, Integer> seen = new HashMap<>();
        for (Node n = root.getFirstChild(); n != null; n = n.getNextSibling()) {
            if (n.getNodeType() != Node.ELEMENT_NODE) {
                continue;
            }
            Element e = (Element) n;
            String tag = e.getTagName();
            if (!tag.equals("sql") && !STATEMENTS.contains(tag)) {
                continue; // M-06: resultMap, cache… se ignoran.
            }
            String id = e.getAttribute("id").strip();
            if (id.isEmpty()) {
                errors.add(SqlError.of("statement", "Hay un elemento <" + tag + "> sin id"));
                continue;
            }
            boolean fragment = tag.equals("sql");
            String key = (fragment ? "sql:" : "statement:") + id;
            int occurrence = seen.merge(key, 1, Integer::sum);
            if (occurrence > 1) {
                Integer line = lineOf(content, fragment ? "sql" : "select|insert|update|delete", id, occurrence);
                errors.add(new SqlError("statement", (fragment ? "El id del fragmento «" : "El id de sentencia «") + id
                        + "» está repetido" + (line == null ? "" : " (línea " + line + ")"), line, null, null));
                continue;
            }
            if (fragment) {
                try {
                    String full = assistant.applyCurrentNamespace(id, false);
                    cfg.getSqlFragments().put(full, new XNode(parser, e, null));
                    fragments.put(full, e);
                } catch (BuilderException ex) {
                    errors.add(SqlError.of("statement", "El id del fragmento «" + id + "» no puede llevar puntos"));
                }
            } else {
                statements.put(id, e);
                found.add(new Statement(id, tag, null));
            }
        }

        // M-40: un include circular haría que MyBatis no terminase nunca.
        String cycle = findCycle(fragments, assistant);
        if (cycle != null) {
            errors.add(SqlError.of("include", "<include> circular: " + cycle));
        }
        if (!errors.isEmpty()) {
            return new ParsedMapper(found, errors);
        }

        XMLIncludeTransformer includes = new XMLIncludeTransformer(cfg, assistant);
        List<Statement> out = new ArrayList<>();
        for (Statement s : found) {
            Element element = (Element) statements.get(s.id()).cloneNode(true);
            removeSelectKeys(element);
            try {
                includes.applyIncludes(element);
            } catch (BuilderException | IllegalArgumentException ex) {
                Integer line = lineOf(content, s.kind(), s.id(), 1);
                errors.add(new SqlError("include", "La sentencia «" + s.id() + "» usa un fragmento que no está en este mapper: "
                        + refids(statements.get(s.id())), line, null, null));
                continue;
            }
            out.add(new Statement(s.id(), s.kind(), dedent(serializeChildren(element))));
        }
        return errors.isEmpty() ? new ParsedMapper(out, List.of()) : new ParsedMapper(found, errors);
    }

    private static ParsedMapper failed(SqlError error) {
        return new ParsedMapper(List.of(), List.of(error));
    }

    /** M-02: el DOCTYPE se cambia por espacios para no tocar líneas ni columnas. */
    static String blankDoctype(String content) {
        Matcher m = DOCTYPE.matcher(content);
        return m.replaceAll(r -> Matcher.quoteReplacement(r.group().replaceAll("[^\\n]", " ")));
    }

    /** Línea de la aparición n de &lt;tag … id="id"&gt; con tag entre tags (alternativas de regex), o null. */
    private static Integer lineOf(String content, String tags, String id, int occurrence) {
        Matcher m = Pattern.compile("<(?:" + tags + ")\\b[^>]*\\bid\\s*=\\s*([\"'])" + Pattern.quote(id) + "\\1").matcher(content);
        for (int i = 0; m.find(); ) {
            if (++i == occurrence) {
                return (int) content.substring(0, m.start()).chars().filter(c -> c == '\n').count() + 1;
            }
        }
        return null;
    }

    private static String refids(Element statement) {
        List<String> out = new ArrayList<>();
        NodeList list = statement.getElementsByTagName("include");
        for (int i = 0; i < list.getLength(); i++) {
            out.add("«" + ((Element) list.item(i)).getAttribute("refid") + "»");
        }
        return String.join(", ", out);
    }

    /** Ciclo entre fragmentos con refid fijo, como «a → b → a»; null si no hay. */
    private static String findCycle(Map<String, Element> fragments, MapperBuilderAssistant assistant) {
        Map<String, List<String>> edges = new HashMap<>();
        fragments.forEach((id, e) -> {
            List<String> to = new ArrayList<>();
            NodeList list = e.getElementsByTagName("include");
            for (int i = 0; i < list.getLength(); i++) {
                String refid = ((Element) list.item(i)).getAttribute("refid").strip();
                if (!refid.contains("${")) {
                    to.add(assistant.applyCurrentNamespace(refid, true));
                }
            }
            edges.put(id, to);
        });
        Set<String> done = new HashSet<>();
        for (String start : fragments.keySet()) {
            List<String> path = new ArrayList<>();
            String cycle = visit(start, edges, path, done);
            if (cycle != null) {
                return cycle;
            }
        }
        return null;
    }

    private static String visit(String id, Map<String, List<String>> edges, List<String> path, Set<String> done) {
        int at = path.indexOf(id);
        if (at >= 0) {
            List<String> loop = new ArrayList<>(path.subList(at, path.size()));
            loop.add(id);
            return String.join(" → ", loop.stream().map(MapperSource::shortId).toList());
        }
        if (done.contains(id) || !edges.containsKey(id)) {
            return null;
        }
        path.add(id);
        for (String next : edges.get(id)) {
            String cycle = visit(next, edges, path, done);
            if (cycle != null) {
                return cycle;
            }
        }
        path.removeLast();
        done.add(id);
        return null;
    }

    private static String shortId(String full) {
        return full.substring(full.lastIndexOf('.') + 1);
    }

    /** M-06: &lt;selectKey&gt; no forma parte del SQL de la sentencia. */
    private static void removeSelectKeys(Element element) {
        NodeList keys = element.getElementsByTagName("selectKey");
        for (int i = keys.getLength() - 1; i >= 0; i--) {
            Node key = keys.item(i);
            key.getParentNode().removeChild(key);
        }
    }

    private static String serializeChildren(Element element) {
        StringBuilder out = new StringBuilder();
        for (Node n = element.getFirstChild(); n != null; n = n.getNextSibling()) {
            write(n, out);
        }
        return out.toString();
    }

    /** M-11: XML de nuevo como texto, escapando solo lo imprescindible para que siga siendo legible. */
    private static void write(Node n, StringBuilder out) {
        switch (n.getNodeType()) {
            case Node.TEXT_NODE -> out.append(n.getNodeValue().replace("&", "&amp;").replace("<", "&lt;"));
            case Node.CDATA_SECTION_NODE -> out.append("<![CDATA[").append(n.getNodeValue()).append("]]>");
            case Node.COMMENT_NODE -> out.append("<!--").append(n.getNodeValue()).append("-->");
            case Node.ELEMENT_NODE -> {
                Element e = (Element) n;
                out.append('<').append(e.getTagName());
                NamedNodeMap attributes = e.getAttributes();
                List<Attr> sorted = new ArrayList<>();
                for (int i = 0; i < attributes.getLength(); i++) {
                    sorted.add((Attr) attributes.item(i));
                }
                sorted.sort(Comparator.comparingInt(a -> {
                    int i = ATTRIBUTE_ORDER.indexOf(a.getName());
                    return i < 0 ? ATTRIBUTE_ORDER.size() : i;
                }));
                for (Attr a : sorted) {
                    out.append(' ').append(a.getName()).append("=\"")
                            .append(a.getValue().replace("&", "&amp;").replace("<", "&lt;").replace("\"", "&quot;"))
                            .append('"');
                }
                if (!e.hasChildNodes()) {
                    out.append("/>");
                    return;
                }
                out.append('>');
                for (Node c = e.getFirstChild(); c != null; c = c.getNextSibling()) {
                    write(c, out);
                }
                out.append("</").append(e.getTagName()).append('>');
            }
            default -> {
            }
        }
    }

    /** M-11: sin líneas vacías al principio ni al final y sin la sangría común. */
    static String dedent(String text) {
        List<String> lines = new ArrayList<>(List.of(text.replace("\r\n", "\n").split("\n", -1)));
        boolean firstInline = !lines.getFirst().isBlank();
        while (!lines.isEmpty() && lines.getFirst().isBlank()) {
            lines.removeFirst();
        }
        while (!lines.isEmpty() && lines.getLast().isBlank()) {
            lines.removeLast();
        }
        if (lines.isEmpty()) {
            return "";
        }
        // Si el SQL empieza en la línea de la etiqueta, esa primera línea no cuenta para la sangría.
        int from = firstInline ? 1 : 0;
        int indent = Integer.MAX_VALUE;
        for (int i = from; i < lines.size(); i++) {
            String line = lines.get(i);
            if (!line.isBlank()) {
                indent = Math.min(indent, line.length() - line.stripLeading().length());
            }
        }
        if (indent == Integer.MAX_VALUE) {
            indent = 0;
        }
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < lines.size(); i++) {
            String line = lines.get(i);
            String cut = i < from ? line.strip() : line.isBlank() ? "" : line.substring(indent);
            out.append(cut.stripTrailing());
            if (i < lines.size() - 1) {
                out.append('\n');
            }
        }
        return out.toString();
    }
}
