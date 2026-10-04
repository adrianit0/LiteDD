# LiteDD — Especificación y prompt maestro

4 oct 2026

## Cómo usar este documento

Este documento es la fuente única de verdad de LiteDD: se copia al repositorio y Claude Code construye la aplicación a partir de él, sprint a sprint.

1. Instala el JDK 21: `sudo apt install openjdk-21-jdk`. Hace falta esa versión: Javalin 7 exige Java 17 y jpackage no existe en Java 11. No hace falta cambiar el Java por defecto del sistema.
2. En la terminal donde lances Claude Code, exporta `JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64`.
3. Crea un repositorio vacío llamado litedd.
4. Exporta este documento a Markdown y guárdalo como `specs/ESPECIFICACION.md`.
5. Abre Claude Code en el repositorio y pega el prompt de arranque de la sección «Prompts para Claude Code».
6. Revisa lo generado y lanza el prompt de sprint una vez por sprint, del 1 al 6.

El texto está redactado para un repositorio público: no menciona máquinas, credenciales ni otros proyectos.

## Producto y alcance

LiteDD es un gestor local de notas con dos tipos de nota: Markdown y SQL. Las notas SQL se escriben con la sintaxis dinámica de MyBatis y se ejecutan en modo de solo lectura contra una base de datos MySQL local.

Contexto de uso: un único usuario, una única máquina con Ubuntu 22.04 y sesiones de varias horas sin cerrar la aplicación.

### Incluido en la versión 1

- Notas Markdown y SQL en un árbol jerárquico sin límite de profundidad.
- Modo edición (texto plano) y modo consulta (Markdown renderizado o consulta ejecutable).
- Barra de formato en el editor.
- Mover notas con sus hijas; eliminar con papelera.
- Buscador de texto completo, filtros, etiquetas y favoritas.
- Pestañas, con restauración al reabrir.
- Notas SQL con variables `#{...}`, etiquetas dinámicas de MyBatis, paginación, ordenación y cronómetro.
- Enlaces entre notas, imágenes pegadas, diagramas Mermaid e historial de versiones.
- Exportación e importación en un único ZIP; copias automáticas.
- Interfaz en español con tema oscuro.

### Fuera de la versión 1

- Ejecutar sentencias que modifiquen datos o estructura.
- Varias conexiones o motores distintos de MySQL.
- Eliminado en cascada.
- Bloques SQL ejecutables dentro de notas Markdown.
- Guardar o exportar resultados; solo se copia la tabla como Markdown.
- Sincronización entre máquinas.
- `<include>` y fragmentos `<sql>` reutilizables.
- Tema claro y otros idiomas.

## Decisiones cerradas

Estas decisiones no se reabren durante el desarrollo; cambiarlas exige modificar antes la especificación.

| Tema | Decisión |
|---|---|
| Motor de plantillas SQL | MyBatis 3.5.14 real, solo para generar el SQL; la ejecución es JDBC directo |
| Base de datos consultada | MySQL 8.4, una sola conexión, en localhost |
| Esquema por defecto | Se elige de la lista de esquemas; automático si solo hay uno |
| Permisos | Solo lectura garantizada por la aplicación, sea cual sea el usuario |
| Sentencias que no son consulta | No se ejecutan; se muestra el SQL final para copiarlo |
| Una nota, una consulta | Más de una sentencia es un error |
| Tipos de variable | En el propio SQL: `#{nombre,tipo}`; por defecto string |
| Entrada vacía | Siempre null |
| Paginación | 20 filas por defecto; opción «Sin límite» con tope de 10.000 |
| Total de filas | Bajo demanda; automático cuando la página no se llena |
| Ordenación | Sobre toda la consulta, en el servidor |
| Ejecución | Siempre manual, con cronómetro y cancelación |
| Resultados | En pantalla, sin guardarse; copiables como tabla Markdown |
| Guardado | Automático, con historial de 20 versiones |
| Pestañas | Sin sincronización en vivo; botón «Actualizar» y aviso de conflicto al guardar |
| Almacenamiento propio | Un fichero SQLite, distinto de la base consultada |
| Exportación | Un ZIP con las notas en .md y .sql |
| Copias | Una diaria; se conservan 3 |
| Ventana | Chrome en modo aplicación |
| Idioma y tema | Español, tema oscuro |
| Método | SDD con especificaciones en specs/ y 6 sprints |
| Licencia | MIT |

## Arquitectura y stack

LiteDD es un único proceso Java que sirve una interfaz web en 127.0.0.1 y guarda sus datos en un fichero SQLite. No usa Spring: arranca en uno o dos segundos y consume poca memoria durante horas.

La interfaz solo habla con el servidor HTTP. El módulo sqlengine genera el SQL y mysql lo ejecuta en solo lectura; transfer y session usan store igual que notes.

### Componentes

| Componente | Responsabilidad |
|---|---|
| Lanzador | Icono de escritorio y comando litedd; arranca el proceso o reutiliza el que ya exista |
| Servidor HTTP | API JSON, ficheros estáticos de la interfaz y canal de presencia |
| notes | Notas, árbol, papelera, historial, etiquetas, búsqueda |
| sqlengine | Análisis de variables, renderizado con MyBatis, clasificación y paginación |
| mysql | Pool de conexiones de solo lectura, ejecución, cancelación |
| store | Acceso a SQLite y migraciones |
| transfer | Exportación, importación y copias |
| session | Pestañas abiertas y su estado |
| Interfaz | Aplicación de página única en la ventana de Chrome |

### Stack

| Pieza | Elección | Motivo |
|---|---|---|
| Lenguaje | Java 21 (LTS) | Mismo ecosistema que MyBatis; jpackage incluido |
| Build | Maven con Maven Wrapper 3.9.x | La versión de Maven queda fijada en el repositorio |
| Servidor | Javalin 7.2.x | Ligero, sin contenedor; exige Java 17 o superior |
| SQL dinámico | org.mybatis:mybatis 3.5.14 | Versión fijada; garantiza la misma sintaxis `<if>`, `<where>`, `<foreach>` y OGNL |
| Driver MySQL | com.mysql:mysql-connector-j 9.x | Compatible con MySQL 8.0 y posteriores |
| Pool | HikariCP | Validación de conexiones y reconexión |
| Datos propios | org.xerial:sqlite-jdbc con FTS5 | Un único fichero, búsqueda de texto completo |
| Registro | SLF4J + Logback con rotación | Fichero acotado en sesiones largas |
| Pruebas backend | JUnit 5 + AssertJ | |
| Interfaz | React + TypeScript + Vite | Últimas versiones estables al crear el proyecto |
| Editor | CodeMirror 6 | Markdown y SQL con resaltado |
| Markdown | markdown-it + highlight.js + Mermaid (carga diferida) + DOMPurify | GFM, código, diagramas, HTML saneado |
| Estado | Zustand | Simple, sin ceremonia |
| Tabla y árbol | TanStack Virtual + dnd-kit | Listas largas fluidas; arrastrar y soltar |
| Pruebas interfaz | Vitest + Testing Library | |

Las versiones no fijadas en la tabla se fijan en el Sprint 0 con la última estable y se anotan en un ADR.

### Ciclo de vida

1. Al lanzar, se comprueba si ya hay una instancia en el puerto configurado (por defecto 47600) con `GET /api/health`. Si la hay, solo se abre la ventana.
2. Si no la hay: se abre SQLite, se aplican migraciones, se hace la copia diaria si toca y se arranca el servidor.
3. Se abre la ventana con `google-chrome --app=http://127.0.0.1:47600/`. Si Chrome no está, se usa `xdg-open`.
4. La interfaz mantiene abierto un canal SSE (`/api/events`) como señal de presencia.
5. Al cerrar la ventana, la interfaz envía un aviso de despedida. Si a los 15 segundos no queda ninguna ventana conectada, el proceso se apaga de forma ordenada.
6. Si la presencia se pierde sin despedida (pestaña suspendida, fallo del navegador), el proceso sigue vivo. Un ajuste opcional permite apagarlo tras N minutos; por defecto está desactivado.

Opciones de línea de comandos: `litedd` (arrancar y abrir), `litedd --no-window`, `litedd --port N`, `litedd --stop`.

### Memoria y sesiones largas

- JVM con `-Xmx384m -XX:+UseSerialGC`.
- Los resultados de consulta viven solo en la interfaz, por pestaña, y se liberan al cerrarla.
- El servidor nunca devuelve más de 10.000 filas ni más de 10.000 caracteres por celda.
- Tablas y árbol virtualizados: solo se pintan las filas visibles.
- Fichero de registro con rotación: 5 MB por fichero, 3 ficheros.

### Build y distribución

