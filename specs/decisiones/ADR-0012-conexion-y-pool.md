# ADR-0012: Detalles de la conexión y del pool

- Estado: aceptada (2026-10-04)
- Requisitos: C-01, C-05, C-07, C-08, S-20, S-21

## Decisión

1. **Contraseña en el diálogo:** si el campo se deja vacío, se conserva la guardada. La API solo indica si hay una (S-21).
2. **Parámetros JDBC adicionales:** además de `allowMultiQueries` (C-05), se rechazan `autoReconnect` (C-08) y `allowLoadLocalInfile`. Este último permitiría leer ficheros locales con `LOAD DATA LOCAL`.
3. **Validación en cada préstamo** (C-08): HikariCP no valida una conexión usada en los últimos 500 ms. Se fija `com.zaxxer.hikari.aliveBypassWindowMs=0` para que valide siempre.
4. **Arranque sin MySQL** (C-02): el pool se crea con `initializationFailTimeout=-1`, así que la aplicación arranca aunque el servidor no esté. El estado se calcula al configurar, al reconectar y en cada ejecución.
5. **Permisos 600** de `connection.json` (S-20): se aplican donde el sistema de ficheros es POSIX. En Windows, solo en desarrollo, no se pueden aplicar (ADR-0004).
6. **Tiempo máximo y tope de filas:** valen 30 s y 10.000 filas como constantes, hasta que la pantalla «Ajustes» del Sprint 6 los haga configurables.
