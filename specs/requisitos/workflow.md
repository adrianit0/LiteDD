# Requisitos de las notas workflow

Sexto tipo de nota: un flujo que empieza en Start, pasa por nodos Login, HTTP, SQL, Espera e Input y termina en Finish. Se diseña una vez en edición y en consulta se ejecuta para cada caso cambiando solo los valores. El resultado de un nodo se puede usar en los siguientes con referencias como `$Conn1.data.test`, y cada pestaña guarda sus últimas ejecuciones (ADR-0031, ADR-0032). Los ejemplos usan nombres inventados (S-30 a S-32).

Edición:

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Ruta / Título                 ★  Etiquetas          [Ver] ⟳ Historial …    │
├────────────────────────────────────────────────────────────────────────────┤
│ + Login   + HTTP   + SQL   + Espera   + Input                              │
│ ☐ Mismos inputs tendrá mismo valor  ☑ Parar si error                       │
│ ☐ Parar si no existe input          ☐ Fijar valores de input               │
├──────────────────────────────────────────────────────┬─────────────────────┤
│                                                      │ HTTP                │
│  ╭─────╮   ┌──────────┐   ┌───────────┐   ╭──────╮   │ Nombre [Conn1     ] │
│  │Start├──▶┤ Input1   ├──▶┤ Conn1     ├──▶┤Finish│   │ Nota   [Usuario  ▾] │
│  ╰─────╯   │ id = 54  │   │ GET /use… │   ╰──────╯   │ GET /users/#{id}    │
│            └──────────┘   │ id = $In… │              │ id  [$Input1.id   ] │
│                           └───────────┘              │ Sale hacia [Finish▾]│
│                                                      │ Abrir nota          │
└──────────────────────────────────────────────────────┴─────────────────────┘
```

Consulta:

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Ruta / Título                 ★  Etiquetas       [Editar] ⟳ Historial …    │
├────────────────────────────────────────────────────────────────────────────┤
│ Input1   id [54        ]   user [demo      ]                [Restablecer]  │
├────────────────────────────────────────────────────────────────────────────┤
│ ▶ Ejecutar  ■ Cancelar  2,41 s  Terminado con 1 error  [Ejecución 10:42 ▾] │
├──────────────────────────────────────────────────────┬─────────────────────┤
│  ╭─────╮   ┌──────────┐   ┌───────────┐   ╭──────╮   │ Conn1 · 404 · 0,12 s│
│  │Start├──▶┤✓ Input1  ├──▶┤✗ Conn1    ├──▶┤Finish│   │ id  54              │
│  ╰─────╯   └──────────┘   └───────────┘   ╰──────╯   │ Cuerpo Cabeceras …  │
└──────────────────────────────────────────────────────┴─────────────────────┘
```

## Tipo y modos

| ID | Requisito |
|---|---|
| W-01 | Tipo de nota `workflow`, «Nota Workflow». Se crea desde «+ Nuevo» y desde el submenú «Nuevo» del árbol (N-04, N-05). Sigue las reglas comunes de árbol, hijas, papelera, etiquetas, favorita, descripción, duplicar, pestañas e historial. |
| W-02 | En edición se diseña el flujo y se dan sus valores guardados; en consulta se rellenan los valores de ese caso, se ejecuta y se ven los resultados. Se cambia de modo con «Editar» o «Ver» y con Ctrl+E (N-12). Un workflow nuevo se abre en edición (N-06) con Start y Finish unidos por una flecha. |
| W-03 | La pantalla tiene, de arriba abajo: en edición, la barra con los botones para añadir nodos y las casillas (W-40); en consulta, el formulario de los Input (W-50) y la barra de ejecución (W-71) con el desplegable de ejecuciones (W-75). Debajo, el lienzo y, a su derecha, un panel con el nodo seleccionado. |

## Lienzo