- `./mvnw verify` compila backend e interfaz y ejecuta todas las pruebas. La interfaz se construye con `npm ci && npm run build` y se copia a los recursos del JAR.
- `./mvnw -Pdist package` genera un JAR único y una imagen de aplicación con `jpackage --type app-image`, que incluye su propio runtime de Java.
- `scripts/install.sh` copia la imagen a `~/.local/opt/litedd/`, crea `~/.local/bin/litedd` y el lanzador `~/.local/share/applications/litedd.desktop` con icono.
- `scripts/dev.sh` arranca backend y Vite con recarga en caliente.

### Rutas en disco

| Contenido | Ruta |
|---|---|
| Ajustes | `~/.config/litedd/config.json` |
| Conexión (permisos 600) | `~/.config/litedd/connection.json` |
| Datos | `~/.local/share/litedd/litedd.db` |
| Copias | `~/.local/share/litedd/backups/` |
| Registro | `~/.local/state/litedd/litedd.log` |

### Convenciones de código

- Código, identificadores, tablas y rutas de API en inglés.
- Textos de interfaz, especificaciones y mensajes de commit en español.
- Paquete raíz Java: `dev.litedd`.

## Seguridad

LiteDD nunca modifica la base de datos consultada, aunque la conexión use un usuario con todos los privilegios. Esto se garantiza con cuatro capas independientes; cada una tiene sus propias pruebas.

### Solo lectura

| ID | Requisito |
|---|---|
| S-01 | Clasificación: tras renderizar, se eliminan comentarios y se mira la primera palabra clave. Solo se ejecutan SELECT, WITH (que desemboca en SELECT), SHOW, DESCRIBE, DESC y EXPLAIN. |
| S-02 | Se rechazan aunque empiecen por SELECT: INTO OUTFILE, INTO DUMPFILE, INTO @variable, FOR UPDATE, FOR SHARE y LOCK IN SHARE MODE. |
| S-03 | Una sola sentencia: el driver se configura con `allowMultiQueries=false` y, además, un detector propio rechaza cualquier `;` que separe sentencias fuera de cadenas y comentarios. |
| S-04 | Sesión de solo lectura: cada conexión del pool ejecuta `SET SESSION TRANSACTION READ ONLY` al crearse y se marca con `setReadOnly(true)`. El servidor rechaza cualquier escritura. |
| S-05 | Límites: tiempo máximo por consulta de 30 s (configurable), cancelación manual y LIMIT siempre presente en las consultas paginables. |
| S-06 | Una sentencia no ejecutable nunca llega al driver: se muestra el SQL final y un aviso. |

### Servidor local

| ID | Requisito |
|---|---|
| S-10 | El servidor escucha solo en 127.0.0.1. |
| S-11 | Se valida la cabecera Host (`127.0.0.1:puerto` o `localhost:puerto`); cualquier otra se rechaza con 403. |
| S-12 | Al arrancar se genera un token aleatorio. Se entrega en el HTML inicial y es obligatorio en la cabecera `X-LiteDD-Token` de toda llamada a `/api`. |
| S-13 | Se valida Origin en las peticiones que modifican estado. No se emiten cabeceras CORS. |
| S-14 | Cabecera CSP: `default-src 'self'`; imágenes `'self'` y `data:`. Ningún recurso se carga de internet: todo va empaquetado. |
| S-15 | El HTML generado desde Markdown se sanea con DOMPurify. Mermaid se configura con `securityLevel: 'strict'`. |
| S-16 | Sin telemetría ni llamadas a servicios externos. |

### Credenciales y registro

| ID | Requisito |
|---|---|
| S-20 | La contraseña se guarda solo en connection.json, con permisos 600. Nunca en SQLite, en la exportación ni en el registro. |
| S-21 | La API no devuelve la contraseña; solo indica si hay una guardada. |
| S-22 | El registro no contiene valores de variables ni filas de resultado. El SQL se registra solo en nivel de depuración. |

### Reglas del repositorio público

| ID | Requisito |
|---|---|
| S-30 | Ningún dato real: ni nombres de esquemas, tablas o columnas, ni consultas de bases de datos reales. |
| S-31 | Ejemplos y pruebas usan el esquema inventado litedd_demo con las tablas author, book y loan. |
| S-32 | Sin nombres de máquina, usuarios, contraseñas ni rutas personales. Los ejemplos usan marcadores. |
| S-33 | El README describe qué hace la aplicación de forma genérica. No menciona su origen, su motivo ni otros proyectos. |
| S-34 | .gitignore excluye datos, configuración, registros, `*.db`, exportaciones `*.zip` y `.env`. |
| S-35 | Mensajes de commit neutros y en español. |

## Modelo de datos local

Todo el estado de LiteDD vive en un fichero SQLite, salvo los ajustes y la conexión, que son ficheros JSON aparte.

### Esquema

```sql
CREATE TABLE note (
  rid         INTEGER PRIMARY KEY,           -- rowid estable para FTS
  id          TEXT NOT NULL UNIQUE,          -- UUID v4, identidad pública
  parent_id   TEXT REFERENCES note(id),      -- NULL = raíz
  position    INTEGER NOT NULL,              -- orden entre hermanas, 0..n-1
  type        TEXT NOT NULL CHECK (type IN ('md','sql')),
  title       TEXT NOT NULL,
  content     TEXT NOT NULL DEFAULT '',
  favorite    INTEGER NOT NULL DEFAULT 0,
  version     INTEGER NOT NULL DEFAULT 1,    -- concurrencia optimista
  created_at  TEXT NOT NULL,                 -- ISO-8601 UTC
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT                           -- NULL = activa; fecha = papelera
);
CREATE INDEX idx_note_parent ON note(parent_id, position);

CREATE TABLE tag (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);
CREATE TABLE note_tag (
  note_id TEXT NOT NULL REFERENCES note(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, tag_id)
);

CREATE TABLE note_version (
  id       INTEGER PRIMARY KEY,
  note_id  TEXT NOT NULL REFERENCES note(id) ON DELETE CASCADE,
  title    TEXT NOT NULL,
  content  TEXT NOT NULL,
  saved_at TEXT NOT NULL
);

CREATE TABLE attachment (
  id         TEXT PRIMARY KEY,               -- UUID v4
  note_id    TEXT REFERENCES note(id) ON DELETE SET NULL,
  name       TEXT,
  mime       TEXT NOT NULL,
  data       BLOB NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE variable_value (                -- últimos valores usados por nota SQL
  note_id TEXT NOT NULL REFERENCES note(id) ON DELETE CASCADE,
  name    TEXT NOT NULL,
  value   TEXT,
  PRIMARY KEY (note_id, name)
);

CREATE TABLE tab (
  id       TEXT PRIMARY KEY,
  note_id  TEXT NOT NULL REFERENCES note(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  active   INTEGER NOT NULL DEFAULT 0,
  mode     TEXT NOT NULL CHECK (mode IN ('view','edit')),
  state    TEXT                              -- JSON: tamaño de página, orden, valores
);

CREATE TABLE setting (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE VIRTUAL TABLE note_fts USING fts5(
  title, content,
  content='note', content_rowid='rid',
  tokenize='unicode61 remove_diacritics 2',
  prefix='2 3'
);
-- Triggers AFTER INSERT / UPDATE / DELETE sobre note mantienen note_fts al día.
```

### Reglas

| ID | Regla |
|---|---|
| D-01 | `PRAGMA foreign_keys=ON`, `journal_mode=WAL`, `synchronous=NORMAL` en cada conexión. |
| D-02 | Migraciones numeradas (`V001__initial.sql`, …) controladas con `PRAGMA user_version`. Antes de migrar se hace una copia. |
| D-03 | Toda operación sobre el árbol (crear, mover, eliminar, restaurar) va en una transacción y deja las posiciones de las hermanas contiguas desde 0. |
| D-04 | Las notas en la papelera conservan parent_id y no aparecen en el árbol ni en la búsqueda. |
| D-05 | Una nota nunca puede ser descendiente de sí misma; se valida en el servidor. |
| D-06 | El acceso a SQLite usa mappers de MyBatis con anotaciones; no se añade otro framework de persistencia. |
| D-07 | Una única conexión de escritura a SQLite, serializada; las lecturas pueden ir en paralelo. |

## Notas

Una nota tiene tipo (Markdown o SQL), título, contenido y un lugar en el árbol. Estos requisitos valen para los dos tipos; lo específico de SQL está en su sección.

### Árbol

