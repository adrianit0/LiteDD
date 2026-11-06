# ADR-0044: Casillas de tareas marcables en consulta

- Estado: aceptada (2026-11-06)
- Requisitos: N-31
- Relacionada: N-40, N-44, N-46 (guardado e historial)

## Contexto

N-31 dejaba las casillas de las listas de tareas como solo lectura en consulta: para marcar una tarea había que pasar a edición, buscar la línea y cambiar `[ ]` por `[x]`. El usuario quiere usar las notas Markdown como cuaderno de trabajo y pidió poder marcarlas directamente en consulta.

## Decisión

1. Al renderizar, cada casilla lleva en `data-task-line` la línea del Markdown donde empieza su elemento de lista (el `map` de markdown-it). Ya no lleva `disabled`, así que se alcanza con el tabulador y se marca con Espacio.
2. Al pulsarla, la vista no cambia la casilla por su cuenta: se cambia `[ ]` por `[x]` (y `[x]` o `[X]` por `[ ]`) en esa línea del contenido, y la vista se vuelve a dibujar desde él. Si la línea ya no es una tarea, no se hace nada.
3. El cambio pasa por la misma vía que una edición: con el guardado automático se guarda de inmediato, sin esperar 1,5 s, para que marcar una tarea y cerrar la pestaña no pierda nada; con el guardado manual la nota queda con cambios sin guardar y se guarda con «Guardar» o Ctrl+S (N-46). Un conflicto (N-42) bloquea el cambio igual que en edición.
4. Marcar una casilla no crea una versión del historial: N-44 solo las crea al salir del modo edición. Una casilla se deshace pulsándola otra vez.
5. Las hijas generadas de una nota XML no son Markdown, así que no les afecta.

## Consecuencias

- Una nota Markdown sirve como lista de tareas sin entrar en edición.
- La línea de la casilla sale del Markdown ya interpretado, así que funciona igual en listas anidadas, numeradas y dentro de citas.
- Ninguna dependencia ni cambio en el servidor.