| ID | Requisito |
|---|---|
| W-10 | El lienzo muestra los nodos como cajas y las flechas como líneas con punta. Crece con los nodos y, si no cabe en el panel, se desplaza con barras; la posición se recuerda por pestaña (P-06). No hay zoom. |
| W-11 | En edición, arrastrar un nodo lo mueve, ajustado a una rejilla de 16 píxeles. Con un nodo seleccionado, las flechas del teclado lo mueven una celda. |
| W-12 | Cada nodo tiene una entrada a la izquierda y una salida a la derecha; Start solo tiene salida y Finish solo entrada. Cada entrada y cada salida admite una sola flecha. Arrastrar desde una salida hasta otro nodo crea la flecha; si la salida o la entrada ya tenían una, la nueva la sustituye. Un nodo no se puede unir consigo mismo. |
| W-13 | Un clic selecciona un nodo o una flecha. Supr borra lo seleccionado, salvo Start y Finish, que no se pueden borrar. Al borrar un nodo que tenía entrada y salida, su predecesor queda unido a su sucesor. |
| W-14 | «+ Login», «+ HTTP», «+ SQL», «+ Espera» y «+ Input» añaden un nodo, que queda seleccionado. Con un nodo seleccionado, el nuevo se inserta tras él en la cadena: se coloca a su derecha y los nodos que lo siguen se desplazan lo justo para dejarle sitio. Con Finish seleccionado, se inserta justo antes de Finish. Sin selección, queda suelto: debajo de los demás nodos, sin flechas y fuera de la cadena (ADR-0032). |
| W-15 | La cadena es el camino que sale de Start siguiendo las flechas. Los nodos fuera de ella se ven atenuados y no se ejecutan. Si la cadena no llega a Finish, el lienzo marca el último nodo al que llega. |
| W-16 | Un workflow tiene como máximo 100 nodos, Start y Finish incluidos. |
| W-17 | Con teclado (U-08), Tab recorre los nodos en el orden de la cadena, y los que están fuera de ella al final. En el panel, el selector «Sale hacia» une la salida del nodo con otro nodo sin usar el ratón. |

## Nodos

| ID | Requisito |
|---|---|
| W-20 | Start es un círculo verde con «Start»; Finish, un círculo de borde grueso con «Finish». Hay exactamente uno de cada uno. |
| W-21 | Los demás nodos tienen un nombre, que usan las referencias (W-30): letras sin acentos, números y `_`, empezando por una letra, hasta 40 caracteres y único en el workflow sin distinguir mayúsculas. Un nombre vacío, no válido o repetido se marca en el panel e impide ejecutar (W-61). |
| W-22 | Nombre propuesto: en HTTP y SQL, el título de la nota sin acentos ni signos y con cada palabra en mayúscula inicial («Alta de usuario» → `AltaDeUsuario`); en Login, Espera e Input, `Login1`, `Espera1` e `Input1`. Si el título no da un nombre válido, se usa `Http1` o `Sql1`. Si el nombre está ocupado, se cambia el número final por el siguiente libre o se le añade. Renombrar la nota después no cambia el nombre del nodo. |
| W-23 | Nodo HTTP: la nota HTTP se elige con un selector con búsqueda, como el de «Mover a…» (N-64). En el lienzo el nodo muestra su nombre, el título de la nota, el método y el endpoint. El panel tiene un campo por cada variable `#{…}` de la nota, en su orden (H-12). Al elegir la nota, los campos toman los valores guardados en ella. «Abrir nota» la abre en una pestaña. |
| W-24 | Nodo SQL: igual que el HTTP, con una nota SQL, también una hija generada de una nota XML MyBatis (M-20). Cada campo muestra el nombre y el tipo de su variable (Q-10 a Q-16) y es de texto, porque puede llevar referencias. Al elegir la nota, los campos toman sus últimos valores ejecutados (Q-24). Si la nota no es una consulta ejecutable (Q-45), el nodo lo indica. |
| W-25 | En el lienzo, los nodos HTTP y SQL muestran sus campos con su valor, hasta cuatro; los demás, como «+N». |
| W-26 | Si la nota de un nodo cambia sus variables, el nodo muestra las nuevas, vacías, y deja de guardar las que la nota ya no tiene. Si la nota está en la papelera, no existe o no es del tipo del nodo, el nodo lo indica en rojo. |
| W-27 | Nodo Espera: un campo «Segundos», de 0 a 3600, que admite decimales con coma o con punto y referencias. |
| W-28 | Nodo Input: filas con nombre y valor, que se añaden, quitan y reordenan. El nombre sigue las reglas de W-21 y no se repite dentro del nodo. El valor puede llevar referencias, que se resuelven cuando el flujo pasa por el nodo (W-66). |
| W-29 | Nodo Login: hace el login con la nota de login de «Ajustes» (H-20) y un único campo, «Usuario», que admite referencias. Vacío, vale el usuario del perfil activo (H-22). La contraseña es la del perfil (H-21) y el login sigue H-22 y H-23. Su sesión la usan los nodos HTTP siguientes (W-69). |

