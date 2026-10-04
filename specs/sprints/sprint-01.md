# Sprint 1: Notas básicas

## Objetivo

Almacenamiento, árbol, edición y vista Markdown, y guardado.

## Requisitos cubiertos

D-01 a D-07, N-01 a N-33, N-40 a N-43, U-01 a U-09

Documentos: [requisitos/datos.md](../requisitos/datos.md), [diseno/modelo-datos.md](../diseno/modelo-datos.md), [requisitos/notas.md](../requisitos/notas.md), [requisitos/interfaz.md](../requisitos/interfaz.md), [requisitos/api.md](../requisitos/api.md).

## Tareas

1. store: conexión SQLite con los PRAGMA de D-01, migración `V001__initial.sql` con todo el esquema y control con `PRAGMA user_version` (D-02).
2. store: una conexión de escritura serializada y lecturas en paralelo (D-07); mappers MyBatis con anotaciones (D-06).
3. notes: crear nota y árbol con posiciones contiguas desde 0 en transacción (D-03), con pruebas antes del código.
4. API: `GET /api/tree`, `POST /api/notes`, `GET` y `PUT /api/notes/{id}` con `baseVersion` y 409 (N-42, A-01 a A-05).
5. Interfaz: cliente de API con el token, almacén Zustand, disposición de tres zonas y panel redimensionable (U-01 a U-09).
6. Interfaz: árbol con plegado recordado, botones de nueva nota y menú contextual básico (N-01 a N-06).
7. Interfaz: modos consulta y edición, Ctrl+E, título editable (N-10 a N-13).
8. Editor CodeMirror con barra de formato y atajos (N-20 a N-22).
9. Vista Markdown con markdown-it, highlight.js y DOMPurify (N-30 a N-33, S-15); Mermaid queda para el Sprint 5.
10. Guardado automático, Ctrl+S, indicador, conflicto 409 con «Recargar» o «Sobrescribir» y botón «Actualizar» (N-40 a N-43).

## Criterios de aceptación

- Se crean notas Markdown y SQL en la raíz y como hijas; el árbol las muestra y recuerda el plegado.
- La barra de formato aplica y quita cada formato sobre una selección.
- La vista renderiza tablas, listas de tareas y bloques de código resaltados.
- Tras escribir y esperar 2 segundos, cerrar y reabrir la aplicación conserva el texto.
- Un guardado con versión antigua recibe 409 y la interfaz ofrece «Recargar» o «Sobrescribir».

## Resultado

Fecha: 2026-10-04.

### Hecho

- **Almacenamiento:** `Store` con una conexión de escritura serializada y tres de lectura de solo lectura, con los PRAGMA de D-01 en todas. Mappers MyBatis con anotaciones (D-06).
- **Migraciones:** `V001__initial.sql` crea el esquema completo, incluidos FTS5 y sus disparadores. Se controlan con `PRAGMA user_version`, y antes de migrar una base existente se hace una copia; se conservan 2 (D-02).
- **Datos:** carpeta `~/.local/share/litedd/`, o `$XDG_DATA_HOME/litedd/` si esa variable existe.
- **notes:** crear al final de las hermanas en una transacción (D-03), árbol sin notas de la papelera (D-04) y guardado con concurrencia optimista. El 409 lleva la nota actual (ADR-0007).
- **API:** `GET /api/tree`, `POST /api/notes`, `GET` y `PUT /api/notes/{id}`, `GET` y `PUT /api/settings` (ADR-0005). Todos los errores siguen A-02.
- **Interfaz:**
  - Disposición de tres zonas y panel redimensionable con ratón y teclado, que se oculta con Alt+B. El ancho y la visibilidad se recuerdan (U-01).
  - Árbol virtualizado con icono de tipo y plegado recordado. Se maneja con teclado (flechas, Inicio, Fin, Intro, F2, menú contextual con Mayús+F10). El menú contextual permite crear hijas Markdown o SQL y renombrar (N-01 a N-06, N-13).
  - Modos consulta y edición con botón y Ctrl+E. El título se edita en la cabecera o con F2 en el árbol (N-10 a N-13).
  - Editor CodeMirror con barra de 17 botones que ponen y quitan cada formato, Ctrl+B y Ctrl+I, Intro que continúa listas y tabulador que sangra (N-20 a N-22).
  - Vista Markdown con GFM, código resaltado, casillas de solo lectura, tablas con `<br>` y `|`, y enlaces `litedd://note/` que abren la nota. El HTML se sanea con DOMPurify (N-30 a N-33, S-15).
  - Guardado automático a los 1,5 s, al perder el foco, al cambiar de modo, al abrir otra nota y al cerrar la ventana (con `keepalive`). También con Ctrl+S. Indicador de estado, diálogo de conflicto «Recargar» o «Sobrescribir», y botón «Actualizar» que pide confirmación si hay cambios sin guardar (N-40 a N-43).
  - Tema oscuro con contraste AA comprobado por prueba, foco visible y ningún atajo reservado del navegador (U-02 a U-04, U-08, U-09).
