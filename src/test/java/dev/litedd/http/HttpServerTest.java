package dev.litedd.http;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class HttpServerTest {

    private static final String TOKEN = "test-token-0123456789abcdefghijklmnop";
    private static HttpServer server;
    private static int port;

    @BeforeAll
    static void start() throws IOException {
        try (ServerSocket s = new ServerSocket(0)) {
            port = s.getLocalPort();
        }
        server = new HttpServer(port, TOKEN).start();
    }

    @AfterAll
    static void stop() {
        server.stop();
    }

    @Test
    void health_responds_without_token() throws IOException {
        Response r = send("GET /api/health", "Host: 127.0.0.1:" + port);
        assertThat(r.status).isEqualTo(200);
        assertThat(r.body).contains("\"app\":\"LiteDD\"").contains("\"version\"");
    }

    @Test
    void s10_listens_only_on_loopback() throws IOException {
        InetAddress external = Collections.list(NetworkInterface.getNetworkInterfaces()).stream()
                .flatMap(ni -> Collections.list(ni.getInetAddresses()).stream())
                .filter(a -> !a.isLoopbackAddress() && !a.isLinkLocalAddress())
                .findFirst().orElse(null);
        if (external != null) {
            assertThatThrownBy(() -> new Socket(external, port).close()).isInstanceOf(IOException.class);
        }
        new Socket(InetAddress.getLoopbackAddress(), port).close();
    }

    @Test
    void s11_rejects_foreign_host_header() throws IOException {
        assertThat(send("GET /api/health", "Host: evil.example:" + port).status).isEqualTo(403);
        assertThat(send("GET /api/health", "Host: 127.0.0.1:1").status).isEqualTo(403);
        assertThat(send("GET /", "Host: 192.168.0.10:" + port).status).isEqualTo(403);
        assertThat(send("GET /api/health", "Host: localhost:" + port).status).isEqualTo(200);
    }

    @Test
    void s11_error_body_follows_a02() throws IOException {
        Response r = send("GET /api/health", "Host: evil.example");
        assertThat(r.body).contains("\"code\":\"forbidden\"").contains("\"message\"").contains("\"details\"");
    }

    @Test
    void s12_api_requires_session_token() throws IOException {
        String host = "Host: 127.0.0.1:" + port;
        assertThat(send("GET /api/tree", host).status).isEqualTo(403);
        assertThat(send("GET /api/tree", host, "X-LiteDD-Token: wrong").status).isEqualTo(403);
        // Con el token correcto pasa la protección; la ruta aún no existe.
        assertThat(send("GET /api/tree", host, "X-LiteDD-Token: " + TOKEN).status).isEqualTo(404);
    }

    @Test
    void s12_token_is_delivered_in_initial_html() throws IOException {
        Response r = send("GET /", "Host: 127.0.0.1:" + port);
        assertThat(r.status).isEqualTo(200);
        assertThat(r.body).contains(TOKEN).doesNotContain(HttpServer.TOKEN_PLACEHOLDER);
    }

    @Test
    void s13_rejects_foreign_origin_on_state_changes() throws IOException {
        String host = "Host: 127.0.0.1:" + port;
        String token = "X-LiteDD-Token: " + TOKEN;
        assertThat(send("POST /api/tree", host, token, "Origin: http://evil.example").status).isEqualTo(403);
        assertThat(send("POST /api/tree", host, token, "Origin: http://127.0.0.1:" + port).status).isEqualTo(404);
    }

    @Test
    void s13_emits_no_cors_headers() throws IOException {
        Response r = send("GET /api/health", "Host: 127.0.0.1:" + port, "Origin: http://evil.example");
        assertThat(r.headers.toLowerCase()).doesNotContain("access-control-allow");
    }

    @Test
    void s14_sends_content_security_policy() throws IOException {
        Response r = send("GET /", "Host: 127.0.0.1:" + port);
        assertThat(r.headers).contains("Content-Security-Policy: default-src 'self'; img-src 'self' data:");
    }

    private record Response(int status, String headers, String body) {
    }

    /** Petición HTTP/1.1 en bruto para poder fijar la cabecera Host. */
    private static Response send(String requestLine, String... headers) throws IOException {
        try (Socket socket = new Socket(InetAddress.getLoopbackAddress(), port)) {
            StringBuilder req = new StringBuilder(requestLine).append(" HTTP/1.1\r\n");
            for (String h : headers) {
                req.append(h).append("\r\n");
            }
            req.append("Content-Length: 0\r\nConnection: close\r\n\r\n");
            OutputStream out = socket.getOutputStream();
            out.write(req.toString().getBytes(StandardCharsets.UTF_8));
            out.flush();

            InputStream in = socket.getInputStream();
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            in.transferTo(buf);
            String raw = buf.toString(StandardCharsets.UTF_8);
            int split = raw.indexOf("\r\n\r\n");
            String head = raw.substring(0, split);
            int status = Integer.parseInt(head.split(" ")[1]);
            return new Response(status, head, raw.substring(split + 4));
        }
    }
}
