# Requisitos de las notas workflow

Sexto tipo de nota: un flujo que empieza en Start, pasa por nodos Login, HTTP, SQL, Espera e Input y termina en Finish. Se diseña una vez en edición y en consulta se ejecuta para cada caso cambiando solo los valores. El resultado de un nodo se puede usar en los siguientes con referencias como `$Conn1.data.test`, y cada pestaña guarda sus últimas ejecuciones (ADR-0031, ADR-0032). Los nodos Condición, Bucle, Break y Cambiar valor permiten ramas, repeticiones y cambios de valores (ADR-0041). Los ejemplos usan nombres inventados (S-30 a S-32).

Edición:

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Ruta / Título                 ★  Etiquetas          [Ver] ⟳ Historial …    │
├────────────────────────────────────────────────────────────────────────────┤
│ + Login  + HTTP  + SQL  + Espera  + Input                                  │
│ + Condición  + Bucle  + Break  + Cambiar valor                             │
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
| W-12 | Cada nodo tiene una entrada a la izquierda y una salida a la derecha; Start solo tiene salida, Finish solo entrada y la Condición dos salidas, «Sí» arriba y «No» abajo (W-90). Una salida admite una sola flecha y una entrada, varias. Arrastrar desde una salida hasta otro nodo crea la flecha; si la salida ya tenía una, la nueva la sustituye. Un nodo no se puede unir consigo mismo, y una flecha que cerraría un ciclo no se crea y se avisa: solo el Bucle repite (W-94, ADR-0041). |
| W-13 | Un clic selecciona un nodo o una flecha. Supr borra lo seleccionado, salvo Start y Finish, que no se pueden borrar. Al borrar un nodo cuya salida tenía flecha, los nodos que llegaban a él quedan unidos a su sucesor. Al borrar una Condición se borran sus flechas sin unir nada. |
| W-14 | «+ Login», «+ HTTP», «+ SQL», «+ Espera», «+ Input», «+ Condición», «+ Bucle», «+ Break» y «+ Cambiar valor» añaden un nodo, que queda seleccionado. Con un nodo seleccionado, el nuevo se inserta tras él, y tras una Condición en su salida «Sí»: se coloca a su derecha y los nodos que lo siguen se desplazan lo justo para dejarle sitio. Con Finish seleccionado, el nuevo recibe las flechas que llegaban a Finish y sale hacia Finish. Una Condición insertada sale por «Sí» hacia el siguiente. Sin selección, el nuevo queda suelto: debajo de los demás nodos, sin flechas y fuera del flujo (ADR-0032). |
| W-15 | El flujo son los nodos a los que se llega desde Start siguiendo las flechas. Los nodos fuera de él se ven atenuados y no se ejecutan. Las salidas sin flecha de los nodos del flujo se marcan en el lienzo. |
| W-16 | Un workflow tiene como máximo 100 nodos, Start y Finish incluidos. |
| W-17 | Con teclado (U-08), Tab recorre los nodos en el orden del flujo, y los que están fuera de él al final. En el panel, el selector «Sale hacia» une la salida del nodo con otro nodo sin usar el ratón; la Condición tiene dos: «Si se cumple, sale hacia» y «Si no, sale hacia». |
| W-18 | En edición, arrastrar una flecha crea un codo en ese punto, y arrastrar un codo lo mueve; los dos se ajustan a la rejilla. Con la flecha seleccionada se ven sus codos, y doble clic en uno lo quita. La flecha pasa por sus codos en tramos rectos; sin codos, es una curva. Mover un nodo no mueve los codos, y la flecha que se crea al borrar o insertar un nodo no tiene codos (ADR-0041). |
| W-19 | En edición, soltar sobre el lienzo una nota HTTP o SQL arrastrada desde el árbol añade un nodo de ese tipo donde se suelta, ajustado a la rejilla: queda suelto, seleccionado y con esa nota, con el nombre y los valores de W-22 a W-24. Otro tipo de nota, o soltarla en consulta, no hace nada, y la nota no cambia de sitio en el árbol. |

