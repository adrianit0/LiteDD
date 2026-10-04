# ADR-0003: Token de sesión y Origin en desarrollo

- Estado: propuesta (pendiente de visto bueno)
- Fecha: 2026-10-04
- Requisitos: S-11, S-12, S-13

## Contexto

S-12 entrega el token en el HTML inicial que sirve el backend. En desarrollo la página la sirve Vite (puerto 5173), que no conoce el token, y su proxy reenvía `Host` y `Origin` de Vite, que S-11 y S-13 rechazan. Además S-13 no dice qué hacer cuando una petición que modifica estado llega sin cabecera `Origin`.

## Decisión

1. `scripts/dev.sh` genera un token aleatorio en cada arranque y lo exporta en `LITEDD_DEV_TOKEN`. Si esa variable existe y tiene al menos 32 caracteres, el backend la usa como token; si no, genera uno con `SecureRandom`. Un plugin de Vite, solo en `serve`, sustituye con ella el marcador `__LITEDD_TOKEN__` del HTML.
2. El proxy de Vite usa `changeOrigin` y reescribe `Origin` al del backend. El backend no relaja ninguna comprobación.
3. S-13: se rechaza con 403 toda petición POST/PUT/DELETE/PATCH cuyo `Origin` no sea `http://127.0.0.1:puerto` o `http://localhost:puerto`. Si falta `Origin` (clientes que no son navegador, como el futuro `litedd --stop`), se acepta y el token sigue siendo obligatorio.

## Consecuencias

El token de desarrollo vive en el entorno del proceso. En uso normal la variable no existe y el token es aleatorio en cada arranque.
