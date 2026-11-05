# ADR-0040: Cabeceras por defecto en «Ajustes → Cabeceras»

- Estado: aceptada (2026-11-05)
- Requisitos: H-15, H-72, H-73, H-74, U-10
- Modifica: ADR-0022 (valores por defecto de Accept, User-Agent y Cache-Control) y ADR-0030 (categorías de «Ajustes»)

## Contexto

Al replicar en LiteDD llamadas que la aplicación web hace desde el navegador, algunas fallan y desde el navegador funcionan. Entre las diferencias están cabeceras que el navegador envía siempre, como `Accept-Language`, `X-Requested-With` o la cookie de idioma, y que LiteDD no envía. Hasta ahora solo se podían configurar en «Ajustes» los valores de Accept, User-Agent y Cache-Control; cualquier otra había que escribirla en cada nota, y una `Cookie` propia sustituía a las cookies del login.

El usuario pide una sección de «Ajustes» con las cabeceras por defecto de las notas HTTP, con las que hay hoy, y un botón para volver a generar las básicas si un cambio rompe alguna.

## Decisión

Respuestas del usuario (2026-11-05):

1. **Cabeceras calculadas:** Content-Type y las del login (X-USERID, X-CSRF-TOKEN y Cookie) quedan fuera de la lista: las calcula LiteDD en cada llamada, como hasta ahora. La lista tiene Accept, User-Agent, Cache-Control y las que se añadan.
2. **Cookie:** una fila Cookie de la lista se añade a las cookies del login; sin login se envía sola.
3. **«Restablecer básicas»:** repone Accept, User-Agent y Cache-Control al principio, activas y con el valor de serie, y conserva las demás filas.
4. **Ubicación:** una categoría propia, «Cabeceras», justo después de «HTTP». Sustituye al apartado «Headers generados» de «HTTP».

Detalles:

- **Formato:** `AppConfig.http.headers` es una lista de filas `{key, value, enabled}` en config.json, en su orden. Sustituye a los campos `accept`, `userAgent` y `cacheControl`. Un config.json sin la lista la crea con las tres básicas y los valores que tuvieran esos campos.
- **Valor de serie:** en Accept, User-Agent y Cache-Control el valor vacío es el de serie (`application/json`, `LiteDD/versión` y `no-cache`), como en ADR-0022. Así el User-Agent sigue la versión instalada. En las demás, el valor vacío se envía vacío, como en las cabeceras propias de una nota.
- **Activa:** una fila desactivada no se envía por defecto. Cada nota la ve desactivada en sus cabeceras generadas y puede activarla, igual que puede desactivar una activa o cambiar su valor (H-15). Lo que cambia la nota manda sobre «Ajustes».
- **Orden de envío:** las de la lista, Content-Type, Authorization (solo en el login) y, con login, X-USERID, X-CSRF-TOKEN y Cookie. Una fila Cookie conserva su sitio en la lista.
- **Cookie en una nota:** con login, la nota muestra una sola cabecera Cookie con las del login más la de «Ajustes». Cambiar su valor en la nota la sustituye entera, como antes. Si la fila Cookie de «Ajustes» está desactivada, no se añade a las del login.
- **Nombres que no se admiten:** los que calcula LiteDD (Content-Type, X-USERID, X-CSRF-TOKEN y Authorization), los que pone el cliente HTTP (H-16), los repetidos sin distinguir mayúsculas y los que no son un nombre de cabecera válido. Authorization no se admite porque la usa el login y porque un secreto no debe guardarse en config.json (S-20).
- **Alcance:** la lista es común a todos los perfiles (H-60) y vale para el login y para los nodos HTTP de los workflows (W-62).

## Consecuencias

- Una cabecera que el servidor espera en todas las llamadas se configura una vez, sin repetirla en cada nota.
- Borrar Accept, User-Agent o Cache-Control hace que no se envíen; «Restablecer básicas» las devuelve sin tocar las demás.
- Un config.json escrito por esta versión ya no tiene `accept`, `userAgent` ni `cacheControl`; una versión anterior usaría sus valores de serie.
