package dev.litedd.httpnotes;

import com.fasterxml.jackson.annotation.JsonInclude;
import dev.litedd.http.ApiError;
import dev.litedd.httpnotes.HttpCaller.CallFailed;
import dev.litedd.httpnotes.HttpCaller.Exchange;
import dev.litedd.notes.Note;
import dev.litedd.notes.NoteService;
import dev.litedd.settings.AppConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.ByteBuffer;
import java.util.Base64;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;

/** Ejecuta una nota HTTP con su login (H-20 a H-27, H-30 a H-36). */
public final class HttpRunner {

    /** H-23: lo que debe traer un login correcto. */
    static final String CSRF_COOKIE = "CSRF-TOKEN";
    static final String USER_NAME = "userName";

    public record Header(String name, String value) {
    }

    /** Lo enviado, para verlo y copiarlo. La cabecera Authorization se muestra oculta (H-21). */
    public record Sent(String method, String url, List<Header> headers) {
    }

    /** H-33 a H-35: text si es texto; base64 si es binario. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Received(int status, String statusText, long millis, long size, String contentType, List<Header> headers,
                           List<HttpCaller.Cookie> cookies, String text, String base64, boolean binary, boolean truncated) {
    }

    public record LoginSummary(String user, int status, long millis) {
    }

    public record Failure(String code, String message) {
    }

    /**
     * phase: «login» si el error o la respuesta son del login (H-26), «request» si son de la llamada.
     * response: la respuesta recibida, si la hubo. login: resumen del login hecho antes, si lo hubo.
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Result(String phase, Failure error, Sent request, Received response, LoginSummary login) {
    }

    private static final Logger log = LoggerFactory.getLogger(HttpRunner.class);

    private final NoteService notes;
    private final Supplier<AppConfig> config;
    private final HttpCredentials credentials;
    private final HttpCaller caller;
    private final AtomicReference<LoginSession> lastLogin = new AtomicReference<>();

    public HttpRunner(NoteService notes, Supplier<AppConfig> config, HttpCredentials credentials, HttpCaller caller) {
        this.notes = notes;
        this.config = config;
        this.credentials = credentials;
        this.caller = caller;
    }

    public boolean cancel(String executionId) {
        return caller.cancel(executionId) | caller.cancel(loginExecution(executionId));
    }

    /** A-04, A-05: siempre el contenido guardado, en la versión que tiene la pestaña. */
    public Result execute(String noteId, long version, String executionId) {
        Note note = notes.get(noteId);
        if (!"http".equals(note.type())) {
            throw new ApiError(400, "not_http", "La nota no es una nota HTTP");
        }
        if (note.version() != version) {
            throw new ApiError(409, "stale_version", "La nota ha cambiado desde que se abrió. Pulsa «Actualizar».");
        }
        AppConfig.Http settings = config.get().http();
        HttpNoteContent content = HttpNoteContent.parse(note.content());
        String id = executionId == null ? UUID.randomUUID().toString() : executionId;

        // H-27: la propia nota de login hace el login y lo deja para reutilizar.
        if (note.id().equals(settings.loginNoteId())) {
            String user = userOf(content, settings);
            return login(content, user, settings, id, true);
        }
        LoginSession session = null;
        LoginSummary summary = null;
        switch (content.login()) {
            case HttpNoteContent.LOGIN_NONE -> {
            }
            case HttpNoteContent.LOGIN_REUSE -> {
                session = lastLogin.get();
                if (session == null) {
                    // H-25
                    return new Result("login", new Failure("no_login",
                            "No hay un login anterior para reutilizar. Haz antes una llamada con login."), null, null, null);
                }
            }
            default -> {
                Result login = login(loginContent(settings), userOf(content, settings), settings, loginExecution(id), false);
                if (login.error() != null) {
                    // H-26: sin login correcto no hay llamada.
                    return login;
                }
                session = lastLogin.get();
                summary = login.login();
            }
        }
        Prepared p = prepare(content, content.pathValues(), session, null, settings);
        try {
            Exchange ex = caller.send(p.call(), id, settings.timeoutSeconds(), maxBytes(settings));
            log.debug("Llamada HTTP {} {} en {} ms", content.method(), ex.status(), ex.millis());
            return new Result("request", null, p.sent(), received(ex), summary);
        } catch (CallFailed e) {
            return new Result("request", new Failure(e.code(), e.getMessage()), p.sent(), null, summary);
        }
    }

