# Requisitos de las notas HTTP

Tercer tipo de nota: una llamada HTTP al servidor local de pruebas o, si el usuario lo activa, a sus entornos de preproducción. Funciona al estilo de Postman, pero limitada a esos destinos y con el login de la aplicación ya resuelto (ADR-0021, ADR-0028). Los ejemplos usan direcciones y usuarios inventados (S-30 a S-32).

## Nota HTTP

| ID | Requisito |
|---|---|
| H-01 | Las notas HTTP se crean con «Nuevo → Nota HTTP» del panel o del menú contextual (N-04, N-05). Tienen nombre, descripción, etiquetas y favorita como las demás. |
| H-02 | No tienen modo consulta y edición: el formulario siempre se puede editar y se guarda como el resto (N-40, N-46). Modificarlo o enviar la llamada fija una pestaña provisional (P-14). |
| H-03 | El contenido es un JSON con método, endpoint, valores de las variables, params, cabeceras, cuerpo y modo de login. Todo se guarda en la nota salvo la contraseña (H-21). |

## Dirección

| ID | Requisito |
|---|---|
| H-10 | La URL base es la del perfil activo (H-60) y se configura en «Ajustes → Entornos», por ejemplo `http://127.0.0.1:8080/demo/`. La nota guarda solo el endpoint, por ejemplo `/user/#{id}/tasks`, y vale para cualquier perfil. |
| H-11 | Al unir base y endpoint queda una sola barra entre ambos: se quita una si las dos la tienen y se añade si no la tiene ninguna. |
| H-12 | Variables con la misma sintaxis que en SQL: `#{nombre}`. Pueden ir en el endpoint, en la clave o el valor de params y cabeceras propias, en el valor cambiado de una cabecera generada, en el cuerpo raw y en los campos de form-data. Un formulario «Variables» tiene un campo por nombre; un nombre repetido usa el mismo valor en todos sus sitios. Los valores se guardan en la nota. Cualquier variable vacía impide enviar (ADR-0022). |
| H-18 | Sustitución: en el endpoint el valor se codifica como segmento de ruta; en params se codifica para la URL; en cabeceras, cuerpo raw y form-data se pone tal cual, como Postman (en JSON, las comillas las escribe la nota: `"name": "#{name}"`). La forma antigua `{nombre}` ya no es una variable y el error lo indica. |
| H-13 | Métodos: GET, POST, PUT, PATCH, DELETE, HEAD y OPTIONS. |
| H-14 | Params: filas clave, valor y casilla de activa. Las activas se añaden a la URL codificadas, en su orden. |

## Cabeceras y cuerpo

| ID | Requisito |
|---|---|
| H-15 | Cabeceras generadas, en gris y en este orden: las cabeceras por defecto de «Ajustes → Cabeceras» (H-72), Content-Type según el cuerpo y, con login, X-USERID, X-CSRF-TOKEN y Cookie. En cada nota su valor se puede cambiar y se pueden activar o desactivar; una cabecera por defecto desactivada en «Ajustes» aparece desactivada. «Esconder headers generados» las oculta de la lista. |
| H-16 | Cabeceras propias: filas clave, valor y casilla de activa. Si una tiene el nombre de una generada, manda la propia. Host, Content-Length, Connection, Expect y Upgrade no se pueden escribir. |
| H-17 | Cuerpo: none, form-data (solo campos de texto, filas clave, valor y activa) o raw (JSON, texto o XML), siempre codificado en UTF-8. El Content-Type generado es `application/json` sin cuerpo, `multipart/form-data` con form-data y, con raw, `application/json; charset=UTF-8`, `text/plain; charset=UTF-8` o `application/xml; charset=UTF-8`, para que el servidor no lea el cuerpo con otra codificación (ADR-0038). «Formatear JSON» sangra el cuerpo raw y avisa si no es JSON válido. |
| H-19 | El cuerpo raw mide 220 px de alto por defecto. Su alto cambia al arrastrar el borde inferior o con las flechas arriba y abajo cuando el borde tiene el foco (Mayús da pasos más largos). Mide como mínimo 120 px y no tiene máximo, porque la nota se desplaza. El alto se recuerda como estado de interfaz, es común a todas las notas HTTP y cambiarlo no modifica la nota (ADR-0039). |

