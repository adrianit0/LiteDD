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

Pendiente.
