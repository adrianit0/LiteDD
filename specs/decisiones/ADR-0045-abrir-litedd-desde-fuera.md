# ADR-0045: Abrir LiteDD desde fuera

- Estado: aceptada (2026-11-08)
- Requisitos: N-94, N-95, N-96
- Relacionada: ciclo de vida, ADR-0017 (fichero de instancia y presencia), ADR-0019 (ventana propia), N-73 (búsqueda rápida), N-90 (enlaces entre notas)

## Contexto

Los enlaces `litedd://note/<id>` solo funcionaban dentro de las notas (N-90). El usuario quiere pegarlos fuera, en un ticket, en un comentario del código o en la terminal, y que al pulsarlos LiteDD pase al frente con esa nota abierta. Para la terminal pidió también `litedd --open "título"`.

Una página no puede traer su propia ventana al frente: Chrome ignora `window.focus()` sin un clic del usuario. Hay que pedírselo al gestor de ventanas. Respuesta del usuario (2026-11-08): un cliente X11 propio, sin dependencias, mejor que exigir `wmctrl` o renunciar a traer la ventana al frente.

## Decisión

1. **Copiar el enlace (N-94):** el menú contextual del árbol ofrece «Copiar enlace», que copia `litedd://note/<id>` en texto plano, que es lo que se pega en un ticket o en un comentario. También está en las hijas generadas de una nota XML, porque copiar el enlace no las modifica (M-20).
2. **Registro del esquema (N-95):** `packaging/litedd.desktop` declara `MimeType=x-scheme-handler/litedd;` y `Exec=… %u`. `scripts/install.sh` lo hace manejador por defecto con `xdg-mime default litedd.desktop x-scheme-handler/litedd`, y `scripts/uninstall.sh` quita esa línea de `~/.config/mimeapps.list`. Al pulsar un enlace en Chrome aparece su diálogo «¿Abrir xdg-open?», que se puede dejar permitido para cada sitio.
3. **Línea de comandos:** `litedd litedd://note/<id>` (lo que ejecuta el lanzador) y `litedd --open "título"` (N-96). Solo se admite un destino. El enlace se acepta con o sin `/`, `?` o `#` al final, y el identificador va decodificado. Con un destino se abre siempre una ventana, aunque se indique `--no-window`.
4. **Entrega a la instancia en marcha:** si LiteDD ya está en marcha, el proceso nuevo lee el token de `instance.json` (como `--stop`) y llama a `POST /api/open-note` con `{"noteId"}` o `{"title"}`. El servidor lo reenvía a las ventanas conectadas como evento `open` del canal `/api/events`, con el mismo JSON, y trae la ventana al frente. Si no hay ninguna ventana, guarda la petición, abre una y se la entrega al conectarse. Si LiteDD no está en marcha, arranca y sigue ese mismo camino.
5. **Resolución en la ventana:** la ventana espera a tener el árbol y las pestañas restauradas. Con `noteId`, abre la nota como un clic en el árbol (pestaña provisional, P-14); si la nota no existe o está en la papelera, avisa «La nota del enlace no existe o está en la papelera». Con `title`, abre la única nota cuyo título coincide entero, sin distinguir mayúsculas ni acentos; si no hay ninguna o hay varias, abre la búsqueda rápida (N-73) con ese texto. El servidor no busca la nota: la ventana ya tiene el árbol.
6. **Traer al frente:** un cliente X11 mínimo en Java (`X11Activator`), sin dependencias, se conecta al socket de `DISPLAY` (`/tmp/.X11-unix/X<n>`) con la cookie MIT-MAGIC-COOKIE-1 de `XAUTHORITY` (o `~/.Xauthority`), busca en `_NET_CLIENT_LIST_STACKING` la ventana más alta de clase `litedd` (ADR-0019) y envía `_NET_ACTIVE_WINDOW` a la raíz como un paginador (fuente 2), igual que `wmctrl -a`. Vale con X11 y con Wayland, porque la ventana de Chrome usa XWayland (`--ozone-platform=x11`). Si no hay `DISPLAY` local, no se encuentra la ventana o algo falla, solo se registra en el log: la nota se abre igualmente. Se hace en un hilo aparte con un tope de 3 s, y la respuesta no lo espera.

## Consecuencias

- Un enlace de LiteDD funciona en cualquier aplicación que abra los enlaces con `xdg-open`, y `xdg-open litedd://note/<id>` vale en la terminal aunque esta no los reconozca como enlace.
- Sin marca de tiempo del clic, GNOME no cambia de escritorio: si la ventana está en otro, la marca como «requiere atención» en lugar de traerla.
- Si se pulsa un enlace en los 5 s siguientes a cerrar la ventana, el servidor aún puede creer que está conectada (el latido no lo ha descubierto) y la petición se pierde; pulsar otra vez abre una ventana nueva.
- `litedd` sin destino con una instancia en marcha sigue como antes: abre otra ventana.
- En Windows, solo para desarrollo, no se trae la ventana al frente y el esquema no se registra.
