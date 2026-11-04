# ADR-0038: Charset UTF-8 en el Content-Type del cuerpo raw

- Estado: aceptada (2026-11-04)
- Requisitos: H-17
- Modifica: H-17 (Content-Type generado)

## Contexto

El usuario copia en notas HTTP llamadas que la aplicación web hace desde el navegador. Algunas fallan en LiteDD con errores de validación cuando el cuerpo lleva tildes (por ejemplo «renovación»), mientras que desde el navegador funcionan.

LiteDD envía el cuerpo raw en UTF-8, pero el Content-Type generado era `application/json`, `text/plain` o `application/xml` sin charset. Sin charset, el servidor aplica su codificación por defecto; en una aplicación Java con servlets suele ser ISO-8859-1. Entonces «ó» llega como «Ã³», el valor ya no coincide con el guardado y la validación lo rechaza. Las aplicaciones web suelen declarar `charset=UTF-8` en sus llamadas, y por eso el mismo cuerpo funciona desde el navegador.

## Decisión

1. Con cuerpo raw, el Content-Type generado declara la codificación en la que LiteDD envía el cuerpo: `application/json; charset=UTF-8`, `text/plain; charset=UTF-8` y `application/xml; charset=UTF-8`.
2. Sin cuerpo sigue siendo `application/json`. El login (H-22) no cambia.
3. Con form-data sigue siendo `multipart/form-data; boundary=…`, como lo envían los navegadores: ese tipo no tiene parámetro charset (RFC 7578).
4. El valor generado no se guarda en la nota, así que el cambio vale para las notas existentes y para los nodos HTTP de los workflows (W-62). Una nota que cambió el valor de Content-Type o tiene una cabecera propia Content-Type la sigue enviando tal cual (H-15, H-16).

## Consecuencias

- Un servidor que respeta el charset lee bien las tildes, la ñ y el resto de caracteres no ASCII del cuerpo raw.
- Si un servidor no aceptara el parámetro, la nota puede cambiar el valor de la cabecera generada o desactivarla (H-15).