## Cabeceras por defecto

| ID | Requisito |
|---|---|
| H-72 | En «Ajustes → Cabeceras» hay una lista de cabeceras por defecto, filas nombre, valor y activa, en su orden. Valen para todas las notas HTTP, para los nodos HTTP de los workflows y para el login. De serie son Accept, User-Agent y Cache-Control; en esas tres, el valor vacío es el de serie (`application/json`, `LiteDD/versión` y `no-cache`). Se pueden cambiar, desactivar y borrar, y se pueden añadir otras, por ejemplo Accept-Language. Los valores de Accept, User-Agent y Cache-Control guardados antes de existir la lista pasan a ella (ADR-0040). |
| H-73 | Content-Type, X-USERID, X-CSRF-TOKEN y Authorization las calcula LiteDD en cada llamada y no se pueden añadir a la lista; tampoco Host, Content-Length, Connection, Expect y Upgrade (H-16). No se admiten nombres repetidos ni no válidos, ni saltos de línea o caracteres de control en los valores. Una fila Cookie activa se añade a las cookies del login, separada por `; `; sin login se envía sola. |
| H-74 | «Restablecer básicas» vuelve a poner Accept, User-Agent y Cache-Control al principio de la lista, activas y con el valor de serie, y conserva las demás filas. Como el resto de «Ajustes», se aplica al pulsar «Guardar ajustes». |

## cURL

Pasar llamadas entre LiteDD, el navegador y la terminal (ADR-0042). Los ejemplos usan direcciones inventadas (S-32).

| ID | Requisito |
|---|---|
| H-75 | «Nuevo → Desde cURL…» abre un diálogo donde se pega un comando cURL, como el de «Copy as cURL (bash)» o «Copy as cURL (cmd)» de Chrome. «Crear» hace una nota HTTP con el método, el endpoint, los params, las cabeceras y el cuerpo, y la abre. El título es el método y el endpoint. Si el texto no es un cURL o no tiene URL, no se crea nada y el diálogo dice por qué. |
| H-76 | Endpoint: si la URL empieza por la URL base de algún perfil (H-61), se quita la más larga que coincida; si no, se queda la ruta y se avisa. La consulta pasa a params, decodificada y en su orden. |
| H-77 | Cabeceras: se descartan las que LiteDD calcula o pone por su cuenta (Cookie, X-CSRF-TOKEN, X-USERID, Authorization y Content-Type), las del cliente HTTP (H-16), Accept-Encoding, las `sec-*` y Priority del navegador y las que ya están en «Ajustes → Cabeceras» (H-72). Las demás pasan a cabeceras propias. `-b`/`--cookie` y `-u`/`--user` se descartan. Un aviso nombra lo descartado. |
| H-78 | Cuerpo: `-d`, `--data-raw`, `--data-binary` y similares dan un cuerpo raw; con `-G`, van a params. JSON y XML según el Content-Type; cualquier otro, texto, y si su Content-Type no es `text/plain` se guarda como valor cambiado de la cabecera generada Content-Type. `-F`, `--form-string` y un cuerpo `multipart/form-data` dan form-data; los ficheros se descartan y se avisa. Sin `-X`, el método es POST con cuerpo y GET sin él. |
| H-79 | «Copiar como cURL» copia la llamada como un comando cURL para bash: URL base del perfil activo, endpoint, params activos, cabeceras generadas y propias activas con los cambios de la nota, y cuerpo, con los valores de las variables puestos. Nunca lleva contraseñas, cookies ni cabeceras del login: ni Authorization, Cookie, X-CSRF-TOKEN ni X-USERID. Sin URL base no se puede copiar; una variable sin valor queda como `#{nombre}` y se avisa. |

