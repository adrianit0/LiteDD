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

Fecha: 2026-10-28.

### Hecho

- **Especificación:**
  - ADR-0031 aceptado con las respuestas del usuario: una ejecución por caso; nombre propio del nodo; error HTTP sin respuesta o con estado ≥ 400; Input escrito antes de ejecutar; null como el texto `null`; «Fijar valores» global; valores por pestaña y últimos ejecutados; solo el cuerpo de la respuesta.
  - Propuestas A a I aprobadas con el plan.
  - `requisitos/workflow.md` con W-01 a W-84, y cambios en N-04, N-05, X-03, X-05, U-02, la API, el modelo de datos y la arquitectura. La constitución no cambia.
- **Migración V007:** tipo `workflow`, reconstruyendo `note` como V003, V004 y V006, con `rid` y la regla de las pizarras en `note_fts`.
- **Servidor (`dev.litedd.workflow`):**
  - `WorkflowContent`: lectura y validación de la estructura al guardar e importar (`invalid_workflow`), cadena desde Start y nombres.
  - `References`: `.clave`, `[n]`, `["clave"]`, referencias dentro de un texto, `$$`, paso a texto y null. Los decimales se conservan como se escribieron (`1.50`).
  - `WorkflowRunner`:
    - Comprobación previa con todos los motivos (`workflow_invalid`), perfil fijo y una sola clave por ejecución.
    - Nodos en orden con las cuatro casillas, espera cancelable y valor de cada nodo.
    - El cuerpo de una respuesta solo se analiza como JSON si una referencia lo usa.
    - El registro solo lleva nombre, tipo, estado y tiempo.
  - `WorkflowApi`: `analyze`, `execute` en NDJSON sin búfer, con latido cada 5 s, y `cancel`. Si la pestaña deja de escuchar, la ejecución se cancela. Los últimos valores van a `variable_value` como `<nodo>/<campo>`.
  - `SqlRunner`, extraído de `SqlApi` sin cambiar su comportamiento, y `HttpRunner.executeWith` para ejecutar una nota con los valores de un nodo.
  - Exportación `.workflow.json` e importación con reasignación de `noteId` en «Añadir como rama».
- **Interfaz:**
  - `workflow/model.ts`, módulo puro: cadena, insertar y borrar manteniendo la cadena, flechas, rejilla, nombres, avisos de referencias, «Mismos inputs», valores de consulta y fijado.
  - **Edición:** lienzo con nodos en HTML y flechas en SVG, arrastre con rejilla, flechas desde la salida, Supr, flechas del teclado y Tab en el orden de la cadena. Barra con «+ HTTP», «+ SQL», «+ Espera», «+ Input» y las casillas.
  - **Panel del nodo:** nombre, selector de nota con búsqueda, «Abrir nota», campos con avisos, filas del Input, «Sale hacia» y «Eliminar nodo».
  - **Consulta:** formulario de Input, «Ejecutar» o Ctrl+Intro, «Cancelar» o Esc, cronómetro, «Nodo k de n», estados por nodo y resultado final. El panel muestra los valores usados, la respuesta HTTP o la tabla SQL y el error.
  - Valores por pestaña guardados en la sesión, últimos ejecutados al abrir y «Restablecer».
  - Tipo `workflow` con icono «WF» en cian y su prueba de contraste AA, «Nota Workflow» en los dos menús y «Workflow» en el filtro de tipo.
- **Pruebas:** 399 de backend (1 omitida en Windows) y 389 de interfaz.

### Criterios de aceptación

Recorridos con la aplicación arrancada (`exec:java`, puerto 47650), datos aislados, el navegador integrado y un servidor HTTP de pruebas en 127.0.0.1:8099.

1. **Workflow nuevo:** «Nota Workflow» lo abre en edición con Start y Finish unidos. **Cumplido.**
2. **Cadena con botones:** «+ Input», «+ HTTP», «+ HTTP» y «+ Espera» montan Start → Input1 → Http1 → Http2 → Espera1 → Finish sin dibujar flechas. Borrar un nodo intermedio une a sus vecinos (prueba W-13). **Cumplido.**
3. **Nota de un nodo:** elegir «Tareas de usuario» propone `TareasDeUsuario` y muestra `id` con el valor guardado en la nota (5). **Cumplido.**
4. **Flechas:** arrastrar el nodo lo deja en la rejilla, y arrastrar desde la salida de Input1 hasta Eco crea la flecha y deja TareasDeUsuario atenuado, fuera de la cadena. **Cumplido.**
5. **Ejecución:**
   - Con `id = $Input1.id`, `task = $TareasDeUsuario.items[0].id` y `who = $TareasDeUsuario.data.test`, los nodos se ponen en verde en orden.
   - El servidor de pruebas recibe `{"task": 1, "who": "54", "id": "5"}`, y el tiempo total (1,0 s) incluye la espera.
   - El panel muestra «Usado: 1», «Usado: 54», «Usado: 5» y la respuesta 200. **Cumplido.**
