ALTER TABLE statuses ADD COLUMN auto_start INTEGER NOT NULL DEFAULT 0;
ALTER TABLE statuses ADD COLUMN auto_end INTEGER NOT NULL DEFAULT 0;

UPDATE statuses
SET auto_start = 1
WHERE LOWER(name) IN ('doing', 'review', 'waiting');

UPDATE statuses
SET auto_end = 1
WHERE LOWER(name) = 'done';

DROP TRIGGER IF EXISTS trg_todos_status_start_at;
DROP TRIGGER IF EXISTS trg_todos_status_end_at;

CREATE TRIGGER IF NOT EXISTS trg_todos_status_start_at
AFTER UPDATE OF status_id ON todos
FOR EACH ROW
WHEN NEW.start_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM statuses
    WHERE id = NEW.status_id
      AND auto_start = 1
  )
BEGIN
  UPDATE todos
  SET start_at = datetime('now'),
      updated_at = datetime('now')
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_todos_status_end_at
AFTER UPDATE OF status_id ON todos
FOR EACH ROW
WHEN NEW.end_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM statuses
    WHERE id = NEW.status_id
      AND auto_end = 1
  )
BEGIN
  UPDATE todos
  SET end_at = datetime('now'),
      updated_at = datetime('now')
  WHERE id = NEW.id;
END;
