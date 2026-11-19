# Requisitos de notas

> Extraído de `specs/ESPECIFICACION.md`. Si este fichero y aquel difieren tras un cambio aprobado, manda este y se registra un ADR.

Una nota tiene tipo (Markdown, SQL, HTTP, XML MyBatis, pizarra o workflow), título, contenido y un lugar en el árbol. Estos requisitos valen para los dos tipos; lo específico de SQL está en su sección.

## Árbol

| ID | Requisito |
|---|---|
| N-01 | El panel izquierdo muestra todas las notas activas en árbol. Cada nodo tiene icono de tipo, título y control de plegado si tiene hijas. El plegado se recuerda. |
| N-02 | Cualquier nota puede tener hijas de cualquier tipo, sin límite de profundidad. Excepción: la nota XML MyBatis solo tiene sus hijas generadas, y estas no tienen hijas (M-20, M-22). |
| N-03 | Clic abre la nota; clic central la abre en pestaña nueva (ver Pestañas). |
| N-04 | Menú contextual: «Nuevo», renombrar, duplicar, favorita, importante (N-89), obsoleta (N-82), etiquetas, mover a…, eliminar. «Nuevo» despliega a su derecha un submenú con «Nota Markdown», «Nota SQL», «Nota HTTP», «Desde cURL…», «Nota MyBatis», «Nota Pizarra» y «Nota Workflow», que crean la nota como hija (ADR-0026, B-01, W-01, H-75). En una nota XML MyBatis no aparece «Nuevo»; en una hija generada solo aparecen duplicar, favorita, importante, obsoleta y etiquetas (M-20, M-22). |
| N-05 | El botón «+ Nuevo» del panel abre un menú flotante con «Nota Markdown», «Nota SQL», «Nota HTTP», «Desde cURL…», «Nota MyBatis», «Nota Pizarra» y «Nota Workflow», que crean la nota en la raíz, al final (ADR-0026, B-01, W-01, H-75). |
| N-06 | Una nota nueva se llama «Sin título» y se abre en modo edición con el título seleccionado. |
| N-07 | Cada nota tiene una descripción opcional de hasta 200 caracteres. En edición se escribe entre el título y las etiquetas; en consulta se ve bajo el título. En el árbol aparece bajo el nombre, en gris y más pequeña, en una línea que se corta con «…» donde acaba el panel (ADR-0020). |
| N-08 | «Duplicar» crea una copia de la nota, sin sus hijas, justo debajo de la original: mismo tipo, contenido, descripción, etiquetas y favorita. El título lleva « (2)», o el siguiente número libre entre las hermanas: «Informe (3)», «Informe (4)»… Un «(n)» final solo cuenta como número de copia si hay una hermana con el nombre sin él. La copia nace sin la marca de obsoleta (N-82) ni la de importante (N-89) y se abre en una pestaña. Las notas XML MyBatis y sus hijas siguen M-31. |
| N-09 | Junto a «+ Nuevo», dos botones: «Contraer todo» pliega todas las notas con hijas; «Localizar nota abierta» despliega las madres de la nota de la pestaña activa, la desplaza a la vista y le da el foco en el árbol. Sin pestaña activa está desactivado; si hay una búsqueda en curso, la quita (ADR-0027). |
| N-100 | En el árbol, el icono de tipo de una nota Markdown, SQL o XML MyBatis sin contenido (vacío o solo espacios y saltos de línea) va en gris en lugar del color de su tipo, y su texto alternativo añade «vacía». En cuanto la nota se guarda con contenido recupera su color, y lo pierde si se vacía. Las notas HTTP, pizarra y workflow, y las hijas generadas de una nota XML, se ven siempre con su color (ADR-0051). |

## Modos

| ID | Requisito |
|---|---|
| N-10 | Cada pestaña tiene dos modos: consulta y edición. Las notas existentes se abren en consulta. |
| N-11 | Nota Markdown en consulta: contenido renderizado. En edición: texto plano en el editor, sin vista previa. |
| N-12 | Se cambia de modo con un botón y con Ctrl+E. Al pasar a consulta se guarda. |
| N-13 | El título se edita en la cabecera en modo edición y con F2 en el árbol. |

