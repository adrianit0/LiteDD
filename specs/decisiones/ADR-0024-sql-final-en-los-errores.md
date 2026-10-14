# ADR-0024: El SQL final también se muestra cuando la ejecución falla

- Estado: aceptada (2026-10-13)
- Requisitos: Q-70 a Q-74, Q-96 a Q-98, A-02

## Contexto

Una nota SQL, propia o generada desde un mapper MyBatis, puede funcionar con unos valores y fallar con otros, porque las etiquetas dinámicas (`<if>`, `<choose>`…) producen un SQL distinto en cada caso. El panel «SQL final» solo aparecía tras una ejecución correcta, y tras un error seguía mostrando el de la ejecución anterior. No había forma de ver la consulta que había fallado.

## Decisión

Petición del usuario (2026-10-13): si falla una consulta, tiene que poder verse la consulta que se ha ejecutado o intentado ejecutar.

- Los errores de `/api/sql/execute` y `/api/sql/count` que ocurren después de generar el SQL llevan en `details.finalSql` el SQL final de esa llamada, con el mismo formato que una respuesta correcta. `mysql_error` conserva además `errorCode` y `sqlState`.
- La interfaz muestra ese SQL en el panel «SQL final», abierto y en la vista «Con valores», en lugar del de la ejecución anterior.
- Es el SQL final de Q-72, sin la paginación añadida por LiteDD. El error 1060 del envoltorio ya explica en su mensaje que lo causa la paginación (Q-57).
- Un error al generar el SQL (XML, OGNL, tipos, valores) no tiene SQL final, porque MyBatis no llega a producirlo. Su mensaje ya indica la expresión o la variable (Q-90 a Q-93).

## Consecuencias

- Los valores elegidos viajan en la respuesta de error igual que en una respuesta correcta. No se registran (S-22).
- No cambia nada para las notas que se ejecutan bien.
