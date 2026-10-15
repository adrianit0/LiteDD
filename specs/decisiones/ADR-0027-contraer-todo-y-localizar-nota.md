# ADR-0027: «Contraer todo» y «Localizar nota abierta» en el panel

- Estado: aceptada (2026-10-15)
- Requisitos: N-09, N-01

## Contexto

Con un árbol grande, plegarlo nodo a nodo es lento, y no hay forma de encontrar en el árbol la nota que se está viendo en la pestaña activa.

## Decisión

Petición del usuario (2026-10-15): dos botones de icono a la derecha de «+ Nuevo».

1. **Contraer todo (⊟):** pliega todas las notas que tienen hijas. El plegado se guarda como cualquier otro (N-01).
2. **Localizar nota abierta (◎):** despliega todas las madres de la nota de la pestaña activa, la desplaza a la vista y le da el foco en el árbol, que ya la muestra seleccionada. Está desactivado si no hay pestaña activa. Si el panel muestra resultados de búsqueda, la búsqueda se quita para volver al árbol.

## Consecuencias

- `uiStore` gana `collapseAll` y `revealNote`; el árbol atiende la petición de localizar con `reveal`.