| ID | Requisito |
|---|---|
| N-01 | El panel izquierdo muestra todas las notas activas en árbol. Cada nodo tiene icono de tipo, título y control de plegado si tiene hijas. El plegado se recuerda. |
| N-02 | Cualquier nota puede tener hijas de cualquier tipo, sin límite de profundidad. |
| N-03 | Clic abre la nota; clic central la abre en pestaña nueva (ver Pestañas). |
| N-04 | Menú contextual: nueva nota Markdown hija, nueva nota SQL hija, renombrar, favorita, etiquetas, mover a…, eliminar. |
| N-05 | Los botones «Nueva nota Markdown» y «Nueva nota SQL» del panel crean la nota en la raíz, al final. |
| N-06 | Una nota nueva se llama «Sin título» y se abre en modo edición con el título seleccionado. |

### Modos

| ID | Requisito |
|---|---|
| N-10 | Cada pestaña tiene dos modos: consulta y edición. Las notas existentes se abren en consulta. |
| N-11 | Nota Markdown en consulta: contenido renderizado. En edición: texto plano en el editor, sin vista previa. |
| N-12 | Se cambia de modo con un botón y con Ctrl+E. Al pasar a consulta se guarda. |
| N-13 | El título se edita en la cabecera en modo edición y con F2 en el árbol. |

### Editor Markdown

| ID | Requisito |
|---|---|
| N-20 | Barra de formato sobre el editor: negrita, cursiva, tachado, código en línea, títulos 1 a 3, lista, lista numerada, lista de tareas, cita, bloque de código, enlace, enlace a nota, imagen, tabla y línea horizontal. |
| N-21 | Cada botón envuelve la selección o inserta una plantilla en el cursor. Si el formato ya está aplicado, lo quita. |
| N-22 | Atajos: Ctrl+B negrita, Ctrl+I cursiva. Tabulador sangra listas; Intro continúa la lista. |

### Vista Markdown

| ID | Requisito |
|---|---|
| N-30 | Markdown GFM: tablas, listas de tareas, tachado y autoenlaces. Resaltado de bloques de código. Los bloques mermaid se dibujan como diagrama. |
| N-31 | Las casillas de tareas son de solo lectura en consulta. |
| N-32 | Los enlaces externos se abren en el navegador por defecto. Los enlaces a notas abren la nota; con clic central, en pestaña nueva. |
| N-33 | Una tabla copiada desde un resultado SQL y pegada en una nota se ve como tabla. |

### Guardado e historial

| ID | Requisito |
|---|---|
| N-40 | Guardado automático 1,5 s después de la última pulsación, al perder el foco, al cambiar de modo y al cerrar la pestaña. Un indicador muestra «Guardando…» o «Guardado». |
| N-41 | Ctrl+S guarda de inmediato. |
| N-42 | Cada guardado envía la versión de partida. Si la nota cambió entretanto, el servidor responde 409 y la interfaz pregunta: «Recargar» o «Sobrescribir». |
| N-43 | El botón «Actualizar» de la pestaña recarga la nota desde el disco. |
| N-44 | Historial: se guarda una versión al salir del modo edición y, como máximo, una cada 5 minutos durante una edición larga. Se conservan las 20 últimas por nota. |
| N-45 | El diálogo «Historial» lista las versiones con fecha y vista previa, y permite restaurar una. |

### Eliminar y papelera

| ID | Requisito |
|---|---|
| N-50 | Nota sin hijas: tras confirmar, va a la papelera. |
| N-51 | Nota con hijas: el diálogo ofrece «Subir las hijas un nivel y eliminar» o «Cancelar». No hay eliminado en cascada. Las hijas ocupan el lugar de la nota eliminada, en su mismo orden. |
| N-52 | La papelera se abre desde el panel izquierdo. Lista título, tipo y fecha; permite restaurar, eliminar definitivamente y vaciar. |
| N-53 | Restaurar devuelve la nota a su madre original, al final. Si la madre ya no existe o está en la papelera, va a la raíz. |
| N-54 | Eliminar una nota cierra sus pestañas. |
| N-55 | La eliminación definitiva borra también historial y valores de variables. Los adjuntos sin referencias se purgan al arrancar. |

### Mover

| ID | Requisito |
|---|---|
| N-60 | Arrastrar y soltar en el árbol con tres zonas por nodo: antes, después y dentro (hija, al final). Un indicador muestra dónde caerá. |
| N-61 | La nota se mueve con toda su descendencia. |
| N-62 | No se puede soltar una nota sobre sí misma ni sobre una descendiente. |
| N-63 | Teclado: Alt+↑ y Alt+↓ entre hermanas; Alt+→ la hace hija de la hermana anterior; Alt+← la saca al nivel de su madre, justo después. |
| N-64 | «Mover a…» abre un selector de destino con búsqueda, para árboles grandes. |
| N-65 | Mantener el arrastre 600 ms sobre un nodo plegado lo despliega. |

### Búsqueda y filtros

| ID | Requisito |
|---|---|
| N-70 | El cuadro de búsqueda del panel busca en título y contenido, por prefijo, sin distinguir mayúsculas ni acentos. Responde mientras se escribe. |
| N-71 | Con búsqueda o filtro activo, el panel muestra una lista plana con título, ruta y fragmento resaltado. Al limpiar, vuelve el árbol. |
| N-72 | Filtros combinables: tipo, etiquetas, solo favoritas y fecha de modificación (hoy, 7 días, 30 días). |
| N-73 | Ctrl+K abre una búsqueda rápida por título; Intro abre la nota. |
| N-74 | El texto buscado se escapa antes de pasarlo a FTS5; ningún carácter provoca un error. |

### Etiquetas, favoritas, enlaces e imágenes

| ID | Requisito |
|---|---|
| N-80 | Etiquetas libres por nota, con autocompletado. Se crean al usarlas y desaparecen al quedar sin notas. |
| N-81 | Favorita: estrella en la cabecera y en el menú contextual; visible en el árbol. |
| N-90 | Escribir `[[` en el editor Markdown abre un autocompletado de notas e inserta `[Título](litedd://note/<id>)`. |
| N-91 | Un enlace a una nota inexistente o en la papelera se muestra tachado. |
| N-92 | Pegar o arrastrar una imagen al editor la guarda como adjunto e inserta `![](litedd://attachment/<id>)`. Tipos PNG, JPEG, GIF y WebP; máximo 10 MB. |
| N-93 | Las direcciones `litedd://` se resuelven antes de sanear el HTML. |

## Pestañas y sesión

Cada nota abierta ocupa una pestaña independiente, y la misma nota puede estar en varias a la vez.

| ID | Requisito |
|---|---|
| P-01 | La barra de pestañas muestra, por pestaña, icono de tipo, título, estado de guardado y botón de cierre. |
| P-02 | Clic sobre una nota: si ya está abierta, se activa la primera pestaña que la contenga; si no, se abre una pestaña nueva. |
| P-03 | Clic central sobre una nota (árbol, búsqueda o enlace): siempre abre una pestaña nueva y la activa, aunque la nota ya esté abierta. |
| P-04 | Una pestaña se cierra con su botón, con clic central sobre ella o con Alt+W. |
| P-05 | Las pestañas se reordenan arrastrando. |
| P-06 | Cada pestaña guarda su propio modo, desplazamiento, valores de variables, tamaño de página, orden y resultados. |
| P-07 | Dos pestañas de la misma nota no se sincronizan en vivo. «Actualizar» recarga el contenido; los conflictos se resuelven según N-42. |
| P-08 | Cerrar una pestaña guarda lo pendiente y libera sus resultados. |
| P-09 | La sesión se guarda en cada cambio y se restaura al arrancar: pestañas, orden, pestaña activa, modo y estado. Los resultados no se restauran. |
| P-10 | Si las pestañas no caben, la barra se desplaza y un menú las lista todas. |
| P-11 | Menú contextual de pestaña: cerrar, cerrar las demás, cerrar las de la derecha y duplicar. |
| P-12 | Sin pestañas abiertas se muestra una pantalla vacía con accesos a nueva nota y búsqueda. |
| P-13 | Renombrar una nota actualiza el título en todas sus pestañas y en el árbol. |

## Notas SQL

Una nota SQL contiene exactamente una sentencia, escrita como el cuerpo de un mapper de MyBatis. En edición se modifica el texto; en consulta se rellenan sus variables, se ejecuta y se ven los resultados.

### Formato de la nota

| ID | Requisito |
|---|---|
| Q-01 | El contenido es el cuerpo de una sentencia MyBatis: SQL con `#{...}`, `${...}` y etiquetas dinámicas. |
| Q-02 | Se admite también la sentencia envuelta en `<select>`, `<insert>`, `<update>` o `<delete>`. Se ignoran los atributos y se usa el contenido. Más de un elemento envolvente, o texto fuera de él, es un error. |
| Q-03 | Etiquetas admitidas: todas las del lenguaje dinámico de MyBatis (if, where, choose, when, otherwise, trim, set, foreach, bind). `<include>` da el error «no admitido en esta versión». |
| Q-04 | El contenido debe ser XML válido, igual que en un mapper: `<` y `&` dentro del SQL se escriben como `&lt;` y `&amp;`, o dentro de `<![CDATA[ ]]>`. El error indica línea y columna. |
| Q-05 | Una nota contiene una sola sentencia. Un `;` final se ignora; cualquier otro `;` que separe sentencias es un error. |
| Q-06 | WHERE puede escribirse como cláusula SQL o con la etiqueta `<where>`. |

