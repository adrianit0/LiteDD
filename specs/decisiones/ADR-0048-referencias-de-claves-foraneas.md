# ADR-0048: Referencias de claves foráneas en la tabla de resultados

- Estado: aceptada (2026-11-17)
- Requisitos: Q-100 a Q-107, U-10
- Relacionada: H-20, Q-84, ADR-0043

## Contexto

En los resultados de una consulta, las columnas con clave foránea solo muestran el identificador. Para saber a qué fila apunta, por ejemplo qué elemento de un catálogo es, el usuario escribe otra consulta o une la tabla a mano. Le pasa con varias tablas a las que apuntan muchas otras: catálogos, personas y similares.

Petición del usuario (2026-11-17):

- Las celdas de una columna con clave foránea hacia una tabla elegida llevan una marca en la esquina inferior derecha, de un color elegido.
- Al dejar el ratón encima de una de esas celdas, LiteDD consulta la tabla y muestra el valor. Solo consulta si el ratón se queda unos milisegundos, para no lanzar consultas al pasar sin querer.
- La consulta es una nota SQL de una salida, por ejemplo `SELECT name FROM author WHERE id = #{id}`, elegida en «Ajustes» como la nota de login de las notas HTTP (H-20).
- En «Ajustes» se añaden tantas tablas objetivo como hagan falta, cada una con su color y su nota.

Respuestas del usuario (2026-11-17):

- Las claves foráneas están declaradas en MySQL: se leen de `information_schema` y no se deducen por el nombre de la columna.
- Las referencias tienen una categoría propia en «Ajustes», «Referencias», tras «SQL».

## Decisión

1. **Ajustes.** `config.json` gana `references`, una lista de `{ table, color, noteId }`. La tabla no se repite, sin distinguir mayúsculas; el color es `#rrggbb` y una referencia nueva nace en azul cerúleo, `#007ba7`; cada referencia necesita su nota. La nota no se comprueba al guardar, igual que la de login: se comprueba al consultar. En la interfaz, la tabla objetivo propone las tablas del esquema (Q-84) y la nota es un desplegable de notas SQL.
2. **Origen de cada columna.** La ejecución devuelve, junto a la etiqueta, la tabla y la columna originales que da JDBC (`getTableName` y `getColumnName` de Connector/J son las originales, no los alias), solo si `getCatalogName` es el esquema de la conexión. Una expresión o una función no tienen origen. Así vale con alias (`b.author_id AS autor`) sin analizar el SQL.
3. **Claves foráneas.** Una ruta nueva, `GET /api/sql/references`, lee `information_schema.KEY_COLUMN_USAGE` del esquema de la conexión con una sentencia fija de solo lectura y devuelve las claves de una sola columna que apuntan a una tabla objetivo. Sin referencias no llega a MySQL. La interfaz la pide al ver resultados si hay referencias y la guarda en memoria hasta que cambian la conexión o las referencias, o falla la petición, como el esquema de ADR-0043.
4. **Marca.** En la tabla de resultados de las notas SQL, y de las hijas de una nota XML, que se ejecutan igual, una celda no nula de una columna cuyo origen tiene clave foránea hacia una tabla objetivo lleva un triángulo en la esquina inferior derecha del color de la referencia. Una clave de varias columnas no se marca, porque la nota recibe un solo valor. El plan de «Explicar» y las tablas de los workflows no se marcan: no se ha pedido.
5. **Consulta.** Con el ratón quieto 400 ms sobre una celda marcada, LiteDD llama a `POST /api/sql/lookup` con la tabla objetivo y el valor. Si el ratón sale antes, no se consulta nada. Para el teclado (U-08), seleccionar una celda marcada con las flechas y esperar el mismo tiempo hace lo mismo. El servidor busca la referencia en sus ajustes, no en la petición, y ejecuta el contenido guardado de la nota con el valor en su única variable: misma clasificación y solo lectura que ejecutar (S-01 a S-06), tiempo máximo de consulta, sin paginación y una sola fila. No recuerda valores, no cuenta como ejecución y no registra el valor.
6. **Recuadro.** El resultado se ve en un recuadro junto a la celda: el valor si la nota tiene una columna; cada valor con su etiqueta si tiene varias; «Sin resultados» sin filas; «Consultando…» mientras tanto; o el error. Se cierra al salir de la celda, al cambiar la selección, con Esc o al desplazar la tabla.
7. **Memoria.** Los valores consultados se recuerdan mientras se ven esos resultados, por tabla objetivo y valor: otra celda con el mismo valor no vuelve a consultar. Una ejecución nueva o cambiar de página los olvida. Los errores no se recuerdan, para poder reintentar tras reconectar.

## Consecuencias

- Hay dos rutas nuevas. Ninguna sentencia nueva modifica datos: una lee `information_schema` y la otra ejecuta una nota SQL ya clasificada como consulta (S-01, S-02). La sesión sigue siendo de solo lectura (S-04).
- Ningún destino nuevo (constitución, punto 4) y ninguna dependencia nueva.
- Si una base de datos no declara sus claves foráneas, no se marca nada. Deducirlas por el nombre de la columna se descartó.
- En una consulta que LiteDD envuelve para paginarla (Q-57), el origen de las columnas es el que dé MySQL para la tabla derivada; si no lo da, esas columnas no se marcan.
