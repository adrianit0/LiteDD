# ADR-0023: Notas XML MyBatis con hijas SQL generadas

- Estado: aceptada (2026-10-12)
- Requisitos: M-01 a M-50, Q-03, N-02, N-04, N-05, N-08, N-51, X-02, X-03

## Contexto

En el proyecto de trabajo, cada prueba de una consulta exige arrancar una aplicación que tarda minutos. Las consultas viven en ficheros mapper.xml que comparten fragmentos `<sql>`. Copiar sentencia a sentencia a notas SQL obliga a resolver los `<include>` a mano y a mantener las copias al día. El usuario quiere pegar el mapper entero y tener una nota SQL por sentencia, siempre sincronizada con el mapper.

## Decisión

Respuestas del usuario (2026-10-12):

1. **Tipo nuevo:** cuarto tipo de nota, `xml`, para no cambiar las notas SQL, que funcionan bien. No admite hijas propias; sus hijas son notas SQL de solo lectura generadas a partir de él. Si se modifica el padre, se modifican todas sus hijas.
2. **Una hija por sentencia:** una por cada `<select>`, `<insert>`, `<update>` y `<delete>` del mapper.
3. **Solo lectura, sin excepciones:** el principio 3 de la constitución no cambia. Las sentencias de escritura no se ejecutan. LiteDD genera su SQL con las variables elegidas para copiarlo y ejecutarlo en otra herramienta más segura (Q-45).
4. **Sentencias que desaparecen:** si una sentencia se borra del mapper o cambia de `id`, su hija se borra definitivamente con sus valores guardados. Su contenido sigue en el padre y en su historial.
5. **Interruptor futuro:** si algún día se permite ejecutar INSERT, UPDATE o DELETE, será con un interruptor en «Ajustes» desactivado por defecto. Ahora no se añade.

Diseño:

- **Datos:**
  - La migración V004 reconstruye `note`, con el mismo procedimiento que V003, para admitir el tipo `xml`.
  - Añade las columnas `statement_id` y `statement_kind`. Una nota con `statement_id` es una hija generada, y su madre es la nota XML.
  - No hace falta otra columna de origen, porque las hijas no se mueven.
- **Análisis del mapper (`sqlengine.MapperSource`):**
  - El DOCTYPE se sustituye por espacios antes de analizar, con lo que se conservan líneas y columnas. El XML se analiza con el mismo analizador seguro que las notas SQL: sin DTD ni entidades externas.
  - Los `<sql>` se registran en una `Configuration` de MyBatis nueva para cada análisis, y los `<include>` se resuelven con su `XMLIncludeTransformer`. No se reimplementa ninguna etiqueta (Q-30).
  - El cuerpo resultante se escribe de nuevo como texto escapando solo `&` y `<`, para que `>=` siga legible.
- **Sincronización:** va en `NoteService`, dentro de la transacción del guardado. Las hijas se emparejan por `statement_id`. El contenido de una hija solo cambia, y con él su versión, si cambia su sentencia. Una pestaña con la versión anterior recibe el 409 de A-05 al ejecutar.
- **Fragmentos:**
  - `<include>` sigue sin estar admitido en las notas SQL normales (Q-03).
  - En el mapper está admitido, porque los fragmentos viven en el propio mapper. Con eso se cumple el punto «Fragmentos reutilizables con `<include>`» de la sección «Futuro» de la arquitectura.
- **Exportación:** las hijas se exportan como cualquier nota, para conservar sus etiquetas y su favorita. El manifiesto añade `statementId` y `statementKind`.

## Consecuencias

- Las hijas son notas SQL a todos los efectos al ejecutarlas (`/api/sql/*`), así que no hay un motor nuevo.
- Las hijas aparecen en la búsqueda como cualquier nota SQL.
- Las clases Java del proyecto (resultType, parameterType…) no hacen falta: se ignoran.
- Un mapper con fragmentos de otros mappers no se puede resolver. Hay que copiar esos fragmentos en el mismo mapper.
