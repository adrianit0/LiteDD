# ADR-0033: Actualización desde GitHub con un JAR firmado

- Estado: aceptada (2026-10-30)
- Requisitos: R-01 a R-47, S-16, S-34, U-10, API, ciclo de vida, constitución (principio 4)
- Modifica: constitución (principio 4), que pasa de «sin internet» a una lista cerrada de destinos autorizados

## Contexto

Llevar un cambio al equipo con Ubuntu exige compilar en Windows, copiar el JAR e instalarlo (ADR-0018). Es demasiada fricción para los cambios rápidos. Compilar allí no es una opción, porque en ese equipo no se puede usar Maven.

Comprobaciones previas (2026-10-30):

- **Red:** desde el equipo con Ubuntu y la VPN puesta, `github.com` responde a curl y al cliente HTTP de Java con sus CA por defecto, y `release-assets.githubusercontent.com` responde a curl.
- **Descarga:** un fichero de una release pública se obtiene de `github.com` sin pasar por `api.github.com`, cuyo límite de peticiones anónimas se comparte por IP. `github.com` redirige a `release-assets.githubusercontent.com`.
- **Firma:** `java.security.Signature` de la JDK 21 verifica una firma Ed25519 hecha con `openssl` y rechaza un mensaje alterado. El runtime que genera jpackage incluye el módulo `jdk.crypto.ec`, que la implementa.
- **Repositorio:** es público, así que las releases se descargan sin credenciales.

## Decisión

Respuestas del usuario (2026-10-30):

1. **Actualización manual.** Un botón busca y otro actualiza. La aplicación nunca se actualiza sola.
2. **Principio 4.** La prohibición de salir a internet se reduce a una lista cerrada de destinos que el usuario permite. Hoy son GitHub y los entornos de preproducción. Cualquier otro exige su autorización y un ADR.
3. **Cuenta de GitHub con MFA.** Se considera protección suficiente para guardar la clave de firma en un secreto de GitHub Actions, de forma que publicar no exija pasos manuales.
4. **Permiso.** El usuario confirma que tiene permiso de su empresa para hacerlo.
5. **Categoría propia en «Ajustes».** Las actualizaciones tienen su sección, que pide la URL del repositorio. Lo que deba configurarse se pide en la aplicación y nunca va al repositorio, que es público.

Propuestas, aprobadas con el plan del Sprint 12:

- **A. Sin URL no hay conexión.** El campo nace vacío, y escribir la URL es lo que autoriza a contactar con GitHub. Con eso sobra una casilla aparte.
- **B. Ninguna conexión sin pulsar un botón.** Ni al arrancar ni de forma periódica.
- **C. Manifiesto firmado con Ed25519.** La firma cubre el número de build y el hash del JAR. Así no se acepta un JAR alterado ni se puede volver a una versión antigua firmada.
- **D. Sin token de GitHub.** Las releases de un repositorio público se descargan sin credenciales, así que no hay ningún secreto que pedir ni que guardar en el equipo.
- **E. Vuelta atrás automática.** Si la versión nueva no arranca, se restaura la anterior.

Diseño:

- **Publicación:**
  - `.github/workflows/release.yml` se dispara con cada push a `main`, en `ubuntu-22.04`, y ejecuta `./mvnw -Pdist verify`.
  - Si pasa, `scripts/release.sh` genera el manifiesto, lo firma y publica la release `build-N`. N es el número de ejecución del workflow.
  - Se usa `gh`, ya instalado en el runner, en lugar de una acción de terceros para publicar.
  - Las releases anteriores se conservan, para poder volver a una a mano.
- **Manifiesto `latest.json`:**

  ```json
  {
    "build": 42,
    "version": "0.1.0",
    "commit": "0123456789abcdef0123456789abcdef01234567",
    "date": "2026-11-02T10:15:00Z",
    "size": 67825301,
    "sha256": "…",
    "commits": ["Corrige el orden de las pestañas"]
  }
  ```

- **Firma:**
  - `openssl pkeyutl -sign -rawin` firma el manifiesto con la clave privada del secreto `LITEDD_RELEASE_KEY`.
  - La clave pública vive en `src/main/resources/dev/litedd/update/release-key.pub`, en Base64.
  - El usuario genera el par fuera del repositorio. La clave privada nunca pasa por el código ni por el registro.
- **Repositorio:**
  - La URL se guarda en `config.json`, que no entra en el repositorio, ni en las copias ni en la exportación. Así se cumple S-32.
  - Solo admite `https://github.com/<propietario>/<repositorio>`, de modo que no puede sacar la aplicación de la lista de hosts.
  - La clave pública sigue dentro del JAR. Cambiar la URL no cambia en quién se confía: una release de otro repositorio no pasa la firma.
