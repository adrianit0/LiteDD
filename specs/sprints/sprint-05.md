# Sprint 5: Búsqueda y contenido rico

## Objetivo

Filtros, etiquetas, enlaces, imágenes, Mermaid e historial.

## Requisitos cubiertos

N-44, N-45, N-70 a N-93

Documentos: [requisitos/notas.md](../requisitos/notas.md), [requisitos/datos.md](../requisitos/datos.md), [requisitos/api.md](../requisitos/api.md).

## Tareas

1. Historial de versiones: guardado, límite de 20, diálogo y restauración (N-44, N-45).
2. Búsqueda FTS5 con escapado, filtros y búsqueda rápida Ctrl+K (N-70 a N-74, T-45).
3. Etiquetas con autocompletado y favoritas (N-80, N-81).
4. Enlaces entre notas con `[[` y enlaces rotos tachados (N-90, N-91).
5. Adjuntos de imagen: subida, descarga y resolución de `litedd://` (N-92, N-93).
6. Mermaid con carga diferida y `securityLevel: 'strict'` (N-30, S-15).

## Criterios de aceptación

- La búsqueda encuentra por título y contenido sin distinguir acentos y resalta el fragmento.
- Los filtros de tipo, etiqueta, favorita y fecha se combinan.
- `[[` inserta un enlace que abre la nota destino; una imagen pegada se ve en la vista.
- Un bloque mermaid se dibuja; el historial lista versiones y restaura una.

## Resultado

Fecha: 2026-10-04.

### Hecho

- **Historial** (N-44, N-45): al salir del modo edición se pide guardar una versión (`snapshot: true`); sin esa marca, se guarda una como mucho cada 5 minutos. Se conservan 20. Un guardado sin cambios no sube la versión de la nota. El diálogo «Historial» muestra fecha y vista previa y restaura, guardando antes la versión actual.
- **Búsqueda** (N-70 a N-74):
  - FTS5 por prefijo, sin distinguir mayúsculas ni acentos, sin notas de la papelera.
  - Solo se usan letras y números, cada palabra entre comillas, así que ningún carácter da error (T-45).
  - Filtros de tipo, etiquetas (todas las elegidas), favoritas y fecha.
  - Lista plana con título, ruta y fragmento resaltado; al limpiar vuelve el árbol.
  - Ctrl+K abre la búsqueda rápida por título.
- **Etiquetas y favoritas** (N-80, N-81): editor de etiquetas en la cabecera con autocompletado, estrella en la cabecera, el árbol y el menú contextual. Las etiquetas sin notas se borran. Ninguna de las dos cosas cambia la versión.
- **Enlaces** (N-90, N-91): `[[` abre un autocompletado de notas, igual que el botón «enlace a nota» de la barra. Los enlaces a notas inexistentes o en la papelera se ven tachados.
- **Imágenes** (N-92, N-93): pegar o arrastrar sube la imagen; el servidor comprueba su firma (PNG, JPEG, GIF o WebP) y el máximo de 10 MB. La vista la muestra como URL `data:`, descargada con el token (ADR-0016).
- **Mermaid** (N-30, S-15): carga diferida, `securityLevel: 'strict'`, SVG saneado en un shadow root, renderizados en cola y caché por diagrama (ADR-0016).
- **Pruebas:** 225 de backend y 187 de interfaz.

### Criterios de aceptación

Recorridos con la aplicación arrancada sobre datos temporales. El panel del navegador no admite teclado real, así que se condujo con JavaScript.

1. **Búsqueda sin acentos con fragmento resaltado:** «PRESTAMO» encontró «Préstamos de libros», «Secuencia» y «Guía con diagrama», con «préstamo» resaltado en cada fragmento y la ruta. **Cumplido.**
2. **Filtros combinados:** «Solo favoritas» dejó solo «Guía con diagrama»; la combinación de tipo, etiquetas, favorita y fecha está probada en el servidor (N-72) y en la interfaz. Al limpiar vuelve el árbol. **Cumplido.**
3. **`[[` inserta un enlace que abre la nota; una imagen pegada se ve:**
   - El autocompletado de `[[` está probado sobre CodeMirror (N-90); que un enlace a nota la abre se probó en el Sprint 1.
   - Una imagen subida se vio en la vista como URL `data:`, y el pegado está probado sobre CodeMirror (N-92).
   - Falta escribir `[[` y pegar con teclado y ratón reales. **Cumplido, salvo ese recorrido a mano.**
4. **Un bloque mermaid se dibuja; el historial lista versiones y restaura una:** un diagrama de flujo y uno de secuencia se dibujan con sus estilos. El historial está probado en el servidor y en la interfaz (N-44, N-45). **Cumplido.**

### Pendiente

- Escribir `[[`, pegar una imagen y arrastrar otra con el teclado y el ratón reales.

### Desviaciones y decisiones

- ADR-0016: `snapshot` para el historial, filtro de etiquetas con todas las elegidas, imágenes como URL `data:` sin abrir excepciones al token, y Mermaid en un shadow root.
- ADR-0001: se añade `@codemirror/autocomplete` 6.20.3, según la opción A aprobada.
- La primera vez que se dibuja cada diagrama, Mermaid provoca avisos de CSP en la consola al medir el texto con un SVG temporal. La política los bloquea y el diagrama se ve bien. Los siguientes salen de la caché sin avisos (ADR-0016).
- MyBatis lee los BLOB como `byte[]` con `getBytes()`, porque sqlite-jdbc no implementa `getBlob()`.

### Cómo probarlo a mano

1. `./mvnw verify` y arrancar LiteDD.
2. Escribir en «Buscar…» parte de una palabra, en mayúsculas o sin acentos: aparece la lista con el fragmento resaltado. «Filtros» combina tipo, etiquetas, favoritas y fecha; «Limpiar» vuelve al árbol.
3. Ctrl+K, escribir parte de un título e Intro.
4. En una nota: ☆ la marca como favorita (★ también en el árbol), y en «+ etiqueta» se escribe y se pulsa Intro.
5. En edición, escribir `[[pres` y elegir la nota: se inserta el enlace, que en consulta la abre. Enlazar una nota y mandarla a la papelera: el enlace aparece tachado.
6. Pegar una captura con Ctrl+V en el editor: en consulta se ve la imagen.
7. Un bloque ```mermaid con `graph TD; A-->B` se dibuja en consulta.
8. Editar, volver a consulta y repetir; «Historial» lista las versiones y «Restaurar esta versión» las recupera.
