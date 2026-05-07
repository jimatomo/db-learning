#!/usr/bin/env bun
/**
 * Idempotent seed: clears domain tables and inserts sample data for the active LESSON.
 */
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { getDatabasePath, getLesson, type Lesson } from "../src/config";
import { runLessonMigrations } from "../src/migrate";

const lesson = getLesson();
const path = getDatabasePath();
mkdirSync(dirname(path), { recursive: true });
const db = new Database(path, { create: true });
db.run("PRAGMA foreign_keys = ON;");
db.run("PRAGMA journal_mode=WAL;");
db.run("PRAGMA busy_timeout = 8000;");
runLessonMigrations(db, lesson);

function clear(lesson: Lesson) {
  if (lesson === "c") db.run("DELETE FROM todo_events");
  if (lesson === "b" || lesson === "c") {
    db.run("DELETE FROM todo_labels");
    db.run("DELETE FROM todos");
    db.run("DELETE FROM projects");
    db.run("DELETE FROM labels");
    db.run("DELETE FROM statuses");
  } else {
    db.run("DELETE FROM todos");
    db.run("DELETE FROM projects");
  }
  db.run("DELETE FROM iterations");
}

clear(lesson);

if (lesson === "a") {
  db.run(`INSERT INTO iterations (name, starts_at, ends_at, sort_order) VALUES
     ('Sprint 1', date('now', '-14 days'), date('now', '-1 days'), 0)`);
  db.run(`INSERT INTO iterations (name, starts_at, ends_at, sort_order) VALUES
     ('Sprint 2', date('now'), date('now', '+13 days'), 1)`);
  db.run(`INSERT INTO projects (name, sort_order) VALUES ('Product', 0), ('Platform', 1), ('Ops', 2)`);
  const it1 = db.query(`SELECT id FROM iterations ORDER BY id LIMIT 1`).get() as { id: number };
  const it2 = db.query(`SELECT id FROM iterations ORDER BY id DESC LIMIT 1`).get() as { id: number };
  const projects = db.query(`SELECT id, name FROM projects ORDER BY sort_order, id`).all() as { id: number; name: string }[];
  const projectId = Object.fromEntries(projects.map((project) => [project.name, project.id])) as Record<string, number>;
  db.query(
    `INSERT INTO todos (title, description, labels_csv, status, parent_id, iteration_id, project_id, start_at, due_at, sort_order) VALUES
     (?, ?, ?, ?, NULL, ?, ?, date('now', '-3 days'), date('now', '+2 days'), 0)`,
  ).run("Design DB schema", "Model iterations and todos", "docs,design", "doing", it1.id, projectId.Platform);
  db.query(
    `INSERT INTO todos (title, description, labels_csv, status, parent_id, iteration_id, project_id, start_at, due_at, sort_order) VALUES
     (?, ?, ?, ?, NULL, ?, ?, date('now'), date('now', '+5 days'), 1)`,
  ).run("Implement API", "Hono + SQLite", "backend,feature", "todo", it1.id, projectId.Platform);
  db.query(
    `INSERT INTO todos (title, description, labels_csv, status, parent_id, iteration_id, project_id, start_at, due_at, sort_order) VALUES
     (?, ?, ?, ?, NULL, ?, ?, date('now', '-10 days'), date('now', '-2 days'), 2)`,
  ).run("Seed sample data", "For dashboards", "docs", "done", it2.id, projectId.Ops);
  db.query(
    `INSERT INTO todos (title, description, labels_csv, status, parent_id, iteration_id, project_id, start_at, due_at, sort_order) VALUES
     (?, ?, ?, ?, NULL, ?, ?, NULL, NULL, 3)`,
  ).run("Kanban polish", "DND kit", "frontend,feature", "todo", it2.id, projectId.Product);
} else {
  db.run(`INSERT INTO statuses (name, sort_order, color) VALUES
     ('inbox', 0, '#6b7280'),
     ('todo', 1, '#4a7bd1'),
     ('doing', 2, '#d4662c'),
     ('review', 3, '#8f5bd6'),
     ('waiting', 4, '#b28704'),
     ('done', 5, '#2f8f83')`);
  db.run(`INSERT INTO labels (name, color) VALUES
     ('bug', '#ef4444'),
     ('feature', '#3b82f6'),
     ('docs', '#22c55e'),
     ('frontend', '#a855f7'),
     ('backend', '#f97316')`);
  db.run(`INSERT INTO iterations (name, starts_at, ends_at, sort_order) VALUES
     ('Sprint 1', date('now', '-14 days'), date('now', '-1 days'), 0)`);
  db.run(`INSERT INTO iterations (name, starts_at, ends_at, sort_order) VALUES
     ('Sprint 2', date('now'), date('now', '+13 days'), 1)`);
  db.run(`INSERT INTO projects (name, sort_order) VALUES ('Product', 0), ('Platform', 1), ('Ops', 2)`);

  const st = db.query(`SELECT id, name FROM statuses`).all() as { id: number; name: string }[];
  const statusId = Object.fromEntries(st.map((s) => [s.name, s.id])) as Record<string, number>;
  const labels = db.query(`SELECT id, name FROM labels`).all() as { id: number; name: string }[];
  const labelId = Object.fromEntries(labels.map((l) => [l.name, l.id])) as Record<string, number>;
  const it = db.query(`SELECT id FROM iterations ORDER BY id`).all() as { id: number }[];
  const it1 = it[0]!.id;
  const it2 = it[1]!.id;
  const projects = db.query(`SELECT id, name FROM projects ORDER BY sort_order, id`).all() as { id: number; name: string }[];
  const projectId = Object.fromEntries(projects.map((project) => [project.name, project.id])) as Record<string, number>;

  type Row = {
    title: string;
    description: string;
    status: string;
    projectId: number;
    iterationId: number;
    startAt: string | null;
    dueAt: string | null;
    sortOrder: number;
    lbls: string[];
  };

  const rows: Row[] = [
    {
      title: "Design DB schema",
      description: "Iterations + todos + events",
      status: "review",
      projectId: projectId.Platform!,
      iterationId: it1,
      startAt: "date('now', '-3 days')",
      dueAt: "date('now', '+2 days')",
      sortOrder: 0,
      lbls: ["docs", "feature"],
    },
    {
      title: "Implement API",
      description: "REST + transactions",
      status: "waiting",
      projectId: projectId.Platform!,
      iterationId: it1,
      startAt: "date('now')",
      dueAt: "date('now', '+5 days')",
      sortOrder: 1,
      lbls: ["backend", "feature"],
    },
    {
      title: "Seed sample data",
      description: "DuckDB insights",
      status: "done",
      projectId: projectId.Ops!,
      iterationId: it2,
      startAt: "date('now', '-10 days')",
      dueAt: "date('now', '-2 days')",
      sortOrder: 2,
      lbls: ["docs"],
    },
    {
      title: "Kanban UX",
      description: "Drag and drop",
      status: "inbox",
      projectId: projectId.Product!,
      iterationId: it2,
      startAt: null,
      dueAt: null,
      sortOrder: 3,
      lbls: ["frontend", "feature"],
    },
    {
      title: "Fix label rename bug",
      description: "Normalized labels",
      status: "waiting",
      projectId: projectId.Product!,
      iterationId: it2,
      startAt: null,
      dueAt: null,
      sortOrder: 4,
      lbls: ["bug", "backend"],
    },
  ];

  for (const r of rows) {
    const sid = statusId[r.status]!;
    const startExpr = r.startAt ?? "NULL";
    const dueExpr = r.dueAt ?? "NULL";
    const sql = `INSERT INTO todos (title, description, status_id, parent_id, iteration_id, project_id, start_at, due_at, sort_order)
       VALUES (?, ?, ?, NULL, ?, ?, ${startExpr}, ${dueExpr}, ?)`;
    db.query(sql).run(r.title, r.description, sid, r.iterationId, r.projectId, r.sortOrder);
    const { id: tid } = db.query(`SELECT id FROM todos ORDER BY id DESC LIMIT 1`).get() as { id: number };
    for (const ln of r.lbls) {
      const lid = labelId[ln];
      if (lid) db.query(`INSERT INTO todo_labels (todo_id, label_id) VALUES (?,?)`).run(tid, lid);
    }
  }

  if (lesson === "c") {
    const todos = db.query(`SELECT id, title, status_id, iteration_id FROM todos ORDER BY id`).all() as {
      id: number;
      title: string;
      status_id: number;
      iteration_id: number | null;
    }[];
    const stById = Object.fromEntries(st.map((s) => [s.id, s.name])) as Record<number, string>;
    let n = 0;
    for (const t of todos) {
      n += 1;
      const m0 = `-${20 + n} days`;
      const m1 = `-${15 + n} days`;
      const m2 = `-${10 + n} days`;
      const m3 = `-${5 + n} days`;
      db
        .query(
          `INSERT INTO todo_events (todo_id, event_type, field_name, from_value, to_value, occurred_at, actor, iteration_id)
         VALUES (?, 'create', 'todo', NULL, ?, datetime('now', ?), 'seed', ?)`,
        )
        .run(t.id, t.title, m0, t.iteration_id);
      const cur = stById[t.status_id]!;
      if (cur === "done") {
        db
          .query(
            `INSERT INTO todo_events (todo_id, event_type, field_name, from_value, to_value, occurred_at, actor, iteration_id)
           VALUES (?, 'status_change', 'status', 'todo', 'doing', datetime('now', ?), 'seed', ?)`,
          )
          .run(t.id, m1, t.iteration_id);
        db
          .query(
            `INSERT INTO todo_events (todo_id, event_type, field_name, from_value, to_value, occurred_at, actor, iteration_id)
           VALUES (?, 'status_change', 'status', 'doing', 'done', datetime('now', ?), 'seed', ?)`,
          )
          .run(t.id, m2, t.iteration_id);
      } else if (cur === "doing") {
        db
          .query(
            `INSERT INTO todo_events (todo_id, event_type, field_name, from_value, to_value, occurred_at, actor, iteration_id)
           VALUES (?, 'status_change', 'status', 'todo', 'doing', datetime('now', ?), 'seed', ?)`,
          )
          .run(t.id, m2, t.iteration_id);
      } else {
        db
          .query(
            `INSERT INTO todo_events (todo_id, event_type, field_name, from_value, to_value, occurred_at, actor, iteration_id)
           VALUES (?, 'label_add', 'labels', NULL, 'feature', datetime('now', ?), 'seed', ?)`,
          )
          .run(t.id, m3, t.iteration_id);
      }
    }
  }
}

console.log("Seeded lesson", lesson, "→", path);
