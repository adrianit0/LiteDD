# ADR-0007: El 409 de guardado lleva la nota actual

- Estado: aceptada (2026-10-04)
- Requisitos: N-42, A-02, A-05

## Contexto

N-42 ofrece «Recargar» o «Sobrescribir» ante un conflicto, pero no dice qué datos recibe la interfaz para hacerlo.

## Decisión

Cuando `PUT /api/notes/{id}` responde 409, `details` contiene la nota completa tal como está guardada, con su `version`. «Recargar» carga esa nota en el editor. «Sobrescribir» repite el guardado con `baseVersion` igual a esa versión.

## Consecuencias

La interfaz resuelve el conflicto sin una petición más.