## Nodos

| ID | Requisito |
|---|---|
| W-20 | Start es un círculo verde con «Start»; Finish, un círculo de borde grueso con «Finish». Hay exactamente uno de cada uno. |
| W-21 | Los demás nodos tienen un nombre, que usan las referencias (W-30): letras sin acentos, números y `_`, empezando por una letra, hasta 40 caracteres y único en el workflow sin distinguir mayúsculas. Un nombre vacío, no válido o repetido se marca en el panel e impide ejecutar (W-61). |
| W-22 | Nombre propuesto: en HTTP y SQL, el título de la nota sin acentos ni signos y con cada palabra en mayúscula inicial («Alta de usuario» → `AltaDeUsuario`); en Login, Espera, Input, Condición, Bucle, Break y Cambiar valor, `Login1`, `Espera1`, `Input1`, `Condicion1`, `Bucle1`, `Break1` y `Cambiar1`. Si el título no da un nombre válido, se usa `Http1` o `Sql1`. Si el nombre está ocupado, se cambia el número final por el siguiente libre o se le añade. Renombrar la nota después no cambia el nombre del nodo. |
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
| W-31 | Las referencias pueden ir en todos los campos de los nodos Login, HTTP, SQL, Espera y Bucle y en los valores de los Input y de Cambiar valor, solas o dentro de un texto: `Bearer $Login.token`. Una referencia empieza en un `$` seguido de una letra y acaba donde acaba su ruta. `$$` escribe un `$`; un `$` seguido de otra cosa es texto. La condición (W-91) y los destinos de Cambiar valor (W-97) tienen su propia sintaxis. |
| W-32 | Valor de cada nodo. HTTP: el cuerpo de la respuesta, como JSON si lo es; si no, su texto, y cualquier ruta sobre él no existe; un cuerpo binario no tiene valor. Login: igual, con el cuerpo de la respuesta del login. SQL: la lista de filas; cada fila tiene sus columnas por etiqueta (Q-61), con el valor como texto (Q-62) y NULL como null; si una etiqueta se repite, vale la primera columna. Input: sus filas por nombre. Condición: `true` o `false`. Bucle: el elemento de la vuelta en curso (W-93). Start, Finish, Espera, Break y Cambiar valor no tienen valor. |
| W-33 | Un nodo solo tiene valor después de ejecutarse en la ejecución en curso y, dentro de un Bucle, en la vuelta en curso (W-95). Un nodo HTTP que recibe respuesta tiene valor aunque cuente como error (W-42); uno que falla sin respuesta, o un nodo SQL con error, no lo tiene. Cambiar valor modifica el valor de otro nodo (W-99). |
| W-34 | Paso a texto: las cadenas, tal cual; los números y booleanos, como en JSON (`54`, `true`); los objetos y listas, como JSON compacto. Si la referencia ocupa todo el campo y vale null, el campo vale null; dentro de un texto, null se escribe `null`. |
| W-35 | Una referencia no existe si el nombre no es de ningún nodo, si el nodo no tiene valor (W-33), si la clave o la posición no están o si un paso se aplica a algo que no es objeto o lista. Vale null, salvo con «Parar si no existe input» marcada (W-43). |
| W-36 | En edición, bajo cada campo se avisa de las referencias a nombres que no existen o a nodos que no van antes en el flujo, es decir, que no están en ningún camino de Start al nodo. El aviso no impide guardar ni ejecutar. Una condición mal escrita (W-91) y un destino no válido o repetido (W-97) también se marcan, y esos sí impiden ejecutar (W-61). |

## Casillas

