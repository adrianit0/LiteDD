# ADR-0042: Nota HTTP desde cURL y «Copiar como cURL»

- Estado: aceptada (2026-11-06)
- Requisitos: H-75, H-76, H-77, H-78, H-79, N-04, N-05

## Contexto

Para replicar en LiteDD una llamada que la aplicación web hace desde el navegador, el usuario copia a mano el método, la ruta, los params, las cabeceras y el cuerpo. Es lento y propenso a errores, como pasó con las tildes del cuerpo (ADR-0038). Chrome ya ofrece «Copy as cURL» en las herramientas de desarrollo.

También quiere el camino inverso: pasar una nota a un compañero o probarla en la terminal.

## Decisión

Petición del usuario (2026-11-06):

1. **«Nuevo → Desde cURL…»**, junto a «Nota HTTP» en el botón «+ Nuevo» y en el submenú «Nuevo» del árbol. Rellena el método, el endpoint sin la URL base del perfil, los params, las cabeceras y el cuerpo, y descarta las cabeceras que LiteDD ya calcula (Cookie, X-CSRF-TOKEN…).
2. **«Copiar como cURL»**, siempre sin contraseñas ni cookies.

Detalles elegidos al implementarlo:

- **Formatos admitidos:** los dos de Chrome en Windows y Linux: bash (comillas simples, `$'…'` con `\uXXXX` y `\xHH`, comillas dobles y `\` de continuación) y cmd (`^` de escape y continuación, comillas dobles con `\"`). Las opciones que no cambian la petición (`--compressed`, `-k`, `-L`, `-s`…) se ignoran.
- **URL base:** se compara con las URL base de todos los perfiles, no solo con la del activo, porque la llamada puede venir de un entorno distinto del que se usa en LiteDD. Si no coincide ninguna, se queda la ruta y se avisa.
- **Endpoint:** se guarda la ruta tal como viene en la URL, codificada; LiteDD la envía igual.
- **Cabeceras descartadas:** las calculadas por LiteDD (Content-Type, X-USERID, X-CSRF-TOKEN, Authorization y Cookie del login), las del cliente HTTP (H-16), Accept-Encoding (LiteDD no descomprime), las `sec-*` y Priority (las pone el navegador) y las de «Ajustes → Cabeceras», que ya se envían. Authorization y `-u` se descartan también porque llevan contraseñas, que nunca se guardan en una nota (H-21).
- **Content-Type:** decide el formato del cuerpo raw. Si no es JSON, XML ni `text/plain` (por ejemplo `application/x-www-form-urlencoded`), el cuerpo queda como texto y el Content-Type original se guarda como valor cambiado de la cabecera generada, para enviarlo igual que el navegador. Sin Content-Type, se usa el de curl con `-d`: `application/x-www-form-urlencoded`.
- **Login:** la nota nueva usa el modo por defecto (login antes de cada llamada, H-24); las cookies y el token del navegador no se guardan.
- **«Copiar como cURL»:** un botón en la barra de la llamada. Genera un comando para bash, que es el shell de Ubuntu donde se ejecuta LiteDD (ADR-0004), con comillas simples y una opción por línea. Usa la URL base del perfil activo y los valores guardados de las variables. Lleva las cabeceras por defecto y Content-Type (sin él con form-data, porque curl pone el boundary). Los campos de form-data van con `--form-string`, para que `@` y `<` no se lean como ficheros. HEAD se escribe `-I`.
- **Sin servidor:** las dos conversiones se hacen en la interfaz; no hay ruta de API nueva ni destino nuevo (constitución, punto 4).

## Consecuencias

- Una llamada del navegador se convierte en nota en dos pasos, sin copiar campos a mano.
- El comando copiado puede no funcionar tal cual si la llamada necesita login: hay que añadir las cookies a mano, a propósito.
- Las cabeceras de «Ajustes» que el navegador envía con otro valor (por ejemplo su Accept o su User-Agent) se envían con el valor de «Ajustes», no con el del navegador.
