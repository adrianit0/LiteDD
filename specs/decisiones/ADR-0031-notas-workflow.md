# ADR-0031: Notas workflow

- Estado: aceptada (2026-10-28)
- Requisitos: W-01 a W-84, N-04, N-05, X-03, X-05, U-02 y la API

## Contexto

El usuario repite a menudo procesos que necesitan muchas llamadas seguidas: varias notas HTTP y consultas SQL en las que el resultado de una alimenta a la siguiente. Hoy lo hace a mano, copiando y pegando valores (ADR-0021, decisión 11). Quiere diseñar cada proceso una vez y ejecutarlo para cada caso cambiando solo unos pocos valores.

Pide un sexto tipo de nota, «Workflow»:

- Un lienzo que empieza en un círculo verde de entrada, Start, y termina en uno de salida, Finish.
- Entre medias, nodos que usan notas HTTP y SQL ya creadas y muestran sus criterios para darles valor, un nodo Espera con unos segundos y un nodo Input con variables fáciles de usar en el resto del flujo, cuyos valores se crean cuando el flujo pasa por él.
- Cada nodo tiene una flecha de entrada y una de salida; nada de condiciones (IF) por ahora.
- Referencias a resultados anteriores: `$Conn1.data.test` toma un campo del JSON de una respuesta, `$Query1[0].col1` una celda de una consulta y `$Input1.value2` un valor de un Input. Lo que no existe vale null.
- Cuatro casillas: «Mismos inputs tendrá mismo valor», «Parar si error», «Parar si no existe input» y «Fijar valores de input».
- Todo pensado para ser rápido y para poder mejorarlo después.

## Decisión

Respuestas del usuario (2026-10-28):

1. **Una ejecución por caso:** «Ejecutar» recorre el flujo una vez con los valores visibles; para otro caso se cambian y se vuelve a ejecutar. No hay lotes de casos en esta versión, pero el motor va en el servidor y queda preparado para añadirlos.
2. **Nombre propio del nodo:** el «Conn1» de `$Conn1.data.test` es un nombre del nodo, único en el workflow y propuesto a partir del título de la nota. Así una nota puede aparecer dos veces y renombrarla no rompe nada.
3. **Error en HTTP:** fallo de conexión, de login o por tiempo máximo, o una respuesta con estado 400 o mayor. Un 2xx o un 3xx es correcto.
4. **Valores del Input:** se escriben en consulta antes de ejecutar. Pueden llevar referencias, que se resuelven cuando el flujo pasa por el nodo; antes de ese punto, el Input no existe.
5. **Null en una variable HTTP:** se envía como el texto `null`. En SQL es NULL, como siempre.
6. **«Fijar valores de input»** es una casilla global: marcada, en consulta solo se pueden cambiar los Input.
7. **Valores de consulta:** cada pestaña tiene los suyos y al abrir el workflow se proponen los de la última ejecución, como en SQL (Q-24).
8. **Respuesta HTTP:** solo se puede referir el cuerpo; `$Conn1` es el JSON de la respuesta. El estado y las cabeceras no tienen referencia.

Interpretaciones que se registran (principio 9):

- «Mismos inputs tendrá mismo valor» une las variables `#{…}` de mismo nombre de los nodos HTTP y SQL, también entre una nota HTTP y una SQL. No afecta a las filas de los Input, que se usan con `$Input1.nombre`.
- «Parar si no existe input» detiene el flujo aunque «Parar si error» esté desmarcada.
- Los nodos Espera también se fijan con «Fijar valores de input».

Propuestas, aprobadas con el plan (2026-10-28):

- **A. Lienzo propio, sin dependencias nuevas.** Nodos en HTML y flechas en SVG, sin zoom, con rejilla de 16 píxeles y manejo con teclado (W-10 a W-17). Se descarta React Flow: sería una dependencia nueva (principio 2) para lo que aquí basta con una entrada y una salida por nodo.
- **B. Añadir y borrar mantienen la cadena.** Un workflow nuevo nace con Start y Finish unidos. Añadir con un nodo seleccionado lo inserta tras él, y sin selección, antes de Finish, desplazando los siguientes. Borrar un nodo intermedio une a sus vecinos (W-13, W-14). Un flujo lineal se monta solo con los botones.
- **C. Panel a la derecha.** En edición tiene la configuración del nodo seleccionado y, en consulta, sus campos y su resultado. En consulta, los Input están además arriba, como los criterios de SQL, porque son lo que cambia en cada caso (W-50, W-72).
- **D. Casillas por defecto:** solo «Parar si error» marcada (W-40). Seguir tras un error es lo arriesgado, y lo demás repite el comportamiento base que pidió el usuario.
- **E. Detalles de la sintaxis:** `.clave`, `[n]` y `["clave"]`; referencias dentro de un texto; `$$` para escribir `$`; números y booleanos como en JSON, y objetos y listas como JSON compacto (W-30 a W-34).
- **F. Nodo SQL:** sin paginación ni orden y con el tope de filas. Si una etiqueta de columna se repite, vale la primera. Todos los campos son de texto, porque pueden llevar referencias (W-24, W-32, W-64).
- **G. Comprobación previa:** una cadena rota, una nota que falta, está en la papelera o no es consulta, o un nombre no válido impiden ejecutar nada. Los nodos fuera de la cadena se ignoran (W-15, W-61). Mejor no empezar que dejar un proceso a medias por algo que se ve antes de enviar.
- **H. Perfil fijo por ejecución:** el de la barra al pulsar «Ejecutar», con una sola petición de la clave de confirmación. Si el perfil cambia durante la ejecución, el flujo se detiene antes del siguiente nodo HTTP, para no mezclar entornos (W-63).
- **I. Límites e icono:** Espera de 0 a 3600 s con decimales, como máximo 100 nodos e icono «WF» en cian (W-16, W-27, W-84).

