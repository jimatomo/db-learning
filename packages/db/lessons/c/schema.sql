-- Lesson C: Lesson B plus append-only todo events for replay and analytics.
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

CREATE TABLE IF NOT EXISTS statuses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  color TEXT DEFAULT '#6b7280',
  auto_start INTEGER NOT NULL DEFAULT 0,
  auto_end INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS labels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#6b7280'
);

CREATE TABLE IF NOT EXISTS todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  status_id INTEGER NOT NULL REFERENCES statuses(id),
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

CREATE TABLE IF NOT EXISTS todo_labels (
  todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  label_id INTEGER NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (todo_id, label_id)
);

CREATE TABLE IF NOT EXISTS todo_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  todo_id INTEGER REFERENCES todos(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  field_name TEXT,
  from_value TEXT,
  to_value TEXT,
  occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
  actor TEXT
);

CREATE TABLE IF NOT EXISTS app_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  time_zone TEXT NOT NULL DEFAULT 'Asia/Tokyo' CHECK (time_zone IN ('UTC', 'Asia/Tokyo'))
);

CREATE INDEX IF NOT EXISTS idx_todos_iteration ON todos(iteration_id);
CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status_id);
CREATE INDEX IF NOT EXISTS idx_todos_parent ON todos(parent_id);
CREATE INDEX IF NOT EXISTS idx_todos_project ON todos(project_id);
CREATE INDEX IF NOT EXISTS idx_todo_events_todo ON todo_events(todo_id);
CREATE INDEX IF NOT EXISTS idx_todo_events_occurred ON todo_events(occurred_at);

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

INSERT OR IGNORE INTO statuses (name, sort_order, color, auto_start, auto_end) VALUES
  ('inbox', 0, '#6b7280', 0, 0),
  ('todo', 1, '#4a7bd1', 0, 0),
  ('doing', 2, '#d4662c', 1, 0),
  ('review', 3, '#8f5bd6', 1, 0),
  ('waiting', 4, '#b28704', 1, 0),
  ('done', 5, '#2f8f83', 0, 1);

INSERT OR IGNORE INTO app_settings (id, time_zone) VALUES (1, 'Asia/Tokyo');