- **Pruebas:** 40 de backend y 72 de interfaz.

### Criterios de aceptación

Recorridos con la aplicación arrancada (http://127.0.0.1:47600/) sobre una carpeta de datos temporal:

1. Se crearon notas Markdown y SQL en la raíz (botón y Alt+Mayús+N) y como hijas (menú contextual). El árbol las muestra y, tras plegar y recargar, el nodo sigue plegado. **Cumplido.**
2. Con todo el texto seleccionado, «Negrita» envolvió el texto en `**` y al pulsar otra vez lo quitó. El resto de formatos tiene pruebas automáticas. **Cumplido.**
3. La vista mostró una tabla, casillas de tareas de solo lectura y un bloque `sql` con colores de highlight.js. **Cumplido.**
4. Se escribió una nota, se esperó y se mató el proceso. Al volver a arrancar, el contenido seguía. **Cumplido.**
5. Con la nota en edición se guardó otra versión con `curl`. Al escribir, apareció el diálogo «La nota ha cambiado» con «Recargar» y «Sobrescribir». «Recargar» cargó la versión externa. **Cumplido.**

### Pendiente

- D-05 (ciclos) y el clic central de N-03 llegan con mover y las pestañas en el Sprint 2.
- U-05: favorita, etiquetas, Historial y Eliminar en la cabecera llegan en sus sprints (ADR-0006).
- U-06 (disposición de la nota SQL en consulta) llega en el Sprint 4. Hasta entonces la nota SQL se ve como texto monoespaciado.
- U-07: solo hay avisos de error no bloqueantes. Los avisos de copias llegan en el Sprint 6.
- N-30: los diagramas Mermaid llegan en el Sprint 5.
- El estado de guardado pasará a ser por pestaña en el Sprint 2.

### Desviaciones y decisiones

- ADR-0005: estado de interfaz en la tabla `setting`; ajustes en `config.json`.
- ADR-0006: las acciones de sprints futuros se ocultan.
- ADR-0007: el 409 lleva la nota guardada.
- ADR-0008: CodeMirror en un shadow root para cumplir la CSP sin relajarla.
- ADR-0001 actualizado: se usan los subpaquetes `@codemirror/language`, `@codemirror/commands` y `@lezer/highlight`, en lugar del paquete `codemirror`.
- La aplicación no produce errores de CSP. El panel del navegador integrado muestra uno propio incluso en `/api/health`; no lo genera LiteDD.

### Cómo probarlo a mano

1. `./mvnw verify` → BUILD SUCCESS.
2. `./mvnw -Dskip.frontend compile exec:java -Dexec.mainClass=dev.litedd.Main` y abrir http://127.0.0.1:47600/. Para no usar la carpeta de datos real, exportar antes `XDG_DATA_HOME` a una carpeta temporal.
3. «+ Nueva nota Markdown»: el título «Sin título» aparece seleccionado. Escribir un título, pulsar Intro y escribir Markdown con una tabla, una lista de tareas y un bloque ```sql.
4. Ctrl+E para ver el resultado; Ctrl+E otra vez para editar. Seleccionar texto y probar los botones de la barra, dos veces cada uno.
5. Botón derecho sobre la nota → «Nueva nota SQL hija». Plegar la madre con ▾ y recargar la página: sigue plegada.
6. Esperar 2 s tras escribir, cerrar el proceso y volver a arrancarlo: el texto sigue.
7. Con una nota en edición, guardar otra versión desde fuera:
   `curl -X PUT -H "X-LiteDD-Token: <token>" -H "Content-Type: application/json" -d '{"title":"T","content":"externo","baseVersion":<versión>}' http://127.0.0.1:47600/api/notes/<id>`
   El token está en la etiqueta `meta[name=litedd-token]` de la página. Después escribir en el editor: aparece el diálogo de conflicto.
8. Alt+B oculta y muestra el panel; arrastrar su borde cambia el ancho y se recuerda.
