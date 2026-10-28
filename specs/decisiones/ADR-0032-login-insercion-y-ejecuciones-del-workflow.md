# ADR-0032: Nodo Login, nodos sueltos e historial de ejecuciones del workflow

- Estado: aceptada (2026-10-28)
- Requisitos: W-03, W-14, W-29, W-32, W-42, W-44, W-61, W-63, W-69, W-72, W-74 a W-78, W-80, W-81
- Modifica: ADR-0031 (propuesta B: sin selección, el nodo nuevo ya no va antes de Finish)

## Contexto

Tras usar los workflows, el usuario pidió tres cambios:

1. **Login:** cada nodo HTTP hace su propio login con el usuario de su nota. Eso va contra el uso que quiere darles: elegir una vez con qué usuario se hace todo el proceso. Pide un nodo «Login» que use la nota de login de «Ajustes» con el usuario que se elija y cuya sesión usen los nodos HTTP siguientes, como si tuvieran marcada «Reutilizar login».
2. **Añadir sin selección:** el nodo nuevo se unía antes de Finish y obligaba a rehacer flechas. Sin selección debe quedar suelto; con un nodo seleccionado, se sigue insertando tras él.
3. **Historial:** al ejecutar otra vez se pierde lo anterior. Quiere un historial que dure mientras la pestaña está abierta y que muestre qué entró y qué salió de cada nodo, sobre todo los valores que llegan por referencias, que es donde aparecen los fallos.

## Decisión

Respuestas del usuario (2026-10-28):

1. **Notas con «No necesita login»:** tras un Login se respetan y se envían sin login. Las demás notas HTTP posteriores usan la sesión del Login, sea cual sea su usuario o su casilla de login.
2. **Alcance del login:** solo esa ejecución. No cambia el login reutilizable de las notas HTTP sueltas (H-25), así dos ejecuciones a la vez, o una ejecución y una nota suelta, no se pisan la sesión.
3. **Historial:** las 20 últimas ejecuciones de la pestaña, con todo lo que entró y salió de cada nodo.

Detalles, tomados con el mismo criterio que las respuestas:

- **El nodo Login** tiene un único campo, «Usuario», que admite referencias (`$Input1.user`). Vacío, vale el usuario del perfil activo (H-22). La contraseña es la del perfil (H-21) y el login sigue H-22 y H-23. Su valor es el cuerpo de la respuesta del login, como el de un nodo HTTP.
- **Otro Login** más adelante sustituye la sesión desde ese punto, por ejemplo para cambiar de usuario a mitad del proceso. Los nodos HTTP anteriores al primer Login hacen su login como siempre.
- **Si el login falla,** es un error del nodo. Los nodos HTTP que usarían su sesión fallan sin enviar nada hasta que otro Login sea correcto. Con «Parar si error» marcada, el flujo ya se detiene en el Login.
- **Nodo suelto:** sin selección, el nodo nuevo se coloca debajo de los demás, sin flechas y atenuado como cualquier nodo fuera de la cadena. Con Finish seleccionado se sigue insertando antes de Finish, porque Finish no tiene salida.
- **Historial:** se llama «Ejecuciones» para no confundirlo con el historial de versiones de la nota (N-45). Se elige en un desplegable de la barra de ejecución. Sin nodo seleccionado, el panel resume la ejecución elegida: cada nodo con su estado y sus campos con referencias.

Diseño:

- **Contenido:** nodo `{"kind": "login", "name": "Login1", "values": {"user": "…"}}`. El campo usa `values`, como los de HTTP y SQL, para reutilizar los valores de consulta, el fijado y los últimos valores (`<nodo>/user`).
- **Servidor:**
  - `HttpRunner` separa el login de su almacenamiento. `loginAs` hace el login de la nota de «Ajustes» y devuelve la sesión sin tocar el login reutilizable. `executeWith` acepta una sesión impuesta, que sustituye al login de la nota salvo con «No necesita login».
  - `WorkflowRunner` guarda la sesión del último Login correcto durante la ejecución.
  - La comprobación previa (W-61) exige la nota de login de «Ajustes» si la cadena tiene un Login. El perfil y la clave (W-63) cuentan los Login como llamadas HTTP.
- **Eventos:** el evento de un nodo terminado lleva además `raw`, lo escrito en cada campo, y `missing`, las referencias que no existían. Así la interfaz distingue un null que llegó de una referencia que falta.
- **Historial en la interfaz:** `workflowRunStore` guarda por pestaña una lista de ejecuciones, la más reciente primero, con la hora, la cadena, el estado de cada nodo y el final. La ejecución en curso es la primera de la lista. Los errores previos (W-61) no son ejecuciones y no entran en la lista.

## Consecuencias

- Un workflow con Login hace un solo login por ejecución, en lugar de uno por nodo HTTP.
- Todos los usuarios de un perfil comparten su contraseña (H-21), igual que el campo «Usuario» de las notas HTTP.
- Las 20 ejecuciones guardan las respuestas completas en la memoria de la ventana. Con respuestas muy grandes, cerrar la pestaña libera esa memoria.
