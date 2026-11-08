package dev.litedd.lifecycle;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.EOFException;
import java.io.IOException;
import java.net.StandardProtocolFamily;
import java.net.UnixDomainSocketAddress;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.channels.SocketChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * ADR-0045: trae al frente la ventana de LiteDD con un cliente X11 mínimo, sin dependencias. Busca en
 * _NET_CLIENT_LIST_STACKING la ventana más alta de clase litedd (ADR-0019) y pide al gestor de ventanas que la
 * active con _NET_ACTIVE_WINDOW, como un paginador (EWMH), igual que wmctrl -a. La ventana de Chrome usa X11
 * también bajo Wayland, mediante XWayland.
 */
final class X11Activator {

    private static final Logger log = LoggerFactory.getLogger(X11Activator.class);

    static final Duration TIMEOUT = Duration.ofSeconds(3);
    static final String COOKIE_NAME = "MIT-MAGIC-COOKIE-1";
    static final int FAMILY_LOCAL = 256;
    static final int FAMILY_WILD = 65535;

    private static final Pattern LOCAL_DISPLAY = Pattern.compile("(?:unix)?:(\\d+)(?:\\.\\d+)?");
    // Átomos y códigos predefinidos del protocolo X11.
    private static final int ATOM_STRING = 31;
    private static final int ATOM_WINDOW = 33;
    private static final int ATOM_WM_CLASS = 67;
    private static final int SUBSTRUCTURE_NOTIFY = 1 << 19;
    private static final int SUBSTRUCTURE_REDIRECT = 1 << 20;
    private static final int CLIENT_MESSAGE = 33;
    /** EWMH: la petición viene de un paginador, en nombre del usuario. */
    private static final int SOURCE_PAGER = 2;
    private static final int MAX_REPLY = 1 << 20;

    /** @param number número de pantalla, como figura en el fichero de autorización */
    record Display(Path socket, String number) {
    }

    private X11Activator() {
    }

    /** Trae al frente la ventana de esa clase. Devuelve false si no se pudo; nunca lanza. */
    static boolean raise(String windowClass) {
        try {
            Display display = display(System.getenv("DISPLAY"));
            if (display == null) {
                log.debug("Sin pantalla X11 local: DISPLAY={}", System.getenv("DISPLAY"));
                return false;
            }
            return activate(display.socket(), cookie(display.number()), windowClass, TIMEOUT);
        } catch (IOException | RuntimeException e) {
            log.debug("No se pudo traer la ventana al frente: {}", e.toString());
            return false;
        }
    }

    /** «:0», «:1.0» o «unix:0» dan /tmp/.X11-unix/X0; una pantalla remota (host:0) da null. */
    static Display display(String value) {
        if (value == null) {
            return null;
        }
        Matcher m = LOCAL_DISPLAY.matcher(value);
        return m.matches() ? new Display(Path.of("/tmp/.X11-unix/X" + m.group(1)), m.group(1)) : null;
    }

    private static byte[] cookie(String number) {
        String file = System.getenv("XAUTHORITY");
        Path path = file != null && !file.isEmpty() ? Path.of(file) : Path.of(System.getProperty("user.home"), ".Xauthority");
        try {
            return cookie(Files.readAllBytes(path), number, hostname());
        } catch (IOException e) {
            // Sin fichero de autorización se intenta sin cookie.
            return new byte[0];
        }
    }

    /** El nombre que usa Xlib para las entradas locales es el del núcleo. */
    private static String hostname() {
        try {
            return Files.readString(Path.of("/proc/sys/kernel/hostname")).strip();
        } catch (IOException e) {
            return "";
        }
    }

    /**
     * Cookie MIT-MAGIC-COOKIE-1 de un fichero Xauthority para esa pantalla: primero la local de este equipo,
     * después la comodín y, si el nombre del equipo ha cambiado, cualquier local. Vacía si no hay.
     */
    static byte[] cookie(byte[] file, String number, String hostname) {
        ByteBuffer b = ByteBuffer.wrap(file).order(ByteOrder.BIG_ENDIAN);
        byte[] wild = null;
        byte[] otherLocal = null;
        while (b.remaining() >= 2) {
            int family = b.getShort() & 0xffff;
            byte[] address = field(b);
            byte[] display = field(b);
            byte[] name = field(b);
            byte[] data = field(b);
            if (data == null) {
                break;
            }
            String n = ascii(display);
            if (!COOKIE_NAME.equals(ascii(name)) || !n.isEmpty() && !n.equals(number)) {
                continue;
            }
            if (family == FAMILY_LOCAL && ascii(address).equals(hostname)) {
                return data;
            }
            if (family == FAMILY_WILD && wild == null) {
                wild = data;
            } else if (family == FAMILY_LOCAL && otherLocal == null) {
                otherLocal = data;
            }
        }
        return wild != null ? wild : otherLocal != null ? otherLocal : new byte[0];
    }

