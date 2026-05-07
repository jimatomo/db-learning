import { afterAll, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { completionTimesSqlite, eventSummarySqlite, iterationTrendsSqlite, labelCountsSqlite, replaySqlite } from "../src/insights";
import * as projectRepo from "../src/projectRepo";
import { loadLessonSchema } from "../src/schema";
import * as settingsRepo from "../src/settingsRepo";
import * as statusRepo from "../src/statusRepo";
import * as todoRepo from "../src/todoRepo";

const root = join(import.meta.dir, "..", "..", "..", "tmp-test-db");

afterAll(() => {
  try {
    rmSync(root, { recursive: true });
  } catch {
    /* ok */
  }
});

function openLesson(lesson: "a" | "b" | "c") {
  mkdirSync(root, { recursive: true });
  const p = join(root, `${lesson}-${crypto.randomUUID()}.db`);
  const db = new Database(p, { create: true });
  db.run("PRAGMA foreign_keys = ON;");
  loadLessonSchema(db, lesson);
  return { db, path: p };
}

describe("lesson schemas", () => {
  test("lesson a/b/c load", () => {
    for (const lesson of ["a", "b", "c"] as const) {
      const { db } = openLesson(lesson);
      const projectTable = db.query(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'projects'`).get() as {
        n: number;
      };
      expect(projectTable.n).toBe(1);
      const projectColumn = db.query(`SELECT COUNT(*) AS n FROM pragma_table_info('todos') WHERE name = 'project_id'`).get() as {
        n: number;
      };
      expect(projectColumn.n).toBe(1);
      if (lesson !== "a") {
        const subStatusTable = db.query(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'sub_statuses'`).get() as {
          n: number;
        };
        expect(subStatusTable.n).toBe(0);
        const subStatusColumn = db.query(`SELECT COUNT(*) AS n FROM pragma_table_info('todos') WHERE name = 'sub_status_id'`).get() as {
          n: number;
        };
        expect(subStatusColumn.n).toBe(0);
      }
      if (lesson === "c") {
        const eventIterationColumn = db.query(`SELECT COUNT(*) AS n FROM pragma_table_info('todo_events') WHERE name = 'iteration_id'`).get() as {
          n: number;
        };
        expect(eventIterationColumn.n).toBe(0);
        const eventProjectColumn = db.query(`SELECT COUNT(*) AS n FROM pragma_table_info('todo_events') WHERE name = 'project_id'`).get() as {
          n: number;
        };
        expect(eventProjectColumn.n).toBe(0);
      }
      db.close();
    }
  });
});

describe("workflow statuses", () => {
  test("normalized lessons expose flat workflow statuses", () => {
    const { db } = openLesson("c");
    const statuses = statusRepo.listStatuses(db, "c");
    expect(statuses.map((status) => status.name)).toEqual(["inbox", "todo", "doing", "review", "waiting", "done"]);
    expect(statuses.find((status) => status.name === "doing")).toMatchObject({ autoStart: true, autoEnd: false });
    expect(statuses.find((status) => status.name === "done")).toMatchObject({ autoStart: false, autoEnd: true });
    db.close();
  });

  test("status create, rename, and sort order update", () => {
    const { db } = openLesson("c");
    const created = statusRepo.createStatus(db, "c", {
      name: "blocked",
      sortOrder: 6,
      color: "#123456",
      autoStart: true,
    });
    expect(created).toMatchObject({ name: "blocked", sortOrder: 6, color: "#123456", autoStart: true, autoEnd: false });

    const renamed = statusRepo.updateStatus(db, "c", created.id, {
      name: "paused",
      sortOrder: 1,
      color: "#abcdef",
      autoStart: false,
      autoEnd: true,
    });
    expect(renamed).toMatchObject({
      id: created.id,
      name: "paused",
      sortOrder: 1,
      color: "#abcdef",
      autoStart: false,
      autoEnd: true,
    });
    expect(statusRepo.listStatuses(db, "c").find((status) => status.id === created.id)).toMatchObject({
      name: "paused",
      sortOrder: 1,
      color: "#abcdef",
      autoStart: false,
      autoEnd: true,
    });
    db.close();
  });
});

