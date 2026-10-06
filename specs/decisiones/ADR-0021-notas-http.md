# ADR-0021: Notas HTTP contra el servidor local

- Estado: aceptada (2026-10-06)
- Requisitos: H-01 a H-50, constitución (principio 4), S-16, S-20, N-04, N-05, X-03, U-10

## Contexto

El usuario hace pruebas del servidor de la aplicación local con Postman. Quiere hacerlas desde LiteDD con su flujo ya resuelto: una URL base fija, solo el endpoint en cada nota y el login de la aplicación hecho antes de cada llamada. LiteDD no debe poder llegar a otra máquina: para lo demás sigue estando Postman.

## Decisión

Respuestas del usuario (2026-10-06):

1. **Servidor:** siempre 127.0.0.1 o localhost, por http. Se bloquea cualquier otra salida.
2. **URL base:** una sola, en «Ajustes». Al unirla con el endpoint queda una sola barra.
3. **Variables de ruta:** `{nombre}` se rellena en un formulario, como `#{}` en SQL; los valores se guardan en la nota.
4. **Login:**
   - Una única nota de login, elegida en «Ajustes».
   - Basic Auth igual que Postman: `base64(usuario:contraseña)`, sin MD5.
   - Exige 200, la cabecera `X-USERID` y la cookie `CSRF-TOKEN`; su cuerpo es `{"message": "Login success"}`.
   - Si falla, se devuelve el error del login y no se hace la llamada.
   - Con el servidor apagado, el mensaje es el de Postman: `Error: connect ECONNREFUSED host:puerto`.
5. **Credenciales:**
   - Usuario por defecto y contraseña en «Ajustes»; cada nota puede indicar su usuario.
   - La contraseña se guarda como la de MySQL: en http.json con permisos 600, fuera de SQLite y de la exportación.
6. **Casillas:** «No necesita login» y «Reutilizar login», excluyentes entre sí; cualquiera desactiva el usuario. «Reutilizar» sin login previo da error.
7. **Cookies:** se reenvían en la llamada todas las cookies del login, como hace el almacén de cookies de Postman.
8. **Petición:**
   - Métodos GET, POST, PUT, PATCH, DELETE, HEAD y OPTIONS.
   - Cuerpo none, form-data solo de texto o raw (JSON, texto o XML). Subir ficheros queda para más adelante.
9. **Cabeceras generadas:**
   - En gris, editables y desactivables, con un botón «Esconder headers generados».
   - Son Accept y Content-Type `application/json`, User-Agent, Cache-Control `no-cache`, X-USERID, X-CSRF-TOKEN y Cookie.
10. **Límites:** tiempo máximo de 30 s y respuesta de hasta 10 MB, configurables. Hay botón «Cancelar».
11. **Respuesta:**
    - Estado, tiempo, tamaño, cuerpo, cabeceras y cookies, cada uno con «Copiar».
    - «Usable en otras llamadas» significa copiar y pegar, sin variables entre notas.
    - Vive solo en la pestaña, como los resultados SQL.
12. **Tipo de nota y exportación:** tercer tipo de nota, `http`, que se exporta como `.http.json`. Solo nombre y descripción corta, sin documentación aparte.
13. **Propuesta A:** sin modo consulta y edición: el formulario siempre se puede editar.
14. **Propuesta B:** el cuerpo raw se edita con el editor existente, sin resaltado de JSON y con un botón «Formatear JSON». No se añade `@codemirror/lang-json`.

Diseño:

- **Llamadas desde el servidor Java:** las hace `java.net.http.HttpClient`, no la ventana, que con la CSP solo puede hablar con LiteDD y no ve `Set-Cookie`. No hay dependencias nuevas.
- **Cliente HTTP:**
  - Sin proxy, sin redirecciones y sin almacén de cookies.
  - La dirección se valida dos veces: al guardar la URL base y en cada llamada, con la URL final ya montada.
  - La validación exige `http`/`https`, un nombre que sea 127.0.0.1, localhost o ::1 y que resuelva a una dirección local, y el mismo host y puerto que la base.
- **Ruta de ejecución:** `POST /api/http/execute` recibe `noteId`, `version` y `executionId`. Ejecuta el contenido guardado (A-04) y devuelve el resultado en un 200 aunque la llamada falle, con `error` y `phase` (`login` o `request`). `POST /api/http/cancel` la cancela.
- **Contraseña:** `GET` y `PUT /api/http/credentials` la escriben o dicen si existe. Nunca la leen.
- **Login reutilizable:** en memoria del servidor (usuario, X-USERID, CSRF y cookies); se pierde al apagar.
- **Ficheros privados:** con este, son tres los que se escriben con permisos 600: connection.json, instance.json y http.json. Se reúne esa escritura en `PrivateFile` (principio 7: dos usos o más).
- **Migración V003:** la restricción `CHECK (type IN ('md','sql'))` no se puede cambiar en SQLite. La tabla `note` se reconstruye con el procedimiento oficial:
  - El migrador desactiva las claves ajenas fuera de la transacción.
  - Crea la tabla nueva y copia las filas conservando `rid`, que usa FTS.
  - Borra la vieja, renombra la nueva y rehace índices y disparadores.
  - Comprueba `foreign_key_check` antes de confirmar.
  - Como toda migración, va precedida de una copia (D-02).
- **Constitución, principio 4:** pasa a ser «Los datos no salen de la máquina: solo se conecta a MySQL y a la URL base local de las notas HTTP; sin internet, sin telemetría, sin CDN».

## Consecuencias

- LiteDD hace peticiones que modifican datos en el servidor local, que es lo que se pide. La regla de solo lectura (principio 3) sigue aplicándose solo a MySQL.
- Si el servidor escucha solo en IPv4 y la URL usa `localhost` resuelto a ::1, la conexión se rechaza. Se recomienda `127.0.0.1` en la URL base.
- Subir ficheros en form-data queda fuera; se añadirá cuando haga falta.
