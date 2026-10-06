# Sprint 7: Notas HTTP

## Objetivo

Llamadas HTTP al servidor local de pruebas desde una nota, con el login de la aplicación resuelto y sin poder salir de la máquina.

## Requisitos cubiertos

H-01 a H-50, y los cambios de N-04, N-05, X-03, U-10, S-16, S-20 y S-21

Documentos: [requisitos/http.md](../requisitos/http.md), [decisiones/ADR-0021-notas-http.md](../decisiones/ADR-0021-notas-http.md), [constitucion.md](../constitucion.md).

## Tareas

1. Especificación: requisitos H, cambio del principio 4 de la constitución, ADR-0021 y rutas nuevas de la API.
2. Migración V003: tipo de nota `http`, reconstruyendo la tabla `note` con las claves ajenas desactivadas y comprobadas antes de confirmar.
3. Servidor:
   - Guardián de direcciones locales y composición de la URL.
   - Ejecución con login, tiempo máximo y cancelación.
   - Captura de la respuesta con tope de tamaño.
   - Contraseña en http.json, escrita con `PrivateFile` junto a connection.json e instance.json.
   - Ajustes HTTP y exportación `.http.json`.
4. Interfaz:
   - Nota HTTP: barra de la llamada, login, variables de ruta, Params, Headers con cabeceras generadas y Body.
   - Panel de respuesta.
   - Sección «HTTP» en Ajustes, y «Nueva nota HTTP» en el panel y el menú del árbol.
5. Pruebas con un servidor falso dentro de las propias pruebas, que imita el login: 200, `X-USERID`, `CSRF-TOKEN` y `{"message": "Login success"}`.

## Criterios de aceptación

- Una nota `GET /user/{id}/tasks` con id 5 llama a `<base>/user/5/tasks` tras el login, con X-USERID, X-CSRF-TOKEN y las cookies del login.
- Con el servidor apagado aparece `Error: connect ECONNREFUSED 127.0.0.1:<puerto>`.
- Un login con 401 no hace la llamada y muestra la respuesta del login.
- «Reutilizar login» funciona tras un login correcto y avisa si no lo hay; «No necesita login» no envía cabeceras de login.
- Una URL base o final que no sea local se rechaza sin conectar.
- La contraseña no aparece en SQLite, en la exportación ni en el registro.
- Una base de datos de la versión anterior se migra sin perder notas, etiquetas, historial, adjuntos ni pestañas.

## Resultado

Fecha: 2026-10-06.

### Hecho

- **Especificación:**
  - `requisitos/http.md` con H-01 a H-50.
  - El principio 4 de la constitución admite solo MySQL y la URL base local.
  - ADR-0021.
  - Rutas nuevas en `api.md`.
  - Cambios en N-04, N-05, X-03, U-10, S-16, S-20 y S-21.
- **Migración V003:**
  - Tipo de nota `http`. La tabla `note` se reconstruye conservando `rid`, y por tanto la búsqueda.
  - El migrador desactiva las claves ajenas fuera de la transacción y comprueba `foreign_key_check` antes de confirmar.
  - Como toda migración, va precedida de una copia.
- **Servidor (`dev.litedd.httpnotes`):**
  - **Guardián de direcciones:** solo 127.0.0.1, localhost o ::1, que además deben resolver a una dirección local. Se comprueba en la URL base y en cada URL final, y siempre con el mismo host y puerto.
  - **Composición de la URL:** una sola barra entre base y endpoint, variables de ruta y params codificados.
  - **Cabeceras:** las generadas, con sus cambios y desactivaciones, y las propias. Las que pone el cliente no se pueden escribir.
  - **Cuerpo:** none, form-data de texto y raw.
  - **Login:**
    - Basic Auth como Postman. Exige 200, `X-USERID` y la cookie `CSRF-TOKEN`.
    - La llamada lleva `X-USERID`, `X-CSRF-TOKEN` y todas las cookies del login.
    - Modos «always», «none» y «reuse»; la nota de login, al ejecutarse, deja el login para reutilizar.
  - **Cliente HTTP:**
    - Usa `java.net.http`, sin proxy, sin redirecciones y con HTTP/1.1.
    - Tiempo máximo, tope de tamaño y cancelación.
    - El error del servidor apagado es `Error: connect ECONNREFUSED host:puerto`.
  - **Contraseña:** en http.json con permisos 600, escrita con `PrivateFile`, que ahora comparten connection.json e instance.json.
  - **Exportación:** `.http.json`.
