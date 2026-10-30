# Constitución

> Extraído de `specs/ESPECIFICACION.md`. Si este fichero y aquel difieren tras un cambio aprobado, manda este y se registra un ADR.

Principios que no se negocian. Cualquier cambio exige modificar antes la especificación.

1. La especificación manda. Si el código y la especificación difieren, se corrige primero la especificación y después el código.
2. Nada fuera de alcance: no se añaden funciones, dependencias ni ajustes que la especificación no pida.
3. Solo lectura inviolable: ninguna ruta de código puede enviar a MySQL una sentencia que modifique datos o estructura.
4. Los datos no salen de la máquina. LiteDD solo se conecta a los destinos de esta lista cerrada, que el usuario autoriza de forma expresa; añadir otro exige su autorización y un ADR:
   - MySQL.
   - Los destinos de las notas HTTP: el propio equipo (127.0.0.1, localhost o ::1) y, si el usuario lo activa, los entornos de preproducción que configure, solo por HTTPS validado contra su CA corporativa o, si el usuario lo elige en un entorno, contra las CA de confianza de Java (ADR-0021, ADR-0028, ADR-0030).
   - GitHub, si el usuario lo activa, solo para descargar actualizaciones firmadas, al pulsar un botón y sin enviar ningún dato suyo (ADR-0033).

   Fuera de esta lista no hay internet, telemetría ni CDN.
5. Repositorio público: se aplican siempre las reglas S-30 a S-35.
6. Los datos del usuario no se pierden: transacciones, copia antes de operaciones destructivas y guardado automático.
7. Simplicidad: sin Spring y sin abstracciones que no tengan dos usos reales.
8. Cada requisito tiene al menos una prueba que lo cita por su identificador.
9. Ante una ambigüedad, se pregunta; no se decide en silencio.
