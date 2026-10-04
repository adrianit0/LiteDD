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

_Pendiente._
