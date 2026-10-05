-- N-07: descripción opcional de la nota. N-70: la búsqueda también mira la descripción (ADR-0020).
ALTER TABLE note ADD COLUMN description TEXT NOT NULL DEFAULT '';

DROP TRIGGER note_fts_ai;
DROP TRIGGER note_fts_ad;
DROP TRIGGER note_fts_au;
DROP TABLE note_fts;

-- Las columnas 0 (título) y 1 (contenido) siguen en su sitio para highlight() y snippet().
CREATE VIRTUAL TABLE note_fts USING fts5(
  title, content, description,
  content='note', content_rowid='rid',
  tokenize='unicode61 remove_diacritics 2',
  prefix='2 3'
);

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

INSERT INTO note_fts(note_fts) VALUES ('rebuild');