## Referencias

| ID | Requisito |
|---|---|
| W-30 | Una referencia es `$` más el nombre de un nodo y una ruta de pasos `.clave` (letras, números y `_`), `[n]` (posición desde 0) o `["clave"]` (cualquier clave). Por ejemplo, `$Conn1.data.test`, `$Query1[0].col1`, `$Input1.value2` o `$Conn1.items[2]["user-id"]`. |
| W-31 | Las referencias pueden ir en todos los campos de los nodos Login, HTTP, SQL y Espera y en los valores de los Input, solas o dentro de un texto: `Bearer $Login.token`. Una referencia empieza en un `$` seguido de una letra y acaba donde acaba su ruta. `$$` escribe un `$`; un `$` seguido de otra cosa es texto. |
| W-32 | Valor de cada nodo. HTTP: el cuerpo de la respuesta, como JSON si lo es; si no, su texto, y cualquier ruta sobre él no existe; un cuerpo binario no tiene valor. Login: igual, con el cuerpo de la respuesta del login. SQL: la lista de filas; cada fila tiene sus columnas por etiqueta (Q-61), con el valor como texto (Q-62) y NULL como null; si una etiqueta se repite, vale la primera columna. Input: sus filas por nombre. Start, Finish y Espera no tienen valor. |
| W-33 | Un nodo solo tiene valor después de ejecutarse en la ejecución en curso. Un nodo HTTP que recibe respuesta tiene valor aunque cuente como error (W-42); uno que falla sin respuesta, o un nodo SQL con error, no lo tiene. |
| W-34 | Paso a texto: las cadenas, tal cual; los números y booleanos, como en JSON (`54`, `true`); los objetos y listas, como JSON compacto. Si la referencia ocupa todo el campo y vale null, el campo vale null; dentro de un texto, null se escribe `null`. |
| W-35 | Una referencia no existe si el nombre no es de ningún nodo, si el nodo no tiene valor (W-33), si la clave o la posición no están o si un paso se aplica a algo que no es objeto o lista. Vale null, salvo con «Parar si no existe input» marcada (W-43). |
| W-36 | En edición, bajo cada campo se avisa de las referencias a nombres que no existen o a nodos que no van antes en la cadena. El aviso no impide guardar ni ejecutar. |

## Casillas

| ID | Requisito |
|---|---|
| W-40 | Las cuatro casillas están en la barra de edición y se guardan en el workflow. Un workflow nuevo tiene marcada solo «Parar si error». |
| W-41 | «Mismos inputs tendrá mismo valor»: marcada, los campos de los nodos HTTP y SQL con el mismo nombre de variable comparten valor, y cambiar uno cambia todos, en edición y en consulta. Al marcarla, cada nombre toma el valor del primer nodo de la cadena que lo tiene. Desmarcada, cada nodo tiene el suyo. Las filas de los Input no se ven afectadas. |
| W-42 | «Parar si error»: marcada, el primer nodo con error detiene el flujo; desmarcada, el flujo sigue con el siguiente. Es un error en HTTP no recibir respuesta (conexión, login, tiempo máximo) o recibir un estado 400 o mayor, y también una variable vacía (W-54) o un Login anterior fallido (W-69); en Login, un login que falla (H-23, H-26); en SQL, cualquier error (valor no válido, sentencia que no es consulta, MySQL, tiempo máximo o sin conexión); en Espera, unos segundos no válidos. |
| W-43 | «Parar si no existe input»: marcada, una referencia que no existe detiene el flujo antes de ejecutar su nodo, con el mensaje «`$Conn1.data.value` no existe», aunque «Parar si error» esté desmarcada. Desmarcada, la referencia vale null. |
| W-44 | «Fijar valores de input»: marcada, en consulta los campos de los nodos Login, HTTP, SQL y Espera son de solo lectura y valen lo guardado en edición; los Input siguen editables. Desmarcada, en consulta todos los campos se pueden cambiar. |