describe("app settings", () => {
  test("time zone defaults to Asia/Tokyo and can switch to UTC", () => {
    const { db } = openLesson("c");
    expect(settingsRepo.getSettings(db)).toEqual({ timeZone: "Asia/Tokyo" });

    const updated = settingsRepo.updateSettings(db, { timeZone: "UTC" });
    expect(updated).toEqual({ timeZone: "UTC" });
    expect(settingsRepo.getSettings(db)).toEqual({ timeZone: "UTC" });
    db.close();
  });
});

describe("projects", () => {
  test("todo project fields round-trip and filter", () => {
    const { db } = openLesson("c");
    const p1 = projectRepo.createProject(db, { name: "Product", sortOrder: 0 });
    const p2 = projectRepo.createProject(db, { name: "Platform", sortOrder: 1 });
    const sid = (db.query(`SELECT id FROM statuses WHERE name='todo' LIMIT 1`).get() as { id: number }).id;

    const productTodo = todoRepo.createTodo(db, "c", {
      title: "product task",
      statusId: sid,
      projectId: p1.id,
    });
    const platformTodo = todoRepo.createTodo(db, "c", {
      title: "platform task",
      statusId: sid,
      projectId: p2.id,
    });

    expect(productTodo.projectId).toBe(p1.id);
    expect(platformTodo.projectId).toBe(p2.id);
    expect(todoRepo.listTodos(db, "c")).toHaveLength(2);
    expect(todoRepo.listTodos(db, "c", { projectId: p1.id }).map((todo) => todo.id)).toEqual([productTodo.id]);

    const moved = todoRepo.updateTodo(db, "c", productTodo.id, { projectId: p2.id });
    expect(moved?.projectId).toBe(p2.id);
    expect(todoRepo.listTodos(db, "c", { projectId: p1.id })).toHaveLength(0);
    expect(todoRepo.listTodos(db, "c", { projectId: p2.id })).toHaveLength(2);
    db.close();
  });

  test("deleting a project clears todo project id", () => {
    const { db } = openLesson("b");
    const project = projectRepo.createProject(db, { name: "Product", sortOrder: 0 });
    const sid = (db.query(`SELECT id FROM statuses WHERE name='todo' LIMIT 1`).get() as { id: number }).id;
    const todo = todoRepo.createTodo(db, "b", {
      title: "project task",
      statusId: sid,
      projectId: project.id,
    });

    expect(projectRepo.deleteProject(db, project.id)).toBe(true);
    expect(todoRepo.getTodo(db, "b", todo.id)?.projectId).toBeNull();
    db.close();
  });
});

