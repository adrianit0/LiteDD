-- N-82, N-86, N-88 (ADR-0046): marca de obsoleta, nota que la sustituye y última ejecución correcta.
-- Solo se añaden columnas: no hace falta reconstruir la tabla note.
ALTER TABLE note ADD COLUMN obsolete INTEGER NOT NULL DEFAULT 0;
ALTER TABLE note ADD COLUMN replaced_by TEXT REFERENCES note(id) ON DELETE SET NULL;
ALTER TABLE note ADD COLUMN last_run_at TEXT;