## Valores en consulta

| ID | Requisito |
|---|---|
| W-50 | En consulta, sobre la barra de ejecución, un formulario con las filas de los Input de la cadena, agrupadas por nodo y en su orden, con el aspecto de los criterios de SQL (Q-20). Los campos de los nodos Login, HTTP, SQL y Espera se ven y se cambian en el panel al seleccionar el nodo. |
| W-51 | Cada pestaña tiene sus propios valores de consulta (P-06). Al abrir el workflow en una pestaña se proponen los de su última ejecución y, donde no los hay, los guardados en edición. Un valor cambiado en edición pasa también a la consulta de esa pestaña. |
| W-52 | «Restablecer» devuelve todos los campos de consulta a los valores guardados en edición. |
| W-53 | Al empezar una ejecución, sus valores se guardan como los últimos ejecutados del workflow. Ejecutar no cambia los valores guardados del workflow ni los de sus notas HTTP y SQL. |
| W-54 | En un nodo HTTP, una variable vacía impide enviar y es un error del nodo (H-12); una que vale null se envía como el texto `null`. En un nodo SQL, vacío y null valen NULL (Q-21), y un valor que no convierte a su tipo es un error del nodo (Q-22). |

## Ejecución

| ID | Requisito |
|---|---|
| W-60 | En consulta, «Ejecutar» o Ctrl+Intro guarda lo pendiente y ejecuta el workflow guardado (A-04) con los valores de la pestaña. Recorre la cadena de Start a Finish nodo a nodo, sin pausas añadidas. «Cancelar» o Esc la detiene, también en mitad de una espera o de una llamada. Un cronómetro muestra el tiempo en vivo. |
| W-61 | Antes de empezar se comprueba la cadena entera. Si la cadena no llega a Finish, si un nodo de la cadena no tiene nota o la tiene en la papelera, inexistente, de otro tipo o que no es consulta, si la cadena tiene un Login y «Ajustes» no tiene una nota de login HTTP, o si un nombre está vacío, no es válido o se repite, no se ejecuta nada y se listan los motivos. |
| W-62 | Un nodo HTTP ejecuta el contenido guardado de su nota con los valores del nodo en lugar de los de la nota, con su login (H-20 a H-27) o el de un Login anterior (W-69), sus límites (H-31, H-35) y sus reglas de seguridad (H-40 a H-42, H-65 a H-71). |
| W-63 | El perfil es el activo al pulsar «Ejecutar» y vale para toda la ejecución (H-63). Si pide clave (H-69) y la cadena tiene algún nodo Login o HTTP, se pide una sola vez, se comprueba antes de empezar y cubre toda la ejecución. Si el perfil activo cambia durante la ejecución, el siguiente nodo Login o HTTP no se envía y el flujo se detiene. |
| W-64 | Un nodo SQL genera el SQL con MyBatis (Q-30) y lo ejecuta en solo lectura (S-01 a S-06), sin paginación ni orden, con el tope de filas (Q-55) y el tiempo máximo (Q-43). |
| W-65 | Un nodo Espera espera los segundos indicados. |
| W-66 | Un nodo Input resuelve los valores de sus filas en orden y, al terminar, tiene valor (W-32). |
| W-67 | Cada pestaña ejecuta un workflow cada vez; mientras dura, «Ejecutar» está desactivado. Varias pestañas pueden ejecutar a la vez, cada una por su lado. |
| W-68 | El registro solo contiene el nombre, el tipo, el estado y el tiempo de cada nodo: nunca valores, cuerpos, cabeceras ni cookies (H-42). |
| W-69 | Tras un Login correcto, los nodos HTTP siguientes usan su sesión, como con «Reutilizar login» (H-24): no hacen su propio login y no importa su usuario. Las notas con «No necesita login» siguen enviándose sin login. Otro Login más adelante sustituye la sesión desde ese punto. Si un Login falla, los nodos HTTP que usarían su sesión fallan sin enviar nada hasta otro Login correcto. Los nodos HTTP anteriores al primer Login hacen su login como siempre. El login vale solo para esa ejecución y no cambia el login reutilizable de las notas HTTP (H-25, ADR-0032). |

