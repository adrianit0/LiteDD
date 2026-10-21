# Sprint 10: Notas pizarra

## Objetivo

Un tipo de nota para dibujar al estilo de Paint, que en consulta es una imagen y que una nota Markdown puede mostrar siempre en su última versión.

## Requisitos cubiertos

B-01 a B-44, y los cambios de N-04, N-05, N-20, N-90, X-03, U-02 y la API

Documentos: [requisitos/pizarra.md](../requisitos/pizarra.md), [decisiones/ADR-0029-notas-pizarra.md](../decisiones/ADR-0029-notas-pizarra.md), [constitucion.md](../constitucion.md).

## Tareas

1. Especificación: requisitos B, ADR-0029 con las propuestas A, B y C, y los cambios en notas, transferencia, interfaz, API, modelo de datos y arquitectura. La constitución no cambia.
2. Migración V006:
   - Tipo `board`, reconstruyendo `note` como V003 y V004 y conservando `rid`.
   - Disparadores de `note_fts` que indexan '' como contenido de las pizarras.
3. Servidor:
   - Validación del contenido de una pizarra al guardar, al restaurar una versión y al importar: vacío o PNG en URL `data:`, firma, cabecera IHDR, 10 MB y 4096 × 4096 (B-31).
   - Búsqueda sin fragmento para las pizarras (B-33).
   - Exportación `.png` e importación (B-34).
   - `maxRequestSize` a 15 MB.
4. Interfaz, motor de dibujo: un módulo puro con pruebas para el relleno con tolerancia, el recorte y el crecimiento del lienzo, la pila de deshacer por rectángulos y los límites de tamaño.
5. Interfaz, pizarra:
   - Lienzo con pincel, goma, texto, relleno, selección, pegar y deshacer, y barra de herramientas.
   - Bordes arrastrables y guardado asíncrono con `toBlob`.
   - Consulta con visor, «Copiar imagen» y «Descargar PNG».
6. Interfaz, integración:
   - Tipo `board` con icono naranja y su prueba de contraste AA.
   - «Nota Pizarra» en los dos menús y «Pizarra» en el filtro de tipo.
   - Miniaturas en el historial.
7. Interfaz, Markdown:
   - `![[` y el botón «Pizarra» de la barra de formato.
   - Imagen `litedd://note/<id>` con la última versión guardada, refrescada al guardar la pizarra.
   - Visor, clic central y avisos.
8. Verificación: `./mvnw verify` y los criterios de aceptación con la aplicación arrancada y datos aislados.

## Criterios de aceptación

- «Nota Pizarra» crea una pizarra que se abre en edición con un lienzo de 1200 × 800. Pincel, goma, texto, relleno, deshacer y rehacer funcionan, y el estado pasa a «Guardado» sin pulsar nada.
- En consulta se ve la imagen y no se puede pintar. Pulsarla la abre en el visor.
- Seleccionar un área y arrastrarla la mueve, y Supr la borra. Ctrl+V pega una captura de pantalla como selección flotante, y el lienzo crece si no cabe.
- Arrastrar la esquina cambia el tamaño al soltar. Encoger recorta, y Ctrl+Z lo deshace.
- Con «Copiar imagen», la pizarra se pega en otra aplicación. «Descargar PNG» descarga «Título.png».
- `![[` en una nota Markdown inserta una pizarra. Tras cambiar la pizarra en otra pestaña, la nota Markdown muestra el cambio sin pulsar «Actualizar». Con la pizarra en la papelera, aparece el aviso.
- La búsqueda encuentra una pizarra por su título y su descripción, sin fragmentos de base64.
- La exportación deja un `.png` que se abre con cualquier visor, y la importación recupera la pizarra igual. Un contenido que no es PNG se rechaza sin cambiar la nota.
- Una base de datos de la versión anterior se migra sin perder notas, búsqueda, historial ni pestañas.

## Resultado

Fecha: 2026-10-22.

### Hecho

- **Especificación:**
  - ADR-0029 aceptado con las respuestas del usuario: mapa de bits; tamaño arrastrando el borde; deshacer, relleno y copiar o descargar PNG, sin formas; `![[` con visor y clic central.
  - Propuestas A (botón «Pizarra»), B (fondo blanco) y C (1200 × 800, de 50 a 4096) aprobadas con el plan.
  - `requisitos/pizarra.md` con B-01 a B-44, y cambios en N-04, N-05, N-20, N-90, X-03, U-02, la API, el modelo de datos y la arquitectura. La constitución no cambia.
- **Migración V006:**
  - Tipo `board`, reconstruyendo `note` como V003 y V004 y conservando `rid`.
  - Los disparadores de `note_fts` indexan '' como contenido de una pizarra, también al borrar, así que el índice no se desajusta.
- **Servidor:**
  - `BoardImage` valida el contenido al guardar y al importar. Solo admite vacío o un PNG en URL `data:`, y comprueba la firma, la cabecera IHDR, los 10 MB y los 4096 × 4096.
  - Errores `invalid_board` (400) y `too_large` (413). La nota no cambia.
  - La búsqueda no pide fragmento para las pizarras, ni con texto ni solo con filtros.
  - Exportación `.png` con los bytes de la imagen (0 bytes si está vacía) e importación con la misma validación.
  - `maxRequestSize` pasa a 15 MB.
- **Interfaz, motor (`board/engine.ts`):**
  - Límites del lienzo, cambio de tamaño por borde y colocación de lo pegado.
  - Relleno con tolerancia de 48 por canal.
  - Recortes de píxeles, pila de deshacer de 50 pasos, paleta y nombre del PNG.
