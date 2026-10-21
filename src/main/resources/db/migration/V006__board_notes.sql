-- B-01, B-33: tipo de nota 'board' (ADR-0029). Como en V003 y V004, SQLite no permite cambiar un CHECK: se
-- reconstruye la tabla note y el migrador comprueba las claves ajenas. El contenido de una pizarra es un PNG en
-- base64: el índice de búsqueda lo recibe como cadena vacía, también al borrar, para no desajustarse.
CREATE TABLE note_new (
  rid            INTEGER PRIMARY KEY,
  id             TEXT NOT NULL UNIQUE,
  parent_id      TEXT REFERENCES note(id),
  position       INTEGER NOT NULL,
  type           TEXT NOT NULL CHECK (type IN ('md','sql','http','xml','board')),
  title          TEXT NOT NULL,
  content        TEXT NOT NULL DEFAULT '',
  favorite       INTEGER NOT NULL DEFAULT 0,
  version        INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  deleted_at     TEXT,
  description    TEXT NOT NULL DEFAULT '',
  statement_id   TEXT,
  statement_kind TEXT CHECK (statement_kind IN ('select','insert','update','delete'))
);

-- Se conserva rid: es la clave del índice de búsqueda (note_fts).
INSERT INTO note_new (rid, id, parent_id, position, type, title, content, favorite, version, created_at, updated_at,
                      deleted_at, description, statement_id, statement_kind)
SELECT rid, id, parent_id, position, type, title, content, favorite, version, created_at, updated_at,
       deleted_at, description, statement_id, statement_kind
FROM note;

DROP TABLE note;
ALTER TABLE note_new RENAME TO note;

CREATE INDEX idx_note_parent ON note(parent_id, position);
CREATE UNIQUE INDEX idx_note_statement ON note(parent_id, statement_id) WHERE statement_id IS NOT NULL;

CREATE TRIGGER note_fts_ai AFTER INSERT ON note BEGIN
  INSERT INTO note_fts(rowid, title, content, description)
  VALUES (new.rid, new.title, CASE WHEN new.type = 'board' THEN '' ELSE new.content END, new.description);
END;

CREATE TRIGGER note_fts_ad AFTER DELETE ON note BEGIN
  INSERT INTO note_fts(note_fts, rowid, title, content, description)
  VALUES ('delete', old.rid, old.title, CASE WHEN old.type = 'board' THEN '' ELSE old.content END, old.description);
END;

CREATE TRIGGER note_fts_au AFTER UPDATE OF title, content, description ON note BEGIN
  INSERT INTO note_fts(note_fts, rowid, title, content, description)
  VALUES ('delete', old.rid, old.title, CASE WHEN old.type = 'board' THEN '' ELSE old.content END, old.description);
  INSERT INTO note_fts(rowid, title, content, description)
  VALUES (new.rid, new.title, CASE WHEN new.type = 'board' THEN '' ELSE new.content END, new.description);
END;
