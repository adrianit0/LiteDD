# ADR-0036: Enlaces externos en el Chrome habitual

- Estado: aceptada (2026-11-03)
- Requisitos: N-32
- Modifica: N-32 («en el navegador por defecto») y completa la ventana propia de ADR-0019

## Contexto

Desde ADR-0019 la ventana de LiteDD es un Chrome aparte, con su propio perfil (`--user-data-dir`). Al pulsar un enlace externo de una nota, la interfaz llamaba a `window.open` y Chrome abría la página en otra ventana de ese mismo proceso: sin las sesiones ni las extensiones del usuario y agrupada bajo el icono de LiteDD.

El usuario pide que los enlaces se abran como pestaña nueva en su Chrome habitual, no dentro de la aplicación.

## Decisión

1. La interfaz no abre ventanas. Un enlace externo, con clic o con clic central, se envía a `POST /api/open-link` con `{"url"}`.
2. El servidor solo acepta enlaces `http:`, `https:` y `mailto:` sin espacios ni caracteres de control; cualquier otro responde 400. La ruta exige el token (S-12) y el Origin (S-13), como el resto de la API.
3. En Linux:
   - `http:` y `https:` se abren con `google-chrome <url>`, sin `--app` ni `--user-data-dir`. Así Chrome entrega la URL al proceso del perfil habitual, que la abre en una pestaña nueva de su última ventana; si no estaba abierto, lo arranca.
   - Si Chrome no está, y para `mailto:`, se usa `xdg-open`.
4. En otros sistemas, solo para desarrollo (ADR-0004), se usa el navegador por defecto.
5. Si no se puede abrir, la respuesta es 500 y la interfaz lo avisa.

## Consecuencias

- LiteDD no contacta con ningún destino nuevo: la página la pide el Chrome del usuario, igual que antes la pedía la ventana de LiteDD (principio 4, S-16).
- Los enlaces a notas no cambian: abren la nota en LiteDD y, con clic central, en una pestaña nueva de la aplicación.