## Login

| ID | Requisito |
|---|---|
| H-20 | En «Ajustes → HTTP» se elige la nota de login, una nota HTTP. Por defecto es `GET /users/#{userName}/login`. Al ejecutarla, `#{userName}` toma el usuario de la llamada. |
| H-21 | El usuario por defecto y la contraseña son los del perfil activo y se configuran en «Ajustes → Entornos» (H-61). Las contraseñas, una por perfil, se guardan solo en http.json con permisos 600: nunca en SQLite, en las copias, en la exportación ni en el registro. La API no las devuelve; solo indica si cada perfil tiene una. |
| H-22 | Cada nota HTTP tiene un campo «Usuario»; vacío, usa el de Ajustes. El login usa Basic Auth: cabecera `Authorization: Basic base64(usuario:contraseña)`, con Accept y Content-Type `application/json`. |
| H-23 | El login es correcto si responde 200 y trae la cabecera `X-USERID` y la cookie `CSRF-TOKEN`. La llamada envía `X-USERID`, `X-CSRF-TOKEN` (el valor de la cookie) y `Cookie` con todas las cookies del login. |
| H-24 | Por defecto se hace login antes de cada llamada. Dos casillas excluyentes cambian eso: «No necesita login» (sin login ni cabeceras de login) y «Reutilizar login» (usa el último login correcto). Cualquiera de las dos desactiva el campo «Usuario». |
| H-25 | «Reutilizar login» sin un login correcto previo desde que arrancó LiteDD, o desde el último cambio de perfil (H-63), no envía nada y lo indica. El login reutilizable vive solo en memoria. |
| H-26 | Si el login falla, la llamada no se hace y se muestra la respuesta o el error del login, indicando que es del login. |
| H-27 | Ejecutar la propia nota de login hace el login con el usuario de esa nota y, si es correcto, lo deja como login reutilizable. |

## Ejecución y respuesta

| ID | Requisito |
|---|---|
| H-30 | «Enviar» o Ctrl+Intro guarda la nota y ejecuta lo guardado (A-04). «Cancelar» o Esc detiene la llamada. Cronómetro en vivo. |
| H-31 | Tiempo máximo por llamada: 30 s, configurable en «Ajustes → HTTP». |
| H-32 | Con el servidor apagado, el error es `Error: connect ECONNREFUSED 127.0.0.1:8080` con la dirección y el puerto reales. |
| H-33 | La respuesta muestra el estado con su texto, el tiempo, el tamaño, el método con la URL final y el perfil con el que se hizo (H-63). Tiene pestañas Cuerpo, Cabeceras y Cookies, cada una con «Copiar». |
| H-34 | Un cuerpo JSON se muestra formateado y resaltado; los demás textos, tal cual. |
| H-35 | Un cuerpo binario se muestra como «Binario, N bytes» con «Descargar». Por encima del tamaño máximo (10 MB por defecto, configurable) el cuerpo se corta y se avisa. |
| H-36 | La respuesta vive solo en la pestaña: no se guarda y se pierde al cerrarla. |

## Seguridad

| ID | Requisito |
|---|---|
| H-40 | Con el perfil Local solo se llama a `http` o `https` en 127.0.0.1, localhost o ::1. La URL base y cada URL final se validan en el servidor; el nombre debe resolver a una dirección local. Cualquier otra se rechaza sin conectar. Los perfiles de preproducción siguen H-65 a H-67. |
| H-41 | No se siguen redirecciones (la respuesta 3xx se muestra tal cual), no se usa proxy y no hay almacén de cookies persistente. |
| H-42 | El registro no contiene cuerpos, valores de cabeceras, cookies, usuarios ni contraseñas. |

## Datos

| ID | Requisito |
|---|---|
| H-50 | Al exportar, una nota HTTP es un fichero `.http.json` con su contenido. La importación la acepta como tipo `http`. |

## Entornos

Perfiles de destino de las llamadas (ADR-0028). Los ejemplos usan nombres inventados, como `https://pre1.litedd-demo.test/demo/` (S-32).

