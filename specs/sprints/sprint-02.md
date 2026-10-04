# Sprint 2: Organización y pestañas

## Objetivo

Mover, eliminar, papelera, pestañas y sesión.

## Requisitos cubiertos

N-50 a N-65, P-01 a P-13

Documentos: [requisitos/notas.md](../requisitos/notas.md), [requisitos/pestanas.md](../requisitos/pestanas.md), [requisitos/datos.md](../requisitos/datos.md), [requisitos/api.md](../requisitos/api.md).

## Tareas

1. notes: mover con descendencia, validación de ciclos (D-05), eliminar con `children=promote`, papelera y restauración; pruebas T-40 a T-43 antes del código.
2. API: `move`, `DELETE /api/notes/{id}`, `/api/trash` y sus variantes.
3. Interfaz: arrastrar y soltar con dnd-kit, tres zonas, despliegue a los 600 ms, atajos Alt+flechas y «Mover a…» (N-60 a N-65).
4. Interfaz: diálogos de eliminación y panel de papelera (N-50 a N-55).
5. Interfaz: barra de pestañas, clic y clic central, cierre, reordenación, menú contextual y desbordamiento (P-01 a P-13).
6. session: `GET` y `PUT /api/session` sobre la tabla `tab`; restauración al arrancar (P-09).

## Criterios de aceptación

- Una nota con tres niveles de hijas se mueve entera arrastrando y con el teclado.
- Soltar una nota sobre una descendiente no es posible.
- Eliminar una nota con hijas ofrece subirlas un nivel; eliminar una sin hijas la manda a la papelera; restaurar la devuelve a su sitio.
- Clic sobre una nota ya abierta activa su pestaña; clic central abre otra pestaña de la misma nota.
- Tras reiniciar, vuelven las mismas pestañas, en el mismo orden y modo.

## Resultado

Fecha: 2026-10-04.

### Hecho

- **Servidor:**
  - `POST /api/notes/{id}/move` mueve la nota con toda su descendencia y rechaza con 409 `cycle` moverla sobre sí misma o una descendiente (N-60 a N-62, D-05, T-40).
  - `DELETE /api/notes/{id}` responde 409 `has_children` si hay hijas, salvo con `children=promote`; entonces las hijas ocupan su lugar en el mismo orden (N-50, N-51, T-42).
  - Papelera: `GET /api/trash`, restaurar a la madre al final o a la raíz (N-53, T-43), eliminar definitivamente y vaciar (N-52, N-55).
  - Sesión: `GET` y `PUT /api/session` (P-09); las pestañas de notas eliminadas desaparecen (N-54).
  - Purga de adjuntos sin nota al arrancar (N-55).
  - Todas las operaciones dejan las posiciones contiguas desde 0, comprobado con 300 operaciones aleatorias (D-03, T-41).
- **Interfaz:**
  - Estado por pestaña: nota, modo, guardado, conflicto y desplazamiento (P-06, P-07).
  - Barra de pestañas con icono, título, punto de estado y botón ×. Se reordenan arrastrando, se cierran con el botón, con clic central o con Alt+W, y Alt+RePág y Alt+AvPág cambian de pestaña. Si no caben, la barra se desplaza y el menú «▾» las lista todas. El menú contextual permite cerrar, cerrar las demás, cerrar las de la derecha y duplicar (P-01 a P-05, P-10, P-11).
  - Clic sobre una nota activa su pestaña o abre una nueva; el clic central, desde el árbol o desde un enlace, siempre abre una nueva (N-03, P-02, P-03).
  - Cerrar una pestaña guarda lo pendiente y pregunta si no se ha podido guardar (P-08).
  - La sesión se guarda en cada cambio y se restaura al arrancar (P-09). Renombrar actualiza las demás pestañas y el árbol (P-13). Sin pestañas aparece la pantalla vacía (P-12).
  - Árbol con arrastrar y soltar: zonas antes, después y dentro, indicador de destino (también el de no válido) y despliegue a los 600 ms. Además Alt+flechas, «Mover a…» con búsqueda sin acentos, y Supr o el menú para eliminar (N-60 a N-65).
  - Diálogos de eliminación (N-50, N-51), botón «Eliminar» en la cabecera (U-05) y papelera en el panel izquierdo (N-52, ADR-0009).
