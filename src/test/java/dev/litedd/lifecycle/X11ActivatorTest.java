package dev.litedd.lifecycle;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.ByteArrayOutputStream;
import java.io.EOFException;
import java.io.IOException;
import java.net.StandardProtocolFamily;
import java.net.UnixDomainSocketAddress;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.channels.ServerSocketChannel;
import java.nio.channels.SocketChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** N-95, N-96: traer al frente la ventana de LiteDD con un cliente X11 propio (ADR-0045). */
class X11ActivatorTest {

    private static final int ROOT = 0x1e6;
    private static final int STACKING = 300;
    private static final int ACTIVE = 301;
    private static final int CLOSED = 0x400009;
    private static final byte[] COOKIE = "0123456789abcdef".getBytes(StandardCharsets.US_ASCII);

    @TempDir
    Path dir;

    @Test
    void n95_activates_the_topmost_litedd_window_as_a_pager() throws Exception {
        // De abajo arriba: dos ventanas de LiteDD, una terminal y una que se cierra antes de preguntar su clase.
        FakeX x = new FakeX(List.of(0x400001, 0x400002, 0x400003, CLOSED), Map.of(
                0x400001, "litedd\0litedd\0",
                0x400002, "127.0.0.1__\0litedd\0",
                0x400003, "gnome-terminal-server\0Gnome-terminal\0"), true);
        assertThat(x.run(dir, COOKIE)).isTrue();

        assertThat(x.authName).isEqualTo(X11Activator.COOKIE_NAME);
        assertThat(x.authData).isEqualTo(COOKIE);
        assertThat(x.events).hasSize(1);
        ByteBuffer e = x.events.getFirst();
        // SendEvent a la raíz con SubstructureNotify | SubstructureRedirect.
        assertThat(e.getInt(4)).isEqualTo(ROOT);
        assertThat(e.getInt(8)).isEqualTo((1 << 19) | (1 << 20));
        // ClientMessage de formato 32 para la ventana más alta de clase litedd.
        assertThat(e.get(12)).isEqualTo((byte) 33);
        assertThat(e.get(13)).isEqualTo((byte) 32);
        assertThat(e.getInt(16)).isEqualTo(0x400002);
        assertThat(e.getInt(20)).isEqualTo(ACTIVE);
        // Fuente: paginador (2); sin marca de tiempo.
        assertThat(e.getInt(24)).isEqualTo(2);
        assertThat(e.getInt(28)).isZero();
        assertThat(x.synced).isTrue();
    }

    @Test
    void n95_without_a_litedd_window_nothing_is_sent() throws Exception {
        FakeX x = new FakeX(List.of(0x400003), Map.of(0x400003, "gnome-terminal-server\0Gnome-terminal\0"), true);
        assertThat(x.run(dir, new byte[0])).isFalse();
        assertThat(x.authName).isEmpty();
        assertThat(x.events).isEmpty();

        // Un gestor de ventanas sin EWMH no publica la lista.
        FakeX noEwmh = new FakeX(List.of(), Map.of(), false);
        assertThat(noEwmh.run(dir, COOKIE)).isFalse();
        assertThat(noEwmh.events).isEmpty();
    }

    @Test
    void n95_a_rejected_connection_or_a_missing_server_fails_quietly() throws Exception {
        FakeX x = new FakeX(List.of(), Map.of(), true);
        x.reject = true;
        assertThatThrownBy(() -> x.run(dir, COOKIE)).isInstanceOf(IOException.class);
        assertThatThrownBy(() -> X11Activator.activate(dir.resolve("no-existe"), COOKIE, "litedd", Duration.ofSeconds(1)))
                .isInstanceOf(IOException.class);
    }

    @Test
    void n95_local_displays_map_to_their_socket() {
        assertThat(X11Activator.display(":0")).isEqualTo(new X11Activator.Display(Path.of("/tmp/.X11-unix/X0"), "0"));
        assertThat(X11Activator.display(":1.0")).isEqualTo(new X11Activator.Display(Path.of("/tmp/.X11-unix/X1"), "1"));
        assertThat(X11Activator.display("unix:12")).isEqualTo(new X11Activator.Display(Path.of("/tmp/.X11-unix/X12"), "12"));
        // Las pantallas remotas o de otra forma no se tocan.
        assertThat(X11Activator.display("localhost:10.0")).isNull();
        assertThat(X11Activator.display("")).isNull();
        assertThat(X11Activator.display(null)).isNull();
    }

