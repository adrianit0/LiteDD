# Sprint 3: Motor SQL y conexión

## Objetivo

Motor SQL y conexión a MySQL, con interfaz mínima.

## Requisitos cubiertos

S-01 a S-06, S-20 a S-22, Q-01 a Q-17, Q-30 a Q-33, Q-51 a Q-58, C-01 a C-11

Documentos: [requisitos/sql.md](../requisitos/sql.md), [requisitos/seguridad.md](../requisitos/seguridad.md), [requisitos/conexion.md](../requisitos/conexion.md), [requisitos/casos-limite.md](../requisitos/casos-limite.md), [requisitos/api.md](../requisitos/api.md).

## Tareas

1. Pruebas T-01 a T-28 escritas antes del código.
2. sqlengine: analizador léxico propio (Q-58), detección de `;` (S-03, Q-05), clasificación (S-01, S-02).
3. sqlengine: análisis de variables y tipos (Q-10 a Q-17), envoltorio y validación XML (Q-01 a Q-06).
4. sqlengine: renderizado con MyBatis y caché de SqlSource (Q-30 a Q-33); conversión de valores.
5. sqlengine: paginación, orden y conteo (Q-51 a Q-58); SQL con valores escapado para MySQL.
6. mysql: pool HikariCP de solo lectura (S-04, C-05 a C-08), ejecución, tiempo máximo, cancelación y reintento (S-05, Q-47).
7. Conexión: `connection.json` con permisos 600 (S-20 a S-22), API `/api/connection/*` y estado (C-01 a C-11).
8. API `/api/sql/analyze`, `execute`, `count`, `render`, `cancel`.
9. Interfaz mínima: diálogo de conexión y estado en la barra superior.
10. Perfil `-Pit` con pruebas contra MySQL real sobre el esquema `litedd_it`.

## Criterios de aceptación

- Pasan todas las pruebas de la sección «Casos límite y pruebas obligatorias».
- El diálogo de conexión prueba, lista esquemas, guarda y muestra el estado en la barra.
- Con el perfil `-Pit`, un UPDATE es rechazado por la clasificación y, forzando su envío en la prueba, también por la sesión de solo lectura.
- `POST /api/sql/execute` devuelve una página de una consulta de demostración con variables.

## Resultado

Fecha: 2026-10-04.

### Hecho

- **`sqlengine`** (100 pruebas sin base de datos):
  - Analizador léxico propio para cadenas, identificadores, comentarios, comentarios ejecutables y paréntesis (Q-58).
  - Preparación de la nota: XML sin DTD ni entidades externas, con línea y columna en los errores (Q-04, Q-90); un único envoltorio (Q-02); `<include>` rechazado (Q-03).
  - Variables y tipos de Q-10 a Q-17, con tipado por comentario (ADR-0011).
  - Conversión de valores con null para los vacíos (Q-21, Q-22, Q-31).
  - Renderizado con MyBatis 3.5.14 real y caché por SHA-256 (Q-30 a Q-33).
  - Una sola sentencia, comprobada sobre el SQL ya renderizado (S-03, Q-05). Clasificación (S-01, S-02), incluida la regla de EXPLAIN ANALYZE (ADR-0011).
  - Paginación, orden y conteo (Q-51 a Q-57) y SQL con valores con el escapado de MySQL (Q-72).
- **`mysql`:**
  - `connection.json` con permisos 600 en POSIX (S-20).
  - URL de C-05 con los parámetros peligrosos prohibidos (ADR-0012).
  - Pool HikariCP de solo lectura, validado en cada préstamo (S-04, C-07, C-08).
  - Ejecución JDBC directa con tiempo máximo, cancelación, recorte de celdas y binarios (S-05, Q-32, Q-41, Q-61 a Q-64).
  - Reintento cuando una conexión se rompe durante el uso (Q-47).
  - Estado de la conexión (C-09, C-10); cambiar la conexión cancela lo que está en curso (C-11).
  - API `/api/sql/*` y `/api/connection/*`. Sin contraseña en la API (S-21) y sin valores en el registro, con el SQL solo en depuración (S-22).
- **Interfaz mínima:** diálogo «Conexión» con prueba, lista de esquemas y selección automática si solo hay uno (C-01, C-03, C-04). Estado en la barra superior, que abre el diálogo, con botón «Reconectar» (C-02, C-09, C-10).
- **Pruebas:** 189 de backend (una omitida en Windows: permisos POSIX) y 119 de interfaz. Además, 13 pruebas contra MySQL real en el perfil `-Pit`.

