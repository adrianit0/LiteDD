package dev.litedd.lifecycle;

/** Opciones de línea de comandos: litedd [--no-window] [--port N] | --stop. */
public final class CommandLine {

    /** @param port null para usar el del ajuste */
    public record Options(boolean noWindow, Integer port, boolean stop) {
    }

    public static final String USAGE = "Uso: litedd [--no-window] [--port N] | litedd --stop";

    private CommandLine() {
    }

    public static Options parse(String[] args) {
        boolean noWindow = false;
        boolean stop = false;
        Integer port = null;
        for (int i = 0; i < args.length; i++) {
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
                default -> throw new IllegalArgumentException("Opción desconocida: " + args[i]);
            }
        }
        return new Options(noWindow, port, stop);
    }
}
