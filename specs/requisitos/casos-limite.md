# Casos límite y pruebas obligatorias

> Extraído de `specs/ESPECIFICACION.md`. Si este fichero y aquel difieren tras un cambio aprobado, manda este y se registra un ADR.

Cada caso de esta lista es una prueba automática con su identificador. El Sprint 3 no se cierra sin los casos T-01 a T-28.

## Motor SQL

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

## Notas y datos

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
