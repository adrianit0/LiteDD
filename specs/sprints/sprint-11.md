# Sprint 11: Notas workflow

## Objetivo

Un tipo de nota que encadena notas HTTP y SQL, esperas y valores de entrada, se diseña una vez y se ejecuta para cada caso cambiando solo los valores, usando el resultado de cada paso en los siguientes.

## Requisitos cubiertos

W-01 a W-84, y los cambios de N-04, N-05, X-03, X-05, U-02, la API, el modelo de datos y la arquitectura

Documentos: [requisitos/workflow.md](../requisitos/workflow.md), [decisiones/ADR-0031-notas-workflow.md](../decisiones/ADR-0031-notas-workflow.md), [constitucion.md](../constitucion.md).

## Tareas

1. Especificación: requisitos W, ADR-0031 con las respuestas del usuario y las propuestas A a I, y los cambios en notas, transferencia, interfaz, API, modelo de datos y arquitectura. La constitución no cambia.
2. Migración V007: tipo `workflow`, reconstruyendo `note` como V003, V004 y V006, conservando `rid` y la regla de las pizarras en `note_fts`.
3. Servidor, piezas puras con pruebas:
   - `References`: análisis de `$Nombre.ruta` dentro de un texto, `$$`, resolución sobre JSON, filas SQL e Input, paso a texto y null (W-30 a W-35).
   - `WorkflowContent`: lectura del JSON y validación de la estructura al guardar, restaurar e importar (W-80, W-81).
   - Cadena y comprobación previa: camino desde Start, nombres y notas (W-15, W-21, W-61).
4. Servidor, ejecución:
   - `SqlRunner` extraído de `SqlApi`, sin cambiar su comportamiento, con ejecución sin paginación para los nodos (W-64).
   - `HttpRunner` con un método para ejecutar una nota con valores y perfil dados (W-62, W-63).
   - `WorkflowRunner`: nodos en orden, casillas, espera cancelable, perfil fijo, clave única, eventos y registro sin datos (W-42 a W-44, W-54, W-60 a W-68).
   - `WorkflowApi`: `analyze`, `execute` en NDJSON y `cancel`; últimos valores en `variable_value` (W-51, W-53, W-83).
   - Exportación `.workflow.json` e importación con reasignación de `noteId` (W-82).
5. Interfaz, lógica pura con pruebas: cadena, insertar y borrar manteniendo la cadena, nombres propuestos, avisos de referencias, propagación de «Mismos inputs», valores de consulta (pestaña, últimos y guardados) y fijado (W-13, W-14, W-22, W-36, W-41, W-44, W-51, W-52).
6. Interfaz, edición: lienzo con nodos, flechas, puertos, arrastre con rejilla, teclado, barra con casillas y panel con selector de nota, campos, filas del Input y «Sale hacia» (W-10 a W-28, W-40).
7. Interfaz, consulta: formulario de Input, «Restablecer», barra de ejecución, lectura del streaming, estados de los nodos, clave de confirmación y panel de resultados que reutiliza la respuesta HTTP y la tabla SQL (W-50 a W-73).
8. Interfaz, integración: tipo `workflow` con icono «WF» en cian y su prueba de contraste AA, «Nota Workflow» en los dos menús y «Workflow» en el filtro de tipo (W-01, W-84).
9. Verificación: `./mvnw verify` y los criterios de aceptación con la aplicación arrancada, datos aislados y un servidor HTTP de pruebas local.

## Criterios de aceptación

- «Nota Workflow» crea un workflow que se abre en edición con Start y Finish unidos.
- Con Start seleccionado, «+ Input», «+ HTTP» y «+ Espera» montan la cadena Start → Input1 → Conn1 → Espera1 → Finish sin dibujar flechas. Borrar Conn1 une Input1 con Espera1.
- Elegir una nota HTTP con `#{id}` muestra el campo `id` con el valor guardado en la nota y propone un nombre a partir de su título. Un nombre repetido se marca.
- Arrastrar desde la salida de un nodo hasta otro crea una flecha, y Supr la borra. Un nodo fuera de la cadena se ve atenuado.
- Con `id = $Input1.id` y una segunda nota HTTP con `$Conn1.data.test`, «Ejecutar» pone los nodos en verde en orden, la segunda llamada lleva el valor de la primera respuesta y el tiempo total incluye la espera.
- Una referencia a una clave que no existe envía `null`. Con «Parar si no existe input», el flujo se detiene antes de ese nodo y lo dice.
- Una respuesta 404 con «Parar si error» detiene el flujo y deja atenuados los siguientes nodos; sin la casilla, el flujo sigue.
- Con «Mismos inputs tendrá mismo valor», cambiar `id` en un nodo lo cambia en el otro. Con «Fijar valores de input», en consulta solo se pueden cambiar los Input.
- Al reabrir el workflow se proponen los valores de la última ejecución, y «Restablecer» vuelve a los guardados.
- «Cancelar» durante una espera la detiene al momento.
- Con un perfil que pide clave, la clave se pide una sola vez por ejecución.
- La cadena rota, una nota en la papelera o un nombre no válido impiden ejecutar y se listan los motivos.
- Un nodo SQL con `$Query1[0].col1` en un nodo HTTP posterior pasa el valor de la primera fila (con MySQL, en Ubuntu).
- La exportación deja un `.workflow.json`, y «Añadir como rama» lo recupera apuntando a las notas importadas.
- Una base de datos de la versión anterior se migra sin perder notas, búsqueda, historial ni pestañas.

## Resultado

Pendiente.
