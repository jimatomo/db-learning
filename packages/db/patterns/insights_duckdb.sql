-- Run with DuckDB CLI (same analytical queries the API uses when INSIGHTS_ENGINE=duckdb_cli):
--   duckdb -json :memory: < insights_duckdb.sql
-- Replace :sqlite_path and :iteration_id before running.

INSTALL sqlite;
LOAD sqlite;
-- CALL sqlite_attach('/absolute/path/to/app-c.db');

-- Label counts (lesson b/c), after attach:
-- SELECT l.name, COUNT(*)::BIGINT AS cnt
-- FROM todo_labels tl
-- JOIN labels l ON l.id = tl.label_id
-- JOIN todos t ON t.id = tl.todo_id
-- WHERE t.iteration_id = 1
-- GROUP BY l.name
-- ORDER BY cnt DESC;

-- Replay (lesson c):
-- SELECT e.id, e.todo_id, e.event_type, e.field_name, e.from_value, e.to_value, e.occurred_at, e.actor
-- FROM todo_events e
-- JOIN todos t ON t.id = e.todo_id
-- WHERE t.iteration_id = 1
-- ORDER BY e.occurred_at, e.id;
