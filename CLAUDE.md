# CLAUDE.md

Instrucciones operativas para trabajar en LiteDD. La fuente de verdad es `specs/`; este fichero solo resume.

## Comandos

| Acción | Comando |
|---|---|
| Build completo y todas las pruebas | `./mvnw verify` (en Windows también `mvnw.cmd verify`) |
| Solo backend | `./mvnw -Dskip.frontend verify` |
| Una prueba de backend | `./mvnw -Dskip.frontend test -Dtest=HttpServerTest` |
| Pruebas de interfaz | `cd frontend && npm test` |
| Arrancar en desarrollo | `scripts/dev.sh` (Git Bash en Windows) → interfaz en http://127.0.0.1:5173/ |
| Arrancar con la interfaz empaquetada | `./mvnw verify` y después `./mvnw -Dskip.frontend compile exec:java -Dexec.mainClass=dev.litedd.Main -Dexec.args=--no-window` → http://127.0.0.1:47600/ |
| Imagen de aplicación | `./mvnw -Pdist package` → `target/dist/litedd` (en Windows, parar antes cualquier instancia que la use) |
| Instalar / desinstalar (Ubuntu) | `scripts/install.sh` / `scripts/uninstall.sh` |
| Instalar en Ubuntu sin Maven | `scripts/install.sh litedd.jar` con el JAR de `target/dist/input/` (ADR-0018) |
| Apagar la instancia en marcha | `litedd --stop` |
| Datos aislados para pruebas manuales | `XDG_DATA_HOME`, `XDG_CONFIG_HOME` y `XDG_STATE_HOME` apuntando a una carpeta temporal |
| Pruebas contra MySQL real (Sprint 3+) | `./mvnw -Pit verify` con `LITEDD_IT_HOST`, `LITEDD_IT_PORT`, `LITEDD_IT_USER`, `LITEDD_IT_PASSWORD` |

Plataforma: se desarrolla en Windows 10 y se ejecuta en Ubuntu 22.04 (ADR-0004). El build y las pruebas deben pasar en los dos.

## Constitución (resumen de `specs/constitucion.md`)

1. La especificación manda: se corrige primero `specs/` y después el código.
2. Nada fuera de alcance: ni funciones, ni dependencias, ni ajustes no pedidos.
3. Solo lectura inviolable: nada que modifique datos o estructura llega a MySQL.
4. Los datos no salen de la máquina: sin red externa, telemetría ni CDN.
5. Repositorio público: reglas S-30 a S-35 (solo el esquema inventado `litedd_demo`; sin máquinas, usuarios, contraseñas ni rutas personales).
6. Los datos del usuario no se pierden: transacciones, copia previa y guardado automático.
7. Simplicidad: sin Spring y sin abstracciones sin dos usos reales.
8. Cada requisito tiene al menos una prueba que cita su identificador.
9. Ante una ambigüedad, se pregunta y se registra la respuesta como ADR.

## Convenciones

- Código, identificadores, tablas y rutas de API en **inglés**. Paquete raíz `dev.litedd`.
- Textos de interfaz, especificaciones y mensajes de commit en **español**, neutros.
- Las pruebas citan el identificador del requisito en su nombre (`s11_rejects_foreign_host_header`, `it('N-40 …')`).
- Decisiones nuevas: `specs/decisiones/ADR-NNNN-titulo.md`.

## Estructura

- `specs/`: especificación (`ESPECIFICACION.md` es la referencia original y no se modifica), constitución, requisitos, diseño, sprints y ADR.
- `src/main/java/dev/litedd/`: backend (Javalin). `src/main/resources/db/migration/`: migraciones SQLite.
- `frontend/`: interfaz React + TypeScript + Vite. Maven la construye y la copia a `web/` dentro del JAR.
- `scripts/`, `packaging/`: arranque en desarrollo, instalación y lanzador.

## Flujo de un sprint

1. Leer CLAUDE.md, `specs/constitucion.md` y `specs/sprints/sprint-0N.md`, con los requisitos y diseños que cita y el «Resultado» del sprint anterior.
2. Revisar el plan de tareas, presentarlo y esperar aprobación.
3. Escribir las pruebas de cada requisito y después el código (primero motor SQL y operaciones de árbol).
4. Verificar: `./mvnw verify` en verde y criterios de aceptación recorridos con la aplicación arrancada.
5. Registrar cada decisión nueva como ADR y actualizar la especificación si cambió.
6. Rellenar «Resultado» en el fichero del sprint y hacer commits pequeños en español.
