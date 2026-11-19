# ADR-0051: Notas vacías en gris en el árbol

- Estado: aceptada (2026-11-19)
- Requisitos: N-100
- Relacionada: N-01, N-83, ADR-0047

## Contexto

El usuario usa muchas notas Markdown sin contenido como carpetas, solo para agrupar otras debajo. En el árbol se ven igual que las notas con contenido, y no hay forma de distinguir de un vistazo una carpeta (o una nota SQL o MyBatis que se quedó sin escribir) de una nota con algo dentro.

Petición del usuario (2026-11-19): las notas Markdown, SQL y MyBatis completamente vacías, «solo el nombre», muestran el icono de tipo en gris en lugar de su color.

## Decisión

1. Una nota está vacía si su contenido, quitados los espacios, tabuladores y saltos de línea de los extremos, no tiene nada. Un contenido de solo espacios cuenta como vacío: no se ve nada al abrirla.
2. Solo cambia de aspecto en Markdown, SQL y XML MyBatis. Las notas HTTP, pizarra y workflow guardan JSON y nunca están «vacías» para el usuario en ese sentido, así que no se tocan. Las hijas generadas de una nota XML tampoco: su contenido lo pone el mapper.
3. Solo cambia el color del icono de tipo, que pasa al gris de los textos secundarios (`--text-muted`), con el borde del mismo color. El título, la descripción y las demás marcas (obsoleta, importante, favorita) siguen igual y se combinan con el gris.
4. El árbol no carga el contenido de las notas (N-01). El servidor calcula el dato en la consulta del árbol y lo envía como `empty` en cada nodo; no hay columna nueva ni migración.
5. Al guardar una nota, la interfaz actualiza `empty` en el árbol con el contenido guardado, sin recargarlo entero. Una nota nueva nace vacía.
6. El texto alternativo del icono añade «vacía» («Markdown vacía») para que el dato no dependa solo del color.