- **Interfaz, pizarra:**
  - **Edición (`BoardEditor`):**
    - Herramientas: pincel, goma, texto, relleno y selección (mover, Supr, Ctrl+C, Ctrl+X).
    - Ctrl+V pega una imagen como selección flotante y hace crecer el lienzo.
    - Deshacer y rehacer guardan solo el rectángulo que cambió.
    - Bordes y esquina arrastrables con contorno y medidas.
  - **Guardado:** cada paso se codifica con `toBlob`. Antes de guardar, la pestaña recibe lo que se ve, también la selección flotante y el texto sin fijar (`setFlusher` en `tabsStore`).
  - **Consulta (`BoardView`):** imagen a tamaño real, reducida al ancho del panel, que se abre en el visor. «Copiar imagen» y «Descargar PNG» están en los dos modos.
  - **Integración:**
    - Icono «PIZ» en naranja, con su prueba de contraste AA.
    - «Nota Pizarra» en los dos menús y «Pizarra» en el filtro de tipo.
    - Miniaturas en el historial.
- **Interfaz, Markdown:**
  - `![[` ofrece solo pizarras e inserta `![Título](litedd://note/<id>)`. El botón «Pizarra» de la barra de formato lo escribe.
  - **Imagen:** muestra la última versión guardada; se pide al mostrar la nota y se actualiza al guardar la pizarra (`markdown/boards.ts`).
  - **Avisos tachados:** si la pizarra no existe, está en la papelera o la nota no es una pizarra. Una pizarra vacía muestra «Pizarra vacía».
  - **Clics:** el clic abre el visor y el clic central abre la pizarra.
- **Pruebas:** 360 de backend (1 omitida en Windows) y 345 de interfaz.

### Criterios de aceptación

Recorridos con la aplicación arrancada (`exec:java`, puerto 47650) y datos aislados en el navegador integrado.

1. **Pizarra nueva:**
   - «Nota Pizarra» la abre en edición con un lienzo de 1200 × 800.
   - Funcionan el pincel, la goma (deja blanco el trozo borrado), el texto en dos líneas, el relleno, deshacer y rehacer.
   - El estado pasa a «Guardado» solo. **Cumplido.**
2. **Consulta:** se ve la imagen sin herramientas, y pulsarla la abre en el visor. **Cumplido.**
3. **Selección y pegado:**
   - Mover un área deja blanco su sitio y Ctrl+Z la devuelve. Supr la borra y Ctrl+Z la recupera.
   - Ctrl+V pegó una imagen de 2000 × 300 como selección flotante, el lienzo creció a 2000 de ancho y la imagen se movió y se fijó. **Cumplido.**
   - El pegado se simuló con un evento `paste` con un PNG generado en la página: el navegador integrado no comparte el portapapeles del sistema.
4. **Tamaño:** arrastrar la esquina encoge, recortando, y agranda, con lo nuevo en blanco. Dos Ctrl+Z vuelven a 1200 × 800 con el dibujo intacto. **Cumplido.**
5. **Copiar y descargar:** **pendiente en la ventana de LiteDD.**
   - El navegador integrado deniega el permiso de escritura en el portapapeles, también para `writeText`, que ya usaban los «Copiar» anteriores. Por eso «Copiar imagen» mostró «No se pudo copiar la imagen al portapapeles».
   - «Descargar PNG» no se pulsó para no descargar ficheros en el equipo.
   - Los dos los cubre la prueba B-04.
6. **Markdown:**
   - `![[esq` ofreció solo «Esquema de préstamos · Pizarra» e insertó la imagen.
   - Tras dibujar en la pizarra y volver a la nota, la imagen era la nueva sin pulsar «Actualizar».
   - Con la pizarra en la papelera, apareció el aviso tachado. **Cumplido.**
7. **Búsqueda:** «esquema» encuentra la pizarra sin fragmento, y la nota Markdown con el suyo. **Cumplido.**
8. **Exportación e importación:**
   - El ZIP lleva `03-esquema-de-prestamos.png`, que `file` reconoce como PNG de 2000 × 800.
   - «Añadir como rama» recupera la pizarra con el mismo contenido y la nota Markdown apunta a la pizarra nueva.
   - Un `PUT` con «hola» responde `invalid_board` y la nota no cambia.
   - El registro no contiene ningún PNG. **Cumplido.**
9. **Migración:** una base V005 pasa a V006 conservando `rid`, pestañas y búsqueda (prueba B-01/B-33 del migrador). **Cumplido.**

### Pendiente

- `./mvnw verify` en Ubuntu (ADR-0004).
- En la ventana de LiteDD: «Copiar imagen», «Descargar PNG» y Ctrl+V con una captura de pantalla real.

### Desviaciones y decisiones

- **Cuadro de texto:**
  - El navegador integrado no admite `field-sizing: content`, y el cuadro solo mostraba la primera línea.
  - Ahora mide lo mismo que medirá el texto dibujado, con la misma tipografía y la misma altura de línea.
- **Restaurar una versión** no vuelve a validar la imagen: las versiones de una pizarra ya pasaron B-31 al guardarse.
- **Herramienta, color, grosor y letra** se conservan entre pizarras mientras la aplicación está abierta, sin guardarse en los ajustes.
- **Posición de desplazamiento:** se recuerda la vertical, como en las demás notas (P-06).
- **Relleno:** la tolerancia deja un halo claro alrededor del texto suavizado, como en Paint.
- **Autocompletado de `[[`:** muestra «Pizarra» como tipo de las pizarras.