describe("lesson c events", () => {
  test("status change writes todo_events", () => {
    const { db } = openLesson("c");
    db.run(`INSERT INTO iterations (name, sort_order) VALUES ('S1',0)`);
    const itId = (db.query(`SELECT id FROM iterations LIMIT 1`).get() as { id: number }).id;
    const st = db.query(`SELECT id, name FROM statuses`).all() as { id: number; name: string }[];
    const todoStatusId = st.find((s) => s.name === "todo")!.id;
    const doingId = st.find((s) => s.name === "doing")!.id;
    db.query(
      `INSERT INTO todos (title, description, status_id, sort_order, iteration_id) VALUES ('t','',?,?,?)`,
    ).run(todoStatusId, 0, itId);
    const tid = (db.query(`SELECT id FROM todos ORDER BY id DESC LIMIT 1`).get() as { id: number }).id;
    const before = (db.query(`SELECT COUNT(*) AS n FROM todo_events`).get() as { n: number }).n;
    todoRepo.updateTodo(db, "c", tid, { statusId: doingId });
    const after = (db.query(`SELECT COUNT(*) AS n FROM todo_events`).get() as { n: number }).n;
    expect(after).toBeGreaterThan(before);
    db.close();
  });

  test("label changes refresh todo updated timestamp", () => {
    const { db } = openLesson("c");
    const sid = (db.query(`SELECT id FROM statuses WHERE name='todo' LIMIT 1`).get() as { id: number }).id;
    db.run(`INSERT INTO labels (name, color) VALUES ('urgent','#f00')`);
    const lid = (db.query(`SELECT id FROM labels WHERE name='urgent'`).get() as { id: number }).id;
    const created = todoRepo.createTodo(db, "c", {
      title: "label timestamp",
      statusId: sid,
    });
    db.query(`UPDATE todos SET updated_at = '2026-01-01 00:00:00' WHERE id = ?`).run(created.id);

    const updated = todoRepo.updateTodo(db, "c", created.id, { labelIds: [lid] });

    expect(updated?.updatedAt).not.toBe("2026-01-01 00:00:00");
    expect(updated?.labels.map((label) => label.id)).toEqual([lid]);
    db.close();
  });

  test("note changes are recorded as description update events", () => {
    const { db } = openLesson("c");
    db.run(`INSERT INTO iterations (name, sort_order) VALUES ('S1',0)`);
    const iterationId = (db.query(`SELECT id FROM iterations LIMIT 1`).get() as { id: number }).id;
    const sid = (db.query(`SELECT id FROM statuses WHERE name='todo' LIMIT 1`).get() as { id: number }).id;
    const created = todoRepo.createTodo(db, "c", {
      title: "note event",
      description: "before",
      statusId: sid,
      iterationId,
    });

    todoRepo.updateTodo(db, "c", created.id, { description: "after" });

    const events = replaySqlite(db, "c", iterationId).filter((event) => event.fieldName === "description");
    expect(events).toEqual([
      expect.objectContaining({
        todoId: created.id,
        eventType: "update",
        fromValue: "note ~1 at L1",
      }),
    ]);
    const noteDiff = JSON.parse(events[0].toValue ?? "{}");
    expect(noteDiff).toMatchObject({
      format: "note-diff/v1",
      summary: "note ~1 at L1",
      startLine: 1,
      stats: { added: 0, removed: 0, changed: 1, fromLines: 1, toLines: 1 },
      preview: [{ kind: "changed", line: 1, from: "before", to: "after" }],
      truncated: false,
    });
    db.close();
  });

  test("note update events store compact line diff payloads", () => {
    const { db } = openLesson("c");
    db.run(`INSERT INTO iterations (name, sort_order) VALUES ('S1',0)`);
    const iterationId = (db.query(`SELECT id FROM iterations LIMIT 1`).get() as { id: number }).id;
    const sid = (db.query(`SELECT id FROM statuses WHERE name='todo' LIMIT 1`).get() as { id: number }).id;
    const created = todoRepo.createTodo(db, "c", {
      title: "note block event",
      description: "unchanged intro\n\n- first\n- second\n\nunchanged outro",
      statusId: sid,
      iterationId,
    });

    todoRepo.updateTodo(db, "c", created.id, {
      description: "unchanged intro\n\n- first\n- changed second\n\nunchanged outro",
    });

    const event = replaySqlite(db, "c", iterationId).find((item) => item.fieldName === "description");
    expect(event).toMatchObject({
      todoId: created.id,
      eventType: "update",
      fromValue: "note ~1 at L4",
    });
    const noteDiff = JSON.parse(event?.toValue ?? "{}");
    expect(noteDiff).toMatchObject({
      format: "note-diff/v1",
      summary: "note ~1 at L4",
      startLine: 4,
      stats: { added: 0, removed: 0, changed: 1, fromLines: 6, toLines: 6 },
      preview: [{ kind: "changed", line: 4, from: "- second", to: "- changed second" }],
      truncated: false,
    });
    db.close();
  });

  test("note diffs keep inserted lines from shifting later edits", () => {
    const { db } = openLesson("c");
    db.run(`INSERT INTO iterations (name, sort_order) VALUES ('S1',0)`);
    const iterationId = (db.query(`SELECT id FROM iterations LIMIT 1`).get() as { id: number }).id;
    const sid = (db.query(`SELECT id FROM statuses WHERE name='todo' LIMIT 1`).get() as { id: number }).id;
    const created = todoRepo.createTodo(db, "c", {
      title: "note insert event",
      description: "heading\nline a\nline b\nline c\nfooter",
      statusId: sid,
      iterationId,
    });

    todoRepo.updateTodo(db, "c", created.id, {
      description: "heading\ninserted context\nline a\nline b\nchanged c\nfooter",
    });

    const event = replaySqlite(db, "c", iterationId).find((item) => item.fieldName === "description");
    expect(event).toMatchObject({
      todoId: created.id,
      eventType: "update",
      fromValue: "note +1 ~1 at L2",
    });
    const noteDiff = JSON.parse(event?.toValue ?? "{}");
    expect(noteDiff).toMatchObject({
      format: "note-diff/v1",
      summary: "note +1 ~1 at L2",
      startLine: 2,
      stats: { added: 1, removed: 0, changed: 1, fromLines: 5, toLines: 6 },
      preview: [
        { kind: "added", line: 2, to: "inserted context" },
        { kind: "changed", line: 5, from: "line c", to: "changed c" },
      ],
      truncated: false,
    });
    db.close();
  });

  test("note diffs do not mark unchanged middle lines between two edits", () => {
    const { db } = openLesson("c");
    db.run(`INSERT INTO iterations (name, sort_order) VALUES ('S1',0)`);
    const iterationId = (db.query(`SELECT id FROM iterations LIMIT 1`).get() as { id: number }).id;
    const sid = (db.query(`SELECT id FROM statuses WHERE name='todo' LIMIT 1`).get() as { id: number }).id;
    const created = todoRepo.createTodo(db, "c", {
      title: "note two edits event",
      description: "- [ ] top task\n\nshared detail a\nshared detail b\nshared detail c\n\n- [ ] bottom task",
      statusId: sid,
      iterationId,
    });

    todoRepo.updateTodo(db, "c", created.id, {
      description: "- [x] top task\n\nshared detail a\nshared detail b\nshared detail c\n\n- [x] bottom task",
    });

    const event = replaySqlite(db, "c", iterationId).find((item) => item.fieldName === "description");
    expect(event).toMatchObject({
      todoId: created.id,
      eventType: "update",
      fromValue: "note ~2 at L1",
    });
    const noteDiff = JSON.parse(event?.toValue ?? "{}");
    expect(noteDiff).toMatchObject({
      format: "note-diff/v1",
      summary: "note ~2 at L1",
      startLine: 1,
      stats: { added: 0, removed: 0, changed: 2, fromLines: 7, toLines: 7 },
      preview: [
        { kind: "changed", line: 1, from: "- [ ] top task", to: "- [x] top task" },
        { kind: "changed", line: 7, from: "- [ ] bottom task", to: "- [x] bottom task" },
      ],
      truncated: false,
    });
    db.close();
  });

  test("note diffs do not report identical lines inside a separated edit block", () => {
    const { db } = openLesson("c");
    db.run(`INSERT INTO iterations (name, sort_order) VALUES ('S1',0)`);
    const iterationId = (db.query(`SELECT id FROM iterations LIMIT 1`).get() as { id: number }).id;
    const sid = (db.query(`SELECT id FROM statuses WHERE name='todo' LIMIT 1`).get() as { id: number }).id;
    const created = todoRepo.createTodo(db, "c", {
      title: "note repeated blocks event",
      description: "REST + transactions\nあ\n\nadd\n\nい\n- [ ] u\n- e\n```\no\n```\n\nadd3",
      statusId: sid,
      iterationId,
    });

    todoRepo.updateTodo(db, "c", created.id, {
      description: "REST + transactions\nあ\n\nadd2\n\nい\n- [ ] u\n- e\n```\no\n```\n\nadd3",
    });

    const event = replaySqlite(db, "c", iterationId).find((item) => item.fieldName === "description");
    expect(event).toMatchObject({
      todoId: created.id,
      eventType: "update",
      fromValue: "note ~1 at L4",
    });
    const noteDiff = JSON.parse(event?.toValue ?? "{}");
    expect(noteDiff).toMatchObject({
      format: "note-diff/v1",
      summary: "note ~1 at L4",
      startLine: 4,
      stats: { added: 0, removed: 0, changed: 1, fromLines: 13, toLines: 13 },
      preview: [{ kind: "changed", line: 4, from: "add", to: "add2" }],
      truncated: false,
    });
    db.close();
  });

  test("full autosave payload with unchanged values does not write noise events", () => {
    const { db } = openLesson("c");
    db.run(`INSERT INTO iterations (name, sort_order) VALUES ('S1',0)`);
    db.run(`INSERT INTO projects (name, sort_order) VALUES ('P1',0)`);
    const iterationId = (db.query(`SELECT id FROM iterations LIMIT 1`).get() as { id: number }).id;
    const projectId = (db.query(`SELECT id FROM projects LIMIT 1`).get() as { id: number }).id;
    const sid = (db.query(`SELECT id FROM statuses WHERE name='todo' LIMIT 1`).get() as { id: number }).id;
    const created = todoRepo.createTodo(db, "c", {
      title: "autosave event",
      description: "note",
      statusId: sid,
      iterationId,
      projectId,
      startAt: "2026-05-05 14:05:00",
    });
    const before = (db.query(`SELECT COUNT(*) AS n FROM todo_events WHERE todo_id = ?`).get(created.id) as { n: number }).n;

    todoRepo.updateTodo(db, "c", created.id, {
      title: created.title,
      description: created.description,
      statusId: created.statusId ?? undefined,
      iterationId: created.iterationId,
      projectId: created.projectId,
      parentId: created.parentId,
      plannedStartAt: created.plannedStartAt,
      startAt: created.startAt,
      dueAt: created.dueAt,
      endAt: created.endAt,
      labelIds: created.labels.map((label) => label.id),
    });

    const after = (db.query(`SELECT COUNT(*) AS n FROM todo_events WHERE todo_id = ?`).get(created.id) as { n: number }).n;
    expect(after).toBe(before);
    db.close();
  });

  test("insight events follow the todo's current iteration and project", () => {
    const { db } = openLesson("c");
    db.run(`INSERT INTO iterations (name, sort_order) VALUES ('S1',0), ('S2',1)`);
    db.run(`INSERT INTO projects (name, sort_order) VALUES ('P1',0), ('P2',1)`);
    const iterations = db.query(`SELECT id, name FROM iterations ORDER BY id`).all() as { id: number; name: string }[];
    const projects = db.query(`SELECT id, name FROM projects ORDER BY id`).all() as { id: number; name: string }[];
    const firstIterationId = iterations.find((iteration) => iteration.name === "S1")!.id;
    const secondIterationId = iterations.find((iteration) => iteration.name === "S2")!.id;
    const firstProjectId = projects.find((project) => project.name === "P1")!.id;
    const secondProjectId = projects.find((project) => project.name === "P2")!.id;
    const sid = (db.query(`SELECT id FROM statuses WHERE name='todo' LIMIT 1`).get() as { id: number }).id;

    const moved = todoRepo.createTodo(db, "c", {
      title: "moved",
      statusId: sid,
      iterationId: firstIterationId,
      projectId: firstProjectId,
    });
    todoRepo.updateTodo(db, "c", moved.id, { iterationId: secondIterationId, projectId: secondProjectId });

    const deleted = todoRepo.createTodo(db, "c", {
      title: "deleted",
      statusId: sid,
      iterationId: firstIterationId,
      projectId: firstProjectId,
    });
    todoRepo.deleteTodo(db, "c", deleted.id);

    const firstProjectEvents = replaySqlite(db, "c", firstIterationId, firstProjectId);
    expect(firstProjectEvents).toEqual([]);
    const secondProjectEvents = replaySqlite(db, "c", secondIterationId, secondProjectId);
    expect(secondProjectEvents.map((event) => event.eventType)).toEqual(["create", "iteration_change", "project_change"]);
    db.close();
  });
});

