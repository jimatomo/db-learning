CREATE TABLE IF NOT EXISTS sub_statuses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  visible INTEGER NOT NULL DEFAULT 1
);

ALTER TABLE todos ADD COLUMN sub_status_id INTEGER REFERENCES sub_statuses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_todos_sub_status ON todos(sub_status_id);

INSERT OR IGNORE INTO sub_statuses (name, sort_order, visible) VALUES ('blocked', 0, 1);
INSERT OR IGNORE INTO sub_statuses (name, sort_order, visible) VALUES ('review', 1, 1);
INSERT OR IGNORE INTO sub_statuses (name, sort_order, visible) VALUES ('waiting', 2, 1);