Ejemplo con el esquema de demostración:

```xml
SELECT b.id, b.title, a.name AS author
FROM book b
JOIN author a ON a.id = b.author_id
<where>
  <if test="title != null">
    AND b.title LIKE CONCAT('%', #{title}, '%')
  </if>
  <if test="minYear != null">
    AND b.year >= #{minYear,int}
  </if>
  <if test="authorIds != null">
    AND a.id IN
    <foreach collection="authorIds" item="id" open="(" separator="," close=")">
      #{id}
    </foreach>
  </if>
</where>
```

Esta nota muestra tres campos: title (string), minYear (int) y authorIds (list).

### Variables

| ID | Requisito |
|---|---|
| Q-10 | Se detectan los nombres usados en `#{...}` y `${...}` (la raíz, antes de un punto o corchete), y los identificadores usados en `test`, en `collection` de `<foreach>` y en `value` de `<bind>`. |
| Q-11 | Se excluyen: variables locales (`item` e `index` de `<foreach>`, `name` de `<bind>`), palabras y literales de OGNL (null, true, false, and, or, not, in, eq, neq, lt, lte, gt, gte, números y cadenas), `_parameter`, `_databaseId` y nombres de método tras un punto. |
| Q-12 | El tipo se declara en el propio token: `#{nombre}` o `#{nombre,tipo}`. También se acepta la forma nativa `#{nombre, javaType=tipo}`. LiteDD extrae el tipo y entrega a MyBatis `#{nombre}`. |
| Q-13 | Sin tipo declarado, la variable es string. |
| Q-14 | Una variable usada como `collection` de un `<foreach>` es list automáticamente. Si el token del item declara tipo, se convierte cada elemento. |
| Q-15 | Una variable que solo aparece en un test se tipa con un comentario XML, que MyBatis ignora: `<!-- #{onlyActive,boolean} -->`. |
| Q-16 | Tipos contradictorios para la misma variable son un error, visible en edición y en consulta. Si un token declara tipo y los demás no, vale el declarado. |
| Q-17 | `${...}` es sustitución textual: el valor se inserta tal cual en el SQL. Siempre es string y el editor lo resalta en otro color. |

| Tipo | Valor Java | Control | Entrada válida |
|---|---|---|---|
| string | String | Texto | Cualquiera; no se recorta |
| int | Integer | Texto | Entero con signo |
| long | Long | Texto | Entero con signo |
| decimal | BigDecimal | Texto | Número con punto decimal |
| boolean | Boolean | Selector: vacío, sí, no | |
| date | String validado | Selector de fecha | yyyy-MM-dd |
| datetime | String validado | Selector de fecha y hora | yyyy-MM-dd HH:mm:ss |
| list | List | Texto | Valores separados por comas; se recorta cada uno |

### Formulario de variables

| ID | Requisito |
|---|---|
| Q-20 | En consulta, sobre los resultados, aparece un formulario con un campo por variable, en orden de aparición, con su nombre y su tipo. Tiene el aspecto de los criterios de un buscador. |
| Q-21 | Un campo vacío vale null. Sin excepciones. |
| Q-22 | Un valor que no convierte a su tipo marca el campo con un error y no se ejecuta. |
| Q-23 | Intro en cualquier campo, o Ctrl+Intro, ejecuta. El botón «Limpiar» vacía todos los campos. |
| Q-24 | Los últimos valores ejecutados se recuerdan por nota y se proponen al abrirla. Cada pestaña mantiene sus propios valores. |
| Q-25 | Una nota sin variables no muestra formulario, solo el botón «Ejecutar». |

### Renderizado con MyBatis

MyBatis genera el SQL y la lista ordenada de parámetros; LiteDD ejecuta con su propio PreparedStatement. Así se conservan los metadatos de las columnas, incluidos los nombres repetidos.

```java
Configuration cfg = new Configuration();                 // única, reutilizada
LanguageDriver driver = new XMLLanguageDriver();
SqlSource source = driver.createSqlSource(cfg, "<script>" + body + "</script>", Map.class);
BoundSql bound = source.getBoundSql(params);             // params: Map<String,Object> ya convertido
String sql = bound.getSql();                             // SQL con '?'
MetaObject meta = cfg.newMetaObject(params);
for (ParameterMapping pm : bound.getParameterMappings()) {
    String prop = pm.getProperty();
    Object value = bound.hasAdditionalParameter(prop)    // elementos de foreach, bind
        ? bound.getAdditionalParameter(prop)
        : meta.getValue(prop);
    // statement.setObject(i++, value)
}
```

| ID | Requisito |
|---|---|
| Q-30 | El SQL final se genera siempre con el motor de MyBatis, como en el fragmento anterior. No se reimplementa ninguna etiqueta. |
| Q-31 | El mapa de parámetros contiene todas las variables detectadas, ya convertidas a su tipo y con null por defecto. |
| Q-32 | La ejecución es JDBC directo; no se usan mappers ni ResultMap contra MySQL. |
| Q-33 | Los SqlSource se cachean por hash del contenido de la nota. |

### Ejecución

| ID | Requisito |
|---|---|
| Q-40 | Una nota nunca se ejecuta al abrirla. Solo con «Ejecutar». |
| Q-41 | Durante la ejecución se muestra un cronómetro en vivo y el botón «Cancelar» (también Esc), que llama a `Statement.cancel()`. |
| Q-42 | Al terminar se muestra el tiempo total, el tiempo de servidor y las filas: «1,24 s (servidor 1,19 s) · 20 filas». |
| Q-43 | Tiempo máximo de 30 s, ajustable. Al superarlo se cancela y se informa. |
| Q-44 | SHOW, DESCRIBE y EXPLAIN se ejecutan tal cual, sin paginación ni ordenación, con el tope de filas. |
| Q-45 | Si la sentencia no es ejecutable (S-01, S-02), el botón pasa a ser «Generar SQL». Se muestra el SQL final con el aviso: «LiteDD solo ejecuta consultas. Copia la sentencia para ejecutarla en otra herramienta.» |
| Q-46 | Sin conexión, se muestra el error con un botón «Reconectar». El resto de la aplicación sigue funcionando. |
| Q-47 | Ante un fallo de comunicación (SQLState 08xxx) se reintenta una vez con una conexión nueva. |

### Paginación, ordenación y total

| ID | Requisito |
|---|---|
| Q-50 | Tamaños de página: 10, 20 (por defecto), 50, 100, 200, 500 y «Sin límite». Se elige por pestaña; el valor por defecto es un ajuste. |
| Q-51 | LiteDD añade la paginación al final del SQL renderizado: `<sql> ORDER BY <n> <ASC o DESC> LIMIT <tamaño+1> OFFSET <desplazamiento>`. `<n>` es la posición de la columna, desde 1; la cláusula de orden solo se añade si se ha elegido orden en la tabla. Se ordena por posición y no por nombre para admitir consultas con nombres de columna repetidos. |
| Q-52 | Siempre se pide una fila más de las que se muestran. Si llega, hay página siguiente. No se lanza ningún COUNT automático. |
| Q-53 | Si la página no se llena, el total ya se conoce (desplazamiento más filas) y se muestra. |
| Q-54 | El botón «Contar» calcula el total con `SELECT COUNT(*) FROM (<sql>) AS litedd_count`. Si falla por nombres de columna duplicados (error 1060), se recorre la consulta en streaming contando filas, bajo el tiempo máximo. |
| Q-55 | «Sin límite» aplica `LIMIT 10001`. Si llegan 10.001 filas, se muestran 10.000 y un aviso de tope alcanzado. El tope es un ajuste. |
| Q-56 | Clic en una cabecera: ascendente, descendente, sin orden. Reejecuta desde la página 1. El orden es de la pestaña y no se guarda en la nota. |
| Q-57 | Se asume que la nota no termina en ORDER BY ni LIMIT. Si termina en ORDER BY y no se ha elegido orden en la tabla, solo se añade LIMIT. En cualquier otro caso se envuelve: `SELECT * FROM (<sql>) AS litedd_page` más orden y límite. Si el envoltorio falla por columnas duplicadas, el mensaje pide quitar ORDER BY y LIMIT de la nota. |
| Q-58 | Un analizador léxico propio, que entiende cadenas, comentarios y paréntesis, detecta el `;`, el ORDER BY y el LIMIT de primer nivel y las cláusulas prohibidas. No se usa un parser SQL completo. |
| Q-59 | Controles de página: primera, anterior, siguiente, número de página y rango visible («21–40»). Cambiar el tamaño vuelve a la página 1. |

