import { Database } from "bun:sqlite";
import type { Lesson } from "./config";

export type ApiLabelRow = { id: number; name: string; color: string };

export function listLabels(db: Database, lesson: Lesson): ApiLabelRow[] {
  if (lesson === "a") {
    const rows = db.query(`SELECT DISTINCT labels_csv FROM todos WHERE labels_csv IS NOT NULL AND labels_csv <> ''`).all() as {
      labels_csv: string;
    }[];
    const names = new Set<string>();
    for (const r of rows) {
      for (const part of r.labels_csv.split(",")) {
        const t = part.trim();
        if (t) names.add(t);
      }
    }
    return [...names]
      .sort()
      .map((name, i) => ({ id: -(i + 1), name, color: "#9ca3af" }));
  }
  return db
    .query(`SELECT id, name, color FROM labels ORDER BY name`)
    .all() as ApiLabelRow[];
}

export function createLabel(db: Database, lesson: Lesson, name: string, color?: string): ApiLabelRow {
  if (lesson === "a") {
    throw new Error("LESSON_A_LABELS");
  }
  const r = db
    .query(`INSERT INTO labels (name, color) VALUES (?, ?) RETURNING id, name, color`)
    .get(name, color ?? "#6b7280") as ApiLabelRow;
  return r;
}

export function updateLabel(db: Database, lesson: Lesson, id: number, name?: string, color?: string): ApiLabelRow | null {
  if (lesson === "a") throw new Error("LESSON_A_LABELS");
  const cur = db.query(`SELECT id FROM labels WHERE id = ?`).get(id);
  if (!cur) return null;
  if (name !== undefined) db.query(`UPDATE labels SET name = ? WHERE id = ?`).run(name, id);
  if (color !== undefined) db.query(`UPDATE labels SET color = ? WHERE id = ?`).run(color, id);
  return db.query(`SELECT id, name, color FROM labels WHERE id = ?`).get(id) as ApiLabelRow;
}

export function deleteLabel(db: Database, lesson: Lesson, id: number): boolean {
  if (lesson === "a") throw new Error("LESSON_A_LABELS");
  const r = db.query(`DELETE FROM labels WHERE id = ?`).run(id);
  return (r as { changes: number }).changes > 0;
}