    @Test
    void n95_the_cookie_comes_from_the_xauthority_entry_of_this_display() {
        byte[] file = xauthority(
                entry(X11Activator.FAMILY_LOCAL, "otro-equipo", "0", X11Activator.COOKIE_NAME, "c1"),
                entry(X11Activator.FAMILY_WILD, "", "0", X11Activator.COOKIE_NAME, "c2"),
                entry(X11Activator.FAMILY_LOCAL, "equipo", "1", X11Activator.COOKIE_NAME, "c3"),
                entry(X11Activator.FAMILY_LOCAL, "equipo", "0", "XDM-AUTHORIZATION-1", "c4"),
                entry(X11Activator.FAMILY_LOCAL, "equipo", "0", X11Activator.COOKIE_NAME, "c5"));
        assertThat(text(X11Activator.cookie(file, "0", "equipo"))).isEqualTo("c5");
        assertThat(text(X11Activator.cookie(file, "1", "equipo"))).isEqualTo("c3");
        // Si el nombre del equipo cambió, primero la comodín y después cualquier local.
        assertThat(text(X11Activator.cookie(file, "0", "renombrado"))).isEqualTo("c2");
        byte[] onlyOther = xauthority(entry(X11Activator.FAMILY_LOCAL, "otro-equipo", "0", X11Activator.COOKIE_NAME, "c1"));
        assertThat(text(X11Activator.cookie(onlyOther, "0", "equipo"))).isEqualTo("c1");
        // Sin entrada, o con el fichero cortado, se intenta sin cookie.
        assertThat(X11Activator.cookie(new byte[0], "0", "equipo")).isEmpty();
        assertThat(X11Activator.cookie(java.util.Arrays.copyOf(onlyOther, onlyOther.length - 1), "0", "equipo")).isEmpty();
    }

    private static String text(byte[] bytes) {
        return new String(bytes, StandardCharsets.US_ASCII);
    }

    private static byte[] entry(int family, String address, String number, String name, String data) {
        ByteBuffer b = ByteBuffer.allocate(256).order(ByteOrder.BIG_ENDIAN);
        b.putShort((short) family);
        for (String s : new String[]{address, number, name, data}) {
            byte[] bytes = s.getBytes(StandardCharsets.US_ASCII);
            b.putShort((short) bytes.length).put(bytes);
        }
        return java.util.Arrays.copyOf(b.array(), b.position());
    }