## Editor Markdown

| ID | Requisito |
|---|---|
| N-20 | Barra de formato sobre el editor: negrita, cursiva, tachado, código en línea, títulos 1 a 3, lista, lista numerada, lista de tareas, cita, bloque de código, enlace, enlace a nota, imagen, pizarra (B-40), tabla y línea horizontal. |
| N-21 | Cada botón envuelve la selección o inserta una plantilla en el cursor. Si el formato ya está aplicado, lo quita. |
| N-22 | Atajos: Ctrl+B negrita, Ctrl+I cursiva. Tabulador sangra listas; Intro continúa la lista. |

## Vista Markdown

| ID | Requisito |
|---|---|
| N-30 | Markdown GFM: tablas, listas de tareas, tachado y autoenlaces. Resaltado de bloques de código. Los bloques mermaid se dibujan como diagrama. |
| N-31 | En consulta, pulsar una casilla de tareas la marca o desmarca: cambia `[ ]` por `[x]` (o al revés) en su línea del Markdown y la nota se guarda como cualquier edición, de inmediato con el guardado automático y con «Guardar» en el manual (N-46). No crea una versión del historial. Las casillas se pueden usar con el teclado (ADR-0044). |
| N-32 | Los enlaces externos, con clic o con clic central, se abren en una pestaña nueva del Chrome habitual del usuario, fuera de la ventana de LiteDD; si Chrome no está, en el navegador por defecto (ADR-0036). Los enlaces a notas abren la nota; con clic central, en pestaña nueva. |
| N-33 | Una tabla copiada desde un resultado SQL y pegada en una nota se ve como tabla. |
| N-34 | En consulta, cada bloque de código tiene una cabecera con el lenguaje a la izquierda y un botón «Copiar» a la derecha, que copia el código sin los números de línea. Los números de línea se ven en el borde izquierdo y no se seleccionan con el texto. |
| N-35 | En consulta, pulsar una imagen la abre en un visor sobre la aplicación, ajustada a la ventana. En el visor, la rueda del ratón acerca o aleja la imagen hacia el puntero, arrastrar la desplaza y doble clic vuelve al ajuste inicial; hay botones para acercar, alejar, ajustar y cerrar, y el nivel de zoom se ve en porcentaje. Escape o un clic fuera de la imagen cierran el visor. El zoom solo afecta a la imagen, no al resto de la aplicación. |

## Guardado e historial

| ID | Requisito |
|---|---|
| N-40 | Guardado automático 1,5 s después de la última pulsación, al perder el foco, al cambiar de modo y al cerrar la pestaña. Un indicador muestra «Guardando…» o «Guardado». Guardar no quita el foco al campo que se está editando. |
| N-41 | Ctrl+S guarda de inmediato. |
| N-42 | Cada guardado envía la versión de partida. Si la nota cambió entretanto, el servidor responde 409 y la interfaz pregunta: «Recargar» o «Sobrescribir». |
| N-43 | El botón «Actualizar» de la pestaña recarga la nota desde el disco. |
| N-44 | Historial: se guarda una versión al salir del modo edición y, como máximo, una cada 5 minutos durante una edición larga. Se conservan las 20 últimas por nota. |
| N-45 | El diálogo «Historial» lista las versiones con fecha y vista previa, y permite restaurar una. |
| N-46 | En «Ajustes» se puede desactivar el guardado automático. Con el guardado manual, la pestaña muestra un botón «Guardar» y se guarda con él, con Ctrl+S, al cambiar de modo y antes de acciones que necesitan la nota guardada (ejecutar, restaurar una versión, mover a la papelera). Cerrar una pestaña con cambios pregunta «Guardar», «Salir sin guardar» o «Cancelar». Cerrar la ventana con cambios muestra el aviso del navegador (ADR-0019). |

