# ADR-0001: Versiones fijadas

- Estado: aceptada
- Fecha: 2026-10-04
- Requisitos: tabla «Stack» de `diseno/arquitectura.md`

## Contexto

La especificación fija algunas versiones (MyBatis 3.5.14, Maven 3.9.x, Javalin 7.2.x, mysql-connector-j 9.x, JUnit 5) y pide fijar el resto en el Sprint 0 con la última estable.

## Decisión

Se usan versiones exactas, sin rangos. Las de la interfaz se fijan sin `^` en `package.json` y se instalan con `npm ci` desde `package-lock.json`.

### Entorno

| Pieza | Versión |
|---|---|
| JDK | 21 (LTS) |
| Node.js | 24 o superior |
| Maven Wrapper | 3.3.4 (`only-script`) |
| Maven | 3.9.16 |

### Backend (`pom.xml`)

| Dependencia | Versión | Nota |
|---|---|---|
| io.javalin:javalin | 7.2.3 | Última 7.2.x |
| com.fasterxml.jackson.core:jackson-databind | 2.22.3 | Serializador JSON de Javalin (ADR-0002) |
| org.mybatis:mybatis | 3.5.14 | Fijada por la especificación |
| com.mysql:mysql-connector-j | 9.7.0 | Última 9.x |
| com.zaxxer:HikariCP | 7.1.0 | |
| org.xerial:sqlite-jdbc | 3.53.4.0 | Incluye FTS5 |
| org.slf4j:slf4j-api | 2.0.20 | |
| ch.qos.logback:logback-classic | 1.6.5 | |
| org.junit:junit-bom | 5.14.4 | Última 5.x; la especificación pide JUnit 5 |
| org.assertj:assertj-core | 3.27.7 | |

| Plugin | Versión |
|---|---|
| maven-compiler-plugin | 3.16.0 |
| maven-resources-plugin | 3.5.0 |
| maven-surefire-plugin | 3.6.0 |
| exec-maven-plugin | 3.6.4 |

### Interfaz instalada en el Sprint 0 (`frontend/package.json`)

| Paquete | Versión |
|---|---|
| react, react-dom | 19.3.0 |
| typescript | 7.0.2 |
| vite | 8.3.2 |
| @vitejs/plugin-react | 6.1.1 |
| vitest | 5.0.3 |
| jsdom | 30.1.1 |
| @testing-library/react | 16.3.3 |
| @testing-library/dom | 10.4.2 |
| @types/react, @types/react-dom | 19.3.0 |

### Interfaz fijada ahora, a instalar en el sprint que la use

Por la constitución (punto 2) no se instalan antes de usarse, pero la versión queda fijada aquí.

| Paquete | Versión | Sprint |
|---|---|---|
| zustand | 5.0.15 | 1 |
| @codemirror/language | 6.12.4 | 1 |
| @codemirror/commands | 6.11.1 | 1 |
| @lezer/highlight | 1.2.5 | 1 |
| @codemirror/state | 6.7.6 | 1 |
| @codemirror/view | 6.43.13 | 1 |
| @codemirror/lang-markdown | 6.5.2 | 1 |
| @codemirror/lang-sql | 6.10.0 | 3 |
| @codemirror/autocomplete | 6.20.3 | 5 |
| markdown-it | 15.0.2 | 1 |
| @types/markdown-it | 14.2.0 | 1 |
| highlight.js | 11.12.0 | 1 |
| dompurify | 3.4.16 | 1 |
| @tanstack/react-virtual | 3.14.13 | 1 |
| @dnd-kit/core | 6.3.1 | 2 |
| @dnd-kit/sortable | 10.0.0 | 2 |
| mermaid | 12.1.0 | 5 |

## Cambios

- 2026-10-04, Sprint 1: no se usa el paquete agregado `codemirror` (su `basicSetup` trae funciones que no se piden). En su lugar se usan los subpaquetes `@codemirror/language` y `@codemirror/commands` (indentación y atajos de lista) y `@lezer/highlight` (colores del tema oscuro).

- 2026-10-04, Sprint 5: se añade `@codemirror/autocomplete` para el autocompletado de `[[` (N-90, ADR-0016).

## Consecuencias

Actualizar una versión exige editar este ADR o añadir uno nuevo.
