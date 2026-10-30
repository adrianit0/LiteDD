# Requisitos de la API HTTP local

> Extraído de `specs/ESPECIFICACION.md`. Si este fichero y aquel difieren tras un cambio aprobado, manda este y se registra un ADR.

La interfaz habla con el servidor solo a través de esta API JSON, bajo `/api`.

| ID | Regla |
|---|---|
| A-01 | JSON en UTF-8. Los nombres de campo van en inglés y en camelCase. |
| A-02 | Los errores usan el código HTTP adecuado y el cuerpo `{"code", "message", "details"}`. message va en español y es apto para mostrarse. |
| A-03 | Toda ruta exige el token de sesión (S-12), salvo `GET /api/health`. |
| A-04 | La ejecución usa siempre el contenido guardado de la nota. La petición envía noteId y la versión que la pestaña tiene cargada. |
| A-05 | Si la versión enviada no coincide con la guardada, la respuesta es 409 y la interfaz pide pulsar «Actualizar». |

| Método | Ruta | Descripción |
|---|---|---|
| GET | /api/tree | Árbol completo de notas activas: identidad, madre, posición, tipo, título, favorita, etiquetas y, en las hijas de una nota XML, statementId y statementKind |
| POST | /api/notes | Crear nota: madre, tipo, título |
| GET | /api/notes/{id} | Nota completa con contenido y versión |
| PUT | /api/notes/{id} | Guardar título y contenido con baseVersion; 409 si hay conflicto. En una pizarra, el contenido se valida según B-31 |
| POST | /api/notes/{id}/duplicate | Duplicar una nota, sin hijas (N-08, M-31) |
| POST | /api/notes/{id}/move | Mover: nueva madre y posición |
| DELETE | /api/notes/{id} | A la papelera; 409 si tiene hijas, salvo children=promote |
| PUT | /api/notes/{id}/tags | Sustituir etiquetas |
| PUT | /api/notes/{id}/favorite | Marcar o desmarcar |
| GET | /api/notes/{id}/versions | Historial |
| POST | /api/notes/{id}/versions/{versionId}/restore | Restaurar una versión |
| GET | /api/trash | Contenido de la papelera |
| POST | /api/trash/{id}/restore | Restaurar |
| DELETE | /api/trash/{id} | Eliminar definitivamente |
| DELETE | /api/trash | Vaciar |
| GET | /api/search | Parámetros q, type, tags, favorite, since |
| GET | /api/tags | Etiquetas existentes |
| POST | /api/attachments | Subir imagen |
| GET | /api/attachments/{id} | Descargar imagen |
| POST | /api/sql/analyze | Variables, tipos, clase de sentencia y errores de un contenido |
| POST | /api/sql/execute | Ejecutar una página |
| POST | /api/sql/count | Total de filas |
| POST | /api/sql/render | SQL final sin ejecutar |
| POST | /api/sql/cancel | Cancelar por executionId |
| POST | /api/mybatis/analyze | Sentencias y errores de un mapper, con los fragmentos de las demás notas XML (M-41, M-05) |
| GET | /api/constants | Constantes Java: nombre, valor y número de notas que la usan (M-61, M-65) |
| PUT | /api/constants | Dar o quitar valores en bloque; un valor vacío deja la constante sin valor (M-65, M-66) |
| POST | /api/http/execute | Ejecutar una nota HTTP con el perfil activo, con su login y la clave de confirmación si el perfil la pide (H-30, H-63, H-69) |
| POST | /api/http/cancel | Cancelar por executionId |
| GET, PUT | /api/http/profile | Perfil activo de las notas HTTP (H-63) |
| GET, PUT | /api/http/credentials | Indicar qué perfiles tienen contraseña y guardar la de uno; nunca la devuelve (H-21) |
| PUT | /api/http/confirm-key | Definir o borrar la clave de confirmación; nunca la devuelve (H-69) |
| GET, PUT | /api/http/ca | Ver e importar la CA corporativa de los perfiles de preproducción (H-66) |
| POST | /api/workflow/analyze | Tipo, título, estado, variables y valores iniciales de las notas de los nodos y, con workflowId, los últimos valores ejecutados (W-23, W-24, W-51) |
| POST | /api/workflow/execute | Ejecutar un workflow con los valores de la pestaña; responde en streaming con un evento JSON por línea (W-60 a W-72) |
| POST | /api/workflow/cancel | Cancelar por executionId |
| GET | /api/connection | Configuración sin contraseña |
| PUT | /api/connection | Guardar configuración |
| POST | /api/connection/test | Probar y listar esquemas |
| POST | /api/connection/reconnect | Recrear el pool |
| GET | /api/connection/status | Estado actual |
| GET, PUT | /api/session | Pestañas y su estado |
| GET, PUT | /api/settings | Ajustes |
| POST | /api/data/export | Descargar ZIP |
| POST | /api/data/import | Subir ZIP con el modo elegido |
| POST | /api/data/backup | Crear copia ahora |
| POST | /api/data/open-folder | Abrir la carpeta de datos (X-10, ADR-0017) |
| GET | /api/update | Versión, build y commit instalados, y si la actualización está disponible y por qué (R-10, R-14) |
| POST | /api/update/check | Buscar una versión nueva (R-13) |
| POST | /api/update/apply | Descargar y verificar el build indicado y reiniciar (R-32, R-42, R-43) |
| GET | /api/health | Firma, versión y build de la aplicación |
| GET | /api/events | Canal SSE de presencia |
| POST | /api/presence/bye | Aviso de cierre de ventana |
| POST | /api/shutdown | Apagado ordenado |