### Criterios de aceptación

1. **Casos T-01 a T-28:** T-01 a T-21, T-23, T-24 y T-25 tienen pruebas sin base de datos y **pasan**. T-22 y T-26 a T-28 (y también T-23 y T-24 de extremo a extremo) están en `MySqlIntegrationTest` y **quedan pendientes de ejecutar en Ubuntu** (ADR-0013).
2. **Diálogo de conexión:** probado con la aplicación arrancada contra un puerto cerrado. Muestra el error, no deja guardar sin esquema y, tras guardar, la barra pasa a «Desconectado · lector@127.0.0.1/litedd_demo» con «Reconectar». La lista de esquemas y la selección automática están cubiertas por pruebas de interfaz; contra un MySQL real, **pendiente en Ubuntu**.
3. **Con `-Pit`, un UPDATE rechazado** por la clasificación y por la sesión de solo lectura: la clasificación **pasa** (también por la API sin servidor: S-06). El rechazo por la sesión está en `s04_update_rejected_by_classification_and_by_read_only_session`, **pendiente en Ubuntu**.
4. **`POST /api/sql/execute` con una consulta de demostración con variables:** `sprint3_q32_demo_query_with_variables_returns_a_page_through_jdbc`, **pendiente en Ubuntu**. Sin servidor, `render` devuelve el SQL final con los parámetros tipados, y `execute` devuelve `not_connected` (Q-98).

### Pendiente

- Ejecutar en Ubuntu, con un MySQL 8.4 y un usuario de pruebas:
  `LITEDD_IT_HOST=127.0.0.1 LITEDD_IT_PORT=3306 LITEDD_IT_USER=<usuario> LITEDD_IT_PASSWORD=<contraseña> ./mvnw -Pit verify`
  Las pruebas crean el esquema `litedd_it` y lo borran al terminar; el usuario necesita permiso para crear esquemas y para KILL sobre sus propias conexiones.
- Recorrer el diálogo «Conexión» contra ese servidor.
- El tiempo máximo y el tope de filas pasan a ser ajustes en el Sprint 6 (ADR-0012).

### Desviaciones y decisiones

- ADR-0011: EXPLAIN ANALYZE solo con consultas; los comentarios `/*! */` no se admiten; un comentario tipado no crea un campo.
- ADR-0012: contraseña vacía conserva la guardada; además de `allowMultiQueries`, se rechazan `autoReconnect` y `allowLoadLocalInfile`; validación en cada préstamo; arranque sin MySQL; permisos 600 solo en POSIX; tiempo máximo y tope como constantes hasta el Sprint 6.
- ADR-0013: las pruebas contra MySQL se ejecutan en Ubuntu.
- Q-47: solo se reintenta si la conexión se rompe durante el uso. Si el pool no consigue ninguna, reintentar solo duplicaría la espera de 5 s.
- Los valores de una lista no admiten elementos vacíos («1,,2» es un error de Q-93).
- En la API, `pageSize: null` significa «Sin límite» (Q-55).

### Cómo probarlo a mano

1. `./mvnw verify` → BUILD SUCCESS. En Ubuntu, además, el comando `-Pit` de arriba.
2. Arrancar LiteDD y pulsar el indicador de la barra superior. Rellenar host, puerto, usuario y contraseña y pulsar «Probar conexión»: aparece la lista de esquemas, y si solo hay uno queda elegido. Guardar.
3. La barra muestra «usuario@host/esquema». Parar MySQL y pulsar el indicador: «Probar conexión» falla con el motivo; tras guardar se ve «Desconectado» con «Reconectar».
4. Crear una nota SQL con el ejemplo de la especificación sobre `litedd_demo` y llamar a la API con el token de la página:
   `POST /api/sql/analyze` con `{"content": "…"}` muestra title (string), minYear (int) y authorIds (list).
   `POST /api/sql/execute` con `{"noteId":"…","version":N,"values":{"minYear":"1990"},"page":1,"pageSize":20}` devuelve la página.
5. Una nota con `UPDATE book SET title = #{t}`: `execute` devuelve `kind: "statement"`, el aviso y el SQL con valores, sin tocar la base de datos.
