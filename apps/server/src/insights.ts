import { Database } from "bun:sqlite";
import { spawnSync } from "node:child_process";
import type { Lesson } from "./config";

/**
 * Analytics for the UI. Default path uses SQLite (same DB file the app writes).
 *
 * DuckDB CLI: when `duckdb` is on PATH and `INSIGHTS_ENGINE=duckdb_cli`, the same
 * analytical SQL runs inside DuckDB with `sqlite_attach` (see packages/db/patterns/).
 * The embedded `duckdb` npm package is not used here because its native addon can
 * crash under Bun on exit.
 */
export type LabelCount = { name: string; count: number };
export type EventSummary = { eventType: string; count: number };
export type CompletionTime = {
  todoId: number;
  title: string;
  startAt: string;
  endAt: string;
  durationHours: number;
};
export type IterationTrend = {
  iterationId: number;
  iterationName: string;
  startsAt: string | null;
  endsAt: string | null;
  total: number;
  completed: number;
  started: number;
  completionRate: number;
};

export type ReplayRow = {
  id: number;
  todoId: number | null;
  eventType: string;
  fieldName: string | null;
  fromValue: string | null;
  toValue: string | null;
  occurredAt: string;
  actor: string | null;
  projectId: number | null;
};

function insightsEngine(): "sqlite" | "duckdb_cli" {
  const v = (process.env.INSIGHTS_ENGINE ?? "sqlite").toLowerCase();
  return v === "duckdb_cli" ? "duckdb_cli" : "sqlite";
}

