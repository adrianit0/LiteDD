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
