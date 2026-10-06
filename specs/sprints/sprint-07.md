# Sprint 7: Notas HTTP

## Objetivo

Llamadas HTTP al servidor local de pruebas desde una nota, con el login de la aplicación resuelto y sin poder salir de la máquina.

## Requisitos cubiertos

H-01 a H-50, y los cambios de N-04, N-05, X-03, U-10, S-16, S-20 y S-21

Documentos: [requisitos/http.md](../requisitos/http.md), [decisiones/ADR-0021-notas-http.md](../decisiones/ADR-0021-notas-http.md), [constitucion.md](../constitucion.md).

## Tareas

1. Especificación: requisitos H, cambio del principio 4 de la constitución, ADR-0021 y rutas nuevas de la API.
2. Migración V003: tipo de nota `http`, reconstruyendo la tabla `note` con las claves ajenas desactivadas y comprobadas antes de confirmar.
3. Servidor:
   - Guardián de direcciones locales y composición de la URL.
   - Ejecución con login, tiempo máximo y cancelación.
   - Captura de la respuesta con tope de tamaño.
   - Contraseña en http.json, escrita con `PrivateFile` junto a connection.json e instance.json.
   - Ajustes HTTP y exportación `.http.json`.
4. Interfaz:
   - Nota HTTP: barra de la llamada, login, variables de ruta, Params, Headers con cabeceras generadas y Body.
   - Panel de respuesta.
   - Sección «HTTP» en Ajustes, y «Nueva nota HTTP» en el panel y el menú del árbol.
5. Pruebas con un servidor falso dentro de las propias pruebas, que imita el login: 200, `X-USERID`, `CSRF-TOKEN` y `{"message": "Login success"}`.

## Criterios de aceptación

- Una nota `GET /user/{id}/tasks` con id 5 llama a `<base>/user/5/tasks` tras el login, con X-USERID, X-CSRF-TOKEN y las cookies del login.
- Con el servidor apagado aparece `Error: connect ECONNREFUSED 127.0.0.1:<puerto>`.
- Un login con 401 no hace la llamada y muestra la respuesta del login.
- «Reutilizar login» funciona tras un login correcto y avisa si no lo hay; «No necesita login» no envía cabeceras de login.
- Una URL base o final que no sea local se rechaza sin conectar.
- La contraseña no aparece en SQLite, en la exportación ni en el registro.
- Una base de datos de la versión anterior se migra sin perder notas, etiquetas, historial, adjuntos ni pestañas.

## Resultado

_Pendiente._
