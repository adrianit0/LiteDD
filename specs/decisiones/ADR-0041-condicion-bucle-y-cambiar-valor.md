# ADR-0041: Condición, Bucle, Break, Cambiar valor, codos y notas arrastradas en el workflow

- Estado: aceptada (2026-11-06)
- Requisitos: W-12 a W-19, W-22, W-31, W-32, W-36, W-42, W-43, W-60, W-61, W-70 a W-81, W-90 a W-99
- Modifica: ADR-0031 (una sola flecha por entrada y sin condiciones) y ADR-0032 (historial por nodo)

## Contexto

El usuario va a montar workflows más complejos y pide seis mejoras:

1. **Condición:** un nodo con una condición y dos salidas que lleven a sitios diferentes.
2. **Foreach o Bucle:** recorre lo que devuelve otro nodo cuando es una lista, como las filas de un SQL. Si `$SQL` vale `[a, b, c]`, el bucle da `$Bucle` = `a` y sigue el flujo hasta Finish; allí vuelve a empezar con `b`, y así hasta acabar. Un valor que no es lista cuenta como un único valor. Si vale null, se detiene con «Parar si no existe input».
3. **Break:** rompe el bucle, que no tiene más iteraciones, y sigue por la salida del propio Break.
4. **Cambiar valor:** cambiar un valor de un resultado anterior para reenviarlo, por ejemplo `$http1.valor = $input1.valorAModificar`, sin rehacer el cuerpo completo de la segunda llamada.
5. **Trayecto de las flechas:** poder cambiarlo para que un workflow complejo se lea mejor.
6. **Arrastrar notas:** soltar sobre el workflow una nota HTTP o SQL del árbol crea su nodo.

## Decisión

Respuestas del usuario (2026-11-06):

1. **Condición como expresión libre:** un campo «Condición» con referencias y operadores, por ejemplo `$Conn1.data.total > 0 && $Input1.tipo == "A"`. Los textos que son números se comparan como números, y una sintaxis mal escrita impide ejecutar.
2. **Tipo del valor asignado en «Cambiar valor»:** el valor resuelto se lee como JSON si lo es. `54` es un número, `true` un booleano, `null` nulo, `{…}` un objeto y `"54"` (con comillas) un texto; lo demás es texto.
3. **Iteraciones:** cada iteración guarda lo que entró y salió de cada nodo. Un selector «Iteración 3 de 10» elige cuál se ve, y el resumen marca las que fallaron.
4. **Codos en las flechas:** arrastrar una flecha crea un codo, que se mueve con la rejilla. Doble clic en un codo lo quita, y los tramos entre codos son rectos.

Propuestas, aprobadas con el plan (2026-11-06):

- **A. Varias flechas por entrada:** hacen falta para que las ramas de una Condición vuelvan a unirse o lleguen a Finish. Cada salida sigue admitiendo una sola flecha (W-12).
- **B. Sin ciclos de flechas:** solo el Bucle repite. El lienzo no crea una flecha que cierre un ciclo, y la comprobación previa no lo acepta (W-12, W-61).
- **C. Flujo:** la «cadena» pasa a ser el «flujo», los nodos a los que se llega desde Start. Para ejecutar, todas sus salidas deben tener flecha, también las dos de cada Condición (W-15, W-61).
- **D. Insertar y borrar:**
  - Tras una Condición, el nodo nuevo va en su salida «Sí».
  - Con Finish seleccionado, todas las flechas que llegaban a Finish pasan al nodo nuevo.
  - Al borrar un nodo, todos sus predecesores se unen a su sucesor. Al borrar una Condición no se une nada (W-13, W-14).
- **E. Condición:**
  - Nombre `Condicion1` y salidas «Sí» y «No».
  - Con null, solo `==` y `!=` dan verdadero. Un valor solo es falso si vale null, false, 0, texto vacío o lista vacía.
  - Su valor es `true` o `false` (W-90 a W-92).
- **F. Bucle:**
  - Nombre `Bucle1` y un campo «Lista». Una lista vacía da cero iteraciones, y una lista null, sin «Parar si no existe input», también.
  - El cuerpo es todo lo que sigue al Bucle. Al llegar a Finish se vuelve al Bucle; al acabar, Finish termina o vuelve al bucle de fuera.
  - Al empezar cada iteración, los nodos del cuerpo pierden el valor de la anterior.
  - Como máximo 10 000 elementos, como el tope de filas de SQL (W-93 a W-95).