El 409 de `PUT /api/notes/{id}` lleva en `details` la nota guardada (ADR-0007). `GET` y `PUT /api/settings` guardan además el estado de interfaz en la tabla `setting` (ADR-0005). `POST /api/sql/execute` guarda los últimos valores de la nota y `POST /api/sql/analyze` con `noteId` los devuelve en `lastValues` (ADR-0014). `PUT /api/notes/{id}` valida la estructura de un workflow (W-81). `POST /api/workflow/execute` comprueba la cadena, la versión, el perfil y la clave antes de responder la primera línea; esos errores siguen A-02 (ADR-0031). El evento de un nodo terminado lleva `raw`, `values` y `missing` (W-78, ADR-0032). `POST /api/update/apply` solo acepta el build de la última búsqueda verificada y responde antes de apagar, cuando la descarga ya está comprobada (ADR-0033).

Petición y respuesta de `POST /api/sql/execute`:

```json
{
  "noteId": "3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90",
  "version": 12,
  "executionId": "c1a2…",
  "values": { "title": "mar", "minYear": "1990", "authorIds": "" },
  "page": 1,
  "pageSize": 20,
  "sort": { "column": 2, "direction": "asc" }
}
```

```json
{
  "kind": "query",
  "columns": [
    { "label": "id", "type": "BIGINT", "numeric": true },
    { "label": "title", "type": "VARCHAR", "numeric": false }
  ],
  "rows": [["1", "El mar"], ["2", null]],
  "truncatedCells": [],
  "hasMore": false,
  "total": 2,
  "capReached": false,
  "serverMillis": 14,
  "finalSql": {
    "withPlaceholders": "SELECT … WHERE b.title LIKE CONCAT('%', ?, '%') AND b.year >= ?",
    "parameters": [
      { "index": 1, "value": "mar", "type": "string" },
      { "index": 2, "value": 1990, "type": "int" }
    ],
    "inlined": "SELECT … WHERE b.title LIKE CONCAT('%', 'mar', '%') AND b.year >= 1990"
  }
}
```

Los valores de `values` viajan siempre como texto; la conversión de tipos ocurre en el servidor. `total` solo aparece cuando se conoce (Q-53). Los errores de ejecución y recuento posteriores a la generación del SQL (`mysql_error`, `timeout`, `cancelled`, `not_connected`, `schema_unavailable`, `not_configured`) llevan en `details.finalSql` el SQL final de esa llamada, con el mismo formato (Q-74).
