# Requisitos de seguridad

> Extraído de `specs/ESPECIFICACION.md`. Si este fichero y aquel difieren tras un cambio aprobado, manda este y se registra un ADR.

LiteDD nunca modifica la base de datos consultada, aunque la conexión use un usuario con todos los privilegios. Esto se garantiza con cuatro capas independientes; cada una tiene sus propias pruebas.

## Solo lectura

| ID | Requisito |
|---|---|
| S-01 | Clasificación: tras renderizar, se eliminan comentarios y se mira la primera palabra clave. Solo se ejecutan SELECT, WITH (que desemboca en SELECT), SHOW, DESCRIBE, DESC y EXPLAIN. |
| S-02 | Se rechazan aunque empiecen por SELECT: INTO OUTFILE, INTO DUMPFILE, INTO @variable, FOR UPDATE, FOR SHARE y LOCK IN SHARE MODE. |
| S-03 | Una sola sentencia: el driver se configura con `allowMultiQueries=false` y, además, un detector propio rechaza cualquier `;` que separe sentencias fuera de cadenas y comentarios. |
| S-04 | Sesión de solo lectura: cada conexión del pool ejecuta `SET SESSION TRANSACTION READ ONLY` al crearse y se marca con `setReadOnly(true)`. El servidor rechaza cualquier escritura. |
| S-05 | Límites: tiempo máximo por consulta de 30 s (configurable), cancelación manual y LIMIT siempre presente en las consultas paginables. |
| S-06 | Una sentencia no ejecutable nunca llega al driver: se muestra el SQL final y un aviso. |

## Servidor local

| ID | Requisito |
|---|---|
| S-10 | El servidor escucha solo en 127.0.0.1. |
| S-11 | Se valida la cabecera Host (`127.0.0.1:puerto` o `localhost:puerto`); cualquier otra se rechaza con 403. |
| S-12 | Al arrancar se genera un token aleatorio. Se entrega en el HTML inicial y es obligatorio en la cabecera `X-LiteDD-Token` de toda llamada a `/api`. |
| S-13 | Se valida Origin en las peticiones que modifican estado. No se emiten cabeceras CORS. |
| S-14 | Cabecera CSP: `default-src 'self'`; imágenes `'self'` y `data:`. Ningún recurso se carga de internet: todo va empaquetado. |
| S-15 | El HTML generado desde Markdown se sanea con DOMPurify. Mermaid se configura con `securityLevel: 'strict'`. |
| S-16 | Sin telemetría ni llamadas a servicios externos. Las notas HTTP solo llaman a 127.0.0.1, localhost o ::1 (H-40, H-41). |

## Credenciales y registro

| ID | Requisito |
|---|---|
| S-20 | La contraseña de MySQL se guarda solo en connection.json y la de las notas HTTP solo en http.json, los dos con permisos 600. Nunca en SQLite, en la exportación ni en el registro. |
| S-21 | La API no devuelve ninguna contraseña; solo indica si hay una guardada. |
| S-22 | El registro no contiene valores de variables ni filas de resultado. El SQL se registra solo en nivel de depuración. |

## Reglas del repositorio público

| ID | Requisito |
|---|---|
| S-30 | Ningún dato real: ni nombres de esquemas, tablas o columnas, ni consultas de bases de datos reales. |
| S-31 | Ejemplos y pruebas usan el esquema inventado litedd_demo con las tablas author, book y loan. |
| S-32 | Sin nombres de máquina, usuarios, contraseñas ni rutas personales. Los ejemplos usan marcadores. |
| S-33 | El README describe qué hace la aplicación de forma genérica. No menciona su origen, su motivo ni otros proyectos. |
| S-34 | .gitignore excluye datos, configuración, registros, `*.db`, exportaciones `*.zip` y `.env`. |
| S-35 | Mensajes de commit neutros y en español. |
