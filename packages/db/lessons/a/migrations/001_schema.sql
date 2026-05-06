-- Lesson A: flat model — labels and status denormalized on todo row
CREATE TABLE IF NOT EXISTS iterations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  starts_at TEXT,
  ends_at TEXT,
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
  start_at TEXT,
  due_at TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_todos_iteration ON todos(iteration_id);
CREATE INDEX IF NOT EXISTS idx_todos_parent ON todos(parent_id);
