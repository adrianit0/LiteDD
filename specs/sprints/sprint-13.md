# Sprint 13: Condición, Bucle, Break y Cambiar valor en el workflow

## Objetivo

Que un workflow pueda tomar caminos distintos según los resultados, repetir su cuerpo para cada elemento de una lista y cambiar un valor de un resultado anterior antes de reenviarlo. Además, que las flechas se puedan desviar y que una nota se pueda añadir arrastrándola desde el árbol.

## Requisitos cubiertos

W-12 a W-19, W-22, W-31 a W-33, W-36, W-41 a W-44, W-50, W-60, W-61, W-63, W-70 a W-81, W-90 a W-99, y los cambios de la API y la arquitectura

Documentos: [requisitos/workflow.md](../requisitos/workflow.md), [decisiones/ADR-0041-condicion-bucle-y-cambiar-valor.md](../decisiones/ADR-0041-condicion-bucle-y-cambiar-valor.md), [constitucion.md](../constitucion.md).

## Tareas

1. Especificación: ADR-0041 con las respuestas del usuario y las propuestas A a K, requisitos W nuevos y cambiados, y la API y la arquitectura. La constitución no cambia.
2. Servidor, piezas puras con pruebas:
   - `Condition`: análisis y evaluación de la condición (W-91, W-92).
   - `References`: asignación sobre una ruta y lectura de un valor como JSON (W-97 a W-99).
   - `WorkflowContent`: tipos nuevos, salidas y codos, validación al guardar, flujo, salidas sin flecha, ciclos, Break sin Bucle y sintaxis (W-12, W-15, W-61, W-80, W-81, W-96).
3. Servidor, ejecución: `WorkflowRunner` recorre el grafo con una pila de bucles, con Condición, Bucle, Break y Cambiar valor, eventos por vuelta y el tope de 10 000 elementos (W-60, W-70, W-78, W-92 a W-99).
4. Interfaz, lógica pura con pruebas (`workflow/model.ts`): tipos y flechas nuevas, flujo, insertar, unir y borrar con varias entradas, rechazo de ciclos, codos, avisos y comprobación de condiciones y destinos (W-12 a W-18, W-22, W-36, W-91, W-97).
5. Interfaz, lienzo: nodos nuevos, dos salidas en la Condición, salidas sin flecha marcadas, codos y soltar notas desde el árbol (W-12, W-15, W-18, W-19, W-70).
6. Interfaz, panel y consulta: campos de los nodos nuevos, dos «Sale hacia», ejecuciones con vueltas, selector «Iteración», resumen con las vueltas con error y avance en la barra (W-17, W-50, W-71, W-72, W-74 a W-79).
7. Verificación: `./mvnw verify` y los criterios de aceptación con la aplicación arrancada, datos aislados y un servidor HTTP de pruebas local.

## Criterios de aceptación

- Una Condición `$Input1.tipo == "A"` lleva por «Sí» o por «No» según el valor, y la otra rama queda «no ejecutado».
- Un Bucle sobre una lista ejecuta su cuerpo una vez por elemento, con `$Bucle1.id`, y el selector «Iteración» muestra cada vuelta.
- Un Break tras una Condición dentro del Bucle lo termina y el flujo sigue por la salida del Break.
- Con «Cambiar valor» `$Http1.data.valor = $Input1.nuevo`, un segundo HTTP con `$Http1.data` envía el JSON con solo ese valor cambiado, y `54` llega como número.
- Una flecha que cerraría un ciclo no se crea, y una salida sin flecha impide ejecutar y se lista.
- Los codos de una flecha se crean, se mueven, se quitan y siguen ahí al reabrir el workflow.
- Arrastrar una nota HTTP del árbol al lienzo en edición crea su nodo donde se suelta.
- Un workflow anterior se abre y se ejecuta igual que antes.

## Resultado

Fecha: 2026-11-06.

### Hecho

- **Especificación:**
  - ADR-0041 aceptado con las respuestas del usuario: condición como expresión libre, valor leído como JSON, todas las vueltas con selector «Iteración» y codos con puntos de paso.
  - Propuestas A a K aprobadas con el plan.
  - `requisitos/workflow.md`: W-18, W-19 y W-90 a W-99 nuevos, y cambios en W-12 a W-17, W-22, W-31 a W-33, W-36, W-41 a W-44, W-50, W-60, W-61, W-63 y W-70 a W-81. También la API, la arquitectura y el README.
- **Servidor (`dev.litedd.workflow`):**
  - `Condition`: análisis con los mensajes de error en español y evaluación con comparación numérica de textos que son números, orden de caracteres, null y valor solo.
  - `References`:
    - `single` para una referencia sola.
    - `readValue`, que lee como JSON solo un texto que lo es entero.
    - `assign`, que crea claves y exige que las posiciones existan.
  - `WorkflowContent`:
    - Tipos `condition`, `foreach`, `break` y `set`, flechas con `out` y `points`, y varias flechas por entrada.
    - Flujo en anchura y salidas sin flecha.
    - Ciclos y Break sin Bucle en curso, calculados por el menor número de Bucles abiertos con que se llega a cada nodo.
    - Condiciones, listas y destinos.
  - `WorkflowRunner`:
    - Recorrido del grafo con una pila de Bucles, eventos `iteration` y `iteration`, `branch` e `items` en los eventos de nodo.
    - Borrado de los valores del cuerpo en cada vuelta, tope de 10 000 elementos, y Cambiar valor sobre copias, todo o nada.
