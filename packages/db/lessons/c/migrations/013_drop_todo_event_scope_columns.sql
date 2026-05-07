DROP INDEX IF EXISTS idx_todo_events_iteration;
DROP INDEX IF EXISTS idx_todo_events_project;
ALTER TABLE todo_events DROP COLUMN project_id;
ALTER TABLE todo_events DROP COLUMN iteration_id;
