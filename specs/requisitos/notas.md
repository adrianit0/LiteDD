# Requisitos de notas

> Extraído de `specs/ESPECIFICACION.md`. Si este fichero y aquel difieren tras un cambio aprobado, manda este y se registra un ADR.

Una nota tiene tipo (Markdown o SQL), título, contenido y un lugar en el árbol. Estos requisitos valen para los dos tipos; lo específico de SQL está en su sección.

## Árbol

| ID | Requisito |
|---|---|
| N-01 | El panel izquierdo muestra todas las notas activas en árbol. Cada nodo tiene icono de tipo, título y control de plegado si tiene hijas. El plegado se recuerda. |
| N-02 | Cualquier nota puede tener hijas de cualquier tipo, sin límite de profundidad. |
| N-03 | Clic abre la nota; clic central la abre en pestaña nueva (ver Pestañas). |
| N-04 | Menú contextual: nueva nota Markdown hija, nueva nota SQL hija, nueva nota HTTP hija, renombrar, duplicar, favorita, etiquetas, mover a…, eliminar. |
| N-05 | Los botones «Nueva nota Markdown», «Nueva nota SQL» y «Nueva nota HTTP» del panel crean la nota en la raíz, al final. |
| N-06 | Una nota nueva se llama «Sin título» y se abre en modo edición con el título seleccionado. |
| N-07 | Cada nota tiene una descripción opcional de hasta 200 caracteres. En edición se escribe entre el título y las etiquetas; en consulta se ve bajo el título. En el árbol aparece bajo el nombre, en gris y más pequeña, en una línea que se corta con «…» donde acaba el panel (ADR-0020). |
| N-08 | «Duplicar» crea una copia de la nota, sin sus hijas, justo debajo de la original: mismo tipo, contenido, descripción, etiquetas y favorita. El título lleva « (2)», o el siguiente número libre entre las hermanas: «Informe (3)», «Informe (4)»… Un «(n)» final solo cuenta como número de copia si hay una hermana con el nombre sin él. La copia se abre en una pestaña. |

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
| N-20 | Barra de formato sobre el editor: negrita, cursiva, tachado, código en línea, títulos 1 a 3, lista, lista numerada, lista de tareas, cita, bloque de código, enlace, enlace a nota, imagen, tabla y línea horizontal. |
| N-21 | Cada botón envuelve la selección o inserta una plantilla en el cursor. Si el formato ya está aplicado, lo quita. |
| N-22 | Atajos: Ctrl+B negrita, Ctrl+I cursiva. Tabulador sangra listas; Intro continúa la lista. |

## Vista Markdown

| ID | Requisito |
|---|---|
| N-30 | Markdown GFM: tablas, listas de tareas, tachado y autoenlaces. Resaltado de bloques de código. Los bloques mermaid se dibujan como diagrama. |
| N-31 | Las casillas de tareas son de solo lectura en consulta. |
| N-32 | Los enlaces externos se abren en el navegador por defecto. Los enlaces a notas abren la nota; con clic central, en pestaña nueva. |
| N-33 | Una tabla copiada desde un resultado SQL y pegada en una nota se ve como tabla. |
| N-34 | En consulta, cada bloque de código tiene una cabecera con el lenguaje a la izquierda y un botón «Copiar» a la derecha, que copia el código sin los números de línea. Los números de línea se ven en el borde izquierdo y no se seleccionan con el texto. |

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
| N-51 | Nota con hijas: el diálogo ofrece «Subir las hijas un nivel y eliminar» o «Cancelar». No hay eliminado en cascada. Las hijas ocupan el lugar de la nota eliminada, en su mismo orden. |
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
| N-72 | Filtros combinables: tipo, etiquetas, solo favoritas y fecha de modificación (hoy, 7 días, 30 días). |
| N-73 | Ctrl+K abre una búsqueda rápida por título; Intro abre la nota. |
| N-74 | El texto buscado se escapa antes de pasarlo a FTS5; ningún carácter provoca un error. |

## Etiquetas, favoritas, enlaces e imágenes

| ID | Requisito |
|---|---|
| N-80 | Etiquetas libres por nota, con autocompletado. Se crean al usarlas y desaparecen al quedar sin notas. |
| N-81 | Favorita: estrella en la cabecera y en el menú contextual; visible en el árbol. |
| N-90 | Escribir `[[` en el editor Markdown abre un autocompletado de notas e inserta `[Título](litedd://note/<id>)`. |
| N-91 | Un enlace a una nota inexistente o en la papelera se muestra tachado. |
| N-92 | Pegar o arrastrar una imagen al editor la guarda como adjunto e inserta `![](litedd://attachment/<id>)`. Tipos PNG, JPEG, GIF y WebP; máximo 10 MB. |
| N-93 | Las direcciones `litedd://` se resuelven antes de sanear el HTML. |
