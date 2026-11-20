# ADR-0052: «Hacer opcional» en el editor SQL

- Estado: aceptada (2026-11-19)
- Requisitos: Q-86, Q-87
- Relacionada: Q-01, Q-14, Q-81, M-25

## Contexto

Cada filtro opcional de una consulta exige escribir el mismo envoltorio: `<where>`, `<if test="x != null">`, la condición y los cierres. La condición es la única parte con información; el resto se deduce de la variable que usa.

Se valoraron tres opciones (2026-11-19): que el editor escriba el envoltorio, plegarlo al mostrarlo o una sintaxis abreviada (`#{x?}`) que LiteDD expanda. El usuario eligió la primera: el contenido sigue siendo el cuerpo de un mapper MyBatis real (Q-01), que se copia tal cual a los mappers del proyecto (M-25), y lo que se ve es lo que se ejecuta. La sintaxis abreviada habría creado un segundo dialecto que no vale en las notas XML ni fuera de LiteDD.

## Decisión

1. Es una transformación del texto en el editor, no una sintaxis: el servidor y MyBatis no cambian. Se deshace con Ctrl+Z.
2. Se activa con el botón «Hacer opcional» de la barra de inserciones (Q-81), al final, y con Ctrl+Mayús+F (petición del usuario). Vale en las notas SQL y en las XML MyBatis, que comparten barra y editor.
3. Actúa por líneas completas: las que toca la selección o, sin ella, la del cursor. Así basta con escribir las condiciones una por línea y seleccionarlas.
4. La condición es `x != null`. Un campo vacío del formulario ya llega como null (T-02), así que no hace falta `x != ''`. Si la línea tiene varias variables, se comparan todas, unidas con `and`: `&&` no es válido en un atributo XML sin escapar.
5. Las variables son las raíces de `#{…}` y `${…}` (como en Q-10). Las líneas que empiezan por `<` son etiquetas y no se tocan, para no envolver dos veces un `<if>` existente.
6. `IN #{lista}` se convierte en `<foreach>` en la misma línea, con `item="item"`. Si el token declara un tipo distinto de `list` (`#{ids,int}`), pasa al item, que es como Q-14 convierte cada elemento.
7. Se añade `<where>` solo si la sentencia no tiene ya `<where>`, `<set>`, `<trim>`, `WHERE` ni `SET`. En una nota XML la sentencia es la etiqueta `<select>`, `<insert>`, `<update>` o `<delete>` que rodea las líneas; en una nota SQL, la nota entera. La comprobación es por texto: si la palabra aparece en un comentario, no se añade `<where>` y el usuario lo pone con su botón.
8. La sangría es de dos espacios, como el resto de inserciones de la barra (Q-81).