describe("insights sqlite", () => {
  test("aggregates run on seeded shape", () => {
    const { db } = openLesson("c");
    db.run(`INSERT INTO labels (name, color) VALUES ('x','#000'), ('y','#111')`);
    db.run(`INSERT INTO iterations (name, sort_order) VALUES ('S1',0)`);
    db.run(`INSERT INTO projects (name, sort_order) VALUES ('P1',0), ('P2',1)`);
    const itId = (db.query(`SELECT id FROM iterations LIMIT 1`).get() as { id: number }).id;
    const sid = (db.query(`SELECT id FROM statuses WHERE name='todo' LIMIT 1`).get() as { id: number }).id;
    const labelRows = db.query(`SELECT id, name FROM labels ORDER BY id`).all() as { id: number; name: string }[];
    const projectRows = db.query(`SELECT id, name FROM projects ORDER BY id`).all() as { id: number; name: string }[];
    const lid = labelRows.find((label) => label.name === "x")!.id;
    const otherLid = labelRows.find((label) => label.name === "y")!.id;
    const projectId = projectRows.find((project) => project.name === "P1")!.id;
    const otherProjectId = projectRows.find((project) => project.name === "P2")!.id;
    db.query(`INSERT INTO todos (title, description, status_id, sort_order, iteration_id, project_id) VALUES ('a','',?,?,?,?)`).run(
      sid,
      0,
      itId,
      projectId,
    );
    db.query(`INSERT INTO todos (title, description, status_id, sort_order, iteration_id, project_id) VALUES ('b','',?,?,?,?)`).run(
      sid,
      1,
      itId,
      otherProjectId,
    );
    const todoRows = db.query(`SELECT id, title FROM todos ORDER BY id`).all() as { id: number; title: string }[];
    const tid = todoRows.find((todo) => todo.title === "a")!.id;
    const otherTid = todoRows.find((todo) => todo.title === "b")!.id;
    db.query(`INSERT INTO todo_labels (todo_id, label_id) VALUES (?,?)`).run(tid, lid);
    db.query(`INSERT INTO todo_labels (todo_id, label_id) VALUES (?,?)`).run(otherTid, otherLid);
    db.query(
      `INSERT INTO todo_events (todo_id, event_type, field_name, from_value, to_value, occurred_at, actor)
       VALUES (?, 'create', 'todo', NULL, 'a', datetime('now'), 't')`,
    ).run(tid);
    db.query(
      `INSERT INTO todo_events (todo_id, event_type, field_name, from_value, to_value, occurred_at, actor)
       VALUES (?, 'delete', 'todo', 'b', NULL, datetime('now'), 't')`,
    ).run(otherTid);

    const labels = labelCountsSqlite(db, "c", itId);
    expect(labels.find((l) => l.name === "x")?.count).toBe(1);
    expect(labels.find((l) => l.name === "y")?.count).toBe(1);

    const projectLabels = labelCountsSqlite(db, "c", itId, projectId);
    expect(projectLabels).toEqual([{ name: "x", count: 1 }]);

    const summary = eventSummarySqlite(db, "c", itId);
    expect(summary.some((s) => s.eventType === "create")).toBe(true);
    const projectSummary = eventSummarySqlite(db, "c", itId, projectId);
    expect(projectSummary).toEqual([{ eventType: "create", count: 1 }]);

    const replay = replaySqlite(db, "c", itId);
    expect(replay.length).toBeGreaterThan(0);
    const projectReplay = replaySqlite(db, "c", itId, projectId);
    expect(projectReplay).toHaveLength(1);
    expect(projectReplay[0]?.todoId).toBe(tid);

    const trends = iterationTrendsSqlite(db, "c");
    expect(trends).toHaveLength(1);
    expect(trends[0]).toMatchObject({
      iterationId: itId,
      total: 2,
      completed: 0,
      started: 0,
      completionRate: 0,
    });

    db.query(`UPDATE todos SET status_id = (SELECT id FROM statuses WHERE name = 'done'), end_at = '2026-04-08' WHERE id = ?`).run(tid);
    db.query(`UPDATE todos SET start_at = '2026-04-05', end_at = '2026-04-07' WHERE id = ?`).run(otherTid);
    const completionTimes = completionTimesSqlite(db, itId);
    expect(completionTimes).toEqual([
      expect.objectContaining({
        todoId: otherTid,
        title: "b",
        startAt: "2026-04-05",
        endAt: "2026-04-07",
        durationHours: 48,
      }),
    ]);

    const projectTrends = iterationTrendsSqlite(db, "c", projectId);
    expect(projectTrends).toHaveLength(1);
    expect(projectTrends[0]).toMatchObject({
      iterationId: itId,
      total: 1,
      completed: 1,
      completionRate: 1,
    });
    db.close();
  });
});

