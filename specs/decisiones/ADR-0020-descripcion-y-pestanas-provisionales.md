# ADR-0020: Descripción de la nota y pestañas provisionales

- Estado: aceptada (2026-10-05)
- Requisitos: N-07, N-70, P-14, X-02

## Contexto

El usuario pidió dos cambios:

1. Una descripción opcional bajo el nombre, visible en el árbol en pequeño y gris, cortada con puntos suspensivos.
2. Pestañas provisionales al estilo de los editores de código: en cursiva, sustituidas al abrir otra nota y fijadas al trabajar con ellas.

## Decisión

### Descripción (N-07)

Respuestas del usuario:
- Se guarda hasta 200 caracteres. El árbol la muestra en una sola línea y la corta con «…» según el ancho del panel, no a un número fijo de caracteres.
- La búsqueda también la mira.

Detalles:
1. Migración V002: columna `note.description` (vacía por defecto) e índice FTS rehecho con título, contenido y descripción. Título y contenido siguen siendo las columnas 0 y 1, así que los fragmentos y el resaltado no cambian. Como toda migración, va precedida de una copia (D-02).
2. `PUT /api/notes/{id}` acepta `description`. Si falta, se conserva la actual: así renombrar desde el árbol y los guardados al cerrar la ventana no la borran. La interfaz solo la envía cuando cambió. Más de 200 caracteres dan 400 `invalid_description`.
3. Cambiar la descripción es una modificación de la nota: sube la versión, deja la pestaña pendiente de guardar y respeta el guardado manual (N-46).
4. El historial (N-44) sigue guardando título y contenido. Restaurar una versión no cambia la descripción.
5. El manifiesto de exportación incluye `description`. Un archivo anterior sin el campo se importa con la descripción vacía, y una de más de 200 caracteres se recorta. El formato sigue en la versión 1.
6. En el árbol, las filas con descripción son más altas (42 px frente a 28). El texto completo aparece al pasar el ratón.

### Pestañas provisionales (P-14)

Respuesta del usuario: «hacer una búsqueda» significa ejecutar la consulta de una nota SQL.

Detalles:
1. Abren en provisional: el clic en el árbol, en los resultados de búsqueda, en la búsqueda rápida y en los enlaces entre notas. Solo hay una provisional: abrir otra nota así la sustituye en su misma posición.
2. Se fija al modificar la nota (título, descripción o contenido), al pulsar «Editar» o «Actualizar», al ejecutar o paginar una consulta, con doble clic sobre la pestaña o con doble clic sobre la nota en el árbol.
3. Las notas nuevas, el clic central (P-03) y «Duplicar» abren pestañas fijas. Si la nota ya está abierta, solo se activa su pestaña (P-02).
4. La sesión (P-09) guarda si cada pestaña es provisional y la restaura igual.
