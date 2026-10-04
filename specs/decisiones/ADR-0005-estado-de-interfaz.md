# ADR-0005: Ajustes en config.json y estado de interfaz en la tabla setting

- Estado: aceptada (2026-10-04)
- Requisitos: N-01, U-01, U-10, «Rutas en disco», tabla `setting`

## Contexto

La especificación tiene dos sitios para «ajustes»: el fichero `~/.config/litedd/config.json` y la tabla `setting` de SQLite. No dice qué va en cada uno. N-01 (plegado) y U-01 (ancho del panel) piden recordar estado de interfaz.

## Decisión

- `config.json` guarda los ajustes de la pantalla «Ajustes» (U-10): tamaño de página por defecto, tope de filas, tiempo máximo, puerto y apagado automático. Algunos, como el puerto, hacen falta antes de abrir la base de datos.
- La tabla `setting` guarda el estado de interfaz: nodos plegados (`ui.collapsed`), ancho del panel (`ui.sidebarWidth`) y su visibilidad (`ui.sidebarVisible`). El valor es JSON.
- `GET /api/settings` devuelve las claves de la tabla `setting` como objeto JSON; `PUT /api/settings` recibe un objeto con las claves que cambian. Las claves cumplen `[A-Za-z0-9._-]{1,100}`. En el Sprint 6 la ruta incorporará también los ajustes de `config.json`.

## Consecuencias

El estado de interfaz viaja con la base de datos y sus copias, pero no con la exportación (X-04 excluye los ajustes).