- **Pruebas:** 63 de backend y 113 de interfaz.

### Criterios de aceptación

Recorridos con la aplicación arrancada sobre una carpeta de datos temporal. El arrastre se simuló con eventos de puntero, porque el panel del navegador integrado no se dibujaba.

1. «Raíz A», con tres niveles de hijas, se arrastró dentro de «Raíz C» y se movió con toda su descendencia. Con Alt+← volvió a la raíz y con Alt+↑ subió una posición. **Cumplido.**
2. Al arrastrar «Raíz A» sobre su descendiente «Nivel 2», el indicador marca el destino como no válido y al soltar no cambia nada. El servidor también lo rechaza (T-40). **Cumplido.**
3. Supr sobre «Nivel 1», que tiene hijas, ofreció solo «Subir las hijas un nivel y eliminar» o «Cancelar»; al subirlas, «Nivel 2» ocupó su lugar. «Nivel 3», sin hijas, fue a la papelera tras confirmar, y «Restaurar» la devolvió a su madre. **Cumplido.**
4. Con «Raíz B» y «Raíz C» abiertas, un clic sobre B activó su pestaña sin abrir otra; un clic central abrió una segunda pestaña de B. **Cumplido.**
5. Con tres pestañas (B, C en edición, B activa), tras reiniciar el servidor y recargar volvieron las tres en el mismo orden, con la misma activa y C en edición. **Cumplido.**

### Pendiente

- Comprobar a mano el aspecto visual del arrastre (indicadores y etiqueta flotante) con el ratón real. Las capturas del navegador integrado no funcionaron.

### Desviaciones y decisiones

- ADR-0009: la papelera se muestra en el panel izquierdo.
- ADR-0010: al eliminar definitivamente una madre, sus hijas de la papelera pasan a la raíz.
- Las filas del árbol se colocan con `top` y no con `transform`: dnd-kit mide las zonas de soltado sin transformaciones.
- Mover no cambia la versión ni la fecha de modificación de la nota.
- Las pestañas abiertas mientras se restaura la sesión se conservan detrás de las restauradas.

### Cómo probarlo a mano

1. `./mvnw verify` y arrancar con `./mvnw -Dskip.frontend compile exec:java -Dexec.mainClass=dev.litedd.Main`. Para no tocar los datos reales, exportar antes `XDG_DATA_HOME` a una carpeta temporal.
2. Crear «A» con una hija, una nieta y una bisnieta, más «B» y «C».
3. Arrastrar «A» sobre la mitad de «C»: queda como hija de «C» con toda su rama. Soltar sobre el borde superior o inferior de un nodo la coloca antes o después.
4. Arrastrar «A» sobre una de sus descendientes: el borde rojo indica que no se puede.
5. Seleccionar una nota en el árbol y usar Alt+↑, Alt+↓, Alt+→ y Alt+←. Mantener un arrastre sobre un nodo plegado: se despliega a los 0,6 s.
6. Menú contextual → «Mover a…», escribir parte del título sin acentos y pulsar Intro.
7. Supr sobre una nota con hijas → «Subir las hijas un nivel y eliminar». Abrir «🗑 Papelera», restaurar, eliminar definitivamente y vaciar.
8. Clic y clic central sobre notas, clic central sobre una pestaña, botón derecho sobre una pestaña, «▾» para listarlas y arrastrarlas para reordenarlas.
9. Cerrar el proceso y volver a arrancarlo: vuelven las mismas pestañas, en el mismo orden y modo.
