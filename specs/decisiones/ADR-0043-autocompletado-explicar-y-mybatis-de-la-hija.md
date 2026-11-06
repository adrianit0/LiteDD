# ADR-0043: Autocompletado de tablas y columnas, «Explicar» y MyBatis de las hijas

- Estado: aceptada (2026-11-06)
- Requisitos: Q-48, Q-84, Q-85, M-25

## Contexto

Escribir consultas obliga a recordar o buscar los nombres de tablas y columnas del esquema. Para saber si una consulta usa índices, el usuario copia el SQL final a otra herramienta y lanza un EXPLAIN. Y en las hijas generadas de una nota XML (M-11), que no tienen modo edición (M-20), no se ve el cuerpo MyBatis que se ejecuta: solo el SQL final tras ejecutar.

## Decisión

Petición del usuario (2026-11-06):

1. **Autocompletado** de tablas y columnas leyendo `information_schema`. Es solo lectura (principio 3).
2. **Botón «Explicar»**: lanza un EXPLAIN del SQL final sin tocar la nota.
3. **Hijas de una nota XML**: que se pueda ver su parte MyBatis extraída del XML.

Detalles elegidos al implementarlo:

- **Origen del autocompletado:** una ruta nueva, `GET /api/sql/schema`, lee `information_schema.COLUMNS` del esquema de la conexión (`TABLE_SCHEMA = DATABASE()`) con una conexión del pool, que es de solo lectura (S-04). La sentencia es fija y no depende de lo que escribe el usuario. Incluye las vistas, porque también tienen columnas. Sin esquema elegido, la lista está vacía.
- **Caché:** la interfaz pide el esquema la primera vez que se abre un editor SQL o XML y lo guarda en memoria. Lo vuelve a pedir cuando cambia la conexión (usuario, máquina, esquema o estado) y si la petición anterior falló. No se guarda en disco.
- **Dónde:** en el editor de las notas SQL y de las notas XML MyBatis. Se usa `schemaCompletionSource` de `@codemirror/lang-sql`, que ya es dependencia: propone tablas al escribir y, tras `tabla.` o `alias.`, las columnas de esa tabla. Solo se completan tablas y columnas; no palabras clave, para no añadir nada que no se ha pedido (principio 2). Si no hay conexión, no se propone nada y el editor funciona igual.
- **«Explicar»:** una ruta nueva, `POST /api/sql/explain`, con la misma petición que ejecutar (A-04). Envía `EXPLAIN ` seguido del SQL final con parámetros, sin la paginación de LiteDD, con los valores del formulario, el tiempo máximo y el tope de filas. Solo se ofrece para consultas (SELECT y WITH); con SHOW, DESCRIBE, EXPLAIN o una sentencia no ejecutable (Q-45, M-23) el botón está desactivado y la ruta responde 400. Se usa el EXPLAIN tradicional en tabla: EXPLAIN ANALYZE ejecutaría la consulta.
- **Resultado de «Explicar»:** se muestra en un panel propio, «Plan de ejecución», encima de los resultados y con una «×» para cerrarlo. No sustituye los resultados de la última ejecución ni recuerda los valores (Q-24 es solo para ejecutar). Los errores se muestran como los de ejecutar (Q-96 a Q-98).
- **MyBatis de la hija:** en consulta, las hijas generadas tienen un panel plegable «MyBatis», cerrado por defecto, encima del formulario. Muestra el contenido de la hija tal como se genera (M-11): el cuerpo de la sentencia con los `<include>` ya resueltos, resaltado como el mapper y con botón «Copiar». Así se ve exactamente lo que LiteDD ejecuta, incluidos los fragmentos de otros mappers (ADR-0025). Las notas SQL normales no lo necesitan: su contenido se ve en edición.

## Consecuencias

- Hay dos rutas nuevas. Ninguna sentencia nueva modifica datos: una lee `information_schema` y la otra antepone `EXPLAIN` a una consulta ya clasificada como ejecutable (S-01, S-02). La sesión sigue siendo de solo lectura (S-04).
- Ningún destino nuevo (constitución, punto 4) y ninguna dependencia nueva.
- El nombre de tablas y columnas viaja solo entre el servidor local y la interfaz; no se guarda ni se registra (S-22).