6. **Referencia que no existe:** con «Parar si no existe input», `who = $TareasDeUsuario.data.value` detiene el flujo antes de Eco con «Detenido: $TareasDeUsuario.data.value no existe». Sin la casilla, se envía `null` (prueba W-35). **Cumplido.**
7. **Error:** con `id = abc`, el 404 detiene el flujo en TareasDeUsuario («Detenido por error en TareasDeUsuario») y deja «no ejecutado» el resto. Sin la casilla, sigue (prueba W-42). **Cumplido.**
8. **Casillas de valores:**
   - Con «Fijar valores de input», en consulta los campos de Eco son de solo lectura, con su aviso, y el Input sigue editable.
   - «Mismos inputs» lo cubren las pruebas W-41 del modelo y de la interfaz. **Cumplido.**
9. **Últimos valores:** tras ejecutar con `abc`, cerrar y reabrir el workflow propone `abc`, y «Restablecer» vuelve a 5. **Cumplido.**
10. **Cancelar:** Esc durante una espera de 30 s la detiene al momento, con la espera «cancelado» y Finish «no ejecutado». **Cumplido.**
11. **Clave por ejecución:** la cubren las pruebas W-63 del servidor: se pide una vez, se comprueba antes de enviar nada y vale para todos los nodos HTTP. **Cumplido en pruebas.**
12. **Comprobación previa:** la cadena rota, una nota en la papelera o que no es consulta y un nombre repetido se listan sin ejecutar nada (pruebas W-61 del servidor y de la interfaz). **Cumplido en pruebas.**
13. **Nodo SQL con MySQL real:** **pendiente en Ubuntu** (ADR-0013). En Windows lo cubre la prueba W-64 con un SQL simulado: `$Query1[0].col1` llega al nodo HTTP siguiente y, si una columna se repite, vale la primera.
14. **Exportación:** el ZIP lleva `03-alta-de-cliente.workflow.json` con el contenido tal cual. «Añadir como rama» lo recupera apuntando a las notas importadas (prueba W-82). La búsqueda encuentra el workflow por el nombre de un nodo. **Cumplido.**
15. **Migración:** una base V006 pasa a V007 conservando `rid`, valores, pestañas y búsqueda (prueba W-01 del migrador). **Cumplido.**

### Pendiente

- `./mvnw verify` y `-Pit` en Ubuntu (ADR-0004, ADR-0013), con un nodo SQL contra MySQL real.
- Un perfil de preproducción con clave en la ventana de LiteDD: aquí solo se probó en las pruebas del servidor.

### Desviaciones y decisiones

- **Ctrl+Intro con el foco en un nodo:** el nodo se quedaba la tecla Intro y el atajo global no llegaba. Ahora los nodos dejan pasar las combinaciones con Ctrl, Alt o Meta. Lo cubre la prueba W-60/W-17.
- **Al insertar** (W-14), los nodos siguientes se desplazan lo justo para dejar sitio, no siempre un paso entero. Así el hueco hasta Finish no crece con cada nodo.
- **El campo de la espera** se llama «Segundos» en el panel. En el contenido sigue siendo `seconds`.
- **Resultados al cambiar de modo:** se conservan en la pestaña al pasar a edición y volver, como los de SQL. Se pierden al cerrarla (W-73).
- **Búsqueda:** los fragmentos de un workflow son trozos de su JSON, como en las notas HTTP (consecuencia prevista en ADR-0031).

### Cambios posteriores: Login, nodos sueltos y ejecuciones (ADR-0032)

Fecha: 2026-10-28.

- **Nodo Login (W-29, W-69):**
  - Hace el login de la nota de «Ajustes» con el usuario elegido, que admite referencias.
  - Los nodos HTTP siguientes usan su sesión sin hacer su propio login. Las notas con «No necesita login» siguen sin login. Otro Login sustituye la sesión, y un Login fallido bloquea los nodos que lo usarían.
  - El login vale solo para la ejecución: `HttpRunner.loginAs` no toca el login reutilizable (H-25).
- **Nodos sueltos (W-14):** sin selección, el nodo nuevo queda debajo de los demás, sin flechas.
- **Ejecuciones (W-74 a W-78):**
  - Cada pestaña guarda las 20 últimas, que se eligen en el desplegable «Ejecución».
  - El panel muestra lo escrito y lo que entró en cada campo, con las referencias que no existían marcadas. Sin nodo seleccionado, resume la ejecución.
  - El evento de cada nodo lleva `raw`, `values` y `missing`.
- **Pruebas:** 406 de backend (1 omitida en Windows) y 393 de interfaz. `./mvnw verify` en verde.

Recorrido con la aplicación arrancada, datos aislados y un servidor de pruebas con login en 127.0.0.1:8099:

1. **Un solo login:** Input1 (`user = ana`) → Login1 (`$Input1.user`) → «Quién soy» → «Eco abierto».
   - El servidor recibe un único login como `ana`.
   - «Quién soy» llega con la sesión `usr-ana` aunque su nota tiene el usuario `bloqueado`.
   - «Eco abierto», sin login, llega sin sesión y con `who = ana`, que sale de `$Login1.user`.
2. **Login fallido:** con `user = bloqueado`, el Login falla con 401 y «Quién soy» no se envía («El login de «Login1» falló: no se envía»). El resumen marca `$Login1.user no existe → null`.
3. **Historial:** el desplegable lista las dos ejecuciones. Elegir la primera devuelve sus estados al lienzo, y un clic en el resumen abre QuienSoy con su respuesta de entonces (`usr-ana`).
4. **Nodo suelto:** en edición, sin selección, «+ Espera» deja el nodo suelto debajo de los demás y la cadena no cambia.