### Tabla de resultados

| ID | Requisito |
|---|---|
| Q-60 | El formato es siempre el mismo: cabecera fija, columna con el número de fila, desplazamiento en ambos ejes y filas virtualizadas. |
| Q-61 | Las cabeceras son las etiquetas de columna (`getColumnLabel`). Se admiten repetidas. |
| Q-62 | Los valores se leen como texto (`getString`), sin conversiones de zona horaria. Los binarios se muestran como `[BLOB 2,3 KB]`. |
| Q-63 | NULL se muestra atenuado y en cursiva, distinto de la cadena vacía. Los números se alinean a la derecha. |
| Q-64 | Las celdas largas se truncan a 200 caracteres en la tabla. Un clic abre el valor completo, hasta 10.000 caracteres, con aviso si el servidor lo recortó. |
| Q-65 | Clic selecciona una celda; Ctrl+C copia su valor. |
| Q-66 | «Copiar tabla» copia las filas cargadas como tabla Markdown GFM: la barra vertical se escapa, los saltos de línea pasan a `<br>` y los nulos a NULL. |
| Q-67 | Los resultados no se guardan en disco. Se pierden al cerrar la pestaña o la aplicación. |
| Q-68 | Una consulta sin filas muestra las cabeceras y el mensaje «Sin resultados». |

### SQL final

| ID | Requisito |
|---|---|
| Q-70 | Tras cada ejecución o generación hay un panel plegable «SQL final», cerrado por defecto. |
| Q-71 | Vista «Con parámetros»: el SQL con `?` y la lista numerada de valores con su tipo. |
| Q-72 | Vista «Con valores»: los literales insertados con el escapado de MySQL, lista para pegar en otra herramienta. No incluye la paginación añadida por LiteDD. |
| Q-73 | Las dos vistas tienen botón «Copiar». |

### Editor SQL

| ID | Requisito |
|---|---|
| Q-80 | Resaltado de SQL (dialecto MySQL), de etiquetas MyBatis y de tokens `#{}` y `${}`. |
| Q-81 | Barra con inserciones: `#{}`, `<if>`, `<where>`, `<choose>`, `<foreach>`, `<trim>` y `<![CDATA[ ]]>`. |
| Q-82 | Bajo el editor se listan en vivo las variables detectadas con su tipo y los errores de análisis. |

### Errores

| ID | Situación | Mensaje |
|---|---|---|
| Q-90 | XML mal formado | Línea, columna y causa |
| Q-91 | Expresión test inválida | La expresión y el error de OGNL |
| Q-92 | Tipo desconocido o contradictorio | Variable y tipos implicados |
| Q-93 | Valor no convertible | En el campo: tipo esperado |
| Q-94 | Más de una sentencia | «Una nota solo puede contener una sentencia» |
| Q-95 | Cláusula no permitida | La cláusula detectada |
| Q-96 | Error de MySQL | Código y mensaje del servidor, sin traducir |
| Q-97 | Tiempo agotado o cancelación | Tiempo transcurrido |
| Q-98 | Sin conexión | Causa y botón «Reconectar» |

## Conexión a MySQL

LiteDD usa una única conexión a un servidor MySQL 8.4 y un esquema por defecto que se elige una vez.

| ID | Requisito |
|---|---|
| C-01 | El diálogo «Conexión» tiene: método (fijo, TCP/IP estándar), host (por defecto 127.0.0.1), puerto (3306), usuario, contraseña (se guarda), esquema por defecto y parámetros JDBC adicionales. |
| C-02 | Sin conexión configurada, la barra superior muestra un aviso que no bloquea. Las notas funcionan sin conexión. |
| C-03 | «Probar conexión» conecta y lista los esquemas con `SHOW DATABASES`, sin los de sistema (information_schema, mysql, performance_schema, sys). |
| C-04 | Esquema por defecto: si solo hay un esquema que no sea de sistema, se selecciona solo. Si hay varios, hay que elegir uno de la lista. La elección se recuerda. |
| C-05 | URL: `jdbc:mysql://<host>:<puerto>/<esquema>` con `useSSL=false`, `allowPublicKeyRetrieval=true`, `characterEncoding=UTF-8`, `allowMultiQueries=false`, `tinyInt1isBit=false`, `zeroDateTimeBehavior=CONVERT_TO_NULL` y `connectTimeout=5000`. Los parámetros adicionales se añaden después; allowMultiQueries no se puede activar. |
| C-06 | `allowPublicKeyRetrieval=true` es necesario para autenticar con caching_sha2_password sin SSL, el método por defecto de MySQL 8.4. |
| C-07 | Pool HikariCP: máximo 3 conexiones, mínimo 0 inactivas, sentencia inicial de solo lectura (S-04), vida máxima de 10 minutos y espera máxima de 5 s. |
| C-08 | No se usa autoReconnect del driver. El pool valida cada conexión antes de entregarla. |
| C-09 | La barra superior indica el estado: conectado (usuario, host y esquema), desconectado o esquema no disponible. Un clic abre el diálogo. «Reconectar» recrea el pool. |
| C-10 | Si el esquema guardado no existe al conectar, el estado es «esquema no disponible». Se reintenta en la siguiente ejecución o al pulsar «Reconectar». |
| C-11 | Cambiar la conexión cierra el pool anterior y cancela las consultas en curso. |

Formato de connection.json:

```json
{
  "host": "127.0.0.1",
  "port": 3306,
  "user": "<usuario>",
  "password": "<contraseña>",
  "schema": "litedd_demo",
  "extraParams": ""
}
```

## Importación, exportación y copias

Todo el contenido se exporta a un único ZIP legible y se importa desde ese mismo ZIP.

```text
litedd-export-20261004-1030.zip
├── manifest.json
├── notes/
│   ├── 01-guia-de-uso.md
│   ├── 01-guia-de-uso/
│   │   ├── 01-libros-por-autor.sql
│   │   └── 02-notas-sueltas.md
│   └── 02-consultas.sql
└── attachments/
    └── 3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90.png
```

| ID | Requisito |
|---|---|
| X-01 | «Exportar» genera el ZIP y lo descarga, con fecha y hora en el nombre. |
| X-02 | manifest.json contiene versión de formato, versión de la aplicación, fecha y, por nota: id, parentId, position, type, title, tags, favorite, createdAt, updatedAt y file. Incluye también la lista de adjuntos. |
| X-03 | Cada nota es un fichero .md o .sql en carpetas que reproducen el árbol. El nombre es la posición con dos dígitos más el título saneado. El contenido es idéntico al de la nota, sin cabeceras añadidas. |
| X-04 | No se exportan papelera, historial, pestañas, valores de variables, ajustes ni conexión. |
| X-05 | «Importar» ofrece dos modos. «Reemplazar todo» hace una copia antes y pide confirmación explícita. «Añadir como rama» cuelga todo de una nota raíz nueva, «Importado» más la fecha, con identificadores nuevos y enlaces y adjuntos reasignados. |
| X-06 | Antes de tocar nada se valida: versión del formato, existencia de cada fichero del manifiesto, rutas sin `..` ni absolutas y tamaño total máximo de 500 MB. La importación va en una transacción. |
| X-07 | En la importación, el manifiesto manda sobre el árbol de carpetas. |
| X-08 | Copia automática: al arrancar, si la última tiene más de 24 horas, se ejecuta `VACUUM INTO` hacia `backups/litedd-AAAAMMDD.db`. Se conservan las 3 más recientes. |
| X-09 | Se hace una copia adicional antes de «Reemplazar todo» y antes de una migración. Llevan un sufijo propio y se conservan las 2 últimas. |
| X-10 | Menú «Datos»: exportar, importar, crear copia ahora y abrir la carpeta de datos. |
| X-11 | Restaurar una copia es manual y se documenta en el README: cerrar LiteDD y sustituir litedd.db. |

## API HTTP local

La interfaz habla con el servidor solo a través de esta API JSON, bajo `/api`.

| ID | Regla |
|---|---|
| A-01 | JSON en UTF-8. Los nombres de campo van en inglés y en camelCase. |
| A-02 | Los errores usan el código HTTP adecuado y el cuerpo `{"code", "message", "details"}`. message va en español y es apto para mostrarse. |
| A-03 | Toda ruta exige el token de sesión (S-12), salvo `GET /api/health`. |
| A-04 | La ejecución usa siempre el contenido guardado de la nota. La petición envía noteId y la versión que la pestaña tiene cargada. |
| A-05 | Si la versión enviada no coincide con la guardada, la respuesta es 409 y la interfaz pide pulsar «Actualizar». |