- **Interfaz:**
  - **Crear notas:** «Nueva nota HTTP» en el panel y «Nueva nota HTTP hija» en el menú del árbol.
  - **Nota HTTP sin modos:**
    - Barra con método, URL base en gris y endpoint, «Enviar» (Ctrl+Intro o Intro en el endpoint), «Cancelar» (Esc) y cronómetro.
    - Login con «Usuario» y las dos casillas excluyentes.
    - Variables de ruta.
    - Pestañas Params, Headers (cabeceras generadas en gris, editables, desactivables y ocultables) y Body (con «Formatear JSON»).
  - **Respuesta:** estado, tiempo, tamaño y URL, con pestañas Cuerpo (JSON resaltado), Cabeceras, Cookies y Petición, todas con «Copiar». Lo binario se descarga, y se avisa del corte por tamaño.
  - **Ajustes, sección HTTP:** URL base, nota de login, usuario, contraseña (solo se escribe o se borra), tiempo y tamaño máximos.
- **Copiar al portapapeles:** reunido en `clipboard.ts`, que usan SQL, los bloques de código y HTTP.
- **Pruebas:** 281 de backend (1 omitida en Windows) y 261 de interfaz. Las de servidor usan un servidor HTTP falso dentro de la propia prueba.

### Criterios de aceptación

Recorridos con el JAR de `-Pdist`, datos aislados y un servidor falso en 127.0.0.1:18080 que imita el login con datos inventados.

1. **GET `/user/{id}/tasks` con id 5 tras el login:**
   - Llamó a `http://127.0.0.1:18080/demo/user/5/tasks` con `X-USERID: usr-demo`, `X-CSRF-TOKEN: tok-xyz` y `Cookie: CSRF-TOKEN=tok-xyz; JSESSIONID=ses-1`.
   - El login llevó Accept y Content-Type `application/json`.
   - **Cumplido.**
2. **Servidor apagado:** `Error: connect ECONNREFUSED 127.0.0.1:18080`. Con login delante: «Login: Error: connect ECONNREFUSED…», marcado como error del login. **Cumplido.**
3. **Login con 401:** no se hace la llamada y se muestra «El login respondió 401 Unauthorized» con la respuesta del login. **Cumplido.**
4. **«Reutilizar login» y «No necesita login»:**
   - «Reutilizar» llamó sin repetir el login y, sin login previo, avisa (prueba H-25).
   - «No necesita login» no envió X-USERID ni cookies.
   - **Cumplido.**
5. **Direcciones no locales:**
   - `http://example.org/` como URL base se rechaza.
   - El endpoint `@example.org/x` se queda en `http://127.0.0.1:18080/demo/@example.org/x`.
   - **Cumplido.**
6. **Contraseña:** no aparece en `litedd.db`, en su WAL, en el registro ni en el ZIP exportado; solo en http.json. **Cumplido.**
7. **Migración:** una base de la versión anterior pasó a V003 con su copia `-premigracion`, las 7 notas, la descripción y la búsqueda. La prueba de migración cubre también etiquetas, historial, adjuntos, valores y pestañas. **Cumplido.**

### Pendiente

- Probar en Ubuntu contra el servidor local real: nota de login `GET /users/{userName}/login` y una llamada con login.
- Subir ficheros en form-data, apuntado para más adelante.

### Desviaciones y decisiones

- El paquete del servidor es `dev.litedd.httpnotes` y no `dev.litedd.http`, porque ese nombre ya lo usa el servidor web local.
- La versión del User-Agent que muestra la interfaz se toma de `/api/health`.
- La cabecera Authorization del login se muestra en «Petición» como `Basic ••••••`.

