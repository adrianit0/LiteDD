# ADR-0006: Las acciones de sprints futuros se ocultan

- Estado: aceptada (2026-10-04)
- Requisitos: N-04, N-20, U-05

## Contexto

El menú contextual (N-04) y la cabecera de nota (U-05) incluyen acciones que se implementan en sprints posteriores: favorita, etiquetas, mover a…, eliminar e historial.

## Decisión

Cada acción aparece solo cuando su sprint la implementa; hasta entonces no se muestra, en lugar de mostrarse desactivada. Los botones «enlace a nota» e «imagen» de la barra de formato (N-20) sí están desde el Sprint 1: insertan una plantilla hasta que el Sprint 5 añada el autocompletado `[[` (N-90) y el pegado de imágenes (N-92).

## Consecuencias

Hasta el Sprint 5 la interfaz muestra menos opciones de las que describe la especificación.
