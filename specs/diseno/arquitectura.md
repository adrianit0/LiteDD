# Arquitectura

> Extraído de `specs/ESPECIFICACION.md`. Si este fichero y aquel difieren tras un cambio aprobado, manda este y se registra un ADR.

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
- `scripts/install.sh litedd.jar` instala desde el JAR único sin Maven: genera la imagen con el `jpackage` del JDK 21 local o, si no lo hay, ejecuta el JAR con el Java 21 instalado (ADR-0018).
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

## Método de desarrollo

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
