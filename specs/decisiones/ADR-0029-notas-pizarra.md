# ADR-0029: Notas pizarra

- Estado: aceptada (2026-10-22)
- Requisitos: B-01 a B-44, N-04, N-05, N-90, X-03, U-02

## Contexto

El usuario quiere un tipo de nota para dibujar, con las funciones de un Paint sencillo:

- Pintar, borrar, elegir el color y escribir texto.
- Seleccionar un área y moverla.
- Pegar una imagen del portapapeles.

El lienzo debe crecer y encoger con rapidez. Solo se modifica tras pulsar «Editar», y en consulta se ve como una imagen. Además, una nota Markdown debe poder mostrar la pizarra, siempre en su última versión.

## Decisión

Respuestas del usuario (2026-10-22):

1. **Mapa de bits:** lo pintado son píxeles, como en Paint. El texto y la imagen pegada se pueden mover hasta fijarlos; después solo se mueven con la selección. No hay objetos editables.
2. **Tamaño del lienzo:** se cambia arrastrando su borde derecho, el inferior o la esquina, como el panel izquierdo (U-01). Al encoger se recorta. No hay zoom mientras se edita.
3. **Herramientas además de las pedidas:** deshacer y rehacer, cubo de relleno, y copiar y descargar la pizarra como PNG. No hay formas (línea, flecha, rectángulo, elipse).
4. **Pizarras en Markdown:** `![[` inserta `![Título](litedd://note/<id>)`. La imagen muestra la última versión guardada. El clic abre el visor de N-35 y el clic central abre la pizarra en otra pestaña.

Propuestas, aprobadas con el plan (2026-10-22):

- **A.** La barra de formato del editor Markdown (N-20) gana un botón «Pizarra» que escribe `![[`, igual que «Enlace a nota» escribe `[[`.
- **B.** El fondo es blanco y opaco, y la goma pinta blanco. Un fondo transparente se vería negro sobre el tema oscuro y saldría transparente al pegarlo en otra aplicación.
- **C.** Una pizarra nueva mide 1200 × 800 píxeles. El mínimo es 50 × 50 y el máximo, 4096 × 4096.

Diseño:

- **Tipo nuevo:** quinto tipo de nota, `board`. La migración V006 reconstruye `note` para admitirlo, con el mismo procedimiento que V003 y V004.
- **Contenido:** la imagen se guarda en `content` como URL `data:image/png;base64,…`. Una pizarra sin dibujar tiene el contenido vacío. Así, el guardado, el 409, el historial, duplicar, la papelera y las pestañas funcionan sin cambios. Se descartan dos alternativas:
  - **La tabla `attachment`:** un adjunto solo se purga cuando su nota desaparece (N-55), así que cada guardado automático dejaría uno nuevo.
  - **Una columna aparte:** obligaría a tocar el historial, duplicar y la API sin ganar nada.
- **Validación en el servidor:** firma PNG y cabecera IHDR para el ancho y el alto, sin decodificar la imagen. El máximo es de 10 MB, como los adjuntos (N-92). `maxRequestSize` sube de 11 a 15 MB, porque 10 MB en base64 ocupan unos 13,4 MB.
- **Búsqueda:** los disparadores de `note_fts` indexan una cadena vacía como contenido de una pizarra. La consulta no pide fragmento para ellas: con contenido externo, FTS5 lo sacaría del base64. Si algún día se hace un `rebuild` de `note_fts`, debe seguir la misma regla.
- **Dibujo:** Canvas 2D del navegador, sin dependencias nuevas:
  - La lógica que no necesita el DOM va en un módulo puro con pruebas: relleno, recorte, pila de deshacer y límites de tamaño.
  - Deshacer guarda solo el rectángulo afectado por cada paso, antes y después, para no copiar el lienzo entero cada vez.
- **Guardado asíncrono:** la imagen se codifica con `canvas.toBlob` al terminar cada paso y se entrega a la pestaña como cualquier contenido. La interfaz no se bloquea con lienzos grandes.
- **Copiar imagen:** usa `navigator.clipboard.write` con un `ClipboardItem` PNG. La API está disponible porque LiteDD se sirve desde 127.0.0.1, que es un contexto seguro.
- **Pizarras en Markdown:**
  - La interfaz guarda en memoria las pizarras que se muestran, con su versión, y las pide de nuevo al abrir la nota Markdown.
  - Al guardar una pizarra, la pestaña actualiza esa memoria, y las notas Markdown abiertas se redibujan sin recargar.
  - La reasignación de enlaces de la importación (X-05) ya trata cualquier `litedd://note/<id>`, también dentro de una imagen.
- **Exportación:** cada pizarra se exporta como `.png` con los bytes de la imagen, para que se abra con cualquier visor. Una pizarra vacía se exporta como fichero de 0 bytes. Al importar se valida como al guardar.

## Consecuencias

- El historial guarda la imagen entera en cada versión. Con 20 versiones, una pizarra grande puede ocupar decenas de MB en litedd.db. Las de uso normal pesan entre 50 y 300 KB.
- El texto de una pizarra son píxeles: no se busca ni se edita después de fijarlo.
- Dibujar exige ratón o lápiz. La barra de herramientas sí se maneja con teclado (U-08).
- Deshacer solo dura mientras se edita. Para volver atrás después está el historial (N-45).
