# Sprint 6: Datos y distribución

## Objetivo

ZIP, copias, ajustes, ciclo de vida e instalación.

## Requisitos cubiertos

X-01 a X-11, U-10, U-11, ciclo de vida

Documentos: [requisitos/transferencia.md](../requisitos/transferencia.md), [requisitos/interfaz.md](../requisitos/interfaz.md), [diseno/arquitectura.md](../diseno/arquitectura.md).

## Tareas

1. Exportación e importación ZIP con validación previa y transacción (X-01 a X-07, T-46, T-47).
2. Copias con `VACUUM INTO` y rotación (X-08, X-09, T-48); copia antes de migrar (D-02).
3. Menú «Datos» y pantalla «Ajustes» (X-10, U-10).
4. Banda de pérdida de contacto y reintento (U-11).
5. Ciclo de vida: instancia única, ventana Chrome en modo aplicación, SSE de presencia, despedida, apagado y opciones `--no-window`, `--port`, `--stop`.
6. Registro en fichero con rotación de 5 MB x 3 y opciones de JVM.
7. Perfil `-Pdist` con JAR único y `jpackage --type app-image`; `scripts/install.sh`, `scripts/uninstall.sh` y `packaging/litedd.desktop` con icono.
8. Prueba de resistencia de 2.000 ejecuciones y auditoría final.

## Criterios de aceptación

- Exportar, vaciar e importar con «Reemplazar todo» deja un árbol idéntico; «Añadir como rama» no altera lo existente.
- La copia diaria se crea y la rotación conserva 3.
- `scripts/install.sh` deja un icono que arranca la aplicación con doble clic.
- Un segundo lanzamiento reutiliza la instancia; cerrar la ventana apaga el proceso en 15 segundos.
- Una prueba de resistencia de 2.000 ejecuciones seguidas termina con la memoria del proceso estable.
- La auditoría final no encuentra datos sensibles en el repositorio.

## Resultado

Fecha: 2026-10-04.

### Hecho

- **Exportación e importación** (X-01 a X-07):
  - El ZIP lleva `manifest.json`, las notas en carpetas que reproducen el árbol (`NN-titulo.md|sql`, sin cabeceras) y `attachments/`.
  - No incluye papelera, historial, pestañas, valores, ajustes ni conexión.
  - Antes de tocar nada se valida versión, ficheros, rutas, padres, ciclos y el máximo de 500 MB. La importación va en una transacción.
  - «Reemplazar todo» hace antes una copia `-prereemplazo` y conserva los identificadores.
  - «Añadir como rama» cuelga todo de «Importado AAAA-MM-DD HH:mm» con identificadores nuevos y reasigna enlaces y adjuntos.
- **Copias** (X-08, X-09): copia diaria con `VACUUM INTO` al arrancar si la última tiene más de 24 h, con 3 conservadas. Copias antes de reemplazar y de migrar, con 2 conservadas.
- **Ajustes** (U-10): botón ⚙ en la barra superior.
  - Tamaño de página por defecto, tope de filas, tiempo máximo, puerto (al reiniciar) y apagado automático, guardados en `config.json`.
  - Las pestañas SQL nuevas usan el tamaño de página y el aviso de tope usa el tope configurado.
  - Da acceso a «Conexión» y a «Datos».
- **Datos** (X-10): exportar, importar en los dos modos (reemplazar con confirmación explícita), crear copia ahora y abrir la carpeta de datos.
- **Contacto** (U-11):
  - Si se corta el canal de presencia o falla una petición, aparece una banda y se consulta `/api/health` cada 3 s.
  - El texto sigue en memoria y los guardados fallidos no lanzan avisos.
  - Al volver, se relee el token (un servidor reiniciado tiene uno nuevo), se reabre el canal y se guardan las pestañas pendientes.
- **Ciclo de vida:**
  - Instancia única y ventana de Chrome en modo aplicación (o `xdg-open`).
  - Presencia por `fetch` en streaming con latido cada 5 s, y despedida con `keepalive`.
  - Apagado 15 s después de cerrar la última ventana.
  - Opciones `--no-window`, `--port` y `--stop`, este último con `instance.json` (600).
- **Registro:** `~/.local/state/litedd/litedd.log` con rotación de 5 MB x 3. Las conexiones, desconexiones y despedidas de ventanas quedan registradas.
- **Distribución:**
  - `./mvnw -Pdist package` genera el JAR único (`target/dist/input/litedd.jar`) y la imagen `target/dist/litedd` con runtime propio y `-Xmx384m -XX:+UseSerialGC`.
  - `scripts/install.sh` y `scripts/uninstall.sh`, más `packaging/litedd.desktop` y `packaging/litedd.png`.
- **Prueba de resistencia:** `sprint6_two_thousand_executions_keep_memory_stable` en `MySqlIntegrationTest` (perfil `-Pit`).
- **README:** instalación, uso, ubicación de los datos y restauración de una copia (X-11).
- **Pruebas:** 251 de backend (1 omitida en Windows: permisos POSIX) y 205 de interfaz.

### Criterios de aceptación

Recorridos en Windows con la imagen de `-Pdist` y datos aislados (`XDG_*` apuntando a una carpeta temporal).

