package dev.litedd.update;

import dev.litedd.http.ApiError;
import dev.litedd.update.UpdateClient.Reply;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpRequest;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class UpdateClientTest {

    private static final URI START = URI.create("https://github.com/demo/app/releases/latest/download/latest.json");
    private static final URI CDN = URI.create("https://release-assets.githubusercontent.com/asset/1?firma=x");
    private static final byte[] BODY = "contenido".getBytes(StandardCharsets.UTF_8);

    @TempDir
    Path dir;

    /** Respuestas por URL; apunta a qué destinos se intentó conectar. */
    private final Map<URI, Reply> replies = new HashMap<>();
    private final List<URI> connected = new ArrayList<>();
    private final UpdateClient client = new UpdateClient((uri, timeout) -> {
        connected.add(uri);
        Reply reply = replies.get(uri);
        if (reply == null) {
            throw new IOException("sin respuesta para " + uri);
        }
        return reply;
    });

    private static Reply redirect(String location) {
        return new Reply(302, location, InputStream.nullInputStream());
    }

    private static Reply ok(byte[] body) {
        return new Reply(200, null, new ByteArrayInputStream(body));
    }

    private static String sha256(byte[] body) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(body));
    }

    private static void assertCode(Runnable call, String code) {
        assertThatThrownBy(call::run).isInstanceOfSatisfying(ApiError.class, e -> assertThat(e.body().code()).isEqualTo(code));
    }

    @Test
    void r20_reads_a_file_from_an_allowed_host() {
        replies.put(START, ok(BODY));
        assertThat(client.read(START, 1024)).isEqualTo(BODY);
    }

    @Test
    void r21_follows_redirects_within_the_allowed_hosts() {
        URI pinned = URI.create("https://github.com/demo/app/releases/download/build-7/latest.json");
        replies.put(START, redirect("/demo/app/releases/download/build-7/latest.json"));
        replies.put(pinned, redirect(CDN.toString()));
        replies.put(CDN, ok(BODY));
        assertThat(client.read(START, 1024)).isEqualTo(BODY);
        assertThat(connected).containsExactly(START, pinned, CDN);
    }

    @Test
    void r20_rejects_any_other_destination_before_connecting() {
        for (String bad : List.of("http://github.com/demo/app", "https://evil.example/demo",
                "https://github.com.evil.example/demo", "https://user:pass@github.com/demo",
                "https://github.com:8443/demo", "ftp://github.com/demo")) {
            URI uri = URI.create(bad);
            assertCode(() -> client.read(uri, 1024), "update_destination");
        }
        assertThat(connected).isEmpty();
    }

    @Test
    void r21_a_redirect_to_another_host_is_rejected_without_connecting() {
        replies.put(START, redirect("https://evil.example/latest.json"));
        assertCode(() -> client.read(START, 1024), "update_destination");
        assertThat(connected).containsExactly(START);
    }

    @Test
    void r21_a_redirect_to_plain_http_is_rejected_without_connecting() {
        replies.put(START, redirect("http://release-assets.githubusercontent.com/asset/1"));
        assertCode(() -> client.read(START, 1024), "update_destination");
        assertThat(connected).containsExactly(START);
    }

    @Test
    void r21_gives_up_after_three_redirects() {
        URI a = URI.create("https://github.com/a");
        URI b = URI.create("https://github.com/b");
        replies.put(a, redirect(b.toString()));
        replies.put(b, redirect(a.toString()));
        assertCode(() -> client.read(a, 1024), "update_redirects");
        assertThat(connected).hasSize(4);
    }

    @Test
    void r13_explains_a_repository_without_releases() {
        replies.put(START, new Reply(404, null, InputStream.nullInputStream()));
        assertThatThrownBy(() -> client.read(START, 1024))
                .isInstanceOf(ApiError.class).hasMessageContaining("No hay ninguna versión publicada");
    }

    @Test
    void r13_explains_a_network_failure() {
        assertThatThrownBy(() -> client.read(START, 1024))
                .isInstanceOfSatisfying(ApiError.class, e -> assertThat(e.body().code()).isEqualTo("update_network"))
                .hasMessageContaining("github.com");
    }

    @Test
    void r24_a_file_above_the_limit_is_rejected() {
        replies.put(START, ok(new byte[2048]));
        assertCode(() -> client.read(START, 1024), "update_too_big");
    }

    @Test
    void r24_a_stalled_download_ends_at_the_time_limit() {
        // Un cuerpo que no acaba nunca hasta que se cierra, como el de HttpClient.
        InputStream stalled = new InputStream() {
            private volatile boolean closed;

            @Override
            public int read() throws IOException {
                while (!closed) {
                    try {
                        Thread.sleep(10);
                    } catch (InterruptedException e) {
                        throw new IOException(e);
                    }
                }
                throw new IOException("closed");
            }

            @Override
            public void close() {
                closed = true;
            }
        };
        replies.put(START, new Reply(200, null, stalled));
        UpdateClient quick = new UpdateClient((uri, timeout) -> replies.get(uri), Duration.ofMillis(100));
        assertCode(() -> quick.read(START, 1024), "update_timeout");
    }

    @Test
    void r32_a_download_with_the_right_size_and_hash_stays_in_place() throws Exception {
        Path target = dir.resolve("litedd.jar.new");
        replies.put(CDN, ok(BODY));
        client.download(CDN, target, BODY.length, sha256(BODY));
        assertThat(Files.readAllBytes(target)).isEqualTo(BODY);
    }

    @Test
    void r42_a_previous_download_is_replaced() throws Exception {
        Path target = dir.resolve("litedd.jar.new");
        Files.write(target, new byte[4096]);
        replies.put(CDN, ok(BODY));
        client.download(CDN, target, BODY.length, sha256(BODY));
        assertThat(Files.readAllBytes(target)).isEqualTo(BODY);
    }

    @Test
    void r32_a_download_with_another_hash_is_deleted() {
        Path target = dir.resolve("litedd.jar.new");
        replies.put(CDN, ok(BODY));
        assertCode(() -> client.download(CDN, target, BODY.length, "0".repeat(64)), "update_hash");
        assertThat(target).doesNotExist();
    }

    @Test
    void r32_a_truncated_download_is_deleted() throws Exception {
        Path target = dir.resolve("litedd.jar.new");
        replies.put(CDN, ok(BODY));
        String hash = sha256(BODY);
        assertCode(() -> client.download(CDN, target, BODY.length + 1L, hash), "update_hash");
        assertThat(target).doesNotExist();
    }

    @Test
    void r24_a_download_longer_than_the_manifest_says_is_deleted() throws Exception {
        Path target = dir.resolve("litedd.jar.new");
        replies.put(CDN, ok(BODY));
        String hash = sha256(BODY);
        assertCode(() -> client.download(CDN, target, BODY.length - 1L, hash), "update_too_big");
        assertThat(target).doesNotExist();
    }

    @Test
    void r22_the_request_carries_no_credentials_or_user_data() {
        HttpRequest request = UpdateClient.request(START, Duration.ofSeconds(5));
        assertThat(request.method()).isEqualTo("GET");
        assertThat(request.headers().map().keySet()).containsExactly("User-Agent");
        assertThat(request.headers().firstValue("User-Agent")).contains("LiteDD");
        assertThat(request.uri().getRawQuery()).isNull();
    }
}
