package dev.litedd.lifecycle;

/**
 * Opciones de línea de comandos: litedd [--no-window] [--port N] [litedd://note/&lt;id&gt; | --open "título"] |
 * --stop (ADR-0045).
 */
public final class CommandLine {

    /**
     * @param port null para usar el del ajuste
     * @param open nota pedida desde fuera (N-95, N-96), o null
     */
    public record Options(boolean noWindow, Integer port, boolean stop, OpenRequest open) {
    }

    public static final String USAGE =
            "Uso: litedd [--no-window] [--port N] [litedd://note/<id> | --open \"título\"] | litedd --stop";

    private CommandLine() {
    }

    public static Options parse(String[] args) {
        boolean noWindow = false;
        boolean stop = false;
        Integer port = null;
        OpenRequest open = null;
        for (int i = 0; i < args.length; i++) {
            OpenRequest target = null;
            switch (args[i]) {
                case "--no-window" -> noWindow = true;
                case "--stop" -> stop = true;
                case "--port" -> {
                    if (i + 1 >= args.length) {
                        throw new IllegalArgumentException("Falta el número de puerto tras --port");
                    }
                    try {
                        port = Integer.parseInt(args[++i]);
                    } catch (NumberFormatException e) {
                        throw new IllegalArgumentException("Puerto no válido: " + args[i]);
                    }
                    if (port < 1 || port > 65535) {
                        throw new IllegalArgumentException("Puerto no válido: " + port);
                    }
                }
                case "--open" -> {
                    if (i + 1 >= args.length) {
                        throw new IllegalArgumentException("Falta el título de la nota tras --open");
                    }
                    target = OpenRequest.title(args[++i]);
                    if (!target.valid()) {
                        throw new IllegalArgumentException("Título no válido tras --open");
                    }
                }
                default -> {
                    // N-95: el lanzador pasa el enlace como argumento (%u).
                    if (!OpenRequest.isLink(args[i])) {
                        throw new IllegalArgumentException("Opción desconocida: " + args[i]);
                    }
                    target = OpenRequest.fromLink(args[i]);
                }
            }
            if (target != null) {
                if (open != null) {
                    throw new IllegalArgumentException("Solo se puede abrir una nota a la vez");
                }
                open = target;
            }
        }
        return new Options(noWindow, port, stop, open);
    }
}
