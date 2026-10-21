# Sprint 9: Entornos de preproducción en las notas HTTP

## Objetivo

Llamar desde las notas HTTP a los entornos de preproducción sin rebajar la seguridad: perfiles elegidos en la barra superior, HTTPS validado solo contra la CA corporativa y una clave de confirmación opcional antes de enviar.

## Requisitos cubiertos

H-60 a H-69, y los cambios de H-10, H-21, H-25, H-33, H-40, S-16, S-20, S-21, U-10 y U-12

Documentos: [requisitos/http.md](../requisitos/http.md), [decisiones/ADR-0028-entornos-de-preproduccion-en-notas-http.md](../decisiones/ADR-0028-entornos-de-preproduccion-en-notas-http.md), [constitucion.md](../constitucion.md).

## Tareas

1. Especificación: este sprint, la comprobación de coherencia del perfil (H-63), los datos de la CA en «Ajustes» (H-66) y las rutas nuevas de la API.
2. Ajustes:
   - Casilla y perfiles en config.json, con el perfil Local fijo.
   - Un config.json anterior pasa su URL base y su usuario al perfil Local.
   - Al borrar un perfil se borra su contraseña.
3. Credenciales: http.json con una contraseña por perfil y el hash PBKDF2 de la clave de confirmación. La contraseña anterior pasa al perfil Local.
4. Direcciones y TLS:
   - Validación de las URL de preproducción (H-65).
   - Importación de la CA y cliente HTTPS que solo confía en ella, sin proxy ni redirecciones.
   - Pruebas con certificados generados con `keytool` durante la propia prueba: ninguna clave en el repositorio.
5. Servidor:
   - Perfil activo en memoria, que empieza en Local.
   - Comprobaciones de coherencia y de la clave antes de abrir ninguna conexión.
   - Perfil en el resultado y rutas nuevas.
6. Interfaz:
   - Selector de perfil en la barra superior.
   - Sección «HTTP» de «Ajustes» con perfiles, clave y CA.
   - Diálogo de la clave al enviar y perfil en la respuesta.
7. Datos: prueba de que nada de esto entra en la base, en las copias, en la exportación ni en el registro. README.

## Criterios de aceptación

- Sin la casilla no hay selector, todo funciona como antes y los ajustes anteriores aparecen en el perfil Local.
- Con un perfil de preproducción elegido, el selector usa el color de aviso, la llamada va a su URL con su usuario y su contraseña, y la respuesta indica el perfil.
- Una URL base con `http`, con una IP o con usuario se rechaza al guardar. Un endpoint que intente salir del host se rechaza sin conectar.
- Sin CA, con un certificado de otra CA o con uno de otro nombre, no se envía nada y se explica el motivo.
- Con «Pedir clave al enviar», cada envío pide la clave. Escape y una clave incorrecta no envían nada; la correcta envía el login y la llamada.
- Cambiar de perfil descarta el login reutilizable, y reiniciar LiteDD vuelve a Local.
- Desmarcar la casilla vuelve a Local y conserva los perfiles. Borrar un perfil borra su contraseña.
- Ni las contraseñas, ni la clave, ni los perfiles aparecen en la base, en las copias, en la exportación ni en el registro.

## Resultado

Fecha: 2026-10-21.

### Hecho

- **Especificación:**
  - ADR-0028 aceptado, con las propuestas A, B y C.
  - Principio 4 de la constitución, H-60 a H-69 y cambios en H-10, H-21, H-25, H-33, H-40, S-16, S-20, S-21, U-10, U-12, la API y la arquitectura.
  - Aprobados con el plan: la comprobación de coherencia del perfil (H-63), el sujeto y la caducidad de la CA en «Ajustes» (H-66) y unas 210 000 iteraciones de PBKDF2.
- **Ajustes (`AppConfig`):**
  - `http.preproduction` y `http.profiles`, con Local siempre el primero y llamado «Local».
  - Un config.json anterior pasa `baseUrl` y `user` al perfil Local; al guardar se escribe ya con perfiles.
  - Validación: identificadores, nombres únicos de hasta 60 caracteres y sin caracteres de control, y la URL de cada perfil.
  - Sin el campo, `requireKey` es falso para Local y verdadero para un entorno de preproducción (propuesta C).
- **Credenciales (`HttpCredentials`):**
  - http.json con una contraseña por perfil y la clave como hash PBKDF2-HMAC-SHA256, con sal de 16 bytes y las 210 000 iteraciones guardadas junto al hash.
  - La contraseña del formato anterior pasa al perfil Local.
  - Al guardar los ajustes se borran las contraseñas de los perfiles quitados, con un gancho de `SettingsApi`.
- **Direcciones y TLS:**
  - `LocalUrls` pasa a `HttpUrls` y valida según el perfil: Local sin cambios (H-40); preproducción con https, un nombre de host (la última etiqueta empieza por letra) y sin usuario, `?` ni `#`.
  - `CorporateCa` importa los certificados de un PEM, los guarda sin el texto que los rodea en http-ca.pem y prepara un `SSLContext` que solo confía en ellos.
  - `HttpCaller` usa dos clientes: el de siempre para Local y otro con la CA para preproducción, también sin proxy ni redirecciones. Los fallos de TLS se explican: certificado de otra CA, de otro nombre o caducado.
