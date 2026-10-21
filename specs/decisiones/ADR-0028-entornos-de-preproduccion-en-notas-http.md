# ADR-0028: Entornos de preproducción en las notas HTTP

- Estado: aceptada (2026-10-21)
- Requisitos: H-10, H-21, H-25, H-33, H-40, H-60 a H-69, S-16, S-20, S-21, U-10, U-12, constitución (principio 4)
- Modifica: ADR-0021 (servidor solo local)

## Contexto

Las notas HTTP solo llaman al propio equipo (ADR-0021). El usuario hace hoy con Postman las llamadas a varios entornos de preproducción de su empresa. Quiere hacerlas desde LiteDD sin rebajar la seguridad.

Esos entornos solo son accesibles por una VPN corporativa. LiteDD se usa en un único equipo corporativo y no se comparte. Sin VPN, el equipo no resuelve DNS.

Análisis previo (2026-10-21):

- **Exposición:** LiteDD no abre ningún puerto fuera del equipo. El servidor escucha solo en 127.0.0.1 (S-10) y Vite, en desarrollo, también. Lo que se plantea es una salida nueva, no una entrada.
- **Hueco del bloqueo por DNS:** sin VPN no se resuelve DNS, pero una URL con una IP privada no necesita DNS. Esa petición iría a la red local del momento, y quien tuviera esa IP recibiría el Basic Auth. Las cachés de DNS (unos 30 s en la JVM) y `/etc/hosts` dejan además un margen tras cortarse la VPN.
- **Medidas que cierran el hueco:**
  - validación TLS estricta contra la CA corporativa, porque un equipo ajeno no tiene un certificado válido para el nombre del entorno;
  - perfiles por nombre de host, nunca por IP;
  - lista cerrada de destinos que la aplicación impone, en lugar de confiar en que no se escriba otra URL.
- **Datos:** las respuestas viven solo en memoria (H-36) y la sesión de pestañas guarda solo desplazamiento, SQL y vista previa. Lo único que queda en disco son las contraseñas de http.json.

## Decisión

Respuestas del usuario (2026-10-21):

1. **Por defecto, solo local.** Mientras no se marque la casilla, LiteDD se comporta como hasta ahora.
2. **Casilla en «Ajustes → HTTP»:** «Permitir entornos de preproducción». Desmarcarla vuelve al perfil Local y deja guardados los perfiles.
3. **Perfiles:**
   - Uno fijo, «Local», que no se puede borrar ni renombrar.
   - Uno por cada entorno de preproducción, en el número que haga falta. Se añaden, renombran y borran en «Ajustes».
4. **Datos de cada perfil:** nombre, URL base, usuario por defecto y contraseña. La nota de login es común a todos.
5. **Selector en la barra superior**, a la izquierda del estado de la conexión MySQL. Es un desplegable con los perfiles. El perfil elegido es el destino de todas las llamadas HTTP.
6. **Al arrancar, siempre «Local».** El perfil activo no se recuerda: se elige a propósito en cada sesión.
7. **HTTPS solo contra la CA corporativa.**
   - Se importa en «Ajustes» un fichero PEM con la CA de la empresa.
   - Los perfiles de preproducción confían solo en ella, no en las CA públicas ni en las del sistema.
   - El nombre del certificado se comprueba siempre.
   - Sin CA importada, no se hace ninguna llamada de preproducción.
8. **Sin IP fijas:** bastan el nombre de host y la validación TLS.
9. **Ninguna clave entra en las copias de seguridad.** Tampoco en SQLite, en la exportación ni en el registro.
10. **Clave de confirmación, opcional:**
    - Cada perfil tiene la casilla «Pedir clave al enviar».
    - Con ella marcada, cada llamada con ese perfil pide antes una clave definida previamente en «Ajustes». Así no se puede enviar a preproducción por error.
    - El usuario la dejará desmarcada en el perfil Local.
11. **Una sola clave de confirmación** para todos los perfiles. Como las contraseñas, no entra en las copias de seguridad.
12. **Propuesta A:** cuando el perfil activo no es Local, el selector usa el color de aviso del tema (U-02). Así siempre se ve que las llamadas van a preproducción.
13. **Propuesta B:** el resultado de una llamada indica el perfil con el que se hizo, junto al método y la URL final (H-33).
14. **Propuesta C:** un perfil de preproducción nuevo nace con «Pedir clave al enviar» marcada; el perfil Local, con ella desmarcada. Quitarla exige un gesto consciente.