| ID | Requisito |
|---|---|
| H-60 | Hay un perfil fijo, «Local», que no se puede borrar, renombrar ni mover: es siempre el primero (H-70). Por defecto es el único y las notas HTTP se comportan como antes de existir los perfiles. |
| H-61 | Cada perfil tiene nombre, URL base, usuario por defecto y contraseña. La nota de login es común a todos (H-20). Los ajustes anteriores a los perfiles pasan a ser los del perfil Local. |
| H-62 | En «Ajustes → Entornos», la casilla «Permitir entornos de preproducción», desmarcada por defecto, permite añadir, renombrar y borrar perfiles de preproducción, sin límite de número. Desmarcarla vuelve al perfil Local y conserva los perfiles y sus contraseñas. Borrar un perfil borra su contraseña. |
| H-63 | El perfil activo es el destino de todas las llamadas. Se elige en la barra superior (U-12), vive solo en memoria y cada arranque empieza en Local. Cambiarlo descarta el login reutilizable (H-25). La petición de ejecución lleva el perfil que muestra la interfaz; si no es el activo, por ejemplo con dos ventanas, responde 409 y no conecta. |
| H-64 | Los perfiles (nombre, URL base, usuario y casillas de clave y de CA), en su orden, se guardan en config.json; las contraseñas y el hash de la clave de confirmación (H-69), en http.json. Ninguno de los dos entra en las copias de seguridad, en SQLite ni en la exportación. |
| H-65 | La URL base de un perfil de preproducción exige `https` y un nombre de host. Se rechazan una dirección IP, un usuario o contraseña en la URL, `?` y `#`. Cada URL final debe tener el mismo host y puerto que la base; si no, se rechaza sin conectar. |
| H-66 | En «Ajustes → Entornos» se importa un fichero PEM con la CA corporativa, que se guarda como http-ca.pem en la carpeta de configuración. Las llamadas a un entorno con «Pedir CA corporativa» marcada (H-71) confían solo en esa CA, no en las públicas ni en las del sistema, y siempre comprueban que el nombre del certificado coincide con el host. «Ajustes» muestra el sujeto y la caducidad de cada certificado importado. |
| H-67 | Sin CA importada, una llamada a un entorno con «Pedir CA corporativa» marcada no se hace. Si el certificado del servidor no es válido para la CA que corresponde (H-71), la llamada no se hace y se muestra el motivo. No existe ninguna opción para aceptar certificados no válidos. |
| H-68 | Las llamadas de preproducción siguen H-41 y H-42: sin redirecciones, sin proxy, sin almacén de cookies persistente y sin datos sensibles en el registro. |
| H-69 | Cada perfil, también Local, tiene la casilla «Pedir clave al enviar». Un perfil de preproducción nuevo nace con ella marcada; Local, con ella desmarcada. La clave de confirmación es una sola, se define en «Ajustes → Entornos» y se guarda solo como hash PBKDF2 con sal. Con la casilla marcada, cada ejecución con ese perfil la pide en un diálogo que nombra el perfil; una entrada cubre el login previo y la llamada. El servidor la comprueba antes de conectar. Si falta o no coincide, no se envía nada y se indica el motivo. La API nunca la devuelve. |
| H-70 | En «Ajustes → Entornos», cada entorno de preproducción se puede subir o bajar. Local es siempre el primero y el perfil con el que arranca LiteDD (H-63). El orden se guarda en config.json y es el del selector de la barra superior (U-12, ADR-0030). |
| H-71 | Cada entorno de preproducción tiene la casilla «Pedir CA corporativa», marcada por defecto, también en los perfiles guardados antes de existir. Marcada, la llamada sigue H-66 y H-67. Desmarcada, no exige la CA importada: valida el certificado contra las CA de confianza de Java (en Ubuntu, las del sistema) y siempre comprueba que su nombre coincide con el host. Local no tiene la casilla (ADR-0030). |
