# ADR-0014: Últimos valores de las variables por nota

- Estado: aceptada (2026-10-04)
- Requisitos: Q-24, P-06, tabla `variable_value`

## Contexto

Q-24 pide recordar por nota los últimos valores ejecutados y proponerlos al abrirla. La tabla `variable_value` existe, pero la API no tiene ninguna ruta para leerlos.

## Decisión

- `POST /api/sql/execute` guarda en `variable_value` los valores de las variables de la nota cada vez que responde con éxito: consulta, sentencia de metadatos o «Generar SQL». Un campo vacío se guarda como null.
- `POST /api/sql/analyze` acepta un `noteId` opcional. Si llega, la respuesta incluye `lastValues`, con las variables y sus últimos valores.
- Cada pestaña mantiene sus propios valores en el estado de la sesión (P-06). Los de `variable_value` solo se usan para rellenar una pestaña que todavía no tiene valores.

## Consecuencias

Los valores se borran con la nota al eliminarla definitivamente (N-55) y no se exportan (X-04).
