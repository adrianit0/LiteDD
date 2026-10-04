-- V001: esquema inicial (specs/diseno/modelo-datos.md)

CREATE TABLE note (
  rid         INTEGER PRIMARY KEY,
  id          TEXT NOT NULL UNIQUE,
  parent_id   TEXT REFERENCES note(id),
  position    INTEGER NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('md','sql')),
  title       TEXT NOT NULL,
  content     TEXT NOT NULL DEFAULT '',
  favorite    INTEGER NOT NULL DEFAULT 0,
  version     INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT
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
  id         TEXT PRIMARY KEY,
  note_id    TEXT REFERENCES note(id) ON DELETE SET NULL,
  name       TEXT,
  mime       TEXT NOT NULL,
  data       BLOB NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE variable_value (
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
  state    TEXT
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

CREATE TRIGGER note_fts_ai AFTER INSERT ON note BEGIN
  INSERT INTO note_fts(rowid, title, content) VALUES (new.rid, new.title, new.content);
END;

CREATE TRIGGER note_fts_ad AFTER DELETE ON note BEGIN
  INSERT INTO note_fts(note_fts, rowid, title, content) VALUES ('delete', old.rid, old.title, old.content);
END;

CREATE TRIGGER note_fts_au AFTER UPDATE OF title, content ON note BEGIN
  INSERT INTO note_fts(note_fts, rowid, title, content) VALUES ('delete', old.rid, old.title, old.content);
  INSERT INTO note_fts(rowid, title, content) VALUES (new.rid, new.title, new.content);
END;
