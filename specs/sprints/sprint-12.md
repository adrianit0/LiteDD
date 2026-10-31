# Sprint 12: Actualización desde GitHub

## Objetivo

Que un push a `main` deje disponible una versión nueva, y que la aplicación la busque e instale con dos botones, sin compilar ni copiar el JAR a mano.

## Requisitos cubiertos

R-01 a R-47, y los cambios de S-16, S-34, U-10, la API, la arquitectura y la constitución (principio 4)

Documentos: [requisitos/actualizaciones.md](../requisitos/actualizaciones.md), [decisiones/ADR-0033-actualizacion-desde-github.md](../decisiones/ADR-0033-actualizacion-desde-github.md), [constitucion.md](../constitucion.md).

## Tareas

1. Especificación: requisitos R, ADR-0033, principio 4 de la constitución y cambios en seguridad, interfaz, API y arquitectura.
2. Paso del usuario: generar el par de claves fuera del repositorio, guardar la privada en el secreto `LITEDD_RELEASE_KEY` y pasar la pública, que va a `release-key.pub`.
3. Integración continua sin publicar: workflow que ejecuta `./mvnw -Pdist verify` en `ubuntu-22.04`, con las acciones fijadas por hash (R-01, R-05). Corregir lo que falle en Linux, donde estas pruebas se ejecutan por primera vez.
4. Versión: `build` y `commit` en `version.properties` y `AppInfo`; `build` en `/api/health` (R-06).
5. Publicación: `scripts/release.sh` con el manifiesto, la firma y la release (R-02 a R-04), y `*.pem` en `.gitignore` (S-34).
6. Servidor, piezas puras con pruebas (paquete `dev.litedd.update`):
   - `UpdateManifest`: lectura, firma y comparación de build (R-03, R-30, R-31).
   - `UpdateClient`: lista de hosts, redirecciones a mano, formación de URL y límites (R-20 a R-24).
   - `JarDownload`: descarga, tamaño y SHA-256 (R-32, R-42).
   - `Installation`: localizar el JAR y `bin/litedd`, y disponibilidad (R-14).
7. Servidor, instalación:
   - `UpdateHelper`: proceso `sh`, sustitución, arranque y vuelta atrás (R-43, R-44), con una prueba solo en Linux.
   - `UpdateApi`: `GET /api/update`, `check` y `apply` (R-11, R-13).
   - Ajuste `updateRepository` en `config.json`, con la validación de la URL (R-11).
8. Interfaz:
   - Categoría «Actualizaciones» con el campo de la URL (R-10 a R-14).
   - Diálogo de confirmación con la lista de commits (R-40).
   - Comprobación de pestañas sin guardar y ejecuciones en marcha (R-41).
   - Recarga al recuperar el contacto con otro build (R-45).
9. Documentación: `README.md` (qué se conecta y cómo actualizar) y `CLAUDE.md`.
10. Verificación: `./mvnw verify` en verde, criterios de aceptación con la aplicación arrancada y, en Ubuntu, una actualización real.

## Criterios de aceptación

- Un push con una prueba rota no publica nada.
- Un push correcto publica `build-N` con `litedd.jar`, `latest.json` y `latest.json.sig`. Un push que solo cambia `specs/` no publica.
- Sin una URL guardada no hay ninguna conexión a GitHub, ni al arrancar ni al abrir «Ajustes».
- «Guardar ajustes» rechaza una URL que no sea de un repositorio de `github.com`.
- «Buscar actualizaciones» dice «Tienes la última versión» o muestra build, fecha, commit y commits.
- Se rechazan, y la aplicación sigue igual: una firma ajena, también la de una release de otro repositorio, un manifiesto alterado, un build anterior, un JAR con otro hash y una redirección a otro host.
- Con cambios sin guardar o un workflow en marcha, «Actualizar» no continúa y dice por qué.
- En Ubuntu, «Actualizar» reinicia la aplicación, la ventana se recarga sola, se ve el build nuevo y las notas siguen intactas.
- Un JAR que no arranca devuelve la aplicación a la versión anterior y queda explicado en `update.log`.
- Una actualización con migración deja su copia `-premigracion`.
- En desarrollo y en Windows, la categoría indica el motivo y no ofrece los botones.

## Resultado

Fecha: 2026-10-31. `build-1` publicado; falta la prueba real en Ubuntu.

### Hecho