| Método | Ruta | Descripción |
|---|---|---|
| GET | /api/tree | Árbol completo de notas activas: identidad, madre, posición, tipo, título, favorita, etiquetas |
| POST | /api/notes | Crear nota: madre, tipo, título |
| GET | /api/notes/{id} | Nota completa con contenido y versión |
| PUT | /api/notes/{id} | Guardar título y contenido con baseVersion; 409 si hay conflicto |
| POST | /api/notes/{id}/move | Mover: nueva madre y posición |
| DELETE | /api/notes/{id} | A la papelera; 409 si tiene hijas, salvo children=promote |
| PUT | /api/notes/{id}/tags | Sustituir etiquetas |
| PUT | /api/notes/{id}/favorite | Marcar o desmarcar |
| GET | /api/notes/{id}/versions | Historial |
| POST | /api/notes/{id}/versions/{versionId}/restore | Restaurar una versión |
| GET | /api/trash | Contenido de la papelera |
| POST | /api/trash/{id}/restore | Restaurar |
| DELETE | /api/trash/{id} | Eliminar definitivamente |
| DELETE | /api/trash | Vaciar |
| GET | /api/search | Parámetros q, type, tags, favorite, since |
| GET | /api/tags | Etiquetas existentes |
| POST | /api/attachments | Subir imagen |
| GET | /api/attachments/{id} | Descargar imagen |
| POST | /api/sql/analyze | Variables, tipos, clase de sentencia y errores de un contenido |
| POST | /api/sql/execute | Ejecutar una página |
| POST | /api/sql/count | Total de filas |
| POST | /api/sql/render | SQL final sin ejecutar |
| POST | /api/sql/cancel | Cancelar por executionId |
| GET | /api/connection | Configuración sin contraseña |
| PUT | /api/connection | Guardar configuración |
| POST | /api/connection/test | Probar y listar esquemas |
| POST | /api/connection/reconnect | Recrear el pool |
| GET | /api/connection/status | Estado actual |
| GET, PUT | /api/session | Pestañas y su estado |
| GET, PUT | /api/settings | Ajustes |
| POST | /api/data/export | Descargar ZIP |
| POST | /api/data/import | Subir ZIP con el modo elegido |
| POST | /api/data/backup | Crear copia ahora |
| GET | /api/health | Firma y versión de la aplicación |
| GET | /api/events | Canal SSE de presencia |
| POST | /api/presence/bye | Aviso de cierre de ventana |
| POST | /api/shutdown | Apagado ordenado |

Petición y respuesta de `POST /api/sql/execute`:

```json
{
  "noteId": "3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90",
  "version": 12,
  "executionId": "c1a2…",
  "values": { "title": "mar", "minYear": "1990", "authorIds": "" },
  "page": 1,
  "pageSize": 20,
  "sort": { "column": 2, "direction": "asc" }
}
```

```json
{
  "kind": "query",
  "columns": [
    { "label": "id", "type": "BIGINT", "numeric": true },
    { "label": "title", "type": "VARCHAR", "numeric": false }
  ],
  "rows": [["1", "El mar"], ["2", null]],
  "truncatedCells": [],
  "hasMore": false,
  "total": 2,
  "capReached": false,
  "serverMillis": 14,
  "finalSql": {
    "withPlaceholders": "SELECT … WHERE b.title LIKE CONCAT('%', ?, '%') AND b.year >= ?",
    "parameters": [
      { "index": 1, "value": "mar", "type": "string" },
      { "index": 2, "value": 1990, "type": "int" }
    ],
    "inlined": "SELECT … WHERE b.title LIKE CONCAT('%', 'mar', '%') AND b.year >= 1990"
  }
}
```

Los valores de `values` viajan siempre como texto; la conversión de tipos ocurre en el servidor. `total` solo aparece cuando se conoce (Q-53).

## Interfaz

La ventana tiene tres zonas fijas: barra superior, panel izquierdo con el árbol y área principal con pestañas.

```text
┌────────────────────────────────────────────────────────────────┐
│ LiteDD      [Búsqueda rápida]        ● usuario@host/esquema  ⚙ │
├────────────────┬───────────────────────────────────────────────┤
│ Buscar…        │ [Nota A ×] [Consulta B ×] [Nota A ×]          │
│ Filtros        ├───────────────────────────────────────────────┤
│ ▾ Nota A       │ Ruta / Título     ★  Etiquetas   [Editar] ⟳   │
│    Consulta B  │                                               │
│ ▸ Nota C       │ Contenido: vista o editor                     │
│                │                                               │
│ Papelera       │                                               │
└────────────────┴───────────────────────────────────────────────┘
```

| ID | Requisito |
|---|---|
| U-01 | El panel izquierdo se redimensiona arrastrando su borde y se oculta con Alt+B. El ancho se recuerda. |
| U-02 | Tema oscuro único, definido con variables CSS: fondo, superficie, borde, texto, texto atenuado, acento, error y aviso. Contraste mínimo AA. |
| U-03 | Toda la interfaz está en español. Fechas como dd/MM/yyyy HH:mm; coma decimal en tiempos y tamaños. |
| U-04 | Tipografía del sistema para la interfaz; monoespaciada para editores, SQL y celdas de resultado. |
| U-05 | Cabecera de nota: ruta, título, favorita, etiquetas y los botones Editar o Ver, Actualizar, Historial y Eliminar. |
| U-06 | Nota SQL en consulta, de arriba abajo: formulario de variables, barra de ejecución (Ejecutar, Cancelar, cronómetro, tamaño de página, Contar, Copiar tabla), tabla de resultados, paginación y panel «SQL final». |
| U-07 | Los avisos de guardado, copias y errores leves no bloquean. Los diálogos se reservan para confirmar acciones destructivas y resolver conflictos. |
| U-08 | Toda la aplicación se puede manejar con teclado y el foco es siempre visible. |
| U-09 | No se usan atajos reservados por el navegador: Ctrl+N, Ctrl+T, Ctrl+W ni Ctrl+Tab. |
| U-10 | Pantalla «Ajustes»: tamaño de página por defecto, tope de filas, tiempo máximo de consulta, puerto y apagado automático. Da acceso a «Conexión» y «Datos». |
| U-11 | Si se pierde el contacto con el servidor, aparece una banda de aviso y se reintenta solo. El texto en edición se conserva en memoria y se guarda al recuperar el contacto. |

### Atajos de teclado

| Atajo | Acción |
|---|---|
| Ctrl+K | Búsqueda rápida |
| Ctrl+E | Cambiar entre consulta y edición |
| Ctrl+S | Guardar ahora |
| Ctrl+Intro | Ejecutar la consulta |
| Esc | Cancelar la ejecución o cerrar el diálogo |
| Alt+N | Nueva nota Markdown |
| Alt+Mayús+N | Nueva nota SQL |
| Alt+W | Cerrar pestaña |
| Alt+RePág, Alt+AvPág | Pestaña anterior, pestaña siguiente |
| Alt+B | Mostrar u ocultar el panel izquierdo |
| F2 | Renombrar, en el árbol |
| Supr | Eliminar, en el árbol |
| Alt+flechas | Mover la nota, en el árbol (N-63) |
| Ctrl+B, Ctrl+I | Negrita y cursiva, en el editor Markdown |

## Repositorio y método SDD

El desarrollo sigue un orden fijo: primero la especificación, después las pruebas y por último el código. Nada se implementa sin un identificador de requisito.

### Estructura

```text
litedd/
├── CLAUDE.md                 instrucciones operativas para Claude Code
├── README.md
├── LICENSE                   MIT
├── .gitignore
├── mvnw, .mvn/
├── pom.xml
├── specs/
│   ├── ESPECIFICACION.md     este documento, como referencia
│   ├── constitucion.md       principios que no se negocian
│   ├── requisitos/           seguridad, datos, notas, pestanas, sql, conexion,
│   │                         transferencia, api, interfaz (.md)
│   ├── diseno/               arquitectura.md, modelo-datos.md
│   ├── sprints/              sprint-00.md … sprint-06.md
│   └── decisiones/           ADR-0001-….md
├── src/main/java/dev/litedd/
├── src/main/resources/db/migration/
├── src/test/java/dev/litedd/
├── frontend/                 src/, package.json, vite.config.ts
├── scripts/                  dev.sh, install.sh, uninstall.sh
└── packaging/                litedd.desktop, icono
```

### Constitución

