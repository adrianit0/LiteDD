# Sprint 8: Notas XML MyBatis

## Objetivo

Pegar un mapper.xml entero en una nota y obtener una nota SQL de solo lectura por sentencia, con los fragmentos `<sql>` resueltos y siempre sincronizadas con el mapper.

## Requisitos cubiertos

M-01 a M-50, y los cambios de Q-03, N-02, N-04, N-05, N-08, N-51, X-02 y X-03

Documentos: [requisitos/mybatis.md](../requisitos/mybatis.md), [decisiones/ADR-0023-notas-mybatis.md](../decisiones/ADR-0023-notas-mybatis.md), [constitucion.md](../constitucion.md).

## Tareas

1. Especificación: requisitos M, ADR-0023, cambios en notas, SQL, transferencia, API, modelo de datos y arquitectura.
2. Migración V004: tipo `xml` y columnas `statement_id` y `statement_kind`, reconstruyendo la tabla `note` como en V003.
3. Motor: `MapperSource` analiza el mapper, resuelve los `<include>` con MyBatis y devuelve las sentencias o los errores.
4. Servidor:
   - Sincronización de las hijas al guardar, restaurar una versión, duplicar y restaurar de la papelera.
   - Reglas del árbol: sin hijas propias en la nota XML, hijas fijas y papelera conjunta.
   - Ruta `POST /api/mybatis/analyze`.
   - Exportación e importación con `statementId` y `statementKind`.
5. Interfaz:
   - Tipo `xml`: icono, «Nueva nota MyBatis» en el panel y en el menú del árbol.
   - Editor con resaltado y la lista de sentencias en vivo. En consulta, el XML y los enlaces a las hijas.
   - Hijas de solo lectura, con «Generada desde» y la marca de escritura.
   - Recargar las pestañas de las hijas al guardar el padre.

## Criterios de aceptación

- Un mapper con un `<sql>` usado por dos `<select>` genera dos hijas ejecutables con el fragmento ya incluido.
- Cambiar el fragmento en el padre y guardar cambia las dos hijas, que conservan sus últimos valores.
- Un `<update>` genera una hija con la marca UPDATE que solo ofrece «Generar SQL», con los valores del formulario. Nunca llega a MySQL.
- Quitar una sentencia del mapper borra su hija. Un mapper con errores no toca las hijas y muestra el error con su línea.
- Las hijas no se pueden editar, renombrar, mover ni eliminar, y la nota XML no admite otras hijas.
- Eliminar y restaurar la nota XML se lleva y devuelve sus hijas. La exportación y la importación las conservan.
- Una base de datos de la versión anterior se migra sin perder nada.

## Resultado

Fecha: 2026-10-12.

### Hecho

- **Especificación:**
  - `requisitos/mybatis.md` con M-01 a M-50.
  - ADR-0023, con las respuestas del usuario: solo lectura sin excepciones, una hija por sentencia, borrado definitivo de las hijas huérfanas y sin interruptor de escrituras por ahora.
  - Cambios en N-02, N-04, N-05, N-08, N-51, Q-03, X-02, X-03, U-02, la API, el modelo de datos y la arquitectura.
  - La constitución no cambia.
- **Migración V004:**
  - Tipo `xml` y columnas `statement_id` y `statement_kind`, con un índice único por madre y sentencia.
  - Reconstruye `note` conservando `rid`, igual que V003.
- **Motor (`MapperSource`):**
  - El DOCTYPE se ignora sin descargar nada y la raíz debe ser `<mapper>`.
  - Los `<include>`, con `<property>` y refid con namespace, se resuelven con el `XMLIncludeTransformer` de MyBatis.
  - Se quitan `<selectKey>` y se ignoran resultMap, cache y los atributos de las sentencias.
  - Se detectan los ids ausentes o repetidos, los fragmentos inexistentes y los include circulares.
  - El cuerpo se escribe sin sangría común, escapando solo `&` y `<`.
- **Servidor:**
  - Sincronización por id de sentencia al guardar, restaurar una versión, duplicar y restaurar de la papelera. La versión de una hija solo cambia si cambia su sentencia, así que conserva sus valores.
  - Las hijas no se editan, no se mueven, no se eliminan y no admiten hijas. La nota XML no admite otras hijas.
  - La nota XML va a la papelera, vuelve y se purga con sus hijas.
  - Ruta `POST /api/mybatis/analyze`.
  - Exportación `.xml`, con `statementId` y `statementKind` en el manifiesto, validados al importar.
- **Interfaz:**
  - «Nueva nota MyBatis» en el panel y en el menú del árbol. Icono XML en violeta, con su prueba de contraste AA.
  - **Editor:** resaltado del mapper y, debajo, las sentencias en vivo con su etiqueta y los errores.
  - **Consulta:** lista de sentencias generadas con enlace a cada una, aviso si el mapper guardado tiene errores y el XML resaltado.
  - **Hijas:** sin Editar, Historial ni Eliminar. Muestran «Generada desde «…»» y la marca INSERT, UPDATE o DELETE, también en el árbol.
  - **Árbol:** no se suelta ni se mueve nada dentro de la nota XML, y el menú se adapta.
  - Al guardar el padre se recargan las pestañas de las hijas, y se cierran las de sentencias borradas.
- **Pruebas:** 315 de backend (1 omitida en Windows) y 285 de interfaz.

### Criterios de aceptación

Recorridos con la aplicación arrancada (`exec:java`, puerto 47650), datos aislados y un mapper inventado de litedd_demo, sin conexión a MySQL.

1. **Un `<sql>` usado por dos `<select>`:** se generan las dos hijas con el fragmento incluido. **Cumplido.** La ejecución contra MySQL real queda pendiente de Ubuntu.
2. **Cambiar el fragmento:** las dos hijas cambian y conservan su id. Que conservan sus valores lo cubre la prueba M-12. **Cumplido.**
3. **`<update>`:** su hija lleva la marca UPDATE y solo ofrece «Generar SQL». Con `O'Brien` y 7 da `UPDATE book SET title = 'O\'Brien' WHERE id = 7` y no llega al driver. **Cumplido.**
4. **Quitar una sentencia y mapper con errores:** quitar una sentencia borra su hija. Un `refid` inexistente guarda el padre, no toca las hijas y muestra el error. **Cumplido.**
5. **Solo lectura:** guardar o eliminar una hija responde `generated_note`, y crear una hija en la nota XML responde `xml_children`. **Cumplido.**
6. **Papelera:** en la papelera solo aparece la nota XML, y al restaurarla vuelven sus tres hijas. La exportación y la importación las conservan (prueba M-50). **Cumplido.**
7. **Migración:** una base V003 pasa a V004 conservando filas, `rid`, búsqueda y pestañas (prueba M-01/M-12 del migrador). **Cumplido.**

### Pendiente

- Probar en Ubuntu con un mapper real del proyecto y MySQL: ejecución de las hijas SELECT.

### Desviaciones y decisiones

- **Fallo previo corregido:** desde el Sprint 4 el análisis omite `forbiddenClause` cuando es null (ADR-0014), y la interfaz lo tomaba por cláusula prohibida. Toda consulta mostraba «Generar SQL» y «Contar» desactivado, aunque se ejecutaba. Corregido con su prueba.
- **Atributos de etiquetas:** el DOM los devuelve en orden alfabético. Las hijas los escriben en el orden habitual de MyBatis (`collection`, `item`, `open`, `separator`, `close`…).
- **Ruta de análisis:** `/api/mybatis/analyze` vive en `SqlApi`, junto a `/api/sql/analyze`, porque solo usa el motor.