## Resultados

| ID | Requisito |
|---|---|
| W-70 | Durante la ejecución, cada nodo muestra su estado: pendiente, en curso con su tiempo en vivo, correcto en verde, error en rojo o no ejecutado, atenuado. |
| W-71 | La barra de ejecución tiene «Ejecutar», «Cancelar», el tiempo total, el avance («Nodo 3 de 5») y, al terminar, el resultado: «Terminado», «Terminado con N errores», «Detenido por error en Conn1», «Detenido: `$Conn1.data.value` no existe» o «Cancelado». |
| W-72 | En consulta, el panel del nodo seleccionado muestra sus campos, lo que entró en la ejecución elegida (W-76), su tiempo y lo que salió: la respuesta HTTP o del login como en H-33 a H-35, la tabla SQL como en Q-60 a Q-66 sin paginación, los valores de un Input o el error. |
| W-73 | Los resultados viven solo en la pestaña: no se guardan, se pierden al cerrarla y no se restauran al arrancar (H-36, Q-67, P-09). |

## Ejecuciones

| ID | Requisito |
|---|---|
| W-74 | Cada pestaña guarda en memoria sus 20 últimas ejecuciones, con lo que entró y salió de cada nodo. Al empezar la vigésimo primera se descarta la más antigua. Siguen W-73. Los errores previos a ejecutar (W-61) no son ejecuciones. |
| W-75 | El desplegable «Ejecución» de la barra de ejecución lista las ejecuciones de la más reciente a la más antigua, con su hora, su resultado (W-71) y su tiempo total. Por defecto se ve la última o la que está en curso, y empezar otra la muestra. Elegir una muestra en el lienzo los estados de sus nodos y en el panel sus datos. |
| W-76 | En el panel, cada campo muestra lo que entró en esa ejecución. Si el campo tenía referencias, se ven lo escrito y el valor, por ejemplo «`$Conn1.data.test` → 54». Si una referencia no existía, se marca en color de aviso: «`$Conn1.data.value` no existe → null». |
| W-77 | Sin nodo seleccionado, el panel resume la ejecución elegida: hora, resultado y, por cada nodo de la cadena, su estado, su tiempo y sus campos con referencias, con lo escrito y el valor que entró, y las referencias que no existían marcadas. Un clic en un nodo del resumen lo selecciona. |
| W-78 | El evento de cada nodo terminado lleva lo escrito en cada campo (`raw`), los valores que entraron (`values`) y las referencias que no existían (`missing`). |

## Datos

| ID | Requisito |
|---|---|
| W-80 | El contenido es un JSON con las casillas, los nodos (identificador, tipo, nombre, posición y, según el tipo, nota y valores, el usuario del Login en `values.user`, segundos o filas) y las flechas. Se guarda como cualquier nota (N-40 a N-46). |
| W-81 | El servidor rechaza con 400 (`invalid_workflow`), sin cambiar la nota, un contenido que no es JSON válido, que no tiene exactamente un Start y un Finish, con tipos de nodo desconocidos, con flechas hacia nodos que no existen o con más de una por entrada o por salida, o con más de 100 nodos. Los nombres se comprueban al ejecutar (W-61). |
| W-82 | Al exportar, un workflow es un fichero `.workflow.json` con su contenido (X-03). La importación lo acepta como tipo `workflow`. Con «Añadir como rama», las notas de los nodos que vienen en el ZIP pasan a sus identificadores nuevos (X-05); las demás se dejan como estaban. |
| W-83 | Los últimos valores ejecutados (W-53) se guardan en `variable_value`, se borran con la nota (N-55) y no se exportan (X-04). |
| W-84 | El icono de tipo es «WF» en cian (U-02). El filtro de tipo ofrece «Workflow» (N-72). |
