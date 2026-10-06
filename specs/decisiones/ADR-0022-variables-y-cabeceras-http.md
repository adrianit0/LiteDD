# ADR-0022: Variables #{…} en toda la nota HTTP y cabeceras generadas en Ajustes

- Estado: aceptada (2026-10-07)
- Requisitos: H-03, H-10, H-12, H-15, H-18, H-20, U-10
- Modifica: ADR-0021 (variables de ruta `{nombre}`)

## Contexto

Tras usar las notas HTTP, el usuario pidió dos cosas:

1. Un único formato de variable, el de SQL (`#{nombre}`), utilizable en toda la nota y no solo en el endpoint. Así prepara una llamada una vez y solo cambia los valores.
2. Poder cambiar en «Ajustes» las cabeceras generadas de valor fijo, por ejemplo poner un User-Agent propio en lugar de `LiteDD/0.1.0`.

## Decisión

Respuestas del usuario (2026-10-07):

1. **Notas existentes:** no se convierten solas. `{nombre}` deja de ser variable y el usuario cambia sus notas a mano, también la de login (`/users/#{userName}/login`). Si queda una `{nombre}` en el endpoint, el error lo indica.
2. **Variables vacías:** cualquier variable vacía impide enviar, esté donde esté.
3. **Sustitución en el cuerpo:** tal cual, como Postman. En JSON las comillas las pone la nota, lo que permite también números u objetos (`"edad": #{edad}`).
4. **Cabeceras en Ajustes:** solo las de valor fijo (Accept, User-Agent y Cache-Control), con valor por defecto para todas las notas y también para el login. Content-Type sigue dependiendo del cuerpo.

Detalles:

- **Dónde puede haber variables:** en el endpoint, en las claves y valores de params y cabeceras propias activas, en los valores cambiados de cabeceras generadas activas, en el cuerpo raw si el cuerpo es raw y en los campos activos de form-data si es form-data. Una variable en una fila desactivada o en un cuerpo que no se envía no pide valor.
- **Codificación:**
  - En el endpoint, el valor se codifica como segmento de ruta.
  - En params, se sustituye antes de codificar la URL.
  - En cabeceras, cuerpo y form-data va tal cual, pero un salto de línea en una cabecera se rechaza.
- **Almacenamiento:** los valores siguen guardándose en el campo `pathValues` del JSON de la nota, ahora para todas las variables.
- **Nota de login:** en ella, `#{userName}` siempre toma el usuario de la llamada.
- **Ajustes:** `AppConfig.http` gana `accept`, `userAgent` y `cacheControl`; vacío equivale a nulo, es decir, el valor de serie. Lo que cambie una nota manda sobre Ajustes.