    /** H-20 a H-23: login con Basic Auth; si es correcto queda como último login (H-25). */
    private Result login(HttpNoteContent loginNote, String user, AppConfig.Http settings, String executionId, boolean asRequest) {
        if (user.isEmpty()) {
            return new Result("login", new Failure("no_user", "Falta el usuario: escríbelo en la nota o en «Ajustes»"), null, null, null);
        }
        String password = credentials.password().orElse(null);
        if (password == null) {
            return new Result("login", new Failure("no_password", "Falta la contraseña de las notas HTTP en «Ajustes»"), null, null, null);
        }
        Map<String, String> values = new HashMap<>(loginNote.pathValues());
        values.put(USER_NAME, user);
        String basic = "Basic " + Base64.getEncoder().encodeToString((user + ":" + password).getBytes(StandardCharsets.UTF_8));
        Prepared p = prepare(loginNote, values, null, basic, settings);
        String phase = asRequest ? "request" : "login";
        Exchange ex;
        try {
            ex = caller.send(p.call(), executionId, settings.timeoutSeconds(), maxBytes(settings));
        } catch (CallFailed e) {
            return new Result(phase, new Failure(e.code(), "Login: " + e.getMessage()), p.sent(), null, null);
        }
        log.debug("Login HTTP {} en {} ms", ex.status(), ex.millis());
        LoginSummary summary = new LoginSummary(user, ex.status(), ex.millis());
        String userId = ex.header(RequestHeaders.X_USERID);
        Map<String, String> cookies = new LinkedHashMap<>();
        ex.cookies().forEach(c -> cookies.put(c.name(), c.value()));
        String problem = null;
        if (ex.status() != 200) {
            problem = "El login respondió " + ex.status() + " " + statusText(ex.status()).strip();
        } else if (userId == null || userId.isBlank()) {
            problem = "El login no devolvió la cabecera X-USERID";
        } else if (!cookies.containsKey(CSRF_COOKIE)) {
            problem = "El login no devolvió la cookie CSRF-TOKEN";
        }
        if (problem != null) {
            // H-26: se muestra la respuesta del login.
            return new Result("login", new Failure("login_failed", problem), p.sent(), received(ex), summary);
        }
        lastLogin.set(new LoginSession(user, userId, cookies.get(CSRF_COOKIE), cookies));
        return new Result(asRequest ? "request" : "login", null, p.sent(), received(ex), summary);
    }

    private HttpNoteContent loginContent(AppConfig.Http settings) {
        if (settings.loginNoteId() == null) {
            throw new ApiError(400, "no_login_note", "Elige la nota de login en «Ajustes»");
        }
        Note login;
        try {
            login = notes.get(settings.loginNoteId());
        } catch (ApiError e) {
            throw new ApiError(400, "no_login_note", "La nota de login de «Ajustes» ya no existe");
        }
        if (!"http".equals(login.type())) {
            throw new ApiError(400, "no_login_note", "La nota de login de «Ajustes» no es una nota HTTP");
        }
        return HttpNoteContent.parse(login.content());
    }

    private record Prepared(HttpCaller.Call call, Sent sent) {
    }

    private Prepared prepare(HttpNoteContent content, Map<String, String> pathValues, LoginSession session, String authorization,
                             AppConfig.Http settings) {
        // H-12, H-18: todas las variables con valor; luego se sustituyen en cada sitio.
        Variables.requireAll(content, pathValues);
        HttpNoteContent filled = Variables.fill(content, pathValues);
        URI uri = LocalUrls.compose(settings.baseUrl(), content.endpoint(), pathValues, filled.params());
        String boundary = "LiteDD" + UUID.randomUUID().toString().replace("-", "");
        List<Map.Entry<String, String>> headers = RequestHeaders.build(filled,
                RequestHeaders.contentTypeFor(filled.body(), boundary), session, authorization, settings);
        byte[] body = body(filled.body(), boundary);
        List<Header> shown = headers.stream()
                .map(h -> new Header(h.getKey(), h.getKey().equalsIgnoreCase(RequestHeaders.AUTHORIZATION) ? "Basic ••••••" : h.getValue()))
                .toList();
        return new Prepared(new HttpCaller.Call(content.method(), uri, headers, body),
                new Sent(content.method(), uri.toString(), shown));
    }