| ID | Requisito |
|---|---|
| W-40 | Las cuatro casillas están en la barra de edición y se guardan en el workflow. Un workflow nuevo tiene marcada solo «Parar si error». |
| W-41 | «Mismos inputs tendrá mismo valor»: marcada, los campos de los nodos HTTP y SQL con el mismo nombre de variable comparten valor, y cambiar uno cambia todos, en edición y en consulta. Al marcarla, cada nombre toma el valor del primer nodo del flujo que lo tiene. Desmarcada, cada nodo tiene el suyo. Las filas de los Input no se ven afectadas. |
| W-42 | «Parar si error»: marcada, el primer nodo con error detiene el flujo; desmarcada, el flujo sigue con el siguiente. Es un error en HTTP no recibir respuesta (conexión, login, tiempo máximo) o recibir un estado 400 o mayor, y también una variable vacía (W-54) o un Login anterior fallido (W-69); en Login, un login que falla (H-23, H-26); en SQL, cualquier error (valor no válido, sentencia que no es consulta, MySQL, tiempo máximo o sin conexión); en Espera, unos segundos no válidos; en Bucle, una lista de más de 10 000 elementos (W-93); en Cambiar valor, un destino que no se puede cambiar (W-99). |
| W-43 | «Parar si no existe input»: marcada, una referencia que no existe detiene el flujo antes de ejecutar su nodo, con el mensaje «`$Conn1.data.value` no existe», aunque «Parar si error» esté desmarcada; también una lista de Bucle que vale null (W-93). Desmarcada, la referencia vale null. |
| W-44 | «Fijar valores de input»: marcada, en consulta los campos de los nodos Login, HTTP, SQL y Espera son de solo lectura y valen lo guardado en edición; los Input siguen editables. Desmarcada, en consulta todos los campos se pueden cambiar, salvo los de W-50. |

## Valores en consulta

| ID | Requisito |
|---|---|
| W-50 | En consulta, sobre la barra de ejecución, un formulario con las filas de los Input del flujo, agrupadas por nodo y en su orden, con el aspecto de los criterios de SQL (Q-20). Los campos de los nodos Login, HTTP, SQL y Espera se ven y se cambian en el panel al seleccionar el nodo. Los de Condición, Bucle y Cambiar valor se ven, pero solo se cambian en edición: son parte del diseño, no de cada caso (ADR-0041). |
| W-51 | Cada pestaña tiene sus propios valores de consulta (P-06). Al abrir el workflow en una pestaña se proponen los de su última ejecución y, donde no los hay, los guardados en edición. Un valor cambiado en edición pasa también a la consulta de esa pestaña. |
| W-52 | «Restablecer» devuelve todos los campos de consulta a los valores guardados en edición. |
| W-53 | Al empezar una ejecución, sus valores se guardan como los últimos ejecutados del workflow. Ejecutar no cambia los valores guardados del workflow ni los de sus notas HTTP y SQL. |
| W-54 | En un nodo HTTP, una variable vacía impide enviar y es un error del nodo (H-12); una que vale null se envía como el texto `null`. En un nodo SQL, vacío y null valen NULL (Q-21), y un valor que no convierte a su tipo es un error del nodo (Q-22). |

## Ejecución

