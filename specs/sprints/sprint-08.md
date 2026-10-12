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

Pendiente.
