-- Lesson A: flat model. Labels and status live directly on each todo row.
CREATE TABLE IF NOT EXISTS iterations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  starts_at TEXT,
  ends_at TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  labels_csv TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'todo',
  parent_id INTEGER REFERENCES todos(id) ON DELETE SET NULL,
  iteration_id INTEGER REFERENCES iterations(id) ON DELETE SET NULL,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  planned_start_at TEXT,
  start_at TEXT,
  due_at TEXT,
  end_at TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS app_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  time_zone TEXT NOT NULL DEFAULT 'Asia/Tokyo' CHECK (time_zone IN ('UTC', 'Asia/Tokyo'))
);

CREATE INDEX IF NOT EXISTS idx_todos_iteration ON todos(iteration_id);
CREATE INDEX IF NOT EXISTS idx_todos_parent ON todos(parent_id);
CREATE INDEX IF NOT EXISTS idx_todos_project ON todos(project_id);

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

INSERT OR IGNORE INTO app_settings (id, time_zone) VALUES (1, 'Asia/Tokyo');
