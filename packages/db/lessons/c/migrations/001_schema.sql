-- Lesson C: B + append-only change log for analytics / replay
CREATE TABLE IF NOT EXISTS iterations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  starts_at TEXT,
  ends_at TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS statuses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0
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
  start_at TEXT,
  due_at TEXT,
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
  actor TEXT,
  iteration_id INTEGER REFERENCES iterations(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_todo_events_todo ON todo_events(todo_id);
CREATE INDEX IF NOT EXISTS idx_todo_events_occurred ON todo_events(occurred_at);
CREATE INDEX IF NOT EXISTS idx_todos_iteration ON todos(iteration_id);
CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status_id);
CREATE INDEX IF NOT EXISTS idx_todos_parent ON todos(parent_id);
