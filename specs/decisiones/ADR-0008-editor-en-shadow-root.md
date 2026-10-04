# ADR-0008: El editor se monta en un shadow root para cumplir la CSP

- Estado: aceptada (2026-10-04)
- Requisitos: S-14, N-11, N-20

## Contexto

S-14 fija la CSP `default-src 'self'; img-src 'self' data:`, que bloquea los elementos `<style>` en línea. CodeMirror 6 inyecta sus estilos con un elemento `<style>` cuando se monta en el documento, así que el editor salía sin estilos y con un error de CSP en la consola.

## Decisión

El editor se monta dentro de un shadow root (`EditorView` con la opción `root`). Ahí CodeMirror usa hojas de estilo construidas (`adoptedStyleSheets`), que la CSP no bloquea. La CSP no cambia y no se usan nonces ni `'unsafe-inline'`.

Las variables CSS del tema atraviesan el shadow root, así que el editor usa los mismos colores y tipografías.

## Consecuencias

- Los selectores CSS globales no alcanzan el interior del editor; sus estilos van en el tema de CodeMirror (`NoteEditor.tsx`).
- El resto de la interfaz no crea elementos `<style>`; los estilos dinámicos se aplican con CSSOM (`element.style`), que la CSP permite.
- El editor SQL del Sprint 4 debe montarse igual.