    private static byte[] field(ByteBuffer b) {
        if (b == null || b.remaining() < 2) {
            return null;
        }
        int length = b.getShort() & 0xffff;
        if (b.remaining() < length) {
            return null;
        }
        byte[] value = new byte[length];
        b.get(value);
        return value;
    }

    private static String ascii(byte[] bytes) {
        return bytes == null ? "" : new String(bytes, StandardCharsets.ISO_8859_1);
    }

    /**
     * Activa la ventana más alta de esa clase en el servidor X del socket. false si no hay ninguna o el gestor
     * de ventanas no publica la lista. Si el servidor no responde en el plazo, se corta la conexión.
     */
    static boolean activate(Path socket, byte[] cookie, String windowClass, Duration timeout) throws IOException {
        try (SocketChannel channel = SocketChannel.open(StandardProtocolFamily.UNIX)) {
            Thread guard = Thread.ofVirtual().name("litedd-x11-timeout").start(() -> {
                try {
                    Thread.sleep(timeout);
                    channel.close();
                } catch (InterruptedException | IOException e) {
                    // Terminó a tiempo o ya está cerrada.
                }
            });
            try {
                channel.connect(UnixDomainSocketAddress.of(socket));
                Connection x = new Connection(channel);
                int root = x.setup(cookie);
                int stacking = x.internAtom("_NET_CLIENT_LIST_STACKING");
                int active = x.internAtom("_NET_ACTIVE_WINDOW");
                if (stacking == 0 || active == 0) {
                    return false;
                }
                ByteBuffer windows = x.property(root, stacking, ATOM_WINDOW, 4096);
                // La lista va de abajo arriba: se busca desde la más alta.
                for (int i = windows.limit() / 4 - 1; i >= 0; i--) {
                    int window = windows.getInt(i * 4);
                    ByteBuffer wmClass;
                    try {
                        wmClass = x.property(window, ATOM_WM_CLASS, ATOM_STRING, 64);
                    } catch (XError e) {
                        // La ventana se ha cerrado entretanto.
                        continue;
                    }
                    if (hasClass(wmClass, windowClass)) {
                        x.activate(root, window, active);
                        x.sync();
                        return true;
                    }
                }
                return false;
            } finally {
                guard.interrupt();
            }
        }
    }

    /** WM_CLASS son dos cadenas terminadas en \0: instancia y clase. */
    static boolean hasClass(ByteBuffer wmClass, String windowClass) {
        byte[] bytes = new byte[wmClass.limit()];
        wmClass.get(0, bytes);
        for (String part : new String(bytes, StandardCharsets.ISO_8859_1).split("\0")) {
            if (part.equalsIgnoreCase(windowClass)) {
                return true;
            }
        }
        return false;
    }

    /** Error del servidor X a una petición. */
    static final class XError extends IOException {
        XError(int code) {
            super("Error X11 " + code);
        }
    }

    /** Peticiones de una en una, cada una con su respuesta. Orden de bytes: little endian («l»). */
    private static final class Connection {

        private final SocketChannel channel;

        Connection(SocketChannel channel) {
            this.channel = channel;
        }

        /** Conexión inicial; devuelve la ventana raíz de la primera pantalla. */
        int setup(byte[] cookie) throws IOException {
            byte[] name = cookie.length == 0 ? new byte[0] : COOKIE_NAME.getBytes(StandardCharsets.US_ASCII);
            ByteBuffer b = buffer(12 + padded(name.length) + padded(cookie.length));
            b.put((byte) 'l').put((byte) 0).putShort((short) 11).putShort((short) 0)
                    .putShort((short) name.length).putShort((short) cookie.length).putShort((short) 0);
            b.put(name);
            pad(b);
            b.put(cookie);
            pad(b);
            write(b);
            ByteBuffer head = read(8);
            ByteBuffer body = read((head.getShort(6) & 0xffff) * 4);
            if (head.get(0) != 1) {
                throw new IOException("El servidor X rechazó la conexión");
            }
            int vendor = body.getShort(16) & 0xffff;
            int screens = body.get(20) & 0xff;
            int formats = body.get(21) & 0xff;
            if (screens == 0) {
                throw new IOException("El servidor X no tiene pantallas");
            }
            return body.getInt(32 + padded(vendor) + 8 * formats);
        }