| ID | Requisito |
|---|---|
| W-60 | En consulta, «Ejecutar» o Ctrl+Intro guarda lo pendiente y ejecuta el workflow guardado (A-04) con los valores de la pestaña. Recorre el flujo desde Start siguiendo las flechas, nodo a nodo y sin pausas añadidas; en una Condición sigue la salida que corresponde (W-92) y en un Bucle repite su cuerpo (W-94). «Cancelar» o Esc la detiene, también en mitad de una espera o de una llamada. Un cronómetro muestra el tiempo en vivo. |
| W-61 | Antes de empezar se comprueba el flujo entero. No se ejecuta nada, y se listan los motivos, si: una salida de un nodo del flujo no tiene flecha; las flechas forman un ciclo; se puede llegar a un Break sin un Bucle en curso (W-96); una condición está vacía o mal escrita (W-91); un Bucle no tiene lista; un destino de Cambiar valor no es válido o se repite (W-97); un nodo del flujo no tiene nota o la tiene en la papelera, inexistente, de otro tipo o que no es consulta; el flujo tiene un Login y «Ajustes» no tiene una nota de login HTTP, o un nombre está vacío, no es válido o se repite. |
| W-62 | Un nodo HTTP ejecuta el contenido guardado de su nota con los valores del nodo en lugar de los de la nota, con su login (H-20 a H-27) o el de un Login anterior (W-69), sus límites (H-31, H-35) y sus reglas de seguridad (H-40 a H-42, H-65 a H-71). |
| W-63 | El perfil es el activo al pulsar «Ejecutar» y vale para toda la ejecución (H-63). Si pide clave (H-69) y el flujo tiene algún nodo Login o HTTP, se pide una sola vez, se comprueba antes de empezar y cubre toda la ejecución. Si el perfil activo cambia durante la ejecución, el siguiente nodo Login o HTTP no se envía y el flujo se detiene. |
| W-64 | Un nodo SQL genera el SQL con MyBatis (Q-30) y lo ejecuta en solo lectura (S-01 a S-06), sin paginación ni orden, con el tope de filas (Q-55) y el tiempo máximo (Q-43). |
| W-65 | Un nodo Espera espera los segundos indicados. |
| W-66 | Un nodo Input resuelve los valores de sus filas en orden y, al terminar, tiene valor (W-32). |
| W-67 | Cada pestaña ejecuta un workflow cada vez; mientras dura, «Ejecutar» está desactivado. Varias pestañas pueden ejecutar a la vez, cada una por su lado. |
| W-68 | El registro solo contiene el nombre, el tipo, el estado y el tiempo de cada nodo: nunca valores, cuerpos, cabeceras ni cookies (H-42). |
| W-69 | Tras un Login correcto, los nodos HTTP siguientes usan su sesión, como con «Reutilizar login» (H-24): no hacen su propio login y no importa su usuario. Las notas con «No necesita login» siguen enviándose sin login. Otro Login más adelante sustituye la sesión desde ese punto. Si un Login falla, los nodos HTTP que usarían su sesión fallan sin enviar nada hasta otro Login correcto. Los nodos HTTP anteriores al primer Login hacen su login como siempre. El login vale solo para esa ejecución y no cambia el login reutilizable de las notas HTTP (H-25, ADR-0032). |

## Resultados

| ID | Requisito |
|---|---|
| W-70 | Durante la ejecución, cada nodo muestra su estado en la vuelta elegida (W-79): pendiente, en curso con su tiempo en vivo, correcto en verde, error en rojo o no ejecutado, atenuado. Una Condición ejecutada muestra además la salida que tomó: «→ Sí» o «→ No». |
| W-71 | La barra de ejecución tiene «Ejecutar», «Cancelar», el tiempo total, el avance (el nodo en curso y, dentro de un Bucle, la vuelta de cada uno: «Conn1 · Bucle1 3 de 10») y, al terminar, el resultado: «Terminado», «Terminado con N errores», «Detenido por error en Conn1», «Detenido: `$Conn1.data.value` no existe», «Detenido: la lista de Bucle1 vale null» o «Cancelado». |
| W-72 | En consulta, el panel del nodo seleccionado muestra, en la vuelta elegida (W-79), sus campos, lo que entró (W-76), su tiempo y lo que salió: la respuesta HTTP o del login como en H-33 a H-35, la tabla SQL como en Q-60 a Q-66 sin paginación, los valores de un Input, la salida que tomó una Condición, el número de elementos y el elemento de la vuelta de un Bucle, lo que entró en cada destino de Cambiar valor o el error. |
| W-73 | Los resultados viven solo en la pestaña: no se guardan, se pierden al cerrarla y no se restauran al arrancar (H-36, Q-67, P-09). |

## Ejecuciones