## Eliminar y papelera

| ID | Requisito |
|---|---|
| N-50 | Nota sin hijas: tras confirmar, va a la papelera. |
| N-51 | Nota con hijas: el diálogo ofrece «Subir las hijas un nivel y eliminar» o «Cancelar». No hay eliminado en cascada. Las hijas ocupan el lugar de la nota eliminada, en su mismo orden. La nota XML MyBatis sigue M-30. |
| N-52 | La papelera se abre desde el panel izquierdo. Lista título, tipo y fecha; permite restaurar, eliminar definitivamente y vaciar. |
| N-53 | Restaurar devuelve la nota a su madre original, al final. Si la madre ya no existe o está en la papelera, va a la raíz. |
| N-54 | Eliminar una nota cierra sus pestañas. |
| N-55 | La eliminación definitiva borra también historial y valores de variables. Los adjuntos sin referencias se purgan al arrancar. |

## Mover

| ID | Requisito |
|---|---|
| N-60 | Arrastrar y soltar en el árbol con tres zonas por nodo: antes, después y dentro (hija, al final). Un indicador muestra dónde caerá. |
| N-61 | La nota se mueve con toda su descendencia. |
| N-62 | No se puede soltar una nota sobre sí misma ni sobre una descendiente. |
| N-63 | Teclado: Alt+↑ y Alt+↓ entre hermanas; Alt+→ la hace hija de la hermana anterior; Alt+← la saca al nivel de su madre, justo después. |
| N-64 | «Mover a…» abre un selector de destino con búsqueda, para árboles grandes. |
| N-65 | Mantener el arrastre 600 ms sobre un nodo plegado lo despliega. |

## Búsqueda y filtros

| ID | Requisito |
|---|---|
| N-70 | El cuadro de búsqueda del panel busca en título, descripción y contenido, por prefijo, sin distinguir mayúsculas ni acentos. Responde mientras se escribe. |
| N-71 | Con búsqueda o filtro activo, el panel muestra una lista plana con título, ruta y fragmento resaltado. Al limpiar, vuelve el árbol. |
| N-72 | Filtros combinables: tipo, etiquetas, solo favoritas, solo importantes (N-99) y fecha de modificación (hoy, 7 días, 30 días). «Mostrar obsoletas» incluye las notas obsoletas, que si no quedan fuera (N-84). |
| N-73 | Ctrl+K abre una búsqueda rápida por título; Intro abre la nota. No ofrece las notas obsoletas (N-84). |
| N-74 | El texto buscado se escapa antes de pasarlo a FTS5; ningún carácter provoca un error. |

## Etiquetas, favoritas, enlaces e imágenes