1. La especificación manda. Si el código y la especificación difieren, se corrige primero la especificación y después el código.
2. Nada fuera de alcance: no se añaden funciones, dependencias ni ajustes que la especificación no pida.
3. Solo lectura inviolable: ninguna ruta de código puede enviar a MySQL una sentencia que modifique datos o estructura.
4. Los datos no salen de la máquina: sin red externa, sin telemetría, sin CDN.
5. Repositorio público: se aplican siempre las reglas S-30 a S-35.
6. Los datos del usuario no se pierden: transacciones, copia antes de operaciones destructivas y guardado automático.
7. Simplicidad: sin Spring y sin abstracciones que no tengan dos usos reales.
8. Cada requisito tiene al menos una prueba que lo cita por su identificador.
9. Ante una ambigüedad, se pregunta; no se decide en silencio.

### Flujo de un sprint

1. Leer CLAUDE.md, la constitución y el fichero del sprint.
2. Revisar el plan de tareas, presentarlo y esperar aprobación.
3. Escribir las pruebas de cada requisito y después el código.
4. Verificar: `./mvnw verify` en verde y criterios de aceptación recorridos con la aplicación arrancada.
5. Registrar cada decisión nueva como ADR y actualizar la especificación si cambió.
6. Rellenar «Resultado» en el fichero del sprint y hacer commit.

Cada fichero de sprint tiene cinco apartados: objetivo, requisitos cubiertos, tareas, criterios de aceptación y resultado.

### Pruebas

| Nivel | Alcance | Obligatoria |
|---|---|---|
| Unitaria | sqlengine completo: análisis, tipos, renderizado, clasificación, léxico y paginación | Sí |
| Unitaria | Operaciones de árbol: crear, mover, eliminar, restaurar | Sí |
| Integración | SQLite real en un fichero temporal | Sí |
| Integración | MySQL real, perfil `-Pit` | Opcional |
| Interfaz | Componentes y almacenes de estado con Vitest | Sí |

Las pruebas contra MySQL leen `LITEDD_IT_HOST`, `LITEDD_IT_PORT`, `LITEDD_IT_USER` y `LITEDD_IT_PASSWORD`. Crean y eliminan su propio esquema litedd_it y no tocan ningún otro.

## Plan de sprints

Son un sprint de arranque y seis de producto. Cada uno deja la aplicación en un estado que se puede usar y probar.

| Sprint | Objetivo | Requisitos |
|---|---|---|
| 0 | Arranque: estructura, especificaciones divididas y esqueleto que arranca | S-10 a S-16, S-30 a S-35 |
| 1 | Notas básicas: almacenamiento, árbol, edición y vista Markdown, guardado | D-01 a D-07, N-01 a N-33, N-40 a N-43, U-01 a U-09 |
| 2 | Organización y pestañas: mover, eliminar, papelera, pestañas y sesión | N-50 a N-65, P-01 a P-13 |
| 3 | Motor SQL y conexión, con interfaz mínima | S-01 a S-06, S-20 a S-22, Q-01 a Q-17, Q-30 a Q-33, Q-51 a Q-58, C-01 a C-11 |
| 4 | Notas SQL en la interfaz: formulario, ejecución, resultados, SQL final | Q-20 a Q-25, Q-40 a Q-50, Q-59 a Q-98 |
| 5 | Búsqueda y contenido rico: filtros, etiquetas, enlaces, imágenes, Mermaid, historial | N-44, N-45, N-70 a N-93 |
| 6 | Datos y distribución: ZIP, copias, ajustes, ciclo de vida, instalación | X-01 a X-11, U-10, U-11, ciclo de vida |

### Criterios de aceptación

#### Sprint 0

- `./mvnw verify` termina en verde con una prueba de backend y una de interfaz.
- `scripts/dev.sh` muestra una pantalla vacía con el tema oscuro y `GET /api/health` responde.
- specs/ contiene constitución, requisitos, diseño y los siete ficheros de sprint.
- Una petición con Host distinto de 127.0.0.1 o sin token recibe 403.

#### Sprint 1

- Se crean notas Markdown y SQL en la raíz y como hijas; el árbol las muestra y recuerda el plegado.
- La barra de formato aplica y quita cada formato sobre una selección.
- La vista renderiza tablas, listas de tareas y bloques de código resaltados.
- Tras escribir y esperar 2 segundos, cerrar y reabrir la aplicación conserva el texto.
- Un guardado con versión antigua recibe 409 y la interfaz ofrece «Recargar» o «Sobrescribir».

#### Sprint 2

- Una nota con tres niveles de hijas se mueve entera arrastrando y con el teclado.
- Soltar una nota sobre una descendiente no es posible.
- Eliminar una nota con hijas ofrece subirlas un nivel; eliminar una sin hijas la manda a la papelera; restaurar la devuelve a su sitio.
- Clic sobre una nota ya abierta activa su pestaña; clic central abre otra pestaña de la misma nota.
- Tras reiniciar, vuelven las mismas pestañas, en el mismo orden y modo.

#### Sprint 3

- Pasan todas las pruebas de la sección «Casos límite y pruebas obligatorias».
- El diálogo de conexión prueba, lista esquemas, guarda y muestra el estado en la barra.
- Con el perfil `-Pit`, un UPDATE es rechazado por la clasificación y, forzando su envío en la prueba, también por la sesión de solo lectura.
- `POST /api/sql/execute` devuelve una página de una consulta de demostración con variables.

#### Sprint 4

- Una nota con tres variables muestra tres campos; vacíos valen null y los `<if>` se comportan en consecuencia.
- Un valor no numérico en un campo int marca el error y no ejecuta.
- `SELECT SLEEP(20)` muestra el cronómetro en marcha y se cancela con Esc.
- Paginación, cambio de tamaño, «Sin límite» con tope, ordenación por cabecera y «Contar» funcionan sobre una tabla de más de 10.000 filas.
- Una consulta con dos columnas de igual nombre se pagina y se ordena sin error.
- «Copiar tabla», pegado en una nota Markdown, se ve como tabla.
- Una nota con un UPDATE muestra «Generar SQL» y el SQL final con valores, y no ejecuta nada.

#### Sprint 5

- La búsqueda encuentra por título y contenido sin distinguir acentos y resalta el fragmento.
- Los filtros de tipo, etiqueta, favorita y fecha se combinan.
- `[[` inserta un enlace que abre la nota destino; una imagen pegada se ve en la vista.
- Un bloque mermaid se dibuja; el historial lista versiones y restaura una.

#### Sprint 6

- Exportar, vaciar e importar con «Reemplazar todo» deja un árbol idéntico; «Añadir como rama» no altera lo existente.
- La copia diaria se crea y la rotación conserva 3.
- `scripts/install.sh` deja un icono que arranca la aplicación con doble clic.
- Un segundo lanzamiento reutiliza la instancia; cerrar la ventana apaga el proceso en 15 segundos.
- Una prueba de resistencia de 2.000 ejecuciones seguidas termina con la memoria del proceso estable.
- La auditoría final no encuentra datos sensibles en el repositorio.

## Prompts para Claude Code

Son cuatro prompts: uno de arranque, uno que se repite por sprint, uno para cambiar requisitos y uno de auditoría final. Se pegan tal cual, con el repositorio abierto y specs/ESPECIFICACION.md ya en su sitio.

### Prompt 0: arranque

```text
Vas a construir LiteDD con desarrollo guiado por especificación (SDD).
La fuente única de verdad es specs/ESPECIFICACION.md. Léela entera antes de hacer nada.

En esta sesión solo se hace el Sprint 0 (arranque). No implementes funcionalidad de producto.

Tareas:
1. Comprueba el entorno: `java -version` debe ser 21 y `node -v` 24 o superior.
   Si algo falla, detente y dímelo; no instales nada por tu cuenta.
2. Crea la estructura del repositorio descrita en «Repositorio y método SDD».
3. Divide specs/ESPECIFICACION.md en los ficheros de specs/ (constitución, requisitos,
   diseño) sin perder ni añadir requisitos y conservando los identificadores
   (S-xx, D-xx, N-xx, P-xx, Q-xx, C-xx, X-xx, A-xx, U-xx, T-xx).
   ESPECIFICACION.md se queda como referencia y no se modifica.
4. Genera specs/sprints/sprint-00.md … sprint-06.md a partir de «Plan de sprints»,
   cada uno con: objetivo, requisitos cubiertos, tareas, criterios de aceptación y
   un apartado «Resultado» vacío.
5. Escribe CLAUDE.md con: comandos de build, prueba y arranque; la constitución
   resumida; las convenciones (código e identificadores en inglés; interfaz,
   especificaciones y commits en español); y el flujo de un sprint.
6. Monta el esqueleto técnico: Maven Wrapper, pom.xml con las versiones de la tabla
   «Stack», servidor Javalin en 127.0.0.1 con GET /api/health y las protecciones
   S-10 a S-16, interfaz Vite + React + TypeScript con el tema oscuro y una pantalla
   vacía «LiteDD», build integrado en Maven, scripts/dev.sh, una prueba de backend
   y una de interfaz.
7. Añade README.md (descripción genérica), LICENSE (MIT) y .gitignore.
8. Anota en specs/decisiones/ADR-0001-versiones.md las versiones exactas fijadas.
9. Verifica con `./mvnw verify` y arrancando la aplicación.

Reglas que no se negocian:
- El repositorio es público. No escribas nombres de máquina, usuarios, contraseñas,
  rutas personales, ni referencias a otros proyectos o al motivo de la aplicación.
  Los ejemplos usan el esquema inventado litedd_demo.
- No añadas dependencias ni funciones que la especificación no pida.
- Si la especificación es ambigua o se contradice, pregunta antes de decidir y
  registra la respuesta como ADR.
- No uses Spring.
- Ninguna llamada de red externa en tiempo de ejecución: sin CDN y sin telemetría.

Al terminar: rellena «Resultado» en sprint-00.md, resume qué has creado, qué
versiones has fijado y qué dudas quedan, y haz un commit «Sprint 0: arranque del
proyecto». No empieces el Sprint 1.
```

