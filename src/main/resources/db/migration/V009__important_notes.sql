-- N-89 (ADR-0047): la nota es importante hasta ese día, AAAA-MM-DD en hora local; NULL = sin marca.
ALTER TABLE note ADD COLUMN important_until TEXT;
