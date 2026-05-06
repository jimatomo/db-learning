import { Database } from "bun:sqlite";
import type { Lesson } from "./config";

export type ApiStatus = { id: number; name: string; sortOrder: number; color: string; autoStart: boolean; autoEnd: boolean };

const DEFAULT_A_STATUSES = ["inbox", "todo", "doing", "review", "waiting", "done"];
const DEFAULT_STATUS_COLOR = "#6b7280";

export function listStatuses(db: Database, lesson: Lesson): ApiStatus[] {
  if (lesson === "a") {
    const rows = db.query(`SELECT DISTINCT status FROM todos`).all() as { status: string }[];
    const set = new Set(DEFAULT_A_STATUSES);
    for (const r of rows) set.add(r.status);
    return [...set].map((name, i) => ({
      id: i + 1,
      name,
      sortOrder: i,
      color: DEFAULT_STATUS_COLOR,
      autoStart: ["doing", "review", "waiting"].includes(name),
      autoEnd: name === "done",
    }));
  }
  const rows = db
    .query(`SELECT id, name, sort_order, COALESCE(color, ?) AS color, auto_start, auto_end FROM statuses ORDER BY sort_order, id`)
    .all(DEFAULT_STATUS_COLOR) as {
    id: number;
    name: string;
    sort_order: number;
    color: string;
    auto_start: number;
    auto_end: number;
  }[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    sortOrder: r.sort_order,
    color: r.color,
    autoStart: Boolean(r.auto_start),
    autoEnd: Boolean(r.auto_end),
  }));
}

export function createStatus(
  db: Database,
  lesson: Lesson,
  body: { name: string; sortOrder?: number; color?: string; autoStart?: boolean; autoEnd?: boolean },
): ApiStatus {
  if (lesson === "a") throw new Error("LESSON_A_STATUSES");
  const row = db
    .query(
      `INSERT INTO statuses (name, sort_order, color, auto_start, auto_end)
       VALUES (?, ?, ?, ?, ?)
       RETURNING id, name, sort_order, color, auto_start, auto_end`,
    )
    .get(body.name, body.sortOrder ?? 0, body.color ?? DEFAULT_STATUS_COLOR, body.autoStart ? 1 : 0, body.autoEnd ? 1 : 0) as {
    id: number;
    name: string;
    sort_order: number;
    color: string;
    auto_start: number;
    auto_end: number;
  };
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    color: row.color,
    autoStart: Boolean(row.auto_start),
    autoEnd: Boolean(row.auto_end),
  };
}

export function updateStatus(
  db: Database,
  lesson: Lesson,
  id: number,
  patch: Partial<{ name: string; sortOrder: number; color: string; autoStart: boolean; autoEnd: boolean }>,
): ApiStatus | null {
  if (lesson === "a") throw new Error("LESSON_A_STATUSES");
  const cur = db.query(`SELECT id FROM statuses WHERE id = ?`).get(id);
  if (!cur) return null;
  if (patch.name !== undefined) db.query(`UPDATE statuses SET name = ? WHERE id = ?`).run(patch.name, id);
  if (patch.sortOrder !== undefined) db.query(`UPDATE statuses SET sort_order = ? WHERE id = ?`).run(patch.sortOrder, id);
  if (patch.color !== undefined) db.query(`UPDATE statuses SET color = ? WHERE id = ?`).run(patch.color, id);
  if (patch.autoStart !== undefined) db.query(`UPDATE statuses SET auto_start = ? WHERE id = ?`).run(patch.autoStart ? 1 : 0, id);
  if (patch.autoEnd !== undefined) db.query(`UPDATE statuses SET auto_end = ? WHERE id = ?`).run(patch.autoEnd ? 1 : 0, id);
  const row = db
    .query(`SELECT id, name, sort_order, COALESCE(color, ?) AS color, auto_start, auto_end FROM statuses WHERE id = ?`)
    .get(DEFAULT_STATUS_COLOR, id) as {
    id: number;
    name: string;
    sort_order: number;
    color: string;
    auto_start: number;
    auto_end: number;
  };
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    color: row.color,
    autoStart: Boolean(row.auto_start),
    autoEnd: Boolean(row.auto_end),
  };
}