    /** H-17: form-data solo con campos de texto. */
    static byte[] body(HttpNoteContent.Body body, String boundary) {
        return switch (body.mode()) {
            case "raw" -> body.raw().getBytes(StandardCharsets.UTF_8);
            case "form-data" -> {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                for (HttpNoteContent.Row r : body.form()) {
                    if (!r.active() || r.key() == null || r.key().isBlank()) {
                        continue;
                    }
                    String name = r.key().strip().replace("\"", "%22");
                    out.writeBytes(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + name + "\"\r\n\r\n"
                            + (r.value() == null ? "" : r.value()) + "\r\n").getBytes(StandardCharsets.UTF_8));
                }
                out.writeBytes(("--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
                yield out.toByteArray();
            }
            default -> new byte[0];
        };
    }

    private static String userOf(HttpNoteContent content, AppConfig.Http settings) {
        return content.user().isEmpty() ? settings.user() : content.user();
    }

    private static long maxBytes(AppConfig.Http settings) {
        return settings.maxResponseMb() * 1024L * 1024L;
    }

    private static String loginExecution(String executionId) {
        return executionId + "-login";
    }

    /** H-34, H-35: texto si el tipo lo dice o si es UTF-8 válido; si no, binario. */
    static Received received(Exchange ex) {
        String contentType = ex.header("content-type");
        List<Header> headers = ex.headers().stream().map(h -> new Header(h.getKey(), h.getValue())).toList();
        Charset charset = charsetOf(contentType);
        String text = null;
        String base64 = null;
        boolean binary = !isText(contentType);
        if (!binary || contentType == null) {
            try {
                text = charset.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                        .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(ex.body())).toString();
                binary = false;
            } catch (CharacterCodingException e) {
                // Un cuerpo cortado puede partir un carácter: entonces se acepta con sustituciones.
                if (!binary && ex.truncated()) {
                    text = new String(ex.body(), charset);
                } else {
                    binary = true;
                }
            }
        }
        if (binary) {
            base64 = Base64.getEncoder().encodeToString(ex.body());
            text = null;
        }
        return new Received(ex.status(), statusText(ex.status()), ex.millis(), ex.size(), contentType, headers, ex.cookies(),
                text, base64, binary, ex.truncated());
    }

    private static boolean isText(String contentType) {
        if (contentType == null) {
            return true;
        }
        String t = contentType.toLowerCase(Locale.ROOT);
        return t.startsWith("text/") || t.contains("json") || t.contains("xml") || t.contains("javascript")
                || t.contains("x-www-form-urlencoded") || t.contains("yaml") || t.contains("csv");
    }

    private static Charset charsetOf(String contentType) {
        if (contentType != null) {
            for (String part : contentType.split(";")) {
                String p = part.strip();
                if (p.toLowerCase(Locale.ROOT).startsWith("charset=")) {
                    try {
                        return Charset.forName(p.substring(8).replace("\"", ""));
                    } catch (RuntimeException ignored) {
                        // Se usa UTF-8.
                    }
                }
            }
        }
        return StandardCharsets.UTF_8;
    }

    /** H-33: texto del estado, como el que muestra Postman. */
    static String statusText(int status) {
        return switch (status) {
            case 100 -> "Continue";
            case 200 -> "OK";
            case 201 -> "Created";
            case 202 -> "Accepted";
            case 204 -> "No Content";
            case 206 -> "Partial Content";
            case 301 -> "Moved Permanently";
            case 302 -> "Found";
            case 303 -> "See Other";
            case 304 -> "Not Modified";
            case 307 -> "Temporary Redirect";
            case 308 -> "Permanent Redirect";
            case 400 -> "Bad Request";
            case 401 -> "Unauthorized";
            case 403 -> "Forbidden";
            case 404 -> "Not Found";
            case 405 -> "Method Not Allowed";
            case 406 -> "Not Acceptable";
            case 408 -> "Request Timeout";
            case 409 -> "Conflict";
            case 410 -> "Gone";
            case 413 -> "Payload Too Large";
            case 415 -> "Unsupported Media Type";
            case 422 -> "Unprocessable Entity";
            case 429 -> "Too Many Requests";
            case 500 -> "Internal Server Error";
            case 501 -> "Not Implemented";
            case 502 -> "Bad Gateway";
            case 503 -> "Service Unavailable";
            case 504 -> "Gateway Timeout";
            default -> "";
        };
    }
}
