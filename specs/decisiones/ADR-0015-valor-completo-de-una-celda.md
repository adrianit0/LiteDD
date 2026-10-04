# ADR-0015: El valor completo de una celda se muestra en un panel

- Estado: aceptada (2026-10-04)
- Requisitos: Q-64, Q-65, U-07

## Decisión

Un clic selecciona la celda (Q-65). Si su valor no cabe en la tabla, porque supera los 200 caracteres o porque el servidor lo recortó, el clic abre también un panel bajo la tabla con el valor completo. El panel indica si el servidor recortó el valor a 10.000 caracteres y se cierra con su botón o con Esc. No se usa un diálogo, porque U-07 los reserva para confirmaciones y conflictos.
