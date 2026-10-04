# ADR-0016: Historial, imágenes adjuntas y diagramas Mermaid

- Estado: aceptada (2026-10-04)
- Requisitos: N-30, N-44, N-45, N-80, N-92, N-93, S-12, S-14, S-15

## Decisión

1. **Historial (N-44):** el servidor no sabe cuándo se sale del modo edición. `PUT /api/notes/{id}` acepta `snapshot: true`, que la interfaz envía al salir de edición. Entonces se guarda una versión si título o contenido difieren de la última. Sin esa marca, se guarda una como mucho cada 5 minutos. Se conservan las 20 últimas.
2. **Restaurar (N-45):** antes de restaurar una versión se guarda otra con el contenido actual, para poder deshacerlo. Restaurar exige la versión de partida, igual que guardar (N-42).
3. **Etiquetas (N-80):** un filtro con varias etiquetas exige que la nota las tenga todas. Las etiquetas se comparan sin distinguir mayúsculas, y las que se quedan sin notas, contando las de la papelera, se borran.
4. **Imágenes (N-92, N-93):** un `<img>` no puede enviar la cabecera con el token de S-12. La interfaz descarga el adjunto con el token y lo muestra como URL `data:`, que la CSP de S-14 ya permite. La ruta `GET /api/attachments/{id}` sigue exigiendo el token. El tipo real se comprueba por la firma del fichero, no por la cabecera.
5. **Mermaid (N-30, S-15):** Mermaid devuelve un SVG con un elemento `<style>` y atributos `style`, que la CSP no admite. El SVG se sanea con DOMPurify y se muestra dentro de un shadow root: su `<style>` pasa a una hoja de estilo construida y los atributos `style` se aplican por CSSOM. La CSP no cambia.
6. **Autocompletado de `[[` (N-90):** se usa el subpaquete `@codemirror/autocomplete` (ADR-0001).

## Consecuencias

- La primera vez que se dibuja cada diagrama, Mermaid mide el texto con un SVG temporal en el documento y la CSP bloquea sus estilos: la consola muestra esos avisos. El diagrama final se ve con sus estilos, porque se aplican aparte. Los diagramas ya dibujados salen de una caché, sin avisos.
- Los estilos del SVG se sacan del texto antes de analizarlo, porque Chrome aplica la CSP también a los documentos de `DOMParser`.
- Mermaid se carga solo cuando una nota tiene un diagrama: es un paquete grande (más de 1 MB).
