# Modelo de datos local

> Extraído de `specs/ESPECIFICACION.md`. Si este fichero y aquel difieren tras un cambio aprobado, manda este y se registra un ADR.

Todo el estado de LiteDD vive en un fichero SQLite, salvo los ajustes y la conexión, que son ficheros JSON aparte.

## Esquema

```sql
CREATE TABLE note (
  rid         INTEGER PRIMARY KEY,           -- rowid estable para FTS
  id          TEXT NOT NULL UNIQUE,          -- UUID v4, identidad pública
  parent_id   TEXT REFERENCES note(id),      -- NULL = raíz
  position    INTEGER NOT NULL,              -- orden entre hermanas, 0..n-1
  type        TEXT NOT NULL CHECK (type IN ('md','sql')),
  title       TEXT NOT NULL,
  content     TEXT NOT NULL DEFAULT '',
  favorite    INTEGER NOT NULL DEFAULT 0,
  version     INTEGER NOT NULL DEFAULT 1,    -- concurrencia optimista
  created_at  TEXT NOT NULL,                 -- ISO-8601 UTC
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT                           -- NULL = activa; fecha = papelera
);
CREATE INDEX idx_note_parent ON note(parent_id, position);

CREATE TABLE tag (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);
CREATE TABLE note_tag (
  note_id TEXT NOT NULL REFERENCES note(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, tag_id)
);

CREATE TABLE note_version (
  id       INTEGER PRIMARY KEY,
  note_id  TEXT NOT NULL REFERENCES note(id) ON DELETE CASCADE,
  title    TEXT NOT NULL,
  content  TEXT NOT NULL,
  saved_at TEXT NOT NULL
);

CREATE TABLE attachment (
  id         TEXT PRIMARY KEY,               -- UUID v4
  note_id    TEXT REFERENCES note(id) ON DELETE SET NULL,
  name       TEXT,
  mime       TEXT NOT NULL,
  data       BLOB NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE variable_value (                -- últimos valores usados por nota SQL
  note_id TEXT NOT NULL REFERENCES note(id) ON DELETE CASCADE,
  name    TEXT NOT NULL,
  value   TEXT,
  PRIMARY KEY (note_id, name)
);

CREATE TABLE tab (
  id       TEXT PRIMARY KEY,
  note_id  TEXT NOT NULL REFERENCES note(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  active   INTEGER NOT NULL DEFAULT 0,
  mode     TEXT NOT NULL CHECK (mode IN ('view','edit')),
  state    TEXT                              -- JSON: tamaño de página, orden, valores
);

CREATE TABLE setting (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE VIRTUAL TABLE note_fts USING fts5(
  title, content,
  content='note', content_rowid='rid',
  tokenize='unicode61 remove_diacritics 2',
  prefix='2 3'
);
-- Triggers AFTER INSERT / UPDATE / DELETE sobre note mantienen note_fts al día.
```

Las reglas D-01 a D-07 están en [requisitos/datos.md](../requisitos/datos.md).
