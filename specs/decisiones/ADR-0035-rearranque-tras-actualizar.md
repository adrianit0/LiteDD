# ADR-0035: Rearranque automático tras actualizar

- Estado: aceptada (2026-11-02)
- Requisitos: R-43, R-44, R-45
- Modifica: R-43 y R-44, y corrige el arranque de la versión nueva de ADR-0033

## Contexto

El usuario informa de que, cada vez que actualiza, el servidor se cae y tiene que volver a abrir LiteDD a mano. Pide que la aplicación se cierre al instalar la versión nueva y que, si se puede, vuelva a abrirse sola.

Comprobaciones (2026-11-02):

- **Ventana:** con la aplicación real en Windows, al apagar el build 5 y arrancar el build 6 en el mismo puerto, la ventana recupera el contacto y se recarga sola (R-45). El fallo no está ahí.
- **Lanzador de jpackage:** en `LinuxLauncherLib.cpp` de la JDK 21, el lanzador guarda en `_JPACKAGE_LAUNCHER` un hash de `LD_LIBRARY_PATH` y después añade `lib/app` a esa variable. Si al arrancar encuentra `_JPACKAGE_LAUNCHER` con otro hash, entiende que lo reejecuta la propia JVM y le pasa su línea de órdenes tal cual, sin leer su configuración.
- **Efecto:** el proceso `sh` hereda las dos variables de la JVM, así que `bin/litedd --no-window --port N` equivale a `java --no-window --port N`, que termina por una opción no reconocida.
- **Por qué no se vio:**
  - La salida del lanzador iba a `/dev/null`.
  - Las pruebas usaban un lanzador falso.
  - Si el usuario abría la aplicación a mano antes de 60 s, aparecía `instance.json` y el proceso daba la versión nueva por buena. Si no, restauraba el JAR anterior.

No hay Linux en el equipo de desarrollo: la causa sale del código de la JDK y de los síntomas, no de verla ocurrir en Ubuntu.

## Decisión

1. **Entorno limpio.** El proceso `sh` quita `_JPACKAGE_LAUNCHER` y `LD_LIBRARY_PATH` antes de usar el lanzador, de modo que arranca igual que desde el escritorio.
2. **Errores a la vista.** La salida de errores de `bin/litedd` va a `update.log`. La salida normal sigue descartándose, porque repite `litedd.log`.
3. **La ventana no se cierra.** La versión nueva arranca con `--no-window` y la ventana abierta se recarga sola (R-45). Para el usuario el resultado es el que pidió: no hace nada a mano.

## Alternativas descartadas

- **Cerrar la ventana y abrir otra.** `window.close()` solo funciona en algunas ventanas. Además, el perfil propio de Chrome (ADR-0019) es un único proceso, y abrir una ventana mientras se cierra la anterior puede perder la nueva. Si `window.close()` fallara, quedarían dos ventanas.
- **Quitar solo `_JPACKAGE_LAUNCHER`.** Bastaría para arrancar, pero dejaría `lib/app` en `LD_LIBRARY_PATH`, un arranque distinto del que se usa siempre.

## Consecuencias

- **La corrección tarda una actualización en surtir efecto.** El proceso `sh` lo lanza la versión instalada. La primera actualización a una versión con este cambio sigue con el fallo, así que hay que abrir LiteDD a mano antes de 60 s o se vuelve a la anterior. Desde entonces, el reinicio es automático.
- **Sin efecto en la instalación con el Java del sistema (ADR-0018).** Ahí `bin/litedd` es un script y esas variables no están.
- **Un `LD_LIBRARY_PATH` propio del usuario no llega a la versión nueva.** No hace falta, porque la imagen lleva su runtime.
- **El lanzador real sigue sin probarse.** El lanzador falso ahora falla como el real, pero si jpackage cambiara ese comportamiento, las pruebas no lo verían.
- **La versión nueva mantiene `update.log` abierto como salida de errores.** Es inocuo: casi nada escribe ahí y el fichero se reescribe en la siguiente actualización.
