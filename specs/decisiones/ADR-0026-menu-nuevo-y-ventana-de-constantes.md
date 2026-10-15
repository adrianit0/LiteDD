# ADR-0026: Menú «Nuevo» y ventana «Constantes» redimensionable

- Estado: aceptada (2026-10-14)
- Requisitos: N-04, N-05, M-65, H-01, M-01

## Contexto

Con cuatro tipos de nota, el panel muestra cuatro botones «Nueva nota …» y el menú contextual del árbol cuatro entradas «Nueva nota … hija». Ocupan mucho sitio y repiten lo mismo.

En la ventana «Constantes», las constantes con nombres largos deforman la tabla, y para cerrarla hay que desplazarse hasta el final.

## Decisión

Petición del usuario (2026-10-14):

1. **Panel:** un único botón «+ Nuevo». Al pulsarlo se abre un menú flotante debajo con «Nota Markdown», «Nota SQL», «Nota HTTP» y «Nota MyBatis». Alt+N y Alt+Mayús+N siguen creando directamente.
2. **Menú contextual:** una entrada «Nuevo ▸» que despliega a su derecha un submenú con los mismos tipos, creados como hija. Se abre al pasar el ratón, con clic, Intro o flecha derecha; flecha izquierda o Esc vuelve al menú principal.
3. **Constantes:**
   - La ventana es más ancha (hasta 1100 px) y se puede redimensionar desde la esquina inferior derecha.
   - La tabla tiene columnas de ancho fijo y los nombres largos se parten.
   - El título, el filtro y los botones quedan fijos; solo se desplaza la lista.
   - Hay una «×» arriba a la derecha. Si hay cambios sin guardar, cerrar (con «×», «Cerrar» o Esc) pregunta: «Guardar», «Descartar» o «Seguir editando».

## Consecuencias

- `ContextMenu` admite submenús (`MenuItem.submenu`).
- Las pruebas de N-05, H-01 y M-01 pulsan «+ Nuevo» y después el tipo.
