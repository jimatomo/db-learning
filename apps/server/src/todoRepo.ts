import { Database, type SQLQueryBindings } from "bun:sqlite";
import type { Lesson } from "./config";

export type ApiLabel = { id: number; name: string; color?: string };

export type ApiTodo = {
  id: number;
  title: string;
  description: string | null;
  status: string;
  statusId: number | null;
  labels: ApiLabel[];
  projectId: number | null;
  iterationId: number | null;
  parentId: number | null;
  plannedStartAt: string | null;
  startAt: string | null;
  dueAt: string | null;
  endAt: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (Math.imul(31, h) + name.charCodeAt(i)) | 0;
  return Math.abs(h) % 1000000;
}

export function listTodos(db: Database, lesson: Lesson, filters: { projectId?: number | null } = {}): ApiTodo[] {
  const projectWhere = filters.projectId == null ? "" : " WHERE project_id = ?";
  const projectArgs = filters.projectId == null ? [] : [filters.projectId];
  if (lesson === "a") {
    const rows = db
      .query(
        `SELECT id, title, description, labels_csv, status, project_id, parent_id, iteration_id, planned_start_at, start_at, due_at, end_at, sort_order, created_at, updated_at FROM todos${projectWhere} ORDER BY sort_order, id`,
      )
      .all(...projectArgs) as {
      id: number;
      title: string;
      description: string | null;
      labels_csv: string | null;
      status: string;
      project_id: number | null;
      parent_id: number | null;
      iteration_id: number | null;
      planned_start_at: string | null;
      start_at: string | null;
      due_at: string | null;
      end_at: string | null;
      sort_order: number;
      created_at: string;
      updated_at: string;
    }[];
    return rows.map((r) => {
      const parts = (r.labels_csv ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const labels: ApiLabel[] = parts.map((name) => ({
        id: -hashName(name),
        name,
        color: "#9ca3af",
      }));
      return {
        id: r.id,
        title: r.title,
        description: r.description,
        status: r.status,
        statusId: null,
        labels,
        projectId: r.project_id,
        iterationId: r.iteration_id,
        parentId: r.parent_id,
        plannedStartAt: r.planned_start_at,
        startAt: r.start_at,
        dueAt: r.due_at,
        endAt: r.end_at,
        sortOrder: r.sort_order,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    });
  }
  const rows = db
    .query(
      `SELECT t.id, t.title, t.description, t.status_id, s.name AS status_name,
              t.parent_id, t.iteration_id, t.project_id, t.planned_start_at, t.start_at, t.due_at, t.end_at,
              t.sort_order, t.created_at, t.updated_at
       FROM todos t JOIN statuses s ON s.id = t.status_id
       ${filters.projectId == null ? "" : "WHERE t.project_id = ?"}
       ORDER BY t.sort_order, t.id`,
    )
    .all(...projectArgs) as {
    id: number;
    title: string;
    description: string | null;
    status_id: number;
    status_name: string;
    project_id: number | null;
    parent_id: number | null;
    iteration_id: number | null;
    planned_start_at: string | null;
    start_at: string | null;
    due_at: string | null;
    end_at: string | null;
    sort_order: number;
    created_at: string;
    updated_at: string;
  }[];
  const labelRows = db
    .query(
      `SELECT tl.todo_id, l.id AS label_id, l.name, l.color FROM todo_labels tl JOIN labels l ON l.id = tl.label_id`,
    )
    .all() as { todo_id: number; label_id: number; name: string; color: string }[];
  const byTodo = new Map<number, ApiLabel[]>();
  for (const lr of labelRows) {
    const arr = byTodo.get(lr.todo_id) ?? [];
    arr.push({ id: lr.label_id, name: lr.name, color: lr.color });
    byTodo.set(lr.todo_id, arr);
  }
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status_name,
    statusId: r.status_id,
    labels: byTodo.get(r.id) ?? [],
    projectId: r.project_id,
    iterationId: r.iteration_id,
    parentId: r.parent_id,
    plannedStartAt: r.planned_start_at,
    startAt: r.start_at,
    dueAt: r.due_at,
    endAt: r.end_at,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export function getTodo(db: Database, lesson: Lesson, id: number): ApiTodo | null {
  return listTodos(db, lesson).find((t) => t.id === id) ?? null;
}

function insertEvent(
  db: Database,
  todoId: number,
  eventType: string,
  fieldName: string,
  fromValue: string | null,
  toValue: string | null,
) {
  db.query(
    `INSERT INTO todo_events (todo_id, event_type, field_name, from_value, to_value, actor)
     VALUES (?,?,?,?,?,?)`,
  ).run(todoId, eventType, fieldName, fromValue, toValue, process.env.ACTOR ?? "system");
}

function eventValue(value: string | number | null | undefined): string | null {
  if (value == null) return null;
  return String(value);
}

function changedValue(a: string | number | null | undefined, b: string | number | null | undefined): boolean {
  return eventValue(a) !== eventValue(b);
}

function noteLines(value: string | null | undefined): string[] {
  const lines = (value ?? "").replace(/\r\n/g, "\n").split("\n");
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function truncateEventLine(value: string) {
  const normalized = value.replace(/\t/g, "  ").trim();
  return normalized.length > 160 ? `${normalized.slice(0, 157)}...` : normalized;
}

function changedNoteDiff(fromValue: string | null | undefined, toValue: string | null | undefined) {
  const fromLines = noteLines(fromValue);
  const toLines = noteLines(toValue);
  let start = 0;
  while (start < fromLines.length && start < toLines.length && fromLines[start] === toLines[start]) start++;

  let fromEnd = fromLines.length - 1;
  let toEnd = toLines.length - 1;
  while (fromEnd >= start && toEnd >= start && fromLines[fromEnd] === toLines[toEnd]) {
    fromEnd--;
    toEnd--;
  }

  const removed = fromEnd >= start ? fromLines.slice(start, fromEnd + 1) : [];
  const added = toEnd >= start ? toLines.slice(start, toEnd + 1) : [];
  const changed = Math.min(removed.length, added.length);
  const addedOnly = Math.max(0, added.length - changed);
  const removedOnly = Math.max(0, removed.length - changed);
  const previewLimit = 8;
  const preview: { kind: "changed" | "added" | "removed"; line: number; from?: string; to?: string }[] = [];

  for (let i = 0; i < changed && preview.length < previewLimit; i++) {
    preview.push({
      kind: "changed",
      line: start + i + 1,
      from: truncateEventLine(removed[i]),
      to: truncateEventLine(added[i]),
    });
  }
  for (let i = changed; i < added.length && preview.length < previewLimit; i++) {
    preview.push({ kind: "added", line: start + i + 1, to: truncateEventLine(added[i]) });
  }
  for (let i = changed; i < removed.length && preview.length < previewLimit; i++) {
    preview.push({ kind: "removed", line: start + i + 1, from: truncateEventLine(removed[i]) });
  }

  const summaryParts = [];
  if (addedOnly) summaryParts.push(`+${addedOnly}`);
  if (removedOnly) summaryParts.push(`-${removedOnly}`);
  if (changed) summaryParts.push(`~${changed}`);
  const summary = `note ${summaryParts.length ? summaryParts.join(" ") : "updated"} at L${start + 1}`;

  return {
    format: "note-diff/v1",
    summary,
    startLine: start + 1,
    stats: {
      added: addedOnly,
      removed: removedOnly,
      changed,
      fromLines: fromLines.length,
      toLines: toLines.length,
    },
    preview,
    truncated: removed.length + added.length > previewLimit,
  };
}

export function createTodo(
  db: Database,
  lesson: Lesson,
  body: {
    title: string;
    description?: string | null;
    status?: string;
    statusId?: number;
    labelIds?: number[];
    labelsCsv?: string;
    projectId?: number | null;
    iterationId?: number | null;
    parentId?: number | null;
    plannedStartAt?: string | null;
    startAt?: string | null;
    dueAt?: string | null;
    endAt?: string | null;
    sortOrder?: number;
  },
): ApiTodo {
  if (lesson === "a") {
    const labelsCsv = body.labelsCsv ?? "";
    const status = body.status ?? "todo";
    db.run("BEGIN");
    try {
      const r = db
        .query(
          `INSERT INTO todos (title, description, labels_csv, status, parent_id, iteration_id, project_id, planned_start_at, start_at, due_at, end_at, sort_order)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
        )
        .get(
          body.title,
          body.description ?? null,
          labelsCsv,
          status,
          body.parentId ?? null,
          body.iterationId ?? null,
          body.projectId ?? null,
          body.plannedStartAt ?? null,
          body.startAt ?? null,
          body.dueAt ?? null,
          body.endAt ?? null,
          body.sortOrder ?? 0,
        ) as { id: number };
      db.run("COMMIT");
      return getTodo(db, lesson, r.id)!;
    } catch (e) {
      db.run("ROLLBACK");
      throw e;
    }
  }
  const statusId =
    body.statusId ??
    (() => {
      const d = db.query(`SELECT id FROM statuses ORDER BY sort_order, id LIMIT 1`).get() as { id: number } | null;
      if (!d) throw new Error("No statuses seeded");
      return d.id;
    })();
  db.run("BEGIN");
  try {
    const r = db
      .query(
        `INSERT INTO todos (title, description, status_id, parent_id, iteration_id, project_id, planned_start_at, start_at, due_at, end_at, sort_order)
         VALUES (?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
      )
      .get(
        body.title,
        body.description ?? null,
        statusId,
        body.parentId ?? null,
        body.iterationId ?? null,
        body.projectId ?? null,
        body.plannedStartAt ?? null,
        body.startAt ?? null,
        body.dueAt ?? null,
        body.endAt ?? null,
        body.sortOrder ?? 0,
      ) as { id: number };
    const todoId = r.id;
    if (lesson === "c") {
      insertEvent(db, todoId, "create", "todo", null, body.title);
    }
    for (const lid of body.labelIds ?? []) {
      db.query(`INSERT OR IGNORE INTO todo_labels (todo_id, label_id) VALUES (?,?)`).run(todoId, lid);
      if (lesson === "c") {
        const ln = db.query(`SELECT name FROM labels WHERE id = ?`).get(lid) as { name: string } | null;
        insertEvent(db, todoId, "label_add", "labels", null, ln?.name ?? String(lid));
      }
    }
    db.run("COMMIT");
    return getTodo(db, lesson, todoId)!;
  } catch (e) {
    db.run("ROLLBACK");
    throw e;
  }
}

export function updateTodo(
  db: Database,
  lesson: Lesson,
  id: number,
  patch: Partial<{
    title: string;
    description: string | null;
    status: string;
    statusId: number;
    labelsCsv: string;
    labelIds: number[];
    projectId: number | null;
    iterationId: number | null;
    parentId: number | null;
    plannedStartAt: string | null;
    startAt: string | null;
    dueAt: string | null;
    endAt: string | null;
    sortOrder: number;
  }>,
): ApiTodo | null {
  const cur = getTodo(db, lesson, id);
  if (!cur) return null;
  if (lesson === "a") {
    db.run("BEGIN");
    try {
      const fields: string[] = [];
      const vals: SQLQueryBindings[] = [];
      if (patch.title !== undefined) {
        fields.push("title = ?");
        vals.push(patch.title);
      }
      if (patch.description !== undefined) {
        fields.push("description = ?");
        vals.push(patch.description);
      }
      if (patch.labelsCsv !== undefined) {
        fields.push("labels_csv = ?");
        vals.push(patch.labelsCsv);
      }
      if (patch.status !== undefined) {
        fields.push("status = ?");
        vals.push(patch.status);
      }
      if (patch.iterationId !== undefined) {
        fields.push("iteration_id = ?");
        vals.push(patch.iterationId);
      }
      if (patch.projectId !== undefined) {
        fields.push("project_id = ?");
        vals.push(patch.projectId);
      }
      if (patch.parentId !== undefined) {
        fields.push("parent_id = ?");
        vals.push(patch.parentId);
      }
      if (patch.plannedStartAt !== undefined) {
        fields.push("planned_start_at = ?");
        vals.push(patch.plannedStartAt);
      }
      if (patch.startAt !== undefined) {
        fields.push("start_at = ?");
        vals.push(patch.startAt);
      }
      if (patch.dueAt !== undefined) {
        fields.push("due_at = ?");
        vals.push(patch.dueAt);
      }
      if (patch.endAt !== undefined) {
        fields.push("end_at = ?");
        vals.push(patch.endAt);
      }
      if (patch.sortOrder !== undefined) {
        fields.push("sort_order = ?");
        vals.push(patch.sortOrder);
      }
      if (fields.length) {
        fields.push("updated_at = datetime('now')");
        vals.push(id);
        db.query(`UPDATE todos SET ${fields.join(", ")} WHERE id = ?`).run(...vals);
      }
      db.run("COMMIT");
    } catch (e) {
      db.run("ROLLBACK");
      throw e;
    }
    return getTodo(db, lesson, id);
  }
  db.run("BEGIN");
  try {
    if (patch.title !== undefined && changedValue(cur.title, patch.title)) {
      db.query(`UPDATE todos SET title = ?, updated_at = datetime('now') WHERE id = ?`).run(patch.title, id);
      if (lesson === "c") insertEvent(db, id, "update", "title", cur.title, patch.title);
    }
    if (patch.description !== undefined && changedValue(cur.description, patch.description)) {
      db.query(`UPDATE todos SET description = ?, updated_at = datetime('now') WHERE id = ?`).run(patch.description, id);
      if (lesson === "c") {
        const noteChange = changedNoteDiff(cur.description, patch.description);
        insertEvent(db, id, "update", "description", noteChange.summary, JSON.stringify(noteChange));
      }
    }
    if (patch.iterationId !== undefined && patch.iterationId !== cur.iterationId) {
      const from = eventValue(cur.iterationId);
      const to = eventValue(patch.iterationId);
      db.query(`UPDATE todos SET iteration_id = ?, updated_at = datetime('now') WHERE id = ?`).run(patch.iterationId, id);
      if (lesson === "c") insertEvent(db, id, "iteration_change", "iteration", from, to);
    }
    if (patch.projectId !== undefined && patch.projectId !== cur.projectId) {
      const from = eventValue(cur.projectId);
      const to = eventValue(patch.projectId);
      db.query(`UPDATE todos SET project_id = ?, updated_at = datetime('now') WHERE id = ?`).run(patch.projectId, id);
      if (lesson === "c") insertEvent(db, id, "project_change", "project", from, to);
    }
    if (patch.parentId !== undefined && patch.parentId !== cur.parentId) {
      const from = eventValue(cur.parentId);
      const to = eventValue(patch.parentId);
      db.query(`UPDATE todos SET parent_id = ?, updated_at = datetime('now') WHERE id = ?`).run(patch.parentId, id);
      if (lesson === "c") insertEvent(db, id, "parent_change", "parent", from, to);
    }
    if (patch.plannedStartAt !== undefined && changedValue(cur.plannedStartAt, patch.plannedStartAt)) {
      db.query(`UPDATE todos SET planned_start_at = ?, updated_at = datetime('now') WHERE id = ?`).run(patch.plannedStartAt, id);
      if (lesson === "c")
        insertEvent(db, id, "update", "planned_start_at", eventValue(cur.plannedStartAt), eventValue(patch.plannedStartAt));
    }
    if (patch.startAt !== undefined && changedValue(cur.startAt, patch.startAt)) {
      db.query(`UPDATE todos SET start_at = ?, updated_at = datetime('now') WHERE id = ?`).run(patch.startAt, id);
      if (lesson === "c") insertEvent(db, id, "update", "start_at", eventValue(cur.startAt), eventValue(patch.startAt));
    }
    if (patch.dueAt !== undefined && changedValue(cur.dueAt, patch.dueAt)) {
      db.query(`UPDATE todos SET due_at = ?, updated_at = datetime('now') WHERE id = ?`).run(patch.dueAt, id);
      if (lesson === "c") insertEvent(db, id, "update", "due_at", eventValue(cur.dueAt), eventValue(patch.dueAt));
    }
    if (patch.endAt !== undefined && changedValue(cur.endAt, patch.endAt)) {
      db.query(`UPDATE todos SET end_at = ?, updated_at = datetime('now') WHERE id = ?`).run(patch.endAt, id);
      if (lesson === "c") insertEvent(db, id, "update", "end_at", eventValue(cur.endAt), eventValue(patch.endAt));
    }
    if (patch.statusId !== undefined && patch.statusId !== cur.statusId) {
      const fromName = cur.status;
      const toRow = db.query(`SELECT name FROM statuses WHERE id = ?`).get(patch.statusId) as { name: string } | null;
      db.query(`UPDATE todos SET status_id = ?, updated_at = datetime('now') WHERE id = ?`).run(patch.statusId, id);
      if (lesson === "c")
        insertEvent(db, id, "status_change", "status", fromName, toRow?.name ?? String(patch.statusId));
    }
    if (patch.sortOrder !== undefined && changedValue(cur.sortOrder, patch.sortOrder)) {
      db.query(`UPDATE todos SET sort_order = ?, updated_at = datetime('now') WHERE id = ?`).run(patch.sortOrder, id);
    }
    if (patch.labelIds) {
      const oldSet = new Set(cur.labels.map((l) => l.id));
      const newSet = new Set(patch.labelIds);
      let labelsChanged = false;
      for (const lid of oldSet) {
        if (!newSet.has(lid)) {
          db.query(`DELETE FROM todo_labels WHERE todo_id = ? AND label_id = ?`).run(id, lid);
          labelsChanged = true;
          if (lesson === "c") {
            const ln = db.query(`SELECT name FROM labels WHERE id = ?`).get(lid) as { name: string } | null;
            insertEvent(db, id, "label_remove", "labels", ln?.name ?? String(lid), null);
          }
        }
      }
      for (const lid of newSet) {
        if (!oldSet.has(lid)) {
          db.query(`INSERT OR IGNORE INTO todo_labels (todo_id, label_id) VALUES (?,?)`).run(id, lid);
          labelsChanged = true;
          if (lesson === "c") {
            const ln = db.query(`SELECT name FROM labels WHERE id = ?`).get(lid) as { name: string } | null;
            insertEvent(db, id, "label_add", "labels", null, ln?.name ?? String(lid));
          }
        }
      }
      if (labelsChanged) {
        db.query(`UPDATE todos SET updated_at = datetime('now') WHERE id = ?`).run(id);
      }
    }
    db.run("COMMIT");
  } catch (e) {
    db.run("ROLLBACK");
    throw e;
  }
  return getTodo(db, lesson, id);
}

export function deleteTodo(db: Database, lesson: Lesson, id: number): boolean {
  const cur = getTodo(db, lesson, id);
  if (!cur) return false;
  if (lesson === "c") {
    db.run("BEGIN");
    try {
      insertEvent(db, id, "delete", "todo", cur.title, null);
      db.query(`DELETE FROM todos WHERE id = ?`).run(id);
      db.run("COMMIT");
    } catch (e) {
      db.run("ROLLBACK");
      throw e;
    }
  } else {
    db.query(`DELETE FROM todos WHERE id = ?`).run(id);
  }
  return true;
}