- **Interfaz:**
  - `workflow/model.ts`:
    - Flujo, salidas sin flecha, inserción en «Sí» o antes de Finish con varias entradas, y borrado que une a todos los predecesores.
    - Rechazo de ciclos, codos, nodos desde notas soltadas, avisos por ancestros y comprobación de condiciones y destinos con los mismos mensajes que el servidor.
  - **Lienzo:**
    - Dos salidas en la Condición, «→ Sí» o «→ No» tras ejecutar y salidas sin flecha en rojo.
    - Codos que se crean arrastrando la flecha, se mueven y se quitan con doble clic.
    - Resalte del lienzo al arrastrar una nota desde el árbol.
  - **Panel:**
    - Condición, Lista y filas «destino = valor», y los dos «Sale hacia», que no ofrecen nodos que cerrarían un ciclo.
    - En consulta, el selector «Iteración», el elemento de la vuelta y «Se cambia en edición».
  - **Ejecuciones:**
    - Un resultado por nodo y vuelta, con la vuelta que la contiene como respaldo.
    - Resumen con las vueltas con error y avance «Eco · Bucle1 1 de 2».
  - **Árbol:** al soltar una nota fuera de él, envía el evento `litedd-note-drop` al lienzo en edición que haya debajo (`workflow/noteDrop.ts`).
- **Pruebas:** 502 de backend (7 omitidas en Windows) y 472 de interfaz. `./mvnw verify` en verde.

### Criterios de aceptación

Recorridos con la aplicación arrancada (`exec:java`, puerto 47650), datos aislados, el navegador integrado y un servidor HTTP de pruebas en 127.0.0.1:8099. El flujo de prueba es Start → Items → Bucle1 (`$Items.items`, tres elementos con `tipo` A, B y A) → Condicion1 (`$Bucle1.tipo == "A"`). Por «Sí» va a Eco (`id = $Bucle1.id`) → Finish y por «No», a Break1 → Guardar (`{"fin": $Bucle1.id}`) → Finish.

1. **Condición:** la vuelta 1 sale por «Sí» y llama a Eco con `{"id": 1, "tipo": "A"}`. La vuelta 2 sale por «No», y en esa vuelta Eco queda «no ejecutado». **Cumplido.**
2. **Bucle:** el resumen muestra «Lista: `$Items.items` → 3 elementos». El selector «Iteración» lista «Bucle1 1 de 3» y «Bucle1 2 de 3», y elegir la 1 muestra en el panel `$Bucle1.id → 1` y `$Bucle1.tipo → A`. **Cumplido.**
3. **Break:** en la vuelta 2 termina el Bucle y Guardar recibe `{"fin": 2}`. No hay vuelta 3: el servidor recibe Items, un Eco y un Guardar. **Cumplido.**
4. **Cambiar valor:** con Input1 `nuevo = 54`, Usuario (`{"data":{"valor":10,"nombre":"Ana"}}`), `$Usuario.data.valor = $Input1.nuevo` y Guardar con `$Usuario.data`, el servidor recibe `{"valor":54,"nombre":"Ana"}`, con 54 como número. **Cumplido.**
5. **Ciclos y salidas sin flecha:**
   - Arrastrar desde Cambiar1 hasta Input1 avisa «Esa flecha cerraría un ciclo: solo el Bucle repite», y «Sale hacia» solo ofrece Guardar y Finish.
   - Sin la flecha de Cambiar1, la salida se marca en rojo y en consulta «Ejecutar» se desactiva con «El flujo tiene salidas sin flecha». La lista de motivos del servidor la cubre la prueba W-15/W-61. **Cumplido.**
6. **Codos:** arrastrar la flecha «No» crea un codo, que sigue ahí tras recargar la página. Arrastrarlo lo mueve de (736, 576) a (752, 560), y el doble clic lo quita y la flecha vuelve a ser una curva. **Cumplido.**
7. **Notas arrastradas:** arrastrar «Items» del árbol al lienzo en edición crea el nodo HTTP Items donde se suelta, y el lienzo se resalta mientras se arrastra. **Cumplido.**
8. **Workflows anteriores:** las pruebas de W-01 a W-84 pasan sin cambiar sus flujos, salvo los textos de «cadena» a «flujo» y «Nodo k de n» al nodo en curso. El workflow lineal «Cambiar valor» se ejecuta de principio a fin. **Cumplido.**

### Pendiente

- `./mvnw verify` y `-Pit` en Ubuntu (ADR-0004, ADR-0013).

### Desviaciones y decisiones

- **Doble clic en un codo:** en el navegador real no llegaba al codo, porque el puntero se capturaba en el lienzo y el `dblclick` iba a él. Ahora se captura en el propio elemento pulsado. Las pruebas de jsdom no lo detectan, porque allí no hay captura de puntero.
- **Foco de las flechas:** al pulsar una flecha, el navegador dibujaba un rectángulo alrededor de toda ella, que con codos se notaba mucho. Se quita ese contorno y se mantiene el trazo resaltado de `:focus-visible` para el teclado.
- **El avance** muestra el nodo en curso y la vuelta de cada Bucle, no «Nodo k de n», porque con ramas no se conoce el total (propuesta K).
- **Lo que entró en un Bucle** se muestra como «N elementos», a partir de `items`, para no repetir en el evento una lista que puede tener 10 000 filas.
- **Un nodo ejecutado tras un Break**, ya fuera del Bucle, se ve en todas las vueltas, como dice W-79 para lo que está fuera del Bucle.
- **Durante el recorrido**, un texto escrito en los campos de un nodo HTTP recién elegido no llegó a guardarse. No se ha podido reproducir: escribiendo de nuevo en ese nodo, y en otro creado igual, los valores se guardan.
