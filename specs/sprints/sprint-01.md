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

_Pendiente._
