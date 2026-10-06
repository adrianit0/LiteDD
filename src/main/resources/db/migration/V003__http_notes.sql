-- H-01: tipo de nota 'http' (ADR-0021). SQLite no permite cambiar un CHECK: se reconstruye la tabla note
-- con el procedimiento oficial. El migrador desactiva las claves ajenas y las comprueba antes de confirmar.
CREATE TABLE note_new (
  rid         INTEGER PRIMARY KEY,
  id          TEXT NOT NULL UNIQUE,
  parent_id   TEXT REFERENCES note(id),
  position    INTEGER NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('md','sql','http')),
  title       TEXT NOT NULL,
  content     TEXT NOT NULL DEFAULT '',
  favorite    INTEGER NOT NULL DEFAULT 0,
  version     INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT,
  description TEXT NOT NULL DEFAULT ''
);

-- Se conserva rid: es la clave del índice de búsqueda (note_fts).
INSERT INTO note_new (rid, id, parent_id, position, type, title, content, favorite, version, created_at, updated_at,
                      deleted_at, description)
SELECT rid, id, parent_id, position, type, title, content, favorite, version, created_at, updated_at,
       deleted_at, description
FROM note;

DROP TABLE note;
ALTER TABLE note_new RENAME TO note;

CREATE INDEX idx_note_parent ON note(parent_id, position);

CREATE TRIGGER note_fts_ai AFTER INSERT ON note BEGIN
  INSERT INTO note_fts(rowid, title, content, description) VALUES (new.rid, new.title, new.content, new.description);
END;

CREATE TRIGGER note_fts_ad AFTER DELETE ON note BEGIN
  INSERT INTO note_fts(note_fts, rowid, title, content, description)
  VALUES ('delete', old.rid, old.title, old.content, old.description);
END;

CREATE TRIGGER note_fts_au AFTER UPDATE OF title, content, description ON note BEGIN
  INSERT INTO note_fts(note_fts, rowid, title, content, description)
  VALUES ('delete', old.rid, old.title, old.content, old.description);
  INSERT INTO note_fts(rowid, title, content, description) VALUES (new.rid, new.title, new.content, new.description);
END;
