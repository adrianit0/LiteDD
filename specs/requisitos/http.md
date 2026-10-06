# Requisitos de las notas HTTP

Tercer tipo de nota: una llamada HTTP al servidor local de pruebas, al estilo de Postman pero limitada a ese servidor y con el login de la aplicación ya resuelto (ADR-0021). Los ejemplos usan direcciones y usuarios inventados (S-30 a S-32).

## Nota HTTP

| ID | Requisito |
|---|---|
| H-01 | Las notas HTTP se crean con «Nueva nota HTTP» del panel o «Nueva nota HTTP hija» del menú contextual. Tienen nombre, descripción, etiquetas y favorita como las demás. |
| H-02 | No tienen modo consulta y edición: el formulario siempre se puede editar y se guarda como el resto (N-40, N-46). Modificarlo o enviar la llamada fija una pestaña provisional (P-14). |
| H-03 | El contenido es un JSON con método, endpoint, valores de las variables de ruta, params, cabeceras, cuerpo y modo de login. Todo se guarda en la nota salvo la contraseña (H-21). |

## Dirección

| ID | Requisito |
|---|---|
| H-10 | La URL base es una sola y se configura en «Ajustes», por ejemplo `http://127.0.0.1:8080/demo/`. La nota guarda solo el endpoint, por ejemplo `/user/{id}/tasks`. |
| H-11 | Al unir base y endpoint queda una sola barra entre ambos: se quita una si las dos la tienen y se añade si no la tiene ninguna. |
| H-12 | Cada `{nombre}` del endpoint es una variable de ruta. Bajo la barra de la llamada hay un campo por variable; su valor se guarda en la nota y se envía codificado como segmento de ruta. Una variable vacía impide enviar. |
| H-13 | Métodos: GET, POST, PUT, PATCH, DELETE, HEAD y OPTIONS. |
| H-14 | Params: filas clave, valor y casilla de activa. Las activas se añaden a la URL codificadas, en su orden. |

## Cabeceras y cuerpo

| ID | Requisito |
|---|---|
| H-15 | Cabeceras generadas, en gris: Accept `application/json`, Content-Type según el cuerpo, User-Agent `LiteDD/versión`, Cache-Control `no-cache` y, con login, X-USERID, X-CSRF-TOKEN y Cookie. Su valor se puede cambiar y se pueden desactivar. «Esconder headers generados» las oculta de la lista. |
| H-16 | Cabeceras propias: filas clave, valor y casilla de activa. Si una tiene el nombre de una generada, manda la propia. Host, Content-Length, Connection, Expect y Upgrade no se pueden escribir. |
| H-17 | Cuerpo: none, form-data (solo campos de texto, filas clave, valor y activa) o raw (JSON, texto o XML). El Content-Type generado es `application/json`, `multipart/form-data`, `text/plain` o `application/xml`. «Formatear JSON» sangra el cuerpo raw y avisa si no es JSON válido. |

## Login

| ID | Requisito |
|---|---|
| H-20 | En «Ajustes» se elige la nota de login, una nota HTTP. Por defecto es `GET /users/{userName}/login`. Al ejecutarla, `{userName}` toma el usuario de la llamada. |
| H-21 | El usuario por defecto y la contraseña se configuran en «Ajustes». La contraseña se guarda solo en http.json con permisos 600: nunca en SQLite, en las copias, en la exportación ni en el registro. La API no la devuelve; solo indica si hay una. |
| H-22 | Cada nota HTTP tiene un campo «Usuario»; vacío, usa el de Ajustes. El login usa Basic Auth: cabecera `Authorization: Basic base64(usuario:contraseña)`, con Accept y Content-Type `application/json`. |
| H-23 | El login es correcto si responde 200 y trae la cabecera `X-USERID` y la cookie `CSRF-TOKEN`. La llamada envía `X-USERID`, `X-CSRF-TOKEN` (el valor de la cookie) y `Cookie` con todas las cookies del login. |
| H-24 | Por defecto se hace login antes de cada llamada. Dos casillas excluyentes cambian eso: «No necesita login» (sin login ni cabeceras de login) y «Reutilizar login» (usa el último login correcto). Cualquiera de las dos desactiva el campo «Usuario». |
| H-25 | «Reutilizar login» sin un login correcto previo desde que arrancó LiteDD no envía nada y lo indica. El login reutilizable vive solo en memoria. |
| H-26 | Si el login falla, la llamada no se hace y se muestra la respuesta o el error del login, indicando que es del login. |
| H-27 | Ejecutar la propia nota de login hace el login con el usuario de esa nota y, si es correcto, lo deja como login reutilizable. |

## Ejecución y respuesta

| ID | Requisito |
|---|---|
| H-30 | «Enviar» o Ctrl+Intro guarda la nota y ejecuta lo guardado (A-04). «Cancelar» o Esc detiene la llamada. Cronómetro en vivo. |
| H-31 | Tiempo máximo por llamada: 30 s, configurable en «Ajustes». |
| H-32 | Con el servidor apagado, el error es `Error: connect ECONNREFUSED 127.0.0.1:8080` con la dirección y el puerto reales. |
| H-33 | La respuesta muestra el estado con su texto, el tiempo, el tamaño y el método con la URL final. Tiene pestañas Cuerpo, Cabeceras y Cookies, cada una con «Copiar». |
| H-34 | Un cuerpo JSON se muestra formateado y resaltado; los demás textos, tal cual. |
| H-35 | Un cuerpo binario se muestra como «Binario, N bytes» con «Descargar». Por encima del tamaño máximo (10 MB por defecto, configurable) el cuerpo se corta y se avisa. |
| H-36 | La respuesta vive solo en la pestaña: no se guarda y se pierde al cerrarla. |

## Seguridad

| ID | Requisito |
|---|---|
| H-40 | Solo se llama a `http` o `https` en 127.0.0.1, localhost o ::1. La URL base y cada URL final se validan en el servidor; el nombre debe resolver a una dirección local. Cualquier otra se rechaza sin conectar. |
| H-41 | No se siguen redirecciones (la respuesta 3xx se muestra tal cual), no se usa proxy y no hay almacén de cookies persistente. |
| H-42 | El registro no contiene cuerpos, valores de cabeceras, cookies, usuarios ni contraseñas. |

## Datos

| ID | Requisito |
|---|---|
| H-50 | Al exportar, una nota HTTP es un fichero `.http.json` con su contenido. La importación la acepta como tipo `http`. |