    private static byte[] xauthority(byte[]... entries) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        for (byte[] e : entries) {
            out.writeBytes(e);
        }
        return out.toByteArray();
    }

    /**
     * Servidor X de pega, escrito a partir de la especificación del protocolo X11 (orden de bytes «l»): conexión
     * inicial, InternAtom, GetProperty, SendEvent y GetInputFocus.
     */
    private static final class FakeX {

        private final List<Integer> stacking;
        private final Map<Integer, String> classes;
        private final boolean ewmh;
        boolean reject;
        String authName;
        byte[] authData;
        final List<ByteBuffer> events = new ArrayList<>();
        boolean synced;

        FakeX(List<Integer> stacking, Map<Integer, String> classes, boolean ewmh) {
            this.stacking = stacking;
            this.classes = classes;
            this.ewmh = ewmh;
        }

        boolean run(Path dir, byte[] cookie) throws Exception {
            Path socket = dir.resolve("X" + System.nanoTime() % 100000);
            try (ServerSocketChannel server = ServerSocketChannel.open(StandardProtocolFamily.UNIX)) {
                server.bind(UnixDomainSocketAddress.of(socket));
                CompletableFuture<Void> serving = CompletableFuture.runAsync(() -> {
                    try (SocketChannel c = server.accept()) {
                        serve(c);
                    } catch (IOException e) {
                        throw new java.io.UncheckedIOException(e);
                    }
                });
                try {
                    return X11Activator.activate(socket, cookie, "litedd", Duration.ofSeconds(3));
                } finally {
                    serving.get(5, TimeUnit.SECONDS);
                }
            }
        }

        private void serve(SocketChannel c) throws IOException {
            ByteBuffer head = read(c, 12);
            assertThat(head.get(0)).isEqualTo((byte) 'l');
            assertThat(head.getShort(2)).isEqualTo((short) 11);
            int n = head.getShort(6) & 0xffff;
            int d = head.getShort(8) & 0xffff;
            authName = new String(read(c, pad(n)).array(), 0, n, StandardCharsets.US_ASCII);
            authData = java.util.Arrays.copyOf(read(c, pad(d)).array(), d);
            if (reject) {
                byte[] reason = "No protocol specified".getBytes(StandardCharsets.US_ASCII);
                ByteBuffer r = buffer(8 + pad(reason.length));
                r.put((byte) 0).put((byte) reason.length).putShort((short) 11).putShort((short) 0)
                        .putShort((short) (pad(reason.length) / 4)).put(reason);
                write(c, r);
                return;
            }
            write(c, setupReply());
            try {
                while (true) {
                    ByteBuffer req = read(c, 4);
                    int opcode = req.get(0) & 0xff;
                    ByteBuffer rest = read(c, (req.getShort(2) & 0xffff) * 4 - 4);
                    switch (opcode) {
                        case 16 -> {
                            int len = rest.getShort(0) & 0xffff;
                            String atom = new String(rest.array(), 4, len, StandardCharsets.US_ASCII);
                            assertThat(req.get(1)).as("only-if-exists").isEqualTo((byte) 1);
                            int value = !ewmh ? 0 : switch (atom) {
                                case "_NET_CLIENT_LIST_STACKING" -> STACKING;
                                case "_NET_ACTIVE_WINDOW" -> ACTIVE;
                                default -> 0;
                            };
                            ByteBuffer r = buffer(32);
                            r.put((byte) 1).put((byte) 0).putShort((short) 0).putInt(0).putInt(value);
                            write(c, r.position(32));
                        }
                        case 20 -> write(c, property(rest.getInt(0), rest.getInt(4), rest.getInt(8)));
                        case 25 -> {
                            ByteBuffer event = buffer(44).put(req.array()).put(rest.array());
                            events.add(event.flip());
                        }
                        case 43 -> {
                            synced = true;
                            ByteBuffer r = buffer(32);
                            r.put((byte) 1);
                            write(c, r.position(32));
                        }
                        default -> throw new AssertionError("Petición X11 inesperada: " + opcode);
                    }
                }
            } catch (EOFException e) {
                // El cliente cierra la conexión al terminar.
            }
        }

        private ByteBuffer setupReply() {
            byte[] vendor = "Pega X".getBytes(StandardCharsets.US_ASCII);
            int formats = 2;
            int extra = 32 + pad(vendor.length) + 8 * formats + 40;
            ByteBuffer r = buffer(8 + extra);
            r.put((byte) 1).put((byte) 0).putShort((short) 11).putShort((short) 0).putShort((short) (extra / 4));
            r.putInt(12101004).putInt(0x400000).putInt(0x1fffff).putInt(256)
                    .putShort((short) vendor.length).putShort((short) 0xffff)
                    .put((byte) 1).put((byte) formats).put((byte) 0).put((byte) 0).put((byte) 32).put((byte) 32)
                    .put((byte) 8).put((byte) 255).putInt(0);
            r.put(vendor).put(new byte[pad(vendor.length) - vendor.length]);
            for (int i = 0; i < formats; i++) {
                r.put((byte) 0x7f).put((byte) 0x7f).put((byte) 0x7f).put(new byte[5]);
            }
            r.putInt(ROOT);
            return r.position(r.capacity());
        }

        private ByteBuffer property(int window, int property, int type) {
            if (window == CLOSED) {
                // BadWindow.
                ByteBuffer r = buffer(32);
                r.put((byte) 0).put((byte) 3).putShort((short) 0).putInt(window);
                return r.position(32);
            }
            if (window == ROOT && property == STACKING) {
                assertThat(type).isEqualTo(33);
                ByteBuffer value = buffer(stacking.size() * 4);
                stacking.forEach(value::putInt);
                return propertyReply(32, value.array(), stacking.size());
            }
            if (property == 67 && classes.containsKey(window)) {
                assertThat(type).isEqualTo(31);
                byte[] value = classes.get(window).getBytes(StandardCharsets.ISO_8859_1);
                return propertyReply(8, value, value.length);
            }
            return propertyReply(0, new byte[0], 0);
        }

        private ByteBuffer propertyReply(int format, byte[] value, int units) {
            ByteBuffer r = buffer(32 + pad(value.length));
            r.put((byte) 1).put((byte) format).putShort((short) 0).putInt(pad(value.length) / 4)
                    .putInt(format == 0 ? 0 : 31).putInt(0).putInt(units).put(new byte[12]).put(value);
            return r.position(r.capacity());
        }

        private static ByteBuffer read(SocketChannel c, int length) throws IOException {
            ByteBuffer b = buffer(length);
            while (b.hasRemaining()) {
                if (c.read(b) < 0) {
                    throw new EOFException();
                }
            }
            return b.flip();
        }

        private static void write(SocketChannel c, ByteBuffer b) throws IOException {
            b.flip();
            while (b.hasRemaining()) {
                c.write(b);
            }
        }

        private static ByteBuffer buffer(int length) {
            return ByteBuffer.allocate(length).order(ByteOrder.LITTLE_ENDIAN);
        }

        private static int pad(int n) {
            return (n + 3) & ~3;
        }
    }
}