- **Versión:** `version.properties` gana `build` y `commit`. Por defecto valen `0` y vacío, y el workflow los inyecta. La comparación usa solo `build`, así que cualquier versión publicada es más nueva que un JAR compilado a mano. `version` sigue siendo la del `pom.xml`.
- **Cliente:**
  - Un `HttpClient` propio, sin redirecciones automáticas, sin proxy y sin almacén de cookies, igual que las notas HTTP (H-41).
  - Valida contra las CA de confianza de Java, las mismas que usó la comprobación previa.
  - Sigue las redirecciones a mano y comprueba cada una contra la lista de hosts.
  - Las URL salen solo de la URL de «Ajustes» y del número de build. Nunca de una respuesta, salvo la redirección comprobada.
- **Instalación:**
  - Las dos formas de instalar (ADR-0018) tienen un único JAR y `bin/litedd`. La aplicación localiza el JAR con su `CodeSource` y sube por sus carpetas hasta encontrar `bin/litedd`.
  - El JAR nuevo se descarga junto al actual como `litedd.jar.new`, para que mover sea atómico.
  - Un proceso `sh` independiente espera a que termine el proceso actual, guarda `litedd.jar.prev`, coloca el JAR nuevo y arranca `bin/litedd --no-window` con el mismo puerto.
  - Espera hasta 60 s a que aparezca `instance.json`, que el servidor escribe tras arrancar (ADR-0017). Si no aparece, restaura `litedd.jar.prev` y arranca esa versión.
- **Ventana:** recupera el contacto como en U-11. Guarda lo pendiente y, si `/api/health` indica otro build, se recarga para tomar la interfaz nueva. Con el guardado manual y cambios sin guardar en otra ventana, avisa el navegador (N-46).

## Alternativas descartadas

- **`scripts/update.sh` con curl, sin botones.** Dejaba el principio 4 como estaba, pero el usuario pidió botones y Java llega a GitHub. Queda como salida si el cliente de Java dejara de funcionar en esa red.
- **Hash sin firma.** Un SHA-256 publicado junto al JAR detecta una descarga corrupta, pero no a quien pueda cambiar la release.
- **Firmar en el equipo de desarrollo.** Es más seguro, porque una cuenta de GitHub comprometida no podría firmar. Devuelve el paso manual que se quiere quitar.
- **Buscar al arrancar.** Saldría a internet sin un gesto del usuario.
- **`api.github.com`.** Añade un host y un límite de peticiones sin aportar nada a este uso.
- **Token de GitHub en «Ajustes».** Una descarga pública no lo necesita. Dejaría un secreto en disco en un equipo corporativo y obligaría a usar `api.github.com`. Si el repositorio pasara a ser privado, haría falta un ADR nuevo.
- **Repositorio inyectado por el build.** También cumplía S-32, pero un JAR compilado a mano no podría actualizarse y la URL no se vería en «Ajustes».

## Consecuencias

- **La cuenta de GitHub pasa a ser el mayor riesgo.**
  - Quien pueda hacer push a `main` puede publicar una versión firmada, y esa versión se ejecutaría en un equipo con credenciales de MySQL y de preproducción.
  - El MFA protege el inicio de sesión, no los tokens ya emitidos, como un token personal o las credenciales guardadas de git.
  - Lo limitan que nada se instala sin pulsar «Actualizar» y que el diálogo muestra el commit y sus mensajes antes de confirmar. Un cambio que no se reconoce se puede rechazar.
- **La firma no cubre eso.** Protege frente a un JAR alterado después de publicarlo y frente a quien pueda subir ficheros a una release sin poder leer el secreto.
- **Solo se actualiza el JAR.** Los cambios en `install.sh`, en las opciones de Java o en el runtime de la imagen siguen exigiendo reinstalar.
- **Volver atrás tras una migración no es inmediato.** Migrator rechaza una base más reciente que la aplicación. Tras una versión que migró, usar el JAR anterior exige restaurar la copia `-premigracion` (X-09), y se pierde lo escrito desde entonces.
- **Si GitHub cambia el host de descarga,** la actualización falla con un error claro y hace falta instalar a mano una versión con la lista corregida. Es preferible a aceptar cualquier host.
- **Si se pierde la clave privada,** se genera otra y hay que instalar a mano una vez.
- **El workflow no se debe renombrar.** GitHub cuenta las ejecuciones por workflow: con otro nombre, el número de build volvería a empezar y las instalaciones no verían las versiones nuevas (R-31).
- **La primera instalación es manual:** hay que llevar una vez un JAR con esta función, de la primera release o compilado a mano, y ejecutar `scripts/install.sh litedd.jar`.
- **Las pruebas `-Pit` no bloquean la publicación,** porque el runner no tiene MySQL. Una regresión solo visible contra MySQL real se publicaría.
- **`./mvnw verify` se ejecutará en Linux por primera vez.** Pueden aparecer fallos que en Windows no se ven.
- **El JAR se puede descargar públicamente.** No cambia nada: solo contiene lo que ya está en el repositorio (S-30 a S-32).
