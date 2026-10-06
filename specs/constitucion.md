# Constitución

> Extraído de `specs/ESPECIFICACION.md`. Si este fichero y aquel difieren tras un cambio aprobado, manda este y se registra un ADR.

Principios que no se negocian. Cualquier cambio exige modificar antes la especificación.

1. La especificación manda. Si el código y la especificación difieren, se corrige primero la especificación y después el código.
2. Nada fuera de alcance: no se añaden funciones, dependencias ni ajustes que la especificación no pida.
3. Solo lectura inviolable: ninguna ruta de código puede enviar a MySQL una sentencia que modifique datos o estructura.
4. Los datos no salen de la máquina: solo se conecta a MySQL y a la URL base local de las notas HTTP (127.0.0.1, localhost o ::1); sin internet, sin telemetría, sin CDN (ADR-0021).
5. Repositorio público: se aplican siempre las reglas S-30 a S-35.
6. Los datos del usuario no se pierden: transacciones, copia antes de operaciones destructivas y guardado automático.
7. Simplicidad: sin Spring y sin abstracciones que no tengan dos usos reales.
8. Cada requisito tiene al menos una prueba que lo cita por su identificador.
9. Ante una ambigüedad, se pregunta; no se decide en silencio.
