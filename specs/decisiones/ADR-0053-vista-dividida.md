# ADR-0053: Vista dividida en dos paneles

- Estado: aceptada (2026-11-27)
- Requisitos: P-09, P-15, P-16, P-17, P-18
- Relacionada: ADR-0005, ADR-0020

## Contexto

El usuario quiere consultar los datos de una nota mientras modifica otra: llevar una pestaña a la derecha y trabajar a la izquierda sin cambiar de pestaña cada vez.

Respuestas del usuario (2026-11-27):
- Una pestaña se mueve con el menú contextual y también arrastrándola a la otra barra.
- El separador entre los paneles se arrastra y el reparto se recuerda.
- Lo que se abre desde el árbol, la búsqueda o un enlace va al panel con el foco.

## Decisión

1. Hay como mucho dos paneles. Cada pestaña pertenece a uno (`left` o `right`) y cada panel muestra una pestaña. No hay paneles vacíos: el derecho existe mientras tenga pestañas, y si el izquierdo se queda sin ellas, las del derecho pasan a la izquierda. Por eso «Mover a la derecha» no aparece en la única pestaña del panel izquierdo.
2. El panel con el foco es el último en el que se pulsó o recibió el foco. Su pestaña visible es la pestaña activa de siempre: la que marca el árbol y sobre la que actúan los atajos globales. Esc cancela solo la ejecución de la pestaña activa, para no cancelar una consulta del otro panel al pulsar Esc mientras se escribe.
3. Las pestañas nuevas se abren en el panel con el foco. P-02 no cambia: si la nota ya está abierta en cualquier panel, se activa esa pestaña y su panel pasa a tener el foco. Hay una pestaña provisional por panel (P-14), para que abrir notas en un lado no sustituya la provisional del otro.
4. «Cerrar las demás», «Cerrar las de la derecha», «Duplicar», el menú «▾», el reordenado y Alt+RePág/AvPág trabajan dentro del panel de la pestaña. Al cerrar la pestaña visible de un panel se muestra la de su derecha o, si no hay, la de su izquierda, dentro del mismo panel.
5. Arrastrar: soltar sobre una pestaña del otro panel la coloca en su sitio; soltar sobre la barra vacía del otro panel la coloca al final. Sin vista dividida, mientras se arrastra aparece una zona en la mitad derecha del área de notas; soltar ahí abre el panel derecho con esa pestaña. Mover una pestaña de panel, por menú o arrastrando, la fija (P-14), para que no la sustituya la provisional de su panel nuevo.
6. En un panel estrecho, los botones de la cabecera de la nota bajan de línea en vez de invadir el otro panel.
7. El reparto de ancho se guarda en la tabla `setting` como `ui.splitRatio` (fracción del panel izquierdo, de 0,2 a 0,8; 0,5 por defecto). Con el teclado, las flechas mueven el separador un 2 % y con Mayús un 10 %.
8. La sesión (P-09) guarda en el estado de cada pestaña su panel (`side`) y si es la visible de su panel (`shown`). La pestaña activa sigue siendo `active`. El estado es JSON libre, así que no hay migración ni cambio en el servidor; una sesión anterior se restaura entera en el panel izquierdo.
9. Dos pestañas de la misma nota, una en cada panel, siguen sin sincronizarse en vivo (P-07).