Diseño:

- **Dónde se guarda cada cosa:**

  | Dato | Fichero | ¿En copias o exportación? |
  |---|---|---|
  | Casilla y perfiles (nombre, URL base, usuario) | `config.json` | No: las copias son de la base SQLite y la exportación no lleva ajustes (X-04) |
  | Contraseñas, una por perfil | `http.json`, permisos 600 | No |
  | Clave de confirmación, solo su hash | `http.json`, permisos 600 | No |
  | CA corporativa | `http-ca.pem` en la carpeta de configuración | No. Es un certificado público, no un secreto |

- **Clave de confirmación:**
  - No se guarda en claro. Se guarda su hash PBKDF2-HMAC-SHA256 con sal aleatoria, que ya incluye la JDK (sin dependencias nuevas). A diferencia de las contraseñas, LiteDD nunca necesita enviarla a ningún sitio, así que basta con poder comprobarla.
  - La interfaz la pide en un diálogo que nombra el perfil de destino. Escape cancela sin enviar.
  - Viaja en la petición de ejecución y se comprueba en el servidor antes de abrir ninguna conexión. Si no coincide o no hay clave definida, la llamada no se hace y se indica el motivo.
  - Una entrada cubre una ejecución completa: el login previo y la llamada. Ejecutar la propia nota de login también la pide.
  - La interfaz no la recuerda entre llamadas.

- **Validación de las URL de un perfil de preproducción:**
  - Solo `https`.
  - El host es un nombre, no una IP.
  - Sin usuario ni contraseña en la URL, sin `?` ni `#`.
  - Cada URL final debe tener el mismo host y puerto que la base del perfil, como ahora.
- **El perfil Local no cambia:** sigue con H-40 completo, incluida la comprobación de que el nombre resuelve a loopback.
- **Cliente:**
  - Se mantienen la ausencia de proxy y de almacén de cookies y el no seguir redirecciones (H-41). Una redirección es justo lo que llevaría fuera de la lista.
  - Las llamadas de preproducción usan un `SSLContext` propio con un almacén de confianza que solo contiene la CA importada.
  - No hay ninguna opción para aceptar certificados no válidos.
- **Perfil activo:** vive en memoria del servidor. Cambiarlo descarta el login reutilizable (H-25), porque pertenece al entorno anterior.
- **Ajustes heredados:** la URL base, el usuario y la contraseña actuales pasan a ser los del perfil Local, sin intervención del usuario.
- **Constitución, principio 4:** pasa a decir «Los datos no salen de la máquina salvo hacia MySQL y hacia los destinos de las notas HTTP: el propio equipo y, si el usuario lo activa, los entornos de preproducción que configure, solo por HTTPS validado contra su CA (ADR-0028); sin internet, sin telemetría, sin CDN».

## Consecuencias

- LiteDD puede enviar a otra máquina el contenido de una nota y la contraseña de un perfil. Lo limitan la casilla, la lista cerrada de perfiles, el HTTPS obligatorio y la CA corporativa.
- Lo que el usuario copie de una respuesta a una nota sí entra en SQLite, en las copias y en la exportación. Es decisión suya.
- Las contraseñas de los entornos siguen en texto plano en http.json, con permisos 600, igual que la de MySQL. Se confía en la protección de la cuenta y del disco del equipo.
- La clave de confirmación protege contra errores propios, no contra quien ya controla la cuenta del usuario: ese podría editar http.json. Por eso basta un hash local y no hace falta limitar intentos.
- Repositorio público (S-30 a S-32): pruebas y ejemplos usan nombres inventados (`pre1.litedd-demo.test`) y una CA generada en la propia prueba. Ningún nombre, IP, usuario ni certificado real entra en el repositorio.
- El hueco del bloqueo por DNS (IP directas, cachés, `/etc/hosts`) lo neutraliza la validación TLS. Un bloqueo del tráfico IP fuera de la VPN a nivel de sistema protegería además a todas las aplicaciones, pero queda fuera de LiteDD.
- `HttpCaller` necesita dos clientes, uno por defecto y otro con la CA corporativa. Se crea el segundo al importar o cambiar la CA.
