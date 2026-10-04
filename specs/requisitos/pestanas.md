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
| P-09 | La sesión se guarda en cada cambio y se restaura al arrancar: pestañas, orden, pestaña activa, modo y estado. Los resultados no se restauran. |
| P-10 | Si las pestañas no caben, la barra se desplaza y un menú las lista todas. |
| P-11 | Menú contextual de pestaña: cerrar, cerrar las demás, cerrar las de la derecha y duplicar. |
| P-12 | Sin pestañas abiertas se muestra una pantalla vacía con accesos a nueva nota y búsqueda. |
| P-13 | Renombrar una nota actualiza el título en todas sus pestañas y en el árbol. |
