package dev.litedd.lifecycle;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Nota pedida desde fuera de LiteDD (ADR-0045): por enlace litedd://note/&lt;id&gt; (N-95) o por título con
 * litedd --open (N-96). Solo uno de los dos campos tiene valor.
 */
public record OpenRequest(String noteId, String title) {

    public static final String LINK_PREFIX = "litedd://note/";
    /** Los identificadores son UUID; se admite algo más amplio, sin separadores ni espacios. */
    private static final Pattern NOTE_ID = Pattern.compile("[A-Za-z0-9_-]{1,64}");
    static final int TITLE_MAX = 500;

    public OpenRequest {
        title = title == null ? null : title.strip();
    }

    public static OpenRequest note(String noteId) {
        return new OpenRequest(noteId, null);
    }

    public static OpenRequest title(String title) {
        return new OpenRequest(null, title);
    }

    /** ¿Es un enlace litedd://note/? El esquema no distingue mayúsculas. */
    public static boolean isLink(String text) {
        return text.toLowerCase(Locale.ROOT).startsWith(LINK_PREFIX);
    }

    /**
     * litedd://note/&lt;id&gt;, con o sin «/», «?» o «#» al final, como lo entrega xdg-open.
     *
     * @throws IllegalArgumentException si no es un enlace a una nota
     */
    public static OpenRequest fromLink(String link) {
        if (!isLink(link)) {
            throw new IllegalArgumentException("No es un enlace de LiteDD: " + link);
        }
        String rest = link.substring(LINK_PREFIX.length());
        int end = rest.length();
        for (char c : new char[]{'/', '?', '#'}) {
            int i = rest.indexOf(c);
            if (i >= 0) {
                end = Math.min(end, i);
            }
        }
        String id;
        try {
            id = URLDecoder.decode(rest.substring(0, end).replace("+", "%2B"), StandardCharsets.UTF_8);
        } catch (IllegalArgumentException e) {
            id = "";
        }
        OpenRequest request = note(id);
        if (!request.valid()) {
            throw new IllegalArgumentException("Enlace de LiteDD no válido: " + link);
        }
        return request;
    }

    /** Un identificador bien formado o un título no vacío, nunca los dos. */
    public boolean valid() {
        if (noteId != null) {
            return title == null && NOTE_ID.matcher(noteId).matches();
        }
        return title != null && !title.isBlank() && title.length() <= TITLE_MAX && title.chars().noneMatch(Character::isISOControl);
    }
}