function escapePath(p: string): string {
  return p.replace(/'/g, "''");
}

function duckdbCliAvailable(): boolean {
  const r = spawnSync("duckdb", ["-version"], { encoding: "utf-8" });
  return r.status === 0;
}

function runDuckdbCliJson(sqlitePath: string, sql: string): unknown[] | null {
  const wrapped = `
INSTALL sqlite;
LOAD sqlite;
CALL sqlite_attach('${escapePath(sqlitePath)}');
${sql}
`;
  const r = spawnSync("duckdb", ["-json", ":memory:", wrapped], {
    encoding: "utf-8",
    maxBuffer: 20_000_000,
  });
  if (r.error || r.status !== 0) return null;
  const out = r.stdout.trim();
  if (!out) return [];
  try {
    return JSON.parse(out) as unknown[];
  } catch {
    return null;
  }
}

export function labelCountsSqlite(
  db: Database,
  lesson: Lesson,
  iterationId: number,
  projectId: number | null = null,
): LabelCount[] {
  const projectClause = projectId == null ? "" : " AND project_id = ?";
  const args = projectId == null ? [iterationId] : [iterationId, projectId];
  if (lesson === "a") {
    const rows = db
      .query(`SELECT labels_csv FROM todos WHERE iteration_id = ?${projectClause}`)
      .all(...args) as { labels_csv: string | null }[];
    const m = new Map<string, number>();
    for (const r of rows) {
      for (const part of (r.labels_csv ?? "").split(",")) {
        const name = part.trim();
        if (!name) continue;
        m.set(name, (m.get(name) ?? 0) + 1);
      }
    }
    return [...m.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }
  const rows = db
    .query(
      `SELECT l.name AS name, COUNT(*) AS cnt
       FROM todo_labels tl
       JOIN labels l ON l.id = tl.label_id
       JOIN todos t ON t.id = tl.todo_id
       WHERE t.iteration_id = ?${projectId == null ? "" : " AND t.project_id = ?"}
       GROUP BY l.name
       ORDER BY cnt DESC`,
    )
    .all(...args) as { name: string; cnt: number }[];
  return rows.map((r) => ({ name: r.name, count: Number(r.cnt) }));
}

export function eventSummarySqlite(
  db: Database,
  lesson: Lesson,
  iterationId: number,
  projectId: number | null = null,
): EventSummary[] {
  if (lesson !== "c") return [];
  const args = projectId == null ? [iterationId] : [iterationId, projectId];
  const rows = db
    .query(
      `SELECT e.event_type AS event_type, COUNT(*) AS cnt
       FROM todo_events e
       JOIN todos t ON t.id = e.todo_id
       WHERE t.iteration_id = ?${projectId == null ? "" : " AND t.project_id = ?"}
       GROUP BY e.event_type
       ORDER BY cnt DESC`,
    )
    .all(...args) as { event_type: string; cnt: number }[];
  return rows.map((r) => ({ eventType: r.event_type, count: Number(r.cnt) }));
}

export function completionTimesSqlite(
  db: Database,
  iterationId: number,
  projectId: number | null = null,
): CompletionTime[] {
  const args = projectId == null ? [iterationId] : [iterationId, projectId];
  const rows = db
    .query(
      `SELECT t.id,
              t.title,
              t.start_at,
              t.end_at,
              (julianday(t.end_at) - julianday(t.start_at)) * 24.0 AS duration_hours
       FROM todos t
       WHERE t.iteration_id = ?
         AND t.start_at IS NOT NULL
         AND t.end_at IS NOT NULL
         AND julianday(t.end_at) >= julianday(t.start_at)
         ${projectId == null ? "" : "AND t.project_id = ?"}
       ORDER BY duration_hours DESC, t.id ASC`,
    )
    .all(...args) as {
    id: number;
    title: string;
    start_at: string;
    end_at: string;
    duration_hours: number;
  }[];
  return rows.map((r) => ({
    todoId: r.id,
    title: r.title,
    startAt: r.start_at,
    endAt: r.end_at,
    durationHours: Number(r.duration_hours),
  }));
}

export function iterationTrendsSqlite(db: Database, lesson: Lesson, projectId: number | null = null): IterationTrend[] {
  const projectJoinClause = projectId == null ? "" : " AND t.project_id = ?";
  const args = projectId == null ? [] : [projectId];
  const statusExpression = lesson === "a" ? "t.status" : "s.name";
  const statusJoin = lesson === "a" ? "" : "LEFT JOIN statuses s ON s.id = t.status_id";
  const rows = db
    .query(
      `SELECT i.id,
              i.name,
              i.starts_at,
              i.ends_at,
              COUNT(t.id) AS total,
              SUM(CASE WHEN t.id IS NOT NULL AND (LOWER(${statusExpression}) = 'done' OR t.end_at IS NOT NULL) THEN 1 ELSE 0 END) AS completed,
              SUM(CASE WHEN t.id IS NOT NULL AND t.start_at IS NOT NULL THEN 1 ELSE 0 END) AS started
       FROM iterations i
       LEFT JOIN todos t ON t.iteration_id = i.id${projectJoinClause}
       ${statusJoin}
       GROUP BY i.id, i.name, i.starts_at, i.ends_at, i.sort_order
       ORDER BY i.sort_order, i.id`,
    )
    .all(...args) as {
    id: number;
    name: string;
    starts_at: string | null;
    ends_at: string | null;
    total: number;
    completed: number | null;
    started: number | null;
  }[];
  return rows.map((r) => {
    const total = Number(r.total);
    const completed = Number(r.completed ?? 0);
    return {
      iterationId: r.id,
      iterationName: r.name,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      total,
      completed,
      started: Number(r.started ?? 0),
      completionRate: total > 0 ? completed / total : 0,
    };
  });
}

export function replaySqlite(
  db: Database,
  lesson: Lesson,
  iterationId: number,
  projectId: number | null = null,
): ReplayRow[] {
  if (lesson !== "c") return [];
  const args = projectId == null ? [iterationId] : [iterationId, projectId];
  const rows = db
    .query(
      `SELECT e.id, e.todo_id, e.event_type, e.field_name, e.from_value, e.to_value, e.occurred_at, e.actor, t.project_id
       FROM todo_events e
       JOIN todos t ON t.id = e.todo_id
       WHERE t.iteration_id = ?${projectId == null ? "" : " AND t.project_id = ?"}
       ORDER BY e.occurred_at ASC, e.id ASC`,
    )
    .all(...args) as {
    id: number;
    todo_id: number | null;
    event_type: string;
    field_name: string | null;
    from_value: string | null;
    to_value: string | null;
    occurred_at: string;
    actor: string | null;
    project_id: number | null;
  }[];
  return rows.map((r) => ({
    id: r.id,
    todoId: r.todo_id,
    eventType: r.event_type,
    fieldName: r.field_name,
    fromValue: r.from_value,
    toValue: r.to_value,
    occurredAt: r.occurred_at,
    actor: r.actor,
    projectId: r.project_id,
  }));
}

export async function duckdbLabelCounts(
  sqlitePath: string,
  db: Database,
  lesson: Lesson,
  iterationId: number,
  projectId: number | null = null,
): Promise<LabelCount[]> {
  const projectClause = projectId == null ? "" : ` AND project_id = ${projectId}`;
  const joinedProjectClause = projectId == null ? "" : ` AND t.project_id = ${projectId}`;
  if (insightsEngine() === "duckdb_cli" && duckdbCliAvailable()) {
    if (lesson === "a") {
      const sql = `
SELECT trim(label) AS name, COUNT(*)::BIGINT AS cnt
FROM (
  SELECT id, iteration_id, unnest(str_split(COALESCE(labels_csv, ''), ',')) AS label
  FROM todos
  WHERE iteration_id = ${iterationId}${projectClause}
) s
WHERE trim(label) <> ''
GROUP BY 1
ORDER BY cnt DESC;
`;
      const rows = runDuckdbCliJson(sqlitePath, sql) as { name: string; cnt: number }[] | null;
      if (rows) return rows.map((r) => ({ name: r.name, count: Number(r.cnt) }));
    } else {
      const sql = `
SELECT l.name AS name, COUNT(*)::BIGINT AS cnt
FROM todo_labels tl
JOIN labels l ON l.id = tl.label_id
JOIN todos t ON t.id = tl.todo_id
WHERE t.iteration_id = ${iterationId}${joinedProjectClause}
GROUP BY l.name
ORDER BY cnt DESC;
`;
      const rows = runDuckdbCliJson(sqlitePath, sql) as { name: string; cnt: number }[] | null;
      if (rows) return rows.map((r) => ({ name: r.name, count: Number(r.cnt) }));
    }
  }
  return labelCountsSqlite(db, lesson, iterationId, projectId);
}

export async function duckdbEventSummary(
  sqlitePath: string,
  db: Database,
  lesson: Lesson,
  iterationId: number,
  projectId: number | null = null,
): Promise<EventSummary[]> {
  if (lesson !== "c") return [];
  const projectClause = projectId == null ? "" : ` AND t.project_id = ${projectId}`;
  if (insightsEngine() === "duckdb_cli" && duckdbCliAvailable()) {
    const sql = `
SELECT e.event_type, COUNT(*)::BIGINT AS cnt
FROM todo_events e
JOIN todos t ON t.id = e.todo_id
WHERE t.iteration_id = ${iterationId}${projectClause}
GROUP BY e.event_type
ORDER BY cnt DESC;
`;
    const rows = runDuckdbCliJson(sqlitePath, sql) as { event_type: string; cnt: number }[] | null;
    if (rows) return rows.map((r) => ({ eventType: r.event_type, count: Number(r.cnt) }));
  }
  return eventSummarySqlite(db, lesson, iterationId, projectId);
}

export async function duckdbCompletionTimes(
  sqlitePath: string,
  db: Database,
  iterationId: number,
  projectId: number | null = null,
): Promise<CompletionTime[]> {
  const projectClause = projectId == null ? "" : ` AND t.project_id = ${projectId}`;
  if (insightsEngine() === "duckdb_cli" && duckdbCliAvailable()) {
    const sql = `
SELECT t.id,
       t.title,
       t.start_at,
       t.end_at,
       (epoch(CAST(t.end_at AS TIMESTAMP)) - epoch(CAST(t.start_at AS TIMESTAMP))) / 3600.0 AS duration_hours
FROM todos t
WHERE t.iteration_id = ${iterationId}
  AND t.start_at IS NOT NULL
  AND t.end_at IS NOT NULL
  AND CAST(t.end_at AS TIMESTAMP) >= CAST(t.start_at AS TIMESTAMP)
  ${projectClause}
ORDER BY duration_hours DESC, t.id ASC;
`;
    const rows = runDuckdbCliJson(sqlitePath, sql) as {
      id: number;
      title: string;
      start_at: string;
      end_at: string;
      duration_hours: number;
    }[] | null;
    if (rows) {
      return rows.map((r) => ({
        todoId: r.id,
        title: r.title,
        startAt: r.start_at,
        endAt: r.end_at,
        durationHours: Number(r.duration_hours),
      }));
    }
  }
  return completionTimesSqlite(db, iterationId, projectId);
}

export async function duckdbIterationTrends(
  sqlitePath: string,
  db: Database,
  lesson: Lesson,
  projectId: number | null = null,
): Promise<IterationTrend[]> {
  const projectClause = projectId == null ? "" : ` AND t.project_id = ${projectId}`;
  const statusExpression = lesson === "a" ? "t.status" : "s.name";
  const statusJoin = lesson === "a" ? "" : "LEFT JOIN statuses s ON s.id = t.status_id";
  if (insightsEngine() === "duckdb_cli" && duckdbCliAvailable()) {
    const sql = `
SELECT i.id,
       i.name,
       i.starts_at,
       i.ends_at,
       COUNT(t.id)::BIGINT AS total,
       SUM(CASE WHEN t.id IS NOT NULL AND (LOWER(${statusExpression}) = 'done' OR t.end_at IS NOT NULL) THEN 1 ELSE 0 END)::BIGINT AS completed,
       SUM(CASE WHEN t.id IS NOT NULL AND t.start_at IS NOT NULL THEN 1 ELSE 0 END)::BIGINT AS started
FROM iterations i
LEFT JOIN todos t ON t.iteration_id = i.id${projectClause}
${statusJoin}
GROUP BY i.id, i.name, i.starts_at, i.ends_at, i.sort_order
ORDER BY i.sort_order, i.id;
`;
    const rows = runDuckdbCliJson(sqlitePath, sql) as {
      id: number;
      name: string;
      starts_at: string | null;
      ends_at: string | null;
      total: number;
      completed: number | null;
      started: number | null;
    }[] | null;
    if (rows) {
      return rows.map((r) => {
        const total = Number(r.total);
        const completed = Number(r.completed ?? 0);
        return {
          iterationId: r.id,
          iterationName: r.name,
          startsAt: r.starts_at,
          endsAt: r.ends_at,
          total,
          completed,
          started: Number(r.started ?? 0),
          completionRate: total > 0 ? completed / total : 0,
        };
      });
    }
  }
  return iterationTrendsSqlite(db, lesson, projectId);
}

export async function duckdbReplay(
  sqlitePath: string,
  db: Database,
  lesson: Lesson,
  iterationId: number,
  projectId: number | null = null,
): Promise<ReplayRow[]> {
  if (lesson !== "c") return [];
  const projectClause = projectId == null ? "" : ` AND t.project_id = ${projectId}`;
  if (insightsEngine() === "duckdb_cli" && duckdbCliAvailable()) {
    const sql = `
SELECT e.id, e.todo_id, e.event_type, e.field_name, e.from_value, e.to_value, e.occurred_at, e.actor, t.project_id
FROM todo_events e
JOIN todos t ON t.id = e.todo_id
WHERE t.iteration_id = ${iterationId}${projectClause}
ORDER BY e.occurred_at ASC, e.id ASC;
`;
    const rows = runDuckdbCliJson(sqlitePath, sql) as {
      id: number;
      todo_id: number | null;
      event_type: string;
      field_name: string | null;
      from_value: string | null;
      to_value: string | null;
      occurred_at: string;
      actor: string | null;
      project_id: number | null;
    }[] | null;
    if (rows) {
      return rows.map((r) => ({
        id: r.id,
        todoId: r.todo_id,
        eventType: r.event_type,
        fieldName: r.field_name,
        fromValue: r.from_value,
        toValue: r.to_value,
        occurredAt: r.occurred_at,
        actor: r.actor,
        projectId: r.project_id,
      }));
    }
  }
  return replaySqlite(db, lesson, iterationId, projectId);
}
