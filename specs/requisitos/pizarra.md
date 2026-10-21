# Requisitos de las notas pizarra

Quinto tipo de nota: un dibujo de mapa de bits con fondo blanco, para hacer esquemas rápidos al estilo de Paint. Solo se modifica en edición; en consulta es una imagen. Una nota Markdown puede mostrar una pizarra, siempre en su última versión guardada (ADR-0029).

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Ruta / Título              ★  Etiquetas     [Ver] ⟳ Historial …      │
├──────────────────────────────────────────────────────────────────────┤
│ ✎ Pincel ⌫ Goma T Texto ◧ Relleno ⬚ Selección │ ■■■■■■ ◉ │ ─ 4 px │ ↶ ↷ │
├──────────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────┐                             │
│ │                                      │                             │
│ │            lienzo blanco             ┃ ← arrastrar: ancho          │
│ │                                      │                             │
│ └━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛ ← esquina: ancho y alto     │
└──────────────────────────────────────────────────────────────────────┘
```

## Tipo y modos

| ID | Requisito |
|---|---|
| B-01 | Tipo de nota `board`, «Nota Pizarra». Se crea desde «+ Nuevo» y desde el submenú «Nuevo» del árbol (N-04, N-05). Sigue las reglas comunes de árbol, hijas, papelera, etiquetas, favorita, descripción, duplicar, pestañas e historial. |
| B-02 | En consulta, la pizarra se ve como una imagen a su tamaño real, reducida al ancho del panel si no cabe. Pulsarla la abre en el visor de N-35. Una pizarra vacía muestra «Pizarra vacía. Pulsa «Editar» o Ctrl+E para dibujar.». |
| B-03 | Solo se modifica en edición, con «Editar» o Ctrl+E (N-10, N-12). Una pizarra nueva se abre en edición (N-06) con un lienzo de 1200 × 800 píxeles. |
| B-04 | Sobre la imagen, en los dos modos, «Copiar imagen» copia la pizarra al portapapeles como PNG. «Descargar PNG» la descarga con el título saneado como nombre. En edición, los dos incluyen lo pintado aún sin guardar. |

## Herramientas

| ID | Requisito |
|---|---|
| B-10 | En edición, una barra de herramientas sobre el lienzo ofrece: pincel, goma, texto, cubo de relleno y selección; color, grosor y tamaño de letra; deshacer y rehacer. La herramienta activa se ve marcada. Cada control tiene nombre accesible y se maneja con teclado (U-08). Dibujar exige ratón o lápiz. |
| B-11 | Pincel: trazo a mano alzada con el color y el grosor elegidos, con extremos redondeados. |
| B-12 | Goma: igual que el pincel, pero pinta el color de fondo, que es blanco. |
| B-13 | Color: una paleta fija de 12 colores y el selector de color del sistema para cualquier otro. Grosor: de 1 a 40 píxeles. |
| B-14 | Texto: un clic abre en ese punto un cuadro de texto con el color y el tamaño de letra elegidos (de 12 a 72 píxeles). Admite varias líneas. Escape, otra herramienta, un clic fuera o salir de edición lo fijan en el lienzo. Si está vacío, no deja nada. |
| B-15 | Cubo de relleno: rellena con el color elegido la zona contigua cuyo color se parece al del punto pulsado. Una tolerancia pequeña absorbe el suavizado de los bordes. |
| B-16 | Selección: arrastrar marca un rectángulo, que se ve con un contorno discontinuo. Arrastrar desde dentro lo mueve y deja blanco su sitio original. Supr lo borra, Ctrl+C lo copia como imagen y Ctrl+X lo corta. Escape, otra herramienta, un clic fuera o salir de edición lo fijan. |
| B-17 | Pegar: Ctrl+V con una imagen en el portapapeles la pega como selección flotante (B-16) en la esquina superior izquierda de la parte visible del lienzo. Si no cabe, el lienzo crece hasta contenerla. Si supera el máximo de B-22, se reduce de forma proporcional. Sin imagen en el portapapeles, Ctrl+V no hace nada en el lienzo. |
| B-18 | Deshacer y rehacer: Ctrl+Z y Ctrl+Y (también Ctrl+Mayús+Z), y sus botones, hasta 50 pasos. Es un paso cada trazo, texto, relleno, movimiento, pegado, borrado o cambio de tamaño. Los pasos se pierden al salir de edición o cerrar la pestaña. |
| B-19 | Los atajos de la pizarra solo actúan con el foco en el lienzo. Ctrl+S, Ctrl+E y los demás atajos globales funcionan igual que en las otras notas. |

## Lienzo

| ID | Requisito |
|---|---|
| B-20 | El tamaño del lienzo cambia arrastrando su borde derecho, su borde inferior o su esquina. Mientras se arrastra, un contorno y una etiqueta muestran el tamaño nuevo en píxeles; al soltar, se aplica. Al encoger, se recorta lo que queda fuera; al crecer, la parte nueva es blanca. |
| B-21 | El lienzo se ve a tamaño real. Si no cabe en el panel, se desplaza con las barras de desplazamiento, y la posición se recuerda por pestaña (P-06). |
| B-22 | El lienzo mide como mínimo 50 × 50 píxeles y como máximo 4096 × 4096. |

## Guardado y datos

| ID | Requisito |
|---|---|
| B-30 | El contenido de la nota es la imagen PNG como URL `data:image/png;base64,…`. Una pizarra sin dibujar tiene el contenido vacío. Se guarda como cualquier nota (N-40 a N-46): automáticamente 1,5 s después del último cambio, con Ctrl+S, al cambiar de modo y con el 409 de los conflictos. |
| B-31 | En una pizarra, el servidor solo acepta un contenido vacío o un PNG válido en ese formato, de hasta 10 MB y 4096 × 4096 píxeles. Si no, responde 400 (`invalid_board`) o 413 (`too_large`) y la nota no cambia. |
| B-32 | El diálogo «Historial» muestra una miniatura de cada versión de una pizarra en lugar del texto. |
| B-33 | En las pizarras, la búsqueda (N-70) solo mira el título y la descripción: su contenido no se indexa y sus resultados no llevan fragmento. El filtro de tipo ofrece «Pizarra» (N-72). |
| B-34 | En la exportación, cada pizarra es un fichero `.png` con los bytes de la imagen; una pizarra vacía es un fichero de 0 bytes (X-03). La importación valida el fichero como B-31. |

## Pizarras en notas Markdown

| ID | Requisito |
|---|---|
| B-40 | Al escribir `![[` en el editor Markdown aparece un autocompletado solo con pizarras, que inserta `![Título](litedd://note/<id>)`. El botón «Pizarra» de la barra de formato escribe `![[` y abre ese autocompletado (N-20). |
| B-41 | En consulta, esa imagen muestra la última versión guardada de la pizarra. Se actualiza al guardar la pizarra desde cualquier pestaña y al volver a mostrar la nota Markdown, sin pulsar «Actualizar». |
| B-42 | Pulsar la imagen la abre en el visor (N-35). El clic central abre la pizarra en una pestaña nueva (P-03). |
| B-43 | Si la nota no existe, está en la papelera o no es una pizarra, aparece un aviso tachado en lugar de la imagen, como en los enlaces rotos (N-91). Si la pizarra está vacía, aparece «Pizarra vacía». |
| B-44 | La importación con «Añadir como rama» reasigna estas referencias como los demás enlaces a notas (X-05). |
