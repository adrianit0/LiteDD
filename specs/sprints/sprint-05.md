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

_Pendiente._
