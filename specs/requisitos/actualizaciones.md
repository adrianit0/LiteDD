# Requisitos de actualización

LiteDD se puede actualizar sin compilar ni copiar el JAR a mano. Cada push a `main` genera en GitHub un JAR firmado, y el usuario decide cuándo buscarlo e instalarlo (ADR-0033). GitHub es un destino autorizado de forma expresa (constitución, principio 4). Los ejemplos usan marcadores: la dirección del repositorio se configura en «Ajustes» y no aparece en el código (S-32).

## Publicación

| ID | Requisito |
|---|---|
| R-01 | Cada push a `main` ejecuta `./mvnw -Pdist verify` en GitHub Actions, en `ubuntu-22.04`. Si falla, no se publica nada. Un push que solo cambia `specs/`, `README.md`, `CLAUDE.md` o `LICENSE` no publica. |
| R-02 | Si pasa, se crea la release `build-N`, con N el número de ejecución del workflow. Contiene `litedd.jar`, `latest.json` y `latest.json.sig`. Las releases anteriores se conservan. |
| R-03 | `latest.json` lleva `build`, `version`, `commit`, `date`, `size`, `sha256` y `commits`: los asuntos de los commits desde la release anterior, hasta 50. |
| R-04 | `latest.json` se firma con Ed25519. La clave privada solo existe en el secreto `LITEDD_RELEASE_KEY` de GitHub Actions y fuera del repositorio. La clave pública va en los recursos del JAR. |
| R-05 | El workflow nunca se dispara con pull requests, solo pide el permiso `contents: write` y fija por hash de commit las acciones de terceros. |
| R-06 | El build del workflow inyecta `build` y `commit` en `version.properties`. Un JAR compilado a mano lleva build 0, así que cualquier versión publicada es más nueva. |

## Activación y búsqueda

| ID | Requisito |
|---|---|
| R-10 | La categoría «Actualizaciones» de «Ajustes» muestra la versión, el build y el commit instalados, el campo «URL del repositorio» y los botones. |
| R-11 | «URL del repositorio» nace vacía y se guarda en `config.json` con «Guardar ajustes» (U-13). Solo admite `https://github.com/<propietario>/<repositorio>`, con `/` o `.git` final opcionales; otra URL impide guardar. Mientras no haya una URL guardada, los botones están desactivados y el servidor rechaza las llamadas sin conectar. |
| R-12 | LiteDD solo contacta con GitHub al pulsar un botón. Nunca al arrancar ni de forma periódica. |
| R-13 | «Buscar actualizaciones» obtiene `latest.json` y su firma y los comprueba (R-30, R-31). Si no hay nada nuevo, dice «Tienes la última versión». Si lo hay, muestra build, fecha, commit y la lista de commits, y activa «Actualizar». Si falla, dice el motivo y la aplicación sigue igual. |
| R-14 | La actualización solo está disponible en Linux, si la aplicación corre desde un JAR, hay un `bin/litedd` en sus carpetas superiores y se puede escribir en la carpeta del JAR. Si no, la categoría indica el motivo y no muestra los botones. |

## Red

| ID | Requisito |
|---|---|
| R-20 | Solo se conecta por HTTPS a `github.com` y `release-assets.githubusercontent.com`, con la cadena y el nombre validados contra las CA de confianza de Java. Cualquier otro destino se rechaza antes de conectar. |
| R-21 | Las redirecciones se siguen a mano, hasta 3, y cada una se comprueba contra R-20. |
| R-22 | Solo se hacen peticiones GET a las rutas públicas del repositorio, con un User-Agent fijo, sin cookies, sin credenciales, sin proxy y sin ningún dato del usuario. La aplicación no pide ni guarda ningún token de GitHub. |
| R-23 | Las URL se forman con la URL de «Ajustes» (R-11) y el número de build. Nunca se toma una URL del manifiesto. |
| R-24 | Límites: 64 KiB para `latest.json`, 1 KiB para la firma y, para el JAR, el `size` del manifiesto, nunca más de 200 MiB. Tiempo máximo: 30 s para el manifiesto y 5 minutos para el JAR. |

## Verificación

| ID | Requisito |
|---|---|
| R-30 | La firma se comprueba con la clave pública del JAR antes de interpretar el manifiesto. Si no es válida, el manifiesto se descarta. La clave no se configura: cambiar la URL del repositorio no cambia en quién se confía. |
| R-31 | Solo se acepta un build mayor que el instalado. Un manifiesto válido con un build igual o menor no ofrece nada. |
| R-32 | El tamaño y el SHA-256 del JAR descargado se comparan con los del manifiesto firmado antes de tocar nada. Si no coinciden, se borra la descarga y la aplicación sigue igual. |
| R-33 | No existe ninguna opción para instalar sin verificar. |

## Instalación

| ID | Requisito |
|---|---|
| R-40 | «Actualizar» pide confirmación en un diálogo con el build, el commit y la lista de commits, y avisa de que la aplicación se reiniciará. |
| R-41 | Antes de confirmar se guardan las pestañas pendientes. Si queda alguna sin guardar o hay una consulta, una llamada HTTP o un workflow en marcha, no se actualiza y se indica el motivo. |
| R-42 | El JAR se descarga en la carpeta del actual como `litedd.jar.new`, con permisos 644. Si queda una descarga anterior, se sustituye. |
| R-43 | Tras verificar, un proceso `sh` independiente espera a que termine LiteDD, que se apaga de forma ordenada. Después guarda el JAR actual como `litedd.jar.prev`, mueve el nuevo a su sitio y ejecuta `bin/litedd --no-window` con el mismo puerto. |
| R-44 | Si a los 60 s no existe `instance.json`, el proceso restaura `litedd.jar.prev` y arranca esa versión. Lo que hace queda en `~/.local/state/litedd/update.log`, que se reescribe en cada actualización. |
| R-45 | La ventana abierta recupera el contacto (U-11) y guarda lo pendiente. Si `/api/health` indica otro build, se recarga. Si indica el mismo, avisa de que no se pudo aplicar y de que sigue la versión anterior. |
| R-46 | Actualizar solo sustituye el JAR. No toca datos, ajustes, contraseñas ni ficheros de `scripts/` o `packaging/`. |
| R-47 | Las migraciones siguen D-02, con su copia previa (X-09). Volver al JAR anterior tras una migración exige restaurar esa copia. |
