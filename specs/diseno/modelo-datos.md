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
  type        TEXT NOT NULL CHECK (type IN ('md','sql','http','xml','board','workflow')),  -- 'http' desde V003 (ADR-0021), 'xml' desde V004 (ADR-0023), 'board' desde V006 (ADR-0029), 'workflow' desde V007 (ADR-0031)
  title       TEXT NOT NULL,
  content     TEXT NOT NULL DEFAULT '',      -- en una pizarra, '' o data:image/png;base64,… (B-30); en un workflow, JSON (W-80)
  description TEXT NOT NULL DEFAULT '',      -- N-07, migración V002
  favorite    INTEGER NOT NULL DEFAULT 0,
  version     INTEGER NOT NULL DEFAULT 1,    -- concurrencia optimista
  created_at  TEXT NOT NULL,                 -- ISO-8601 UTC
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT,                          -- NULL = activa; fecha = papelera
  statement_id   TEXT,                       -- M-12: id de la sentencia en el mapper de la madre; NULL = nota normal
  statement_kind TEXT CHECK (statement_kind IN ('select','insert','update','delete'))  -- M-24, V004
);
CREATE INDEX idx_note_parent ON note(parent_id, position);
CREATE UNIQUE INDEX idx_note_statement ON note(parent_id, statement_id) WHERE statement_id IS NOT NULL;

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

CREATE TABLE variable_value (                -- últimos valores usados por nota SQL o workflow (W-83)
  note_id TEXT NOT NULL REFERENCES note(id) ON DELETE CASCADE,
  name    TEXT NOT NULL,                     -- en un workflow, <nodo>/<campo> (ADR-0031)
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

CREATE TABLE java_constant (               -- M-61, V005: solo las constantes con valor (ADR-0025)
  name       TEXT PRIMARY KEY,               -- paquete.Clase@CAMPO
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
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
-- Desde V006, el contenido de una pizarra se indexa como '' (B-33, ADR-0029).
```

Las reglas D-01 a D-07 están en [requisitos/datos.md](../requisitos/datos.md).