Diseño:

- **Tipo nuevo:** sexto tipo de nota, `workflow`. La migración V007 reconstruye `note` para admitirlo, con el mismo procedimiento que V003, V004 y V006 y conservando `rid` y la regla de V006 para las pizarras en `note_fts`.
- **Contenido:** un JSON en `content` (W-80), por ejemplo:

  ```json
  {
    "options": { "sameInputs": false, "stopOnError": true, "stopOnMissing": false, "lockValues": false },
    "nodes": [
      { "id": "start", "kind": "start", "x": 32, "y": 160 },
      { "id": "n1", "kind": "input", "name": "Input1", "x": 192, "y": 160,
        "rows": [ { "name": "id", "value": "54" } ] },
      { "id": "n2", "kind": "http", "name": "Conn1", "x": 384, "y": 160,
        "noteId": "3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90", "values": { "id": "$Input1.id" } },
      { "id": "n3", "kind": "wait", "name": "Espera1", "x": 576, "y": 160, "seconds": "1,5" },
      { "id": "finish", "kind": "finish", "x": 768, "y": 160 }
    ],
    "edges": [
      { "from": "start", "to": "n1" }, { "from": "n1", "to": "n2" },
      { "from": "n2", "to": "n3" }, { "from": "n3", "to": "finish" }
    ]
  }
  ```

  Las flechas son objetos para que un nodo con varias salidas, como un IF, pueda añadirles después la salida de la que parten sin cambiar el formato.
- **Validación al guardar:** el servidor solo comprueba la estructura (W-81). Los nombres se comprueban al ejecutar, porque el guardado automático llega mientras se escriben y no debe fallar a medio nombre.
- **Motor en el servidor:** paquete `dev.litedd.workflow`, con:
  - `WorkflowContent`: lectura y validación del contenido.
  - `References`: módulo puro que analiza y resuelve las referencias, con sus pruebas.
  - `WorkflowRunner`: comprobación previa y ejecución nodo a nodo.
  - `WorkflowApi`: las rutas.

  Las llamadas HTTP ya las hace el servidor (ADR-0021) y las consultas también, así que la ventana no añade una ida y vuelta por nodo. El runner recibe un workflow y unos valores y produce eventos: un lote futuro solo tendría que lanzarlo N veces con un límite de simultaneidad.
- **Reutilización:**
  - `HttpRunner` gana un método que ejecuta una nota con unos valores y un perfil dados, sin comprobar versión.
  - El núcleo de ejecución de `SqlApi` pasa a `SqlRunner`, que usan `SqlApi` y `WorkflowRunner` (principio 7: dos usos).
  - El análisis de variables, la clasificación de sentencias, la caché de `SqlSource` (Q-33), el cliente HTTP y sus validaciones son los de siempre.
- **Progreso:** `POST /api/workflow/execute` responde en streaming con JSON por líneas (NDJSON), un evento por línea: inicio, nodo en curso, nodo terminado con su resultado y fin. La interfaz lo lee con `fetch`. Si la pestaña se cierra, la escritura falla y la ejecución se cancela. La comprobación previa (W-61), los 409 (A-05, H-63) y la clave (H-69) responden como errores JSON normales antes de la primera línea.
- **Análisis de los nodos:** `POST /api/workflow/analyze` recibe las notas de todos los nodos y devuelve, en una sola llamada, por nota:
  - Tipo, título y estado (activa, en la papelera o inexistente).
  - Método y endpoint, o si es una consulta ejecutable.
  - Variables con su tipo y valores iniciales (los guardados en la nota HTTP o los últimos ejecutados de la SQL).

  Con `workflowId`, devuelve además los últimos valores ejecutados del workflow.
- **Cancelar:** `POST /api/workflow/cancel` con el `executionId`. Cancela la llamada HTTP o la consulta en curso, o interrumpe la espera.
- **Memoria:** el cuerpo de una respuesta HTTP solo se analiza como JSON la primera vez que una referencia lo usa, y se descarta al terminar la ejecución. Con `-Xmx384m`, analizar siempre cuerpos de hasta 10 MB sería caro y casi nunca hace falta.
- **Últimos valores:** en `variable_value`, con nombre `<nodo>/<campo>` (por ejemplo `n2/id` o `n3/seconds`), al empezar cada ejecución.
- **«Mismos inputs tendrá mismo valor»:** se resuelve en la interfaz. Cada nodo guarda sus valores, y al cambiar uno se escribe el mismo en todos los campos con ese nombre. El servidor no la necesita.
- **Importación:** el reasignador de X-05 trata también el `noteId` de los nodos de un workflow.
- **Constitución:** no cambia. Un nodo SQL pasa por la misma clasificación y el mismo pool de solo lectura (principio 3) y un nodo HTTP, por los mismos destinos y validaciones (principio 4).

## Consecuencias

- Un workflow hace llamadas que modifican datos en el servidor de la aplicación, como las notas HTTP. Con «Parar si error» desmarcada, sigue enviando aunque una llamada anterior haya fallado.
- Los nodos ejecutan el contenido actual de sus notas: cambiar una nota cambia todos los workflows que la usan, y enviarla a la papelera los bloquea hasta restaurarla.
- No hay lotes de casos ni condiciones; el motor y el formato del contenido dejan sitio para ambos.
- La búsqueda indexa el JSON del workflow, como el de las notas HTTP: encuentra nombres de nodo y valores.
- Las pruebas contra MySQL real de los nodos SQL solo se pasan en Ubuntu (ADR-0013); en Windows se cubren con un ejecutor simulado.