### Prompt de sprint

Se usa seis veces, cambiando N por el número de sprint.

```text
Ejecuta el Sprint N de LiteDD.

1. Lee CLAUDE.md, specs/constitucion.md, specs/sprints/sprint-0N.md y los requisitos
   y diseños que cita. Lee también el «Resultado» del sprint anterior.
2. Antes de programar, revisa el plan de tareas del sprint, ajústalo si hace falta,
   enséñamelo y espera mi visto bueno.
3. Implementa tarea a tarea. Cada requisito tiene al menos una prueba que lo nombra
   por su identificador. Escribe primero las pruebas del motor SQL y de las
   operaciones de árbol, y después su código.
4. Si necesitas desviarte de la especificación, para y pregunta. Si lo apruebo,
   actualiza primero la especificación y añade un ADR.
5. Verifica: `./mvnw verify` en verde, y recorre los criterios de aceptación uno a
   uno con la aplicación arrancada. Dime cuáles no has podido comprobar tú.
6. Rellena «Resultado» en el fichero del sprint: hecho, pendiente, desviaciones y
   cómo probarlo a mano paso a paso.
7. Haz commits pequeños con mensajes en español. No empieces el sprint siguiente.

Recuerda: repositorio público y sin datos reales; LiteDD nunca envía a MySQL una
sentencia que modifique datos o estructura.
```

### Prompt de cambio de requisito

```text
Quiero cambiar un requisito de LiteDD: <describe el cambio>.

1. Localiza en specs/ los requisitos afectados y propón el texto nuevo, con sus
   identificadores. No toques código todavía.
2. Cuando lo apruebe: actualiza specs/, añade un ADR, ajusta las pruebas y después
   el código.
3. Verifica con `./mvnw verify` y dime cómo probar el cambio a mano.
```

### Prompt de auditoría final

```text
Audita LiteDD contra specs/. No corrijas nada hasta que te lo diga.

1. Recorre cada identificador de requisito y dime si está implementado, qué prueba
   lo cubre y en qué fichero. Lista los huecos.
2. Revisa las cuatro capas de solo lectura (S-01 a S-06) e intenta saltártelas con
   pruebas nuevas.
3. Busca en todo el repositorio, historial de git incluido: usuarios, contraseñas,
   rutas /home, nombres de máquina y nombres de esquema distintos de litedd_demo y
   litedd_it.
4. Comprueba que la aplicación no hace ninguna petición a internet.
5. Entrega un informe con tres listas: huecos, riesgos y mejoras opcionales.
```

## Casos límite y pruebas obligatorias

Cada caso de esta lista es una prueba automática con su identificador. El Sprint 3 no se cierra sin los casos T-01 a T-28.

### Motor SQL

| ID | Caso | Resultado esperado |
|---|---|---|
| T-01 | `#{a}` con el campo vacío | El parámetro es null |
| T-02 | `<if test="a != null">` con a vacío y con valor | Fragmento omitido; fragmento incluido |
| T-03 | `<where>` con todos los `<if>` falsos; con el primero falso y el segundo cierto | Sin WHERE; AND inicial eliminado |
| T-04 | `#{n,int}` con «12» y con «abc» | Integer 12; error Q-93 sin ejecutar |
| T-05 | `#{n, javaType=int}` | Equivale a `#{n,int}` |
| T-06 | `<foreach>` con «1, 2,3» y con vacío | Tres parámetros; variable null |
| T-07 | Variable que solo aparece en test, tipada con comentario XML | Aparece en el formulario con ese tipo |
| T-08 | Mismo nombre con dos tipos distintos | Error Q-92 |
| T-09 | `${col}` | Sustitución textual; aparece como campo |
| T-10 | `<choose>`, `<otherwise>`, `<trim>` y `<bind>` | Mismo SQL que genera MyBatis |
| T-11 | `<` sin escapar; el mismo SQL dentro de CDATA | Error Q-90 con línea y columna; válido |
| T-12 | Contenido envuelto en `<select id="x">`; dos `<select>` | Se usa el cuerpo; error |
| T-13 | `<include refid="x"/>` | Error «no admitido» |
| T-14 | `SELECT 1; SELECT 2`; `SELECT ';'`; `SELECT 1;` | Error Q-94; válida; válida |
| T-15 | UPDATE, INSERT, DELETE, REPLACE, DROP, ALTER, TRUNCATE, SET, CALL, LOAD DATA | No ejecutables; se genera el SQL final |
| T-16 | Comentario inicial más SELECT; `(SELECT …) UNION (SELECT …)`; `WITH … SELECT` | Ejecutables |
| T-17 | `WITH x AS (…) UPDATE …` y `WITH x AS (…) DELETE …` | No ejecutables |
| T-18 | `SELECT … INTO OUTFILE`; `SELECT … FOR UPDATE`; `SELECT 'for update'` | Error Q-95; error Q-95; válida |
| T-19 | Página 1 de tamaño 20; ordenar por la segunda columna descendente | Sufijo `LIMIT 21 OFFSET 0`; `ORDER BY 2 DESC` antes del límite |
| T-20 | Nota que termina en `ORDER BY x`; nota con LIMIT propio | Solo se añade LIMIT; se envuelve |
| T-21 | ORDER BY o LIMIT dentro de una subconsulta o de una cadena | No cuentan como finales |
| T-22 | Columnas a.id y b.id en la misma consulta | Paginación y orden correctos; «Contar» usa streaming |
| T-23 | 21 filas disponibles con tamaño 20; 5 filas disponibles | hasMore cierto y 20 filas; total 5 |
| T-24 | «Sin límite» con más de 10.000 filas | 10.000 filas y capReached cierto |
| T-25 | SQL con valores: cadena con comilla y contrabarra, null, número, lista | Escapado de MySQL correcto; NULL; sin comillas; lista expandida |
| T-26 | Fecha cero, BLOB, texto de 50.000 caracteres, BIT, TINYINT(1), DECIMAL, JSON | Se muestran según Q-62 a Q-64, sin excepción |
| T-27 | Tiempo agotado y cancelación | La conexión vuelve al pool y la siguiente consulta funciona |
| T-28 | Conexión cortada entre dos ejecuciones | Un reintento transparente (Q-47) |

### Notas y datos

| ID | Caso | Resultado esperado |
|---|---|---|
| T-40 | Mover una nota dentro de una descendiente | Rechazado por el servidor |
| T-41 | Mover, eliminar y restaurar varias veces | Posiciones de hermanas contiguas desde 0 |
| T-42 | Eliminar una nota con hijas usando children=promote | Las hijas ocupan su lugar, en orden |
| T-43 | Restaurar una nota cuya madre fue eliminada | Va a la raíz |
| T-44 | Dos guardados con la misma versión base | El segundo recibe 409 |
| T-45 | Búsqueda con comillas, guiones, asteriscos y `#{` | Sin error |
| T-46 | Importar un ZIP con una ruta `../` | Rechazado sin cambios en los datos |
| T-47 | Título con barra o emoji, exportado e importado | Nombre de fichero saneado; título intacto |
| T-48 | `VACUUM INTO` seguido de búsqueda sobre la copia | El índice de texto completo sigue siendo coherente |

## Futuro

Estas funciones se han aplazado a propósito. No se implementan en la versión 1 y cada una exige ampliar antes la especificación.

- Fragmentos reutilizables con `<include>` y notas de tipo fragmento.
- Autocompletado de tablas y columnas a partir de information_schema.
- Explorador de esquema: tablas, columnas e índices.
- Bloques SQL ejecutables dentro de notas Markdown.
- Exportar resultados a CSV.
- Eliminado en cascada.
- Varias conexiones.
- Distinguir cadena vacía de null en las variables.
- Casillas de tareas marcables en modo consulta.
- Tema claro.