- **Especificación:** ADR-0033 aceptado, requisitos R-01 a R-47, principio 4 de la constitución como lista cerrada de destinos autorizados, y cambios en seguridad, interfaz, API y arquitectura. El usuario confirmó que tiene permiso de su empresa.
- **Publicación:**
  - `.github/workflows/release.yml` con las acciones fijadas por hash, sin credenciales persistidas y con `contents: write` como único permiso.
  - `scripts/release.sh` genera el manifiesto, lo firma y publica. No publica nada sin secreto ni con una clave que no corresponda a `release-key.pub`.
  - `build` y `commit` en `version.properties`, `AppInfo` y `/api/health`.
- **Servidor (`dev.litedd.update`):**
  - `UpdateUrls`: validación de la URL y rutas de las releases.
  - `UpdateManifest`: firma Ed25519 antes de interpretar el contenido.
  - `UpdateClient`: lista de hosts, redirecciones a mano, límites de tamaño y tiempo, y descarga con tamaño y SHA-256.
  - `Installation`, `UpdateHelper`, `Updater` y `UpdateApi`.
  - Ajuste `updateRepository` en `config.json`.
- **Interfaz:**
  - Categoría «Actualizaciones» con versión, URL, botones y lista de commits.
  - Confirmación con el build y los commits.
  - Bloqueo con pestañas sin guardar o ejecuciones en marcha.
  - Recarga de la ventana al volver con otro build.
- **Pruebas:** 464 de backend (5 omitidas en Windows, 4 de ellas las de `UpdateHelper`) y 415 de interfaz. `./mvnw -Pdist verify` en verde en Windows y, por primera vez, en Linux con el CI.

### Criterios de aceptación

1. **Un push con una prueba rota no publica:** **no ha ocurrido todavía.** El workflow ejecuta `verify` antes de publicar.
2. **Un push correcto publica los tres ficheros:** el primer push publicó `build-1` con `litedd.jar`, `latest.json` y `latest.json.sig`. **Cumplido**, salvo comprobar que un push solo de `specs/` no publica.
3. **Sin URL no hay conexión:** pruebas R-11 y R-12. **Cumplido en pruebas.**
4. **«Guardar ajustes» rechaza otra URL:** con la aplicación arrancada, `https://evil.example/demo/app` deja la ventana abierta con el motivo, y una URL de `github.com` se guarda. **Cumplido.**
5. **Búsqueda:** pruebas R-13. Con las clases del propio JAR publicado, `UpdateClient` leyó `latest.json`, validó la firma con la clave incluida, descargó `build-1` comprobando tamaño y hash, y rechazó el manifiesto alterado. **Cumplido.**
6. **Rechazos:** pruebas R-20, R-21, R-30 a R-32. `UpdateClient` real también rechazó un host fuera de la lista. **Cumplido en pruebas.**
7. **Cambios sin guardar o ejecuciones en marcha:** pruebas R-41. **Cumplido en pruebas.**
8. **Actualización real en Ubuntu:** **pendiente.** Exige instalar `build-1` y publicar un segundo build.
9. **Vuelta atrás:** `UpdateHelperTest` solo corre en Linux y forma parte del paso de pruebas que pasó en el CI. **Cumplido en pruebas.**
10. **Copia antes de migrar:** no cambia; la cubren las pruebas de `Migrator`. **Cumplido en pruebas.**
11. **Desarrollo y Windows:** con el JAR en Windows, la categoría da el motivo, no muestra los botones y `POST /api/update/check` responde 409 sin conectar. **Cumplido.**

### Pendiente

- Instalar a mano una vez el JAR de `build-1`, guardar la URL en «Ajustes → Actualizaciones» y actualizar con un segundo build.
- `-Pit` en Ubuntu (ADR-0013): el CI no lo ejecuta.

### Desviaciones y decisiones

- **`JarDownload` no existe:** la descarga comparte el bucle de lectura y sus límites con el manifiesto, así que es un método de `UpdateClient`.
- **`Updater` es una pieza más que el plan:** reúne búsqueda e instalación, y `UpdateApi` solo expone las rutas.
- **R-14 añade la clave pública:** un JAR sin ella no puede verificar nada (R-33), así que no ofrece actualizar.
- **`scripts/release.sh` comprueba la clave contra `release-key.pub`:** una release firmada con otra clave la rechazaría toda instalación.
- **El tiempo máximo de la petición no cubre el cuerpo:** al vencer se cierra el flujo, lo que corta una descarga parada.
- **Tamaño del JAR:** el de `build-1` pesa 31 MB. Uno compilado en un equipo de desarrollo puede pesar el doble, porque `web/assets` acumula interfaces de builds anteriores si no se limpia `target/`.