| ID | Requisito |
|---|---|
| N-80 | Etiquetas libres por nota, con autocompletado. Se crean al usarlas y desaparecen al quedar sin notas. |
| N-81 | Favorita: estrella en la cabecera y en el menú contextual; visible en el árbol. |
| N-82 | Cualquier nota puede marcarse como «Obsoleta» y desmarcarse, a mano, desde el menú contextual del árbol y desde la cabecera de la nota. La marca es de esa nota y no pasa a sus hijas. Marcar o desmarcar no cambia la versión ni la fecha de modificación (ADR-0046). |
| N-83 | En el árbol, una nota obsoleta se ve atenuada y con el título tachado, en su mismo sitio. |
| N-84 | Las notas obsoletas no se ofrecen en la búsqueda del panel (salvo con el filtro «Mostrar obsoletas», N-72), en la búsqueda rápida (N-73), en el autocompletado `[[` (N-90) ni en el selector de nota de un nodo de workflow (W-23, W-24). «Mover a…» (N-64) sí las ofrece. Un enlace `litedd://note/<id>` las abre igual. |
| N-85 | Al abrir una nota obsoleta, una banda bajo la cabecera avisa de que lo está y permite quitar la marca. No impide editarla ni ejecutarla. |
| N-86 | Una nota obsoleta puede indicar la nota que la sustituye. «Sustituida por» es opcional y se elige con un selector de notas con búsqueda, entre las notas activas que no sean ella misma. La banda la muestra como enlace que abre la sustituta; si esta está en la papelera, tachada (N-91). Al quitar la marca de obsoleta, o al eliminar definitivamente la sustituta, el campo se vacía. |
| N-87 | En un workflow, el nodo HTTP o SQL cuya nota está obsoleta lo indica en el lienzo y en su panel. Es un aviso: el workflow se ejecuta igual. |
| N-88 | Las notas SQL, HTTP y workflow guardan la fecha de su última ejecución correcta y la muestran en la cabecera, junto a la de modificación. Es correcta una nota SQL que se ejecuta sin error, una nota HTTP que responde 2xx y un workflow que termina sin errores; cuenta igual desde su pestaña que como nodo de un workflow. Una nota que no se ha ejecutado no muestra nada. Ejecutar no cambia la versión ni la fecha de modificación (ADR-0046). |
| N-89 | Cualquier nota puede marcarse como «Importante» con una «Fecha fin importancia», obligatoria. «Importante…», en el menú contextual del árbol y en la cabecera de la nota, abre un diálogo con los atajos «Hoy», «Mañana» y «1 semana», que guardan al pulsarlos, y un campo de fecha que nace con mañana, o con la fecha vigente, y no admite un día anterior a hoy. Si la nota ya es importante, el diálogo permite cambiar la fecha y quitar la marca. La marca es de esa nota, no pasa a sus hijas y es independiente de favorita (N-81) y de obsoleta (N-82), con las que puede convivir. Ponerla o quitarla no cambia la versión ni la fecha de modificación (ADR-0047). |
| N-90 | Escribir `[[` en el editor Markdown abre un autocompletado de notas e inserta `[Título](litedd://note/<id>)`. Con `![[` se insertan pizarras como imagen (B-40). No ofrece las notas obsoletas (N-84). |
| N-91 | Un enlace a una nota inexistente o en la papelera se muestra tachado. |
| N-92 | Pegar o arrastrar una imagen al editor la guarda como adjunto e inserta `![](litedd://attachment/<id>)`. Tipos PNG, JPEG, GIF y WebP; máximo 10 MB. |
| N-93 | Las direcciones `litedd://` se resuelven antes de sanear el HTML. |
| N-94 | El menú contextual del árbol ofrece «Copiar enlace», que copia `litedd://note/<id>` para pegarlo fuera de LiteDD (ADR-0045). |
| N-95 | Abrir un enlace `litedd://note/<id>` fuera de LiteDD (en otra aplicación o con `xdg-open`) trae la ventana de LiteDD al frente con esa nota abierta; si LiteDD no está en marcha, arranca y la abre. `scripts/install.sh` registra el esquema `litedd` en el lanzador. Si la nota no existe o está en la papelera, LiteDD lo avisa (ADR-0045). |
| N-96 | `litedd --open "título"` hace lo mismo con la nota cuyo título coincide entero, sin distinguir mayúsculas ni acentos. Si hay varias y solo una no es obsoleta, abre esa (ADR-0046). Si no hay ninguna o sigue habiendo varias, abre la búsqueda rápida (N-73) con ese texto (ADR-0045). |
| N-97 | Una nota es importante hasta el final del día de su fecha, en hora local. Al día siguiente deja de serlo sola: pierde el resalte y sale del filtro sin que el usuario haga nada (ADR-0047). |
| N-98 | Una nota importante se resalta en su sitio: en el árbol y en los resultados de búsqueda, el título va en negrita y en el color de aviso, con una marca «!», y el título emergente dice «Importante hasta el» y la fecha. En la cabecera de la nota, el botón «Importante» muestra «Importante hasta» y la fecha. |
| N-99 | El filtro «Solo importantes» de la búsqueda del panel deja solo las notas importantes vigentes y se combina con los demás (N-72). |