- **Servidor:**
  - Perfil activo en memoria de `HttpRunner`. Empieza en Local y vuelve a él si el perfil desaparece o se desmarca la casilla.
  - `execute` exige el perfil que muestra la interfaz (409 `profile_changed`) y, si el perfil la pide, la clave (`confirm_key_missing`, `confirm_key_required`, `confirm_key_wrong`), antes de conectar.
  - El login reutilizable se guarda con su perfil y se descarta al cambiar de perfil.
  - El resultado lleva el perfil (propuesta B).
  - Rutas `GET` y `PUT /api/http/profile`, `/api/http/credentials` por perfil, `PUT /api/http/confirm-key` y `GET` y `PUT /api/http/ca`.
- **Interfaz:**
  - Selector «Destino de las notas HTTP» a la izquierda de la conexión, solo con la casilla, en color de aviso fuera de Local (propuesta A).
  - «Ajustes → HTTP»: casilla; Local y los entornos con nombre, URL base, usuario, contraseña y «Pedir clave al enviar»; «Añadir entorno» y «Eliminar entorno»; clave de confirmación; CA corporativa con su sujeto y su caducidad.
  - Diálogo de la clave en cada envío a un perfil que la pide: nombra el perfil, Escape cancela y una clave incorrecta se vuelve a pedir con el motivo.
  - La nota usa la URL base y el usuario del perfil activo, y la respuesta muestra el perfil.
- **Pruebas:** 351 de backend (1 omitida en Windows) y 311 de interfaz. Los certificados de las pruebas de TLS se generan con keytool durante la prueba (`TestCertificates`).

### Criterios de aceptación

Recorridos con la aplicación arrancada (`exec:java`, puerto 47650) y datos aislados, partiendo de un config.json y un http.json del formato anterior. Servidores falsos fuera del repositorio: http en 18080 para Local, y https en 18443 (certificado válido para localhost), 18444 (para otro nombre) y 18445 (autofirmado), con una CA de prueba generada con keytool.

1. **Sin la casilla:** no hay selector. El perfil Local muestra la URL base, el usuario y la contraseña «Guardada» del formato anterior, y una llamada con login funciona. **Cumplido.**
2. **PRE1 elegido:** el selector se ve en color de aviso. La llamada va a `https://localhost:18443/demo/…` con el login de `pre-ana` y su contraseña, y la respuesta lleva la etiqueta PRE1. **Cumplido.**
3. **URL no válidas:** `http://…`, `https://127.0.0.1:…` y `https://usuario@…` se rechazan al guardar, cada una con su motivo. Que un endpoint no cambia de host lo cubre la prueba H-65. **Cumplido.**
4. **TLS:**
   - Sin CA: «Importa la CA corporativa en «Ajustes» antes de llamar a un entorno de preproducción».
   - Certificado de otro nombre: «el certificado del servidor no es para localhost».
   - Certificado autofirmado: «el certificado de localhost no está firmado por la CA importada».
   - Los servidores de 18444 y 18445 no recibieron ninguna petición. **Cumplido.**
5. **Clave:** cada envío la pide. Escape y una clave incorrecta no envían nada, y la incorrecta se vuelve a pedir con el motivo. La correcta envía el login y la llamada. **Cumplido.**
6. **Perfil activo:** «Reutilizar login» funciona en PRE1 tras su login y, al cambiar a Local, avisa de que no hay login anterior. Tras reiniciar LiteDD con PRE1 elegido, vuelve a Local. **Cumplido.**
7. **Casilla y borrado:** desmarcarla vuelve a Local y conserva PRE1 y su contraseña; al marcarla de nuevo, PRE1 reaparece. «Eliminar entorno» y guardar borra su contraseña de http.json. **Cumplido.**
8. **Datos:** tras crear una copia y exportar, ni las contraseñas, ni la clave (tampoco la incorrecta), ni el nombre, el usuario o la URL de PRE1 aparecen en litedd.db, su WAL, la copia, la exportación ni el registro. También lo comprueba la prueba H-64. **Cumplido.**

### Pendiente

- `./mvnw verify` en Ubuntu (ADR-0004).
- Probar contra los entornos de preproducción reales, con la CA corporativa, en el equipo corporativo. Sus nombres, IP y certificados no entran en el repositorio.

### Desviaciones y decisiones

- **CA en la prueba manual:** el selector de ficheros del navegador integrado no se puede manejar, así que la CA se importó con `PUT /api/http/ca`. «Ajustes» mostró después su sujeto y su caducidad. La importación desde «Ajustes» la cubre la prueba H-66 de interfaz.
- **`LocalUrls` pasa a `HttpUrls`:** ya no valida solo direcciones locales.
- **Caducidad de la CA:** la API la devuelve en ISO-8601, como las demás fechas, porque el mapeador JSON de Javalin no serializa `Instant`.
- **Pruebas de TLS con localhost:** el entorno de preproducción de las pruebas es `https://localhost:…` con un certificado para localhost, porque un nombre inventado no resuelve. `pre1.litedd-demo.test` se usa en las pruebas de validación y en el certificado de otro nombre.
- **Observación anterior al sprint:** un error del login se muestra como «Error en el login: Login: Error: …», con el prefijo repetido. Viene del Sprint 7 y no se ha cambiado.
