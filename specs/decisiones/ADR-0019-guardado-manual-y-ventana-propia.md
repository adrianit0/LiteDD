# ADR-0019: Guardado manual, foco al guardar y ventana propia

- Estado: aceptada (2026-10-05)
- Requisitos: N-40, N-46, U-10, ciclo de vida (paso 3)

## Contexto

Tras probar LiteDD en Ubuntu, el usuario pidió tres cambios:

1. El autoguardado quitaba el foco al editor.
2. Poder desactivar el guardado automático.
3. Que la ventana no compartiera el icono de Chrome en la barra de aplicaciones.

## Decisión

### Foco al guardar (N-40)

La causa era el árbol. Al guardar, el título llega al árbol y este devolvía el foco a la fila activa cada vez que cambiaban sus filas. Ahora solo mueve el foco si ya estaba dentro del árbol o en ningún sitio.

### Guardado manual (N-46)

1. `config.json` gana `autosave` (por defecto `true`). Un fichero anterior sin el campo sigue con el guardado automático.
2. Con `autosave = false`:
   - No se guarda al escribir, al perder el foco ni al cerrar la ventana.
   - La pestaña muestra «Guardar», que también es Ctrl+S.
3. Respuestas del usuario:
   - Cambiar de modo guarda, como con el guardado automático.
   - Cerrar la ventana con cambios muestra el aviso genérico del navegador (`beforeunload`): el navegador no permite un diálogo propio de tres botones al cerrar la ventana.
4. Cerrar una pestaña con cambios pregunta «Guardar», «Salir sin guardar» o «Cancelar». Lo mismo vale para cerrar las demás o las de la derecha, pestaña a pestaña; «Cancelar» detiene el resto.
5. Las acciones que necesitan la nota guardada en el servidor siguen guardando antes: ejecutar SQL, restaurar una versión, renombrar desde el árbol, duplicar la pestaña y mover a la papelera.
6. Al recuperar el contacto (U-11) solo se repiten los guardados que se pidieron y fallaron.

### Ventana propia (ciclo de vida, paso 3)

Si Chrome ya está abierto, `google-chrome --app` entrega la ventana al proceso existente, que la agrupa bajo el icono de Chrome. Por eso la ventana se abre así:

```
google-chrome --app=<url> --class=litedd --user-data-dir=~/.local/state/litedd/chrome \
  --ozone-platform=x11 --no-first-run --no-default-browser-check
```

- El perfil propio arranca un proceso de Chrome aparte, así que la clase de ventana se respeta.
- `--class=litedd` fija la clase de ventana, que coincide con el nombre del lanzador `litedd.desktop` y con su `StartupWMClass=litedd`. El escritorio asocia así la ventana al lanzador y a su icono.
- `--ozone-platform=x11` hace falta porque, con Wayland nativo, Chrome no usa `--class` y da a la ventana un identificador propio. Con X11 (también mediante XWayland) la clase es la indicada.
- La página declara `litedd.png` como favicon, que Chrome usa como icono de la ventana.

## Consecuencias

- El perfil de Chrome de LiteDD es independiente del perfil habitual del usuario: sin extensiones, sin sesiones y con su propio tamaño de ventana recordado. Ocupa unos megabytes en `~/.local/state/litedd/chrome`, y `scripts/uninstall.sh` no lo borra, igual que el resto de los datos.
- Si un escritorio no asocia la ventana al lanzador, la clase real se puede comprobar con `xprop WM_CLASS`.
