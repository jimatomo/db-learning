INSERT OR IGNORE INTO statuses (name, sort_order, color, auto_start, auto_end)
SELECT
  ss.name,
  (SELECT COALESCE(MAX(sort_order), 0) FROM statuses) + ss.sort_order + 1,
  '#6b7280',
  0,
  0
FROM sub_statuses ss
WHERE EXISTS (
  SELECT 1
  FROM todos t
  WHERE t.sub_status_id = ss.id
);

UPDATE todos
SET status_id = (
      SELECT s.id
      FROM statuses s
      JOIN sub_statuses ss ON ss.name = s.name
      WHERE ss.id = todos.sub_status_id
    ),
    updated_at = datetime('now')
WHERE sub_status_id IS NOT NULL;

UPDATE todo_events
SET event_type = 'status_change',
    field_name = 'status'
WHERE event_type = 'sub_status_change'
   OR field_name = 'sub_status';

DROP INDEX IF EXISTS idx_todos_sub_status;
ALTER TABLE todos DROP COLUMN sub_status_id;
DROP TABLE IF EXISTS sub_statuses;