- **G. Break:** termina el bucle más interior. Un Break al que se puede llegar sin un Bucle abierto impide ejecutar (W-96).
- **H. Cambiar valor:**
  - Filas «destino = valor» que se aplican en orden.
  - Si falta la clave en un objeto, se crea. Una posición de lista, o un paso intermedio, que no existe es un error del nodo.
  - El cambio dura el resto de la ejecución (W-97 a W-99).
- **I. Solo en edición:** los campos de Condición, Bucle y Cambiar valor forman parte del diseño, no de cada caso: no se cambian en consulta ni se guardan como últimos valores.
- **J. Notas arrastradas:** solo en edición. El nodo queda donde se suelta, suelto y seleccionado, con el nombre y los valores de la nota, como al elegirla. Otros tipos de nota no hacen nada (W-19).
- **K. Avance:** con ramas no se sabe cuántos nodos quedan. «Nodo 3 de 5» pasa a ser el nodo en curso, con sus bucles: «Conn1 · Bucle1 3 de 10» (W-71).

Detalles, tomados con el mismo criterio:

- **Comparación de textos que no son números:** por orden de caracteres. Así `$Input1.fecha >= "2026-01-01"` funciona con fechas ISO.
- **Referencias dentro de una condición:** su valor nunca se vuelve a leer como expresión.
- **Destinos repetidos en un mismo «Cambiar valor»:** se marcan en edición e impiden ejecutar, porque lo que entró en cada fila se muestra por destino.
- **Teclado:** los codos solo se editan con el ratón. Son un ajuste visual y la flecha sigue seleccionándose y borrándose con el teclado (U-08).

Diseño:

- **Contenido:**
  - Nodos `{"kind": "condition", "condition": "…"}`, `{"kind": "foreach", "list": "…"}`, `{"kind": "break"}` y `{"kind": "set", "assignments": [{"target": "$Http1.data.valor", "value": "$Input1.nuevo"}]}`.
  - Flechas `{"from": "n3", "out": "no", "to": "n5", "points": [{"x": 400, "y": 240}]}`. Una flecha sin `out` sale de la salida normal. Las de una Condición llevan `yes` o `no`, como previó ADR-0031.
  - Los workflows guardados se leen igual.
- **Servidor:**
  - `Condition`: módulo puro que analiza y evalúa la expresión sobre los valores de los nodos.
  - `References`: gana la asignación sobre una ruta y la lectura de un valor como JSON.
  - `WorkflowContent`:
    - Valida las salidas al guardar.
    - Calcula el flujo, las salidas sin flecha, los ciclos, los Break sin Bucle y la sintaxis para la comprobación previa.
    - Un ciclo no se rechaza al guardar, porque el guardado automático no debe fallar mientras se dibuja.
  - `WorkflowRunner`:
    - Recorre el grafo con una pila de bucles. Una iteración se identifica por la posición en cada bucle abierto, por ejemplo `[2, 3]`.
    - Al empezar una iteración, borra los valores de los nodos del cuerpo y da al Bucle el elemento actual.
- **Eventos:**
  - Cada evento de nodo lleva `iteration`.
  - La Condición lleva `branch` (`yes` o `no`) y el Bucle, `items`.
  - Un evento nuevo, `iteration`, anuncia cada vuelta con el Bucle, la posición, el total y el elemento como texto.
- **Interfaz:**
  - `workflowRunStore` guarda, por nodo, un resultado por iteración.
  - Lo que se ve de un nodo en la iteración elegida es su resultado en esa iteración o, si no lo tiene, el de la iteración que la contiene (por ejemplo, la `2` para la `2.3`).
  - El selector de iteración está en el panel, y la iteración elegida también decide los estados del lienzo.
- **Arrastre desde el árbol:**
  - El árbol usa dnd-kit y el lienzo está fuera de su contexto.
  - Al soltar fuera del árbol, el árbol busca bajo el puntero un lienzo en edición y le envía un evento DOM con la nota. Así no hay un store compartido para un único uso.

## Consecuencias

- **Ejecuciones más largas:** un Bucle repite llamadas HTTP que pueden modificar datos. Con «Parar si error» desmarcada sigue con el siguiente elemento aunque uno falle.
- **Memoria:** con bucles largos y respuestas grandes, las 20 ejecuciones de una pestaña ocupan más. Cerrar la pestaña la libera, como ya decía ADR-0032.
- **Workflows anteriores:** no cambian. Un flujo lineal se comporta igual que antes.
