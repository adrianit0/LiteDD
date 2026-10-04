# Requisitos del modelo de datos local

> Extraído de `specs/ESPECIFICACION.md`. Si este fichero y aquel difieren tras un cambio aprobado, manda este y se registra un ADR.

Todo el estado de LiteDD vive en un fichero SQLite, salvo los ajustes y la conexión, que son ficheros JSON aparte.

El esquema SQL completo está en [diseno/modelo-datos.md](../diseno/modelo-datos.md).

## Reglas

| ID | Regla |
|---|---|
| D-01 | `PRAGMA foreign_keys=ON`, `journal_mode=WAL`, `synchronous=NORMAL` en cada conexión. |
| D-02 | Migraciones numeradas (`V001__initial.sql`, …) controladas con `PRAGMA user_version`. Antes de migrar se hace una copia. |
| D-03 | Toda operación sobre el árbol (crear, mover, eliminar, restaurar) va en una transacción y deja las posiciones de las hermanas contiguas desde 0. |
| D-04 | Las notas en la papelera conservan parent_id y no aparecen en el árbol ni en la búsqueda. |
| D-05 | Una nota nunca puede ser descendiente de sí misma; se valida en el servidor. |
| D-06 | El acceso a SQLite usa mappers de MyBatis con anotaciones; no se añade otro framework de persistencia. |
| D-07 | Una única conexión de escritura a SQLite, serializada; las lecturas pueden ir en paralelo. |
