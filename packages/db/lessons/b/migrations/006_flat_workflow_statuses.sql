INSERT OR IGNORE INTO statuses (name, sort_order) VALUES ('inbox', 0);
INSERT OR IGNORE INTO statuses (name, sort_order) VALUES ('review', 3);
INSERT OR IGNORE INTO statuses (name, sort_order) VALUES ('waiting', 4);

UPDATE statuses
SET sort_order = CASE name
  WHEN 'inbox' THEN 0
  WHEN 'todo' THEN 1
  WHEN 'doing' THEN 2
  WHEN 'review' THEN 3
  WHEN 'waiting' THEN 4
  WHEN 'done' THEN 5
  ELSE sort_order
END;

UPDATE todos
SET status_id = (SELECT id FROM statuses WHERE name = 'review'),
    sub_status_id = NULL,
    updated_at = datetime('now')
WHERE sub_status_id IN (SELECT id FROM sub_statuses WHERE name = 'review');

UPDATE todos
SET status_id = (SELECT id FROM statuses WHERE name = 'waiting'),
    sub_status_id = NULL,
    updated_at = datetime('now')
WHERE sub_status_id IN (SELECT id FROM sub_statuses WHERE name IN ('waiting', 'blocked'));

UPDATE todos
SET sub_status_id = NULL,
    updated_at = datetime('now')
WHERE sub_status_id IS NOT NULL;
