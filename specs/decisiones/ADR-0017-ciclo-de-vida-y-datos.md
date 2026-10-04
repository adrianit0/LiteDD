# ADR-0017: Ciclo de vida, datos y ajustes

- Estado: aceptada (2026-10-04)
- Requisitos: ciclo de vida, A-03, S-12, X-05, X-09, X-10, U-10, U-11

## Decisión

1. **Fichero de instancia:** al arrancar, el servidor escribe `~/.local/state/litedd/instance.json` (o en `$XDG_STATE_HOME`), con permisos 600 en POSIX. Contiene el puerto y el token de la sesión. `litedd --stop` lo lee para llamar a `POST /api/shutdown`, que sigue exigiendo el token (A-03). El fichero se borra al apagarse.
2. **Presencia sin exponer el token:** `EventSource` no puede enviar cabeceras. La interfaz abre `/api/events` con `fetch` en streaming, que sí envía `X-LiteDD-Token`, y el servidor manda un comentario cada 20 s para detectar conexiones caídas. La despedida es `POST /api/presence/bye` con `keepalive`.
3. **Apagado:** tras una despedida, si a los 15 s no queda ninguna ventana conectada, el proceso se apaga. Si la conexión se pierde sin despedida, el proceso sigue vivo, salvo que el ajuste «apagado automático» indique un número de minutos sin ventanas.
4. **Abrir la carpeta de datos** (X-10): nueva ruta `POST /api/data/open-folder`, que abre `~/.local/share/litedd/` con `xdg-open`. En Windows, solo para desarrollo, usa el explorador del sistema.
5. **Reemplazar todo** (X-05): antes se hace una copia con el sufijo `-prereemplazo`, de la que se conservan 2 (X-09). Se borran notas, papelera, historial, etiquetas, pestañas, valores de variables y adjuntos, y se importa con los identificadores originales. Se mantienen los ajustes, la conexión y el estado de interfaz.
6. **Ajustes** (U-10): `config.json` guarda tamaño de página por defecto, tope de filas, tiempo máximo de consulta, puerto y apagado automático. `GET` y `PUT /api/settings` los incluyen en la clave `config`, junto al estado de interfaz (ADR-0005). El tiempo máximo y el tope se aplican al momento; el puerto, al siguiente arranque.
7. **Copia del día:** «Crear copia ahora» rehace la copia `litedd-AAAAMMDD.db` del día. Se conservan las 3 más recientes (X-08).
8. **Nombres de fichero exportados** (X-03, T-47): posición desde 1 con dos cifras (o más si hay más hermanas) y el título sin acentos, en minúsculas, con guiones en lugar de cualquier otro carácter y un máximo de 60 caracteres. Un título que se queda vacío pasa a «nota».
