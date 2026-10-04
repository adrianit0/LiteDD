# ADR-0011: Reglas adicionales del motor SQL

- Estado: aceptada (2026-10-04)
- Requisitos: S-01, S-02, Q-15

## Contexto

La especificación permite EXPLAIN y no dice nada de los comentarios ejecutables de MySQL. Q-15 no aclara si un comentario tipado crea un campo por sí solo.

## Decisión

1. **EXPLAIN ANALYZE** (y DESCRIBE ANALYZE) ejecuta de verdad la sentencia que analiza. Solo se admite si esa sentencia es una consulta (SELECT, WITH … SELECT o una consulta entre paréntesis). EXPLAIN sin ANALYZE se admite siempre, porque no ejecuta nada.
2. **Comentarios ejecutables** `/*! … */`: MySQL ejecuta su contenido, así que permitirían colar cláusulas que el clasificador no ve. Una sentencia que los contenga no es ejecutable y se informa como cláusula no permitida (Q-95). Los comentarios de pista del optimizador `/*+ … */` sí se admiten.
3. **Tipo en un comentario** `<!-- #{x,boolean} -->` (Q-15): solo da tipo a una variable que ya aparece en otro sitio de la nota. No crea un campo por sí solo.

## Consecuencias

Son restricciones más estrictas que la especificación, en línea con el punto 3 de la constitución.
