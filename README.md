# LiteDD

LiteDD es un gestor local de notas para un único usuario. Admite dos tipos de nota:

- **Markdown**, con vista renderizada, tablas, listas de tareas, código resaltado y diagramas Mermaid.
- **SQL**, escritas con la sintaxis dinámica de MyBatis (`#{...}`, `<if>`, `<where>`, `<foreach>`…). Se ejecutan en modo de solo lectura contra una base de datos MySQL, con un formulario de variables, paginación, ordenación y cronómetro.

Las notas se organizan en un árbol jerárquico y se abren en pestañas. Todo se guarda en un único fichero SQLite en la máquina local. La aplicación no hace llamadas a internet.

## Requisitos

- JDK 21 (`sudo apt install openjdk-21-jdk`)
- Node.js 24 o superior (solo para compilar)
- Para las notas SQL: un servidor MySQL 8.4 accesible en local
- Para la ventana de aplicación: Google Chrome (si no está, se usa el navegador por defecto)

## Instalar en Ubuntu

```bash
./mvnw -Pdist package
scripts/install.sh
```

`-Pdist` genera un JAR único y una imagen de aplicación con su propio runtime de Java en `target/dist/litedd`. `install.sh` la copia a `~/.local/opt/litedd/` y crea el comando `~/.local/bin/litedd` y el lanzador `~/.local/share/applications/litedd.desktop` con icono. No necesita `sudo`.

Para desinstalar: `scripts/uninstall.sh`. Las notas y los ajustes se conservan.

## Uso

```text
litedd                 arranca LiteDD y abre la ventana; si ya está en marcha, solo abre la ventana
litedd --no-window     arranca sin abrir ventana
litedd --port 47700    usa otro puerto (por defecto, el de «Ajustes», 47600)
litedd --stop          apaga la instancia en marcha
```

LiteDD se apaga solo unos 15 segundos después de cerrar la última ventana. Los ajustes (⚙ en la barra superior) permiten además un apagado automático tras unos minutos sin ventanas.

## Dónde están los datos

| Qué | Dónde |
|---|---|
| Notas (SQLite) | `~/.local/share/litedd/litedd.db` |
| Copias de seguridad | `~/.local/share/litedd/backups/` |
| Ajustes y conexión | `~/.config/litedd/config.json` y `connection.json` |
| Registro | `~/.local/state/litedd/litedd.log` (rota a 5 MB, 3 ficheros) |

Cada día, al arrancar, se hace una copia `litedd-AAAAMMDD.db` y se conservan las 3 últimas. Antes de «Reemplazar todo» y antes de una migración se hace una copia adicional con sufijo propio, y se conservan las 2 últimas. Desde «Ajustes → Datos» se puede exportar a ZIP, importar, crear una copia al momento y abrir la carpeta de datos.

## Restaurar una copia

La restauración es manual:

1. Cierra LiteDD: cierra sus ventanas o ejecuta `litedd --stop`.
2. Guarda aparte el fichero actual, por si acaso: `mv ~/.local/share/litedd/litedd.db ~/litedd-actual.db`.
3. Borra los ficheros auxiliares, si existen: `rm -f ~/.local/share/litedd/litedd.db-wal ~/.local/share/litedd/litedd.db-shm`.
4. Copia la copia elegida en su lugar: `cp ~/.local/share/litedd/backups/litedd-AAAAMMDD.db ~/.local/share/litedd/litedd.db`.
5. Arranca LiteDD.

## Compilar y probar

```bash
./mvnw verify
```

Compila el backend y la interfaz y ejecuta todas las pruebas. Con `-Dskip.frontend` se omite la interfaz. Las pruebas contra un MySQL real se lanzan con `./mvnw -Pit verify` (ver `CLAUDE.md`).

## Desarrollo

```bash
scripts/dev.sh
```

Arranca el servidor en `http://127.0.0.1:47600/` y la interfaz con recarga en caliente en `http://127.0.0.1:5173/`.

## Especificación

La especificación completa está en [`specs/`](specs/). El desarrollo sigue un método guiado por especificación: cada funcionalidad tiene un requisito con identificador y al menos una prueba que lo cita.

## Licencia

[MIT](LICENSE)
