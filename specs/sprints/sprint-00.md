# Sprint 0: Arranque

## Objetivo

Estructura, especificaciones divididas y esqueleto que arranca.

## Requisitos cubiertos

S-10 a S-16, S-30 a S-35

Documentos: [requisitos/seguridad.md](../requisitos/seguridad.md), [diseno/arquitectura.md](../diseno/arquitectura.md).

## Tareas

1. Comprobar el entorno: Java 21 y Node 24 o superior.
2. Crear la estructura del repositorio descrita en «Estructura».
3. Dividir `ESPECIFICACION.md` en constitución, requisitos y diseño sin perder ni añadir identificadores.
4. Generar `sprint-00.md` … `sprint-06.md`.
5. Escribir `CLAUDE.md`.
6. Maven Wrapper y `pom.xml` con las versiones de «Stack».
7. Servidor Javalin en 127.0.0.1 con `GET /api/health` y las protecciones S-10 a S-14.
8. Interfaz Vite + React + TypeScript con tema oscuro y pantalla vacía «LiteDD» (S-15 y S-16 quedan como reglas para los sprints que traen Markdown y Mermaid).
9. Build de la interfaz integrado en Maven; `scripts/dev.sh`.
10. Una prueba de backend y una de interfaz.
11. `README.md` genérico, `LICENSE` (MIT) y `.gitignore` (S-33, S-34).
12. ADR-0001 con las versiones fijadas.

## Criterios de aceptación

- `./mvnw verify` termina en verde con una prueba de backend y una de interfaz.
- `scripts/dev.sh` muestra una pantalla vacía con el tema oscuro y `GET /api/health` responde.
- specs/ contiene constitución, requisitos, diseño y los siete ficheros de sprint.
- Una petición con Host distinto de 127.0.0.1 o sin token recibe 403.

## Resultado

Fecha: 2026-10-04.

### Hecho

- Estructura del repositorio, `specs/ESPECIFICACION.md` y su división en `constitucion.md`, `requisitos/` y `diseno/`. Se ha comprobado con un script que los 230 identificadores del original están en los ficheros divididos.
- Ficheros de sprint 00 a 06, `CLAUDE.md`, `README.md`, `LICENSE` (MIT), `.gitignore` y `.gitattributes`.
- Maven Wrapper 3.3.4 con Maven 3.9.16; `pom.xml` con las versiones del ADR-0001.
- Servidor Javalin en 127.0.0.1:47600 con `GET /api/health`, Host (S-11), token (S-12), Origin y sin CORS (S-13), CSP (S-14) y errores con el formato de A-02.
- Interfaz Vite + React + TypeScript con tema oscuro (variables CSS de U-02) y pantalla vacía «LiteDD». Maven ejecuta `npm ci`, `npm run build` y `npm test`, y copia `frontend/dist` a `web/` dentro del JAR.
- `scripts/dev.sh`: backend en 47600 y Vite en 5173, con proxy de `/api`.
- Pruebas: `HttpServerTest` (9 casos: health, S-10, S-11, A-02, S-12, S-13, S-14) y `App.test.tsx`.

### Criterios de aceptación

- `./mvnw verify` en verde: 9 pruebas de backend y 1 de interfaz.
- `scripts/dev.sh` muestra la pantalla vacía oscura en http://127.0.0.1:5173/ y `GET /api/health` responde `{"app":"LiteDD","version":"0.1.0"}`, directo y a través del proxy.
- `specs/` contiene constitución, requisitos, diseño y los siete ficheros de sprint.
- Host `evil.example` → 403; `/api/tree` sin token → 403 con cuerpo A-02. Comprobado con curl y en las pruebas.
- Servida desde el backend (http://127.0.0.1:47600/), la página carga con CSP y sin errores en consola.

### Pendiente

- S-15 (DOMPurify y Mermaid estricto) y S-16 son reglas para los sprints 1 y 5; en este sprint no se carga nada externo.
- S-30 a S-35: se aplican de forma continua; la auditoría final las revisa.
- `packaging/`, `install.sh` y `uninstall.sh` llegan en el Sprint 6; `packaging/` existe vacío con `.gitkeep`.
- El registro en fichero con rotación se deja para el Sprint 6; ahora solo hay consola.

### Desviaciones y decisiones

- ADR-0002 (aceptada): Jackson como serializador JSON de Javalin.
- ADR-0003 (aceptada): token compartido en desarrollo con `LITEDD_DEV_TOKEN`, reescritura de Origin en el proxy de Vite y peticiones sin Origin aceptadas.
- ADR-0004: desarrollo en Windows, ejecución en Ubuntu.
- `requisitos/casos-limite.md` recoge los casos T-xx, que no encajaban en la lista de ficheros de requisitos.
- La línea de autoría del documento original no se ha copiado a `ESPECIFICACION.md` (S-32).
- La rama principal es `main`. Los ficheros del IDE quedan fuera del repositorio.

### Cómo probarlo a mano

1. `./mvnw verify` → BUILD SUCCESS.
2. `scripts/dev.sh` y abrir http://127.0.0.1:5173/ → pantalla oscura con «LiteDD».
3. `curl http://127.0.0.1:47600/api/health` → firma y versión.
4. `curl -H "Host: evil.example" http://127.0.0.1:47600/api/health` → 403.
5. `curl http://127.0.0.1:47600/api/tree` → 403 por falta de token.
