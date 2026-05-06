CREATE TRIGGER IF NOT EXISTS trg_todos_status_start_at
AFTER UPDATE OF status ON todos
FOR EACH ROW
WHEN NEW.start_at IS NULL
  AND LOWER(NEW.status) IN ('doing', 'review', 'waiting')
BEGIN
  UPDATE todos
  SET start_at = datetime('now'),
      updated_at = datetime('now')
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_todos_status_end_at
AFTER UPDATE OF status ON todos
FOR EACH ROW
WHEN NEW.end_at IS NULL
  AND LOWER(NEW.status) = 'done'
BEGIN
  UPDATE todos
  SET end_at = datetime('now'),
      updated_at = datetime('now')
  WHERE id = NEW.id;
END;
