import { Database } from "bun:sqlite";
import type { Lesson } from "./config";

export type ApiSubStatus = { id: number; name: string; sortOrder: number; visible: boolean };

function toApiSubStatus(row: { id: number; name: string; sort_order: number; visible: number }): ApiSubStatus {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    visible: Boolean(row.visible),
  };
}

export function listSubStatuses(db: Database, lesson: Lesson): ApiSubStatus[] {
  if (lesson === "a") return [];
  const rows = db.query(`SELECT id, name, sort_order, visible FROM sub_statuses ORDER BY sort_order, id`).all() as {
    id: number;
    name: string;
    sort_order: number;
    visible: number;
  }[];
  return rows.map(toApiSubStatus);
}

export function createSubStatus(db: Database, lesson: Lesson, body: { name: string; sortOrder?: number; visible?: boolean }): ApiSubStatus {
  if (lesson === "a") throw new Error("LESSON_A_SUB_STATUSES");
  const row = db
    .query(`INSERT INTO sub_statuses (name, sort_order, visible) VALUES (?, ?, ?) RETURNING id, name, sort_order, visible`)
    .get(body.name, body.sortOrder ?? 0, body.visible === false ? 0 : 1) as {
    id: number;
    name: string;
    sort_order: number;
    visible: number;
  };
  return toApiSubStatus(row);
}

export function updateSubStatus(
  db: Database,
  lesson: Lesson,
  id: number,
  patch: Partial<{ name: string; sortOrder: number; visible: boolean }>,
): ApiSubStatus | null {
  if (lesson === "a") throw new Error("LESSON_A_SUB_STATUSES");
  const cur = db.query(`SELECT id FROM sub_statuses WHERE id = ?`).get(id);
  if (!cur) return null;
  if (patch.name !== undefined) db.query(`UPDATE sub_statuses SET name = ? WHERE id = ?`).run(patch.name, id);
  if (patch.sortOrder !== undefined) db.query(`UPDATE sub_statuses SET sort_order = ? WHERE id = ?`).run(patch.sortOrder, id);
  if (patch.visible !== undefined) db.query(`UPDATE sub_statuses SET visible = ? WHERE id = ?`).run(patch.visible ? 1 : 0, id);
  const row = db.query(`SELECT id, name, sort_order, visible FROM sub_statuses WHERE id = ?`).get(id) as {
    id: number;
    name: string;
    sort_order: number;
    visible: number;
  };
  return toApiSubStatus(row);
}

export function deleteSubStatus(db: Database, lesson: Lesson, id: number): boolean {
  if (lesson === "a") throw new Error("LESSON_A_SUB_STATUSES");
  const r = db.query(`DELETE FROM sub_statuses WHERE id = ?`).run(id);
  return (r as { changes: number }).changes > 0;
}
