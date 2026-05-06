import { Database } from "bun:sqlite";

export type ApiProject = {
  id: number;
  name: string;
  sortOrder: number;
};

function toApiProject(row: { id: number; name: string; sort_order: number }): ApiProject {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
  };
}

export function listProjects(db: Database): ApiProject[] {
  const rows = db.query(`SELECT id, name, sort_order FROM projects ORDER BY sort_order, id`).all() as {
    id: number;
    name: string;
    sort_order: number;
  }[];
  return rows.map(toApiProject);
}

export function createProject(db: Database, body: { name: string; sortOrder?: number }): ApiProject {
  const row = db
    .query(`INSERT INTO projects (name, sort_order) VALUES (?, ?) RETURNING id, name, sort_order`)
    .get(body.name, body.sortOrder ?? 0) as { id: number; name: string; sort_order: number };
  return toApiProject(row);
}

export function updateProject(
  db: Database,
  id: number,
  patch: Partial<{ name: string; sortOrder: number }>,
): ApiProject | null {
  const cur = db.query(`SELECT id FROM projects WHERE id = ?`).get(id);
  if (!cur) return null;
  if (patch.name !== undefined) db.query(`UPDATE projects SET name = ? WHERE id = ?`).run(patch.name, id);
  if (patch.sortOrder !== undefined) db.query(`UPDATE projects SET sort_order = ? WHERE id = ?`).run(patch.sortOrder, id);
  const row = db.query(`SELECT id, name, sort_order FROM projects WHERE id = ?`).get(id) as {
    id: number;
    name: string;
    sort_order: number;
  };
  return toApiProject(row);
}

export function deleteProject(db: Database, id: number): boolean {
  const r = db.query(`DELETE FROM projects WHERE id = ?`).run(id);
  return (r as { changes: number }).changes > 0;
}
