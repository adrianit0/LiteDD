# ADR-0039: Alto del cuerpo raw ajustable y recordado

- Estado: aceptada (2026-11-04)
- Requisitos: H-19, U-01, U-08
- Relacionada: ADR-0005 (estado de interfaz en la tabla `setting`), ADR-0021 (el cuerpo raw usa el editor existente)

## Contexto

El cuerpo raw de una nota HTTP se editaba en un recuadro de 220 px de alto fijo. Con cuerpos JSON largos, el usuario solo ve unas pocas líneas y tiene que desplazarse dentro del recuadro. Pidió que pudiera crecer a su voluntad.

Se le plantearon tres opciones: arrastrar un borde y recordar el alto, arrastrar el asa del navegador sin recordar nada, o que creciera solo con el contenido. Eligió la primera.

## Decisión

1. Bajo el cuerpo raw hay un borde que se arrastra, igual que el del panel izquierdo (U-01). Es un separador con foco: las flechas arriba y abajo cambian el alto 16 px, y 64 px con Mayús (U-08).
2. El alto por defecto sigue siendo 220 px. El mínimo es 120 px y no hay máximo: la nota HTTP se desplaza entera, así que el cuerpo puede ser más alto que la ventana.
3. El alto se guarda en la tabla `setting` con la clave `ui.httpBodyHeight` (ADR-0005). Es uno solo para todas las notas HTTP y se mantiene al cerrar la pestaña y al reiniciar.
4. No se guarda en la nota: cambiar el alto no la marca como modificada, no crea versiones y no viaja en la exportación.

## Consecuencias

- Un cuerpo largo se ve entero sin desplazarse dentro del recuadro.
- Como el alto es común, al abrir otra nota HTTP el cuerpo tiene el último alto elegido, aunque esa nota tenga un cuerpo corto.
- No hace falta tocar el servidor: `PUT /api/settings` ya admite claves `ui.*`.