        /** InternAtom con only-if-exists: 0 si el átomo no existe. */
        int internAtom(String atom) throws IOException {
            byte[] n = atom.getBytes(StandardCharsets.US_ASCII);
            ByteBuffer b = buffer(8 + padded(n.length));
            b.put((byte) 16).put((byte) 1).putShort((short) (b.capacity() / 4)).putShort((short) n.length).putShort((short) 0);
            b.put(n);
            pad(b);
            write(b);
            return reply().getInt(8);
        }

        /** GetProperty: el valor, vacío si la ventana no la tiene o es de otro tipo. */
        ByteBuffer property(int window, int property, int type, int longs) throws IOException {
            ByteBuffer b = buffer(24);
            b.put((byte) 20).put((byte) 0).putShort((short) 6).putInt(window).putInt(property).putInt(type).putInt(0).putInt(longs);
            write(b);
            ByteBuffer r = reply();
            int format = r.get(1) & 0xff;
            int bytes = format == 0 ? 0 : r.getInt(16) * (format / 8);
            if (bytes < 0 || 32 + bytes > r.limit()) {
                throw new IOException("Respuesta X11 mal formada");
            }
            return r.slice(32, bytes).order(ByteOrder.LITTLE_ENDIAN);
        }

        /** SendEvent a la raíz con el ClientMessage _NET_ACTIVE_WINDOW (EWMH). */
        void activate(int root, int window, int activeAtom) throws IOException {
            ByteBuffer b = buffer(44);
            b.put((byte) 25).put((byte) 0).putShort((short) 11).putInt(root).putInt(SUBSTRUCTURE_NOTIFY | SUBSTRUCTURE_REDIRECT);
            // Sin marca de tiempo del clic: el gestor de ventanas usa la suya.
            b.put((byte) CLIENT_MESSAGE).put((byte) 32).putShort((short) 0).putInt(window).putInt(activeAtom)
                    .putInt(SOURCE_PAGER).putInt(0).putInt(0).putInt(0).putInt(0);
            write(b);
        }

        /** GetInputFocus como ida y vuelta: garantiza que el servidor ha procesado lo anterior. */
        void sync() throws IOException {
            ByteBuffer b = buffer(4);
            b.put((byte) 43).put((byte) 0).putShort((short) 1);
            write(b);
            reply();
        }

        /** La siguiente respuesta; los eventos se descartan y un error se lanza. */
        private ByteBuffer reply() throws IOException {
            while (true) {
                ByteBuffer head = read(32);
                int kind = head.get(0) & 0xff;
                if (kind == 0) {
                    throw new XError(head.get(1) & 0xff);
                }
                if (kind == 1) {
                    long extra = (head.getInt(4) & 0xffffffffL) * 4;
                    if (extra > MAX_REPLY) {
                        throw new IOException("Respuesta X11 demasiado grande");
                    }
                    ByteBuffer full = buffer(32 + (int) extra);
                    full.put(head.array(), 0, 32).put(read((int) extra).array());
                    return full.flip();
                }
            }
        }

        private void write(ByteBuffer b) throws IOException {
            b.flip();
            while (b.hasRemaining()) {
                channel.write(b);
            }
        }

        private ByteBuffer read(int length) throws IOException {
            ByteBuffer b = buffer(length);
            while (b.hasRemaining()) {
                if (channel.read(b) < 0) {
                    throw new EOFException("El servidor X cerró la conexión");
                }
            }
            return b.flip();
        }

        private static ByteBuffer buffer(int length) {
            return ByteBuffer.allocate(length).order(ByteOrder.LITTLE_ENDIAN);
        }

        private static int padded(int length) {
            return (length + 3) & ~3;
        }

        private static void pad(ByteBuffer b) {
            while (b.position() % 4 != 0) {
                b.put((byte) 0);
            }
        }
    }
}