1. **Exportar, vaciar e importar con «Reemplazar todo» deja un árbol idéntico; «Añadir como rama» no altera lo existente:**
   - Con tres notas (una hija con enlace, etiqueta, favorita y una imagen), el árbol tras reemplazar es idéntico: identificadores, padres, posiciones, tipos, títulos, contenido, etiquetas y favorita. El adjunto vuelve byte a byte.
   - La rama dejó lo existente igual, creó «Importado 2026-10-04 16:09» y reasignó el enlace a la copia de la hija.
   - **Cumplido.**
2. **La copia diaria se crea y la rotación conserva 3:** al primer arranque se creó `litedd-20261004.db` y, al reemplazar, `litedd-20261004-160910-prereemplazo.db`. La rotación está probada (X-08, X-09). **Cumplido.**
3. **`scripts/install.sh` deja un icono que arranca la aplicación con doble clic:** pendiente en Ubuntu (ADR-0004). La imagen se genera y arranca en Windows.
4. **Un segundo lanzamiento reutiliza la instancia; cerrar la ventana apaga el proceso en 15 segundos:**
   - El segundo `litedd` respondió «ya está en marcha» y salió. `--stop` apagó la instancia y borró `instance.json`.
   - Al salir de la página, el registro muestra la despedida y el apagado 15,0 s después.
   - Cerrar la pestaña del panel del navegador de desarrollo no envía la despedida, así que el proceso sigue, como pide el ciclo de vida para una conexión perdida sin despedida.
   - **Cumplido; falta comprobar el cierre de la ventana de Chrome en Ubuntu.**
5. **2.000 ejecuciones con memoria estable:** la prueba existe y se ejecuta con `-Pit` contra MySQL, pendiente en Ubuntu (ADR-0013).
6. **La auditoría final no encuentra datos sensibles:**
   - Se buscaron en el árbol y en el historial: usuarios, rutas personales, nombres de máquina, contraseñas, direcciones IP y esquemas distintos de `litedd_demo` y `litedd_it`.
   - Solo aparecen valores inventados de prueba («secreto», `192.168.0.10` como host ajeno en S-11, el esquema «otro»).
   - El autor de los commits es el configurado en git por el propietario.
   - **Cumplido.**

### Pendiente

- En Ubuntu:
  - `scripts/install.sh litedd.jar` con el JAR generado en Windows, porque allí no se puede usar Maven (ADR-0018).
  - Doble clic en el lanzador.
  - Cerrar la ventana de Chrome y comprobar el apagado en 15 s.
  - Pruebas `-Pit` (sprints 3, 4 y la prueba de resistencia): necesitan Maven, así que hay que habilitarlo en Ubuntu o lanzarlas desde Windows contra un MySQL accesible.

### Desviaciones y decisiones

- ADR-0017, ampliada:
  - Latido cada 5 s, en lugar de 20 s, para descubrir la ventana cerrada antes de que venzan los 15 s.
  - Si la última ventana se detecta cerrada tras el plazo, se apaga en ese momento.
  - El gancho de apagado espera al apagado en curso.
  - Al recuperar el contacto se relee el token.
  - `-Pdist` con `maven-shade-plugin` y `jpackage` (complementos de compilación, sin dependencias de ejecución nuevas).
- Fallo corregido: el apagado empezaba en un hilo daemon y, al parar Jetty, la JVM salía antes de cerrar SQLite y borrar `instance.json`.
- ADR-0018: `scripts/install.sh` acepta el JAR único y genera la imagen con el jpackage local o, sin él, ejecuta el JAR con el Java 21 instalado. Se probó en Windows la rama sin jpackage (instalar, arrancar, reutilizar la instancia y `--stop`).
- `scripts/dev.sh` arranca el servidor con `--no-window`, porque en desarrollo la interfaz la sirve Vite.
- En Windows, `-Pdist` falla si una instancia de la imagen está en marcha, porque los ficheros quedan bloqueados.

### Cómo probarlo a mano

1. En Windows: `./mvnw -Pdist package`. Copiar a Ubuntu `target/dist/input/litedd.jar`, `scripts/` y `packaging/`, y ejecutar `scripts/install.sh litedd.jar`; abrir «LiteDD» desde el menú de aplicaciones.
2. Ejecutar `litedd` otra vez: no arranca un segundo proceso, solo abre la ventana.
3. ⚙ → cambiar el tamaño de página a 50 y guardar; una nota SQL abierta después pagina de 50 en 50.
4. ⚙ → Datos → «Exportar»: se descarga `litedd-export-AAAAMMDD-HHmm.zip`. Elegir «Añadir como rama» y ese ZIP: aparece «Importado …» con una copia de todo.
5. «Reemplazar todo» con el mismo ZIP: pide confirmación, hace una copia `-prereemplazo` en `backups/` y la ventana se recarga con el árbol del ZIP.
6. Con una nota en edición, `litedd --stop` desde un terminal: aparece la banda «Sin contacto». Escribir algo, ejecutar `litedd --no-window`: la banda desaparece y el texto se guarda.
7. Cerrar la ventana: en unos 15 segundos `litedd.log` registra el apagado.
