-- M-61: valores de las constantes Java de los mappers (ADR-0025). Solo se guardan las que tienen valor.
CREATE TABLE java_constant (
  name       TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
