# LiteDD

LiteDD es un gestor local de notas para un único usuario. Admite dos tipos de nota:

- **Markdown**, con vista renderizada, tablas, listas de tareas, código resaltado y diagramas Mermaid.
- **SQL**, escritas con la sintaxis dinámica de MyBatis (`#{...}`, `<if>`, `<where>`, `<foreach>`…). Se ejecutan en modo de solo lectura contra una base de datos MySQL, con un formulario de variables, paginación, ordenación y cronómetro.

Las notas se organizan en un árbol jerárquico y se abren en pestañas. Todo se guarda en un único fichero SQLite en la máquina local. La aplicación no hace llamadas a internet.

> Estado: en desarrollo. Esta versión solo contiene el esqueleto (Sprint 0).

## Requisitos

- JDK 21
- Node.js 24 o superior (solo para compilar)
- Para las notas SQL: un servidor MySQL 8.4 accesible en local

## Compilar y probar

```bash
./mvnw verify
```

Compila el backend y la interfaz y ejecuta todas las pruebas. Con `-Dskip.frontend` se omite la interfaz.

## Desarrollo

```bash
scripts/dev.sh
```

Arranca el servidor en `http://127.0.0.1:47600/` y la interfaz con recarga en caliente en `http://127.0.0.1:5173/`.

## Especificación

La especificación completa está en [`specs/`](specs/). El desarrollo sigue un método guiado por especificación: cada funcionalidad tiene un requisito con identificador y al menos una prueba que lo cita.

## Licencia

[MIT](LICENSE)