| ID | Requisito |
|---|---|
| W-74 | Cada pestaña guarda en memoria sus 20 últimas ejecuciones, con lo que entró y salió de cada nodo en cada vuelta. Al empezar la vigésimo primera se descarta la más antigua. Siguen W-73. Los errores previos a ejecutar (W-61) no son ejecuciones. |
| W-75 | El desplegable «Ejecución» de la barra de ejecución lista las ejecuciones de la más reciente a la más antigua, con su hora, su resultado (W-71) y su tiempo total. Por defecto se ve la última o la que está en curso, y empezar otra la muestra. Elegir una muestra en el lienzo los estados de sus nodos y en el panel sus datos. |
| W-76 | En el panel, cada campo muestra lo que entró en esa ejecución. Si el campo tenía referencias, se ven lo escrito y el valor, por ejemplo «`$Conn1.data.test` → 54». Si una referencia no existía, se marca en color de aviso: «`$Conn1.data.value` no existe → null». |
| W-77 | Sin nodo seleccionado, el panel resume la ejecución elegida: hora, resultado, las vueltas con algún error, que se eligen con un clic, y, por cada nodo del flujo, su estado en la vuelta elegida, su tiempo y sus campos con referencias, con lo escrito y el valor que entró, y las referencias que no existían marcadas. Un clic en un nodo del resumen lo selecciona. |
| W-78 | El evento de cada nodo terminado lleva lo escrito en cada campo (`raw`), los valores que entraron (`values`), las referencias que no existían (`missing`) y la vuelta (`iteration`: la de cada Bucle en curso, desde 1, por ejemplo `[2, 3]`). La Condición lleva además la salida (`branch`: `yes` o `no`) y el Bucle, el número de elementos (`items`). Cada vuelta de un Bucle tiene su evento `iteration`, con el Bucle, la vuelta, el total y el elemento como texto (W-34). |
| W-79 | En consulta, si la ejecución elegida tiene vueltas de Bucle, arriba del panel, también en el resumen, el selector «Iteración» las lista en orden, con la vuelta de cada Bucle («Bucle1 2 de 10 · Bucle2 3 de 5») y una marca en las que tienen algún error. Por defecto se ve la última, que sigue a la que está en curso, y empezar otra ejecución o elegir otra vuelve a ella. Elegir una vuelta cambia los estados del lienzo y el panel. Un nodo que no se ejecutó en esa vuelta muestra lo de la vuelta que la contiene, o lo de fuera del Bucle, y si no lo hay, «no ejecutado». |

## Datos

| ID | Requisito |
|---|---|
| W-80 | El contenido es un JSON con las casillas, los nodos (identificador, tipo, nombre, posición y, según el tipo, nota y valores, el usuario del Login en `values.user`, segundos, filas, condición, lista o cambios) y las flechas (origen, salida, destino y codos). Se guarda como cualquier nota (N-40 a N-46). |
| W-81 | El servidor rechaza con 400 (`invalid_workflow`), sin cambiar la nota, un contenido que no es JSON válido, que no tiene exactamente un Start y un Finish, con tipos de nodo desconocidos, con flechas hacia nodos que no existen, desde una salida que el nodo no tiene (solo la Condición tiene `yes` y `no`, y no tiene la normal) o con más de una por salida, o con más de 100 nodos. Los nombres, los ciclos y las salidas sin flecha se comprueban al ejecutar (W-61). |
| W-82 | Al exportar, un workflow es un fichero `.workflow.json` con su contenido (X-03). La importación lo acepta como tipo `workflow`. Con «Añadir como rama», las notas de los nodos que vienen en el ZIP pasan a sus identificadores nuevos (X-05); las demás se dejan como estaban. |
| W-83 | Los últimos valores ejecutados (W-53) se guardan en `variable_value`, se borran con la nota (N-55) y no se exportan (X-04). |
| W-84 | El icono de tipo es «WF» en cian (U-02). El filtro de tipo ofrece «Workflow» (N-72). |

## Control del flujo

