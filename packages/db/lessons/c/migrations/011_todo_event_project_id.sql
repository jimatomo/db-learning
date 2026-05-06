ALTER TABLE todo_events ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL;

UPDATE todo_events
SET project_id = (
  SELECT project_id
  FROM todos
  WHERE todos.id = todo_events.todo_id
)
WHERE project_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_todo_events_iteration ON todo_events(iteration_id);
CREATE INDEX IF NOT EXISTS idx_todo_events_project ON todo_events(project_id);
