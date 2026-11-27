# Requisitos de pestañas y sesión

> Extraído de `specs/ESPECIFICACION.md`. Si este fichero y aquel difieren tras un cambio aprobado, manda este y se registra un ADR.

Cada nota abierta ocupa una pestaña independiente, y la misma nota puede estar en varias a la vez.

| ID | Requisito |
|---|---|
| P-01 | La barra de pestañas muestra, por pestaña, icono de tipo, título, estado de guardado y botón de cierre. |
| P-02 | Clic sobre una nota: si ya está abierta, se activa la primera pestaña que la contenga; si no, se abre una pestaña nueva. |
| P-03 | Clic central sobre una nota (árbol, búsqueda o enlace): siempre abre una pestaña nueva y la activa, aunque la nota ya esté abierta. |
| P-04 | Una pestaña se cierra con su botón, con clic central sobre ella o con Alt+W. |
| P-05 | Las pestañas se reordenan arrastrando. |
| P-06 | Cada pestaña guarda su propio modo, desplazamiento, valores de variables, tamaño de página, orden y resultados. |
| P-07 | Dos pestañas de la misma nota no se sincronizan en vivo. «Actualizar» recarga el contenido; los conflictos se resuelven según N-42. |
| P-08 | Cerrar una pestaña guarda lo pendiente y libera sus resultados. |
| P-09 | La sesión se guarda en cada cambio y se restaura al arrancar: pestañas, orden, pestaña activa, modo y estado, y con la vista dividida (P-15) el panel de cada pestaña y la pestaña visible de cada panel. Los resultados no se restauran. |
| P-10 | Si las pestañas no caben, la barra se desplaza y un menú las lista todas. |
| P-11 | Menú contextual de pestaña: cerrar, cerrar las demás, cerrar las de la derecha y duplicar. |
| P-12 | Sin pestañas abiertas se muestra una pantalla vacía con accesos a nueva nota y búsqueda. |
| P-13 | Renombrar una nota actualiza el título en todas sus pestañas y en el árbol. |
| P-14 | Un clic sobre una nota que no está abierta (árbol, búsqueda o enlace) la abre en una pestaña provisional, con el título en cursiva. Abrir otra nota así sustituye a la provisional en su sitio. La pestaña pasa a ser fija al modificar la nota, al pulsar «Editar» o «Actualizar», al ejecutar la consulta, con doble clic sobre la pestaña o con doble clic sobre la nota en el árbol. El clic central (P-03) y las notas nuevas abren pestañas fijas (ADR-0020). |
| P-15 | Vista dividida: el área de notas puede mostrar dos paneles, izquierdo y derecho, cada uno con su barra de pestañas y su pestaña visible. Una pestaña pasa al otro panel con «Mover a la derecha» o «Mover a la izquierda» de su menú contextual, o arrastrándola a la barra del otro panel; sin vista dividida, arrastrarla a la mitad derecha del área de notas la abre. El panel derecho desaparece al quedarse sin pestañas; si es el izquierdo el que se queda sin ellas, las del derecho pasan a la izquierda (ADR-0053). |
| P-16 | Con la vista dividida, el panel con el foco es el último en el que se pulsó o se escribió, y su pestaña visible es la pestaña activa: la marca el árbol y sobre ella actúan Ctrl+E, Ctrl+S, Ctrl+Intro, Alt+W, Alt+RePág, Alt+AvPág y Esc para cancelar una ejecución. La pestaña visible del otro panel se distingue con un tono más apagado. |
| P-17 | Con la vista dividida, las pestañas nuevas (P-02, P-03, P-14, notas nuevas) se abren en el panel con el foco, y una nota ya abierta en cualquier panel activa su pestaña (P-02). Hay una pestaña provisional por panel. «Cerrar las demás», «Cerrar las de la derecha», «Duplicar», el menú «▾», el reordenado y Alt+RePág/AvPág actúan dentro del panel de la pestaña. |
| P-18 | El separador entre los dos paneles se arrastra o se mueve con las flechas para repartir el ancho, entre el 20 % y el 80 %, y el reparto se recuerda (ADR-0005). Empieza al 50 %. |