| ID | Requisito |
|---|---|
| W-90 | Nodo Condición: una caja con su condición, una entrada y dos salidas, «Sí» arriba y «No» abajo. El panel tiene un campo «Condición» y los dos «Sale hacia» de W-17. |
| W-91 | La condición combina valores con `==`, `!=`, `>`, `>=`, `<`, `<=`, `&&` (y), `\|\|` (o), `!` (no) y paréntesis. Primero se aplica `!`, después las comparaciones, después `&&` y por último `\|\|`; dos comparaciones no se encadenan sin paréntesis. Un valor es una referencia (W-30), un número (`54`, `-1.5`), un texto entre comillas dobles (`"A"`, con `\"` y `\\`), `true`, `false` o `null`. Los espacios no cuentan. Una condición vacía o mal escrita se marca en edición e impide ejecutar (W-61). |
| W-92 | Al ejecutarse, cada referencia vale lo que vale en ese momento, y una que no existe vale null (W-35, W-43); su valor nunca se vuelve a leer como condición. `==` y `!=` comparan como números si los dos lados son números o textos que son números (`"54" == 54`); si no, comparan el texto de W-34, y null solo es igual a null. `>`, `>=`, `<` y `<=` comparan como números si los dos lados lo son, si no por orden de caracteres del texto, y con null son falsos. Un valor solo es falso si vale null, false, 0 (también como texto, `"0"`), texto vacío o lista vacía, y verdadero si no. El flujo sigue por «Sí» si la condición es verdadera y por «No» si es falsa. |
| W-93 | Nodo Bucle: un campo «Lista», normalmente una referencia sola, como `$Query1` o `$Conn1.data.items`. Si la lista es una lista JSON, recorre sus elementos en orden; si es otro valor, lo recorre como un único elemento; una lista vacía no da vueltas. Si vale null o no existe, con «Parar si no existe input» el flujo se detiene (W-43) y, sin ella, no da vueltas. Una lista de más de 10 000 elementos es un error del nodo (W-42) y no da vueltas. En cada vuelta, `$Bucle1` vale el elemento. |
| W-94 | El cuerpo del Bucle es lo que sigue a su salida. Cada vuelta lo recorre desde la salida del Bucle y, al llegar a Finish, empieza la siguiente. Tras la última vuelta, o sin vueltas, Finish termina la ejecución o, si el Bucle está dentro del cuerpo de otro, sigue con la siguiente vuelta del de fuera. Las flechas no forman ciclos (W-12): solo el Bucle repite. |
| W-95 | Al empezar cada vuelta, los nodos del cuerpo pierden su valor (W-33): una referencia a un nodo de una rama que no se tomó en esa vuelta no existe. Los valores de los nodos anteriores al Bucle, y lo que Cambiar valor les haya cambiado, se conservan entre vueltas. |
| W-96 | Nodo Break: una entrada y una salida. Termina el Bucle más interior en curso, que no da más vueltas, y el flujo sigue por la salida del Break. Si se puede llegar a un Break sin un Bucle en curso, por ejemplo fuera de todo Bucle o tras otro Break que ya terminó el único, no se ejecuta nada (W-61). |
| W-97 | Nodo Cambiar valor: filas «destino = valor», que se añaden, quitan y reordenan como las del Input. El destino es una referencia sola (W-30), como `$Http1.data.valor` o `$Query1[0].col1`; sin ruta, como `$Http1`, cambia el valor entero. El valor admite referencias (W-31). Un destino que no es una referencia sola o que se repite en el nodo se marca en edición e impide ejecutar (W-61). |
| W-98 | El valor se resuelve como en W-34 y se lee como JSON si lo es: `54` es un número, `true` y `false` booleanos, `null` nulo, `{…}` y `[…]` un objeto y una lista, y `"54"`, con comillas, el texto 54. Si no es JSON, como `abc`, es texto. Así `$Input1.nuevo` con 54 entra como número, y una referencia completa a un objeto o una lista lo copia tal cual. |
| W-99 | Las filas se aplican en orden cuando el flujo pasa por el nodo. En un objeto, la clave se crea si no existe; en una lista, la posición debe existir. Si el nodo del destino no tiene valor (W-33), si un paso intermedio no existe o si se aplica a algo que no es objeto o lista, es un error del nodo y no se aplica ninguna fila. El cambio dura el resto de la ejecución, también en las siguientes vueltas de un Bucle, hasta que el nodo cambiado se vuelva a ejecutar. No cambia la respuesta que muestra el nodo (W-72): solo su valor para las referencias. |
