import { Database } from "bun:sqlite";

export type ApiIteration = {
  id: number;
  name: string;
  startsAt: string | null;
  endsAt: string | null;
  sortOrder: number;
};

export function listIterations(db: Database): ApiIteration[] {
  const rows = db
    .query(`SELECT id, name, starts_at, ends_at, sort_order FROM iterations ORDER BY sort_order, id`)
    .all() as {
    id: number;
    name: string;
    starts_at: string | null;
    ends_at: string | null;
    sort_order: number;
  }[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    sortOrder: r.sort_order,
  }));
}

export function createIteration(
  db: Database,
  body: { name: string; startsAt?: string | null; endsAt?: string | null; sortOrder?: number },
): ApiIteration {
  const r = db
    .query(
      `INSERT INTO iterations (name, starts_at, ends_at, sort_order) VALUES (?,?,?,?) RETURNING id, name, starts_at, ends_at, sort_order`,
    )
    .get(body.name, body.startsAt ?? null, body.endsAt ?? null, body.sortOrder ?? 0) as {
    id: number;
    name: string;
    starts_at: string | null;
    ends_at: string | null;
    sort_order: number;
  };
  return {
    id: r.id,
    name: r.name,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    sortOrder: r.sort_order,
  };
}

export function updateIteration(
  db: Database,
  id: number,
  patch: Partial<{ name: string; startsAt: string | null; endsAt: string | null; sortOrder: number }>,
): ApiIteration | null {
  const cur = db.query(`SELECT id FROM iterations WHERE id = ?`).get(id);
  if (!cur) return null;
  if (patch.name !== undefined) db.query(`UPDATE iterations SET name = ? WHERE id = ?`).run(patch.name, id);
  if (patch.startsAt !== undefined) db.query(`UPDATE iterations SET starts_at = ? WHERE id = ?`).run(patch.startsAt, id);
  if (patch.endsAt !== undefined) db.query(`UPDATE iterations SET ends_at = ? WHERE id = ?`).run(patch.endsAt, id);
  if (patch.sortOrder !== undefined) db.query(`UPDATE iterations SET sort_order = ? WHERE id = ?`).run(patch.sortOrder, id);
  const r = db
    .query(`SELECT id, name, starts_at, ends_at, sort_order FROM iterations WHERE id = ?`)
    .get(id) as {
    id: number;
    name: string;
    starts_at: string | null;
    ends_at: string | null;
    sort_order: number;
  };
  return {
    id: r.id,
    name: r.name,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    sortOrder: r.sort_order,
  };
}

export function deleteIteration(db: Database, id: number): boolean {
  const r = db.query(`DELETE FROM iterations WHERE id = ?`).run(id);
  return (r as { changes: number }).changes > 0;
}