describe("todo schedule fields", () => {
  test("new schedule fields round-trip through repo", () => {
    const { db } = openLesson("c");
    const sid = (db.query(`SELECT id FROM statuses WHERE name='todo' LIMIT 1`).get() as { id: number }).id;
    const created = todoRepo.createTodo(db, "c", {
      title: "schedule test",
      statusId: sid,
      plannedStartAt: "2026-04-01",
      startAt: "2026-04-02",
      dueAt: "2026-04-05",
      endAt: "2026-04-06",
    });

    expect(created.plannedStartAt).toBe("2026-04-01");
    expect(created.startAt).toBe("2026-04-02");
    expect(created.dueAt).toBe("2026-04-05");
    expect(created.endAt).toBe("2026-04-06");

    const updated = todoRepo.updateTodo(db, "c", created.id, {
      plannedStartAt: "2026-04-03",
      endAt: "2026-04-07",
    });

    expect(updated?.plannedStartAt).toBe("2026-04-03");
    expect(updated?.startAt).toBe("2026-04-02");
    expect(updated?.dueAt).toBe("2026-04-05");
    expect(updated?.endAt).toBe("2026-04-07");
    db.close();
  });

  test("status change auto-fills actual dates", () => {
    const { db } = openLesson("c");
    const statuses = db.query(`SELECT id, name FROM statuses ORDER BY sort_order, id`).all() as { id: number; name: string }[];
    const todoId = statuses.find((status) => status.name === "todo")!.id;
    const doingId = statuses.find((status) => status.name === "doing")!.id;
    const doneId = statuses.find((status) => status.name === "done")!.id;

    const created = todoRepo.createTodo(db, "c", {
      title: "auto date",
      statusId: todoId,
    });

    db.query(`UPDATE todos SET status_id = ? WHERE id = ?`).run(doingId, created.id);
    const doing = todoRepo.getTodo(db, "c", created.id);
    expect(doing?.startAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(doing?.endAt).toBeNull();

    db.query(`UPDATE todos SET status_id = ? WHERE id = ?`).run(doneId, created.id);
    const done = todoRepo.getTodo(db, "c", created.id);
    expect(done?.startAt).toBe(doing?.startAt);
    expect(done?.endAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);

    const uiCreated = todoRepo.createTodo(db, "c", {
      title: "ui auto date",
      statusId: todoId,
    });
    const uiDoing = todoRepo.updateTodo(db, "c", uiCreated.id, {
      statusId: doingId,
      startAt: null,
      endAt: null,
    });
    expect(uiDoing?.startAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(uiDoing?.endAt).toBeNull();

    statusRepo.updateStatus(db, "c", doingId, { autoStart: false });
    const configured = todoRepo.createTodo(db, "c", {
      title: "configured trigger",
      statusId: todoId,
    });
    const configuredDoing = todoRepo.updateTodo(db, "c", configured.id, { statusId: doingId });
    expect(configuredDoing?.startAt).toBeNull();
    db.close();
  });
});
