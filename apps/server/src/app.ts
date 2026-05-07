import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Database } from "bun:sqlite";
import type { Lesson } from "./config";
import * as iterationRepo from "./iterationRepo";
import * as labelRepo from "./labelRepo";
import { duckdbCompletionTimes, duckdbEventSummary, duckdbIterationTrends, duckdbLabelCounts, duckdbReplay } from "./insights";
import * as projectRepo from "./projectRepo";
import * as settingsRepo from "./settingsRepo";
import * as statusRepo from "./statusRepo";
import * as todoRepo from "./todoRepo";

export type AppEnv = {
  Variables: {
    db: Database;
    lesson: Lesson;
    sqlitePath: string;
  };
};

export function createApp(db: Database, lesson: Lesson, sqlitePath: string): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use("*", async (c, next) => {
    c.set("db", db);
    c.set("lesson", lesson);
    c.set("sqlitePath", sqlitePath);
    await next();
  });

  app.use(
    "/api/*",
    cors({
      origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type"],
    }),
  );

  app.get("/api/meta/lesson", (c) => c.json({ lesson: c.get("lesson") }));

  app.get("/api/settings", (c) => c.json(settingsRepo.getSettings(c.get("db"))));
  app.patch("/api/settings", async (c) => {
    const body = (await c.req.json()) as Record<string, unknown>;
    return c.json(
      settingsRepo.updateSettings(c.get("db"), {
        timeZone: body.timeZone === "UTC" ? "UTC" : "Asia/Tokyo",
      }),
    );
  });

  app.get("/api/lessons/:lessonId/health", (c) => {
    const id = c.req.param("lessonId") as Lesson;
    const current = c.get("lesson");
    const db = c.get("db");
    const todoCount = (db.query(`SELECT COUNT(*) AS n FROM todos`).get() as { n: number }).n;
    return c.json({
      requestedLesson: id,
      activeLesson: current,
      matches: id === current,
      todoCount,
      schema: `${current}/schema.sql`,
    });
  });

  app.get("/api/statuses", (c) => c.json(statusRepo.listStatuses(c.get("db"), c.get("lesson"))));
  app.post("/api/statuses", async (c) => {
    try {
      const body = (await c.req.json()) as Record<string, unknown>;
      const row = statusRepo.createStatus(c.get("db"), c.get("lesson"), {
        name: String(body.name ?? ""),
        sortOrder: body.sortOrder !== undefined ? Number(body.sortOrder) : body.sort_order !== undefined ? Number(body.sort_order) : 0,
        color: body.color !== undefined ? String(body.color) : undefined,
        autoStart: body.autoStart !== undefined ? Boolean(body.autoStart) : undefined,
        autoEnd: body.autoEnd !== undefined ? Boolean(body.autoEnd) : undefined,
      });
      return c.json(row, 201);
    } catch (e) {
      if ((e as Error).message === "LESSON_A_STATUSES") return c.json({ error: "not available in lesson A" }, 422);
      throw e;
    }
  });
  app.patch("/api/statuses/:id", async (c) => {
    try {
      const body = (await c.req.json()) as Record<string, unknown>;
      const row = statusRepo.updateStatus(c.get("db"), c.get("lesson"), Number(c.req.param("id")), {
        name: body.name !== undefined ? String(body.name) : undefined,
        sortOrder:
          body.sortOrder !== undefined
            ? Number(body.sortOrder)
            : body.sort_order !== undefined
              ? Number(body.sort_order)
              : undefined,
        color: body.color !== undefined ? String(body.color) : undefined,
        autoStart: body.autoStart !== undefined ? Boolean(body.autoStart) : undefined,
        autoEnd: body.autoEnd !== undefined ? Boolean(body.autoEnd) : undefined,
      });
      if (!row) return c.json({ error: "not found" }, 404);
      return c.json(row);
    } catch (e) {
      if ((e as Error).message === "LESSON_A_STATUSES") return c.json({ error: "not available in lesson A" }, 422);
      throw e;
    }
  });

  app.get("/api/projects", (c) => c.json(projectRepo.listProjects(c.get("db"))));
  app.post("/api/projects", async (c) => {
    const body = (await c.req.json()) as Record<string, unknown>;
    const row = projectRepo.createProject(c.get("db"), {
      name: String(body.name ?? ""),
      sortOrder: body.sortOrder !== undefined ? Number(body.sortOrder) : body.sort_order !== undefined ? Number(body.sort_order) : 0,
    });
    return c.json(row, 201);
  });
  app.patch("/api/projects/:id", async (c) => {
    const body = (await c.req.json()) as Record<string, unknown>;
    const row = projectRepo.updateProject(c.get("db"), Number(c.req.param("id")), {
      name: body.name !== undefined ? String(body.name) : undefined,
      sortOrder:
        body.sortOrder !== undefined
          ? Number(body.sortOrder)
          : body.sort_order !== undefined
            ? Number(body.sort_order)
            : undefined,
    });
    if (!row) return c.json({ error: "not found" }, 404);
    return c.json(row);
  });
  app.delete("/api/projects/:id", (c) => {
    const ok = projectRepo.deleteProject(c.get("db"), Number(c.req.param("id")));
    if (!ok) return c.json({ error: "not found" }, 404);
    return c.body(null, 204);
  });

  app.get("/api/iterations", (c) => c.json(iterationRepo.listIterations(c.get("db"))));
  app.post("/api/iterations", async (c) => {
    const body = (await c.req.json()) as iterationRepo.ApiIteration | Record<string, unknown>;
    const row = iterationRepo.createIteration(c.get("db"), {
      name: String(body.name ?? ""),
      startsAt: (body.startsAt as string | null | undefined) ?? (body as { starts_at?: string }).starts_at ?? null,
      endsAt: (body.endsAt as string | null | undefined) ?? (body as { ends_at?: string }).ends_at ?? null,
      sortOrder: Number((body as { sortOrder?: number }).sortOrder ?? (body as { sort_order?: number }).sort_order ?? 0),
    });
    return c.json(row, 201);
  });
  app.patch("/api/iterations/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const body = (await c.req.json()) as Record<string, unknown>;
    const row = iterationRepo.updateIteration(c.get("db"), id, {
      name: body.name !== undefined ? String(body.name) : undefined,
      startsAt:
        body.startsAt !== undefined
          ? (body.startsAt as string | null)
          : body.starts_at !== undefined
            ? (body.starts_at as string | null)
            : undefined,
      endsAt:
        body.endsAt !== undefined
          ? (body.endsAt as string | null)
          : body.ends_at !== undefined
            ? (body.ends_at as string | null)
            : undefined,
      sortOrder:
        body.sortOrder !== undefined
          ? Number(body.sortOrder)
          : body.sort_order !== undefined
            ? Number(body.sort_order)
            : undefined,
    });
    if (!row) return c.json({ error: "not found" }, 404);
    return c.json(row);
  });
  app.delete("/api/iterations/:id", (c) => {
    const ok = iterationRepo.deleteIteration(c.get("db"), Number(c.req.param("id")));
    if (!ok) return c.json({ error: "not found" }, 404);
    return c.body(null, 204);
  });

  app.get("/api/labels", (c) => c.json(labelRepo.listLabels(c.get("db"), c.get("lesson"))));
  app.post("/api/labels", async (c) => {
    try {
      const body = (await c.req.json()) as { name?: string; color?: string };
      const row = labelRepo.createLabel(c.get("db"), c.get("lesson"), String(body.name ?? ""), body.color);
      return c.json(row, 201);
    } catch (e) {
      if ((e as Error).message === "LESSON_A_LABELS") {
        return c.json(
          {
            error:
              "Lesson A stores labels inside todos.labels_csv. Switch to LESSON=b or c for normalized label CRUD.",
          },
          422,
        );
      }
      throw e;
    }
  });
  app.patch("/api/labels/:id", async (c) => {
    try {
      const body = (await c.req.json()) as { name?: string; color?: string };
      const row = labelRepo.updateLabel(c.get("db"), c.get("lesson"), Number(c.req.param("id")), body.name, body.color);
      if (!row) return c.json({ error: "not found" }, 404);
      return c.json(row);
    } catch (e) {
      if ((e as Error).message === "LESSON_A_LABELS") return c.json({ error: "not available in lesson A" }, 422);
      throw e;
    }
  });
  app.delete("/api/labels/:id", (c) => {
    try {
      const ok = labelRepo.deleteLabel(c.get("db"), c.get("lesson"), Number(c.req.param("id")));
      if (!ok) return c.json({ error: "not found" }, 404);
      return c.body(null, 204);
    } catch (e) {
      if ((e as Error).message === "LESSON_A_LABELS") return c.json({ error: "not available in lesson A" }, 422);
      throw e;
    }
  });

  app.get("/api/todos", (c) => {
    const projectParam = c.req.query("projectId");
    const projectId = projectParam ? Number(projectParam) : null;
    if (projectParam && Number.isNaN(projectId)) return c.json({ error: "invalid projectId" }, 400);
    return c.json(todoRepo.listTodos(c.get("db"), c.get("lesson"), { projectId }));
  });
  app.get("/api/todos/:id", (c) => {
    const t = todoRepo.getTodo(c.get("db"), c.get("lesson"), Number(c.req.param("id")));
    if (!t) return c.json({ error: "not found" }, 404);
    return c.json(t);
  });
  app.post("/api/todos", async (c) => {
    const body = (await c.req.json()) as Record<string, unknown>;
    const t = todoRepo.createTodo(c.get("db"), c.get("lesson"), {
      title: String(body.title ?? ""),
      description: (body.description as string | null | undefined) ?? null,
      status: body.status as string | undefined,
      statusId: body.statusId as number | undefined,
      labelIds: body.labelIds as number[] | undefined,
      labelsCsv: body.labelsCsv as string | undefined,
      projectId: (body.projectId as number | null | undefined) ?? (body.project_id as number | null | undefined),
      iterationId: (body.iterationId as number | null | undefined) ?? (body.iteration_id as number | null | undefined),
      parentId: (body.parentId as number | null | undefined) ?? (body.parent_id as number | null | undefined),
      plannedStartAt:
        (body.plannedStartAt as string | null | undefined) ?? (body.planned_start_at as string | null | undefined),
      startAt: (body.startAt as string | null | undefined) ?? (body.start_at as string | null | undefined),
      dueAt: (body.dueAt as string | null | undefined) ?? (body.due_at as string | null | undefined),
      endAt: (body.endAt as string | null | undefined) ?? (body.end_at as string | null | undefined),
      sortOrder: body.sortOrder !== undefined ? Number(body.sortOrder) : body.sort_order !== undefined ? Number(body.sort_order) : undefined,
    });
    return c.json(t, 201);
  });
  app.patch("/api/todos/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const body = (await c.req.json()) as Record<string, unknown>;
    const t = todoRepo.updateTodo(c.get("db"), c.get("lesson"), id, {
      title: body.title !== undefined ? String(body.title) : undefined,
      description: body.description as string | null | undefined,
      status: body.status as string | undefined,
      statusId: body.statusId as number | undefined,
      labelsCsv: body.labelsCsv as string | undefined,
      labelIds: body.labelIds as number[] | undefined,
      projectId:
        body.projectId !== undefined
          ? (body.projectId as number | null)
          : body.project_id !== undefined
            ? (body.project_id as number | null)
            : undefined,
      iterationId:
        body.iterationId !== undefined
          ? (body.iterationId as number | null)
          : body.iteration_id !== undefined
            ? (body.iteration_id as number | null)
            : undefined,
      parentId:
        body.parentId !== undefined
          ? (body.parentId as number | null)
          : body.parent_id !== undefined
            ? (body.parent_id as number | null)
            : undefined,
      plannedStartAt:
        body.plannedStartAt !== undefined
          ? (body.plannedStartAt as string | null)
          : body.planned_start_at !== undefined
            ? (body.planned_start_at as string | null)
            : undefined,
      startAt:
        body.startAt !== undefined
          ? (body.startAt as string | null)
          : body.start_at !== undefined
            ? (body.start_at as string | null)
            : undefined,
      dueAt:
        body.dueAt !== undefined
          ? (body.dueAt as string | null)
          : body.due_at !== undefined
            ? (body.due_at as string | null)
            : undefined,
      endAt:
        body.endAt !== undefined
          ? (body.endAt as string | null)
          : body.end_at !== undefined
            ? (body.end_at as string | null)
            : undefined,
      sortOrder:
        body.sortOrder !== undefined
          ? Number(body.sortOrder)
          : body.sort_order !== undefined
            ? Number(body.sort_order)
            : undefined,
    });
    if (!t) return c.json({ error: "not found" }, 404);
    return c.json(t);
  });
  app.delete("/api/todos/:id", (c) => {
    const ok = todoRepo.deleteTodo(c.get("db"), c.get("lesson"), Number(c.req.param("id")));
    if (!ok) return c.json({ error: "not found" }, 404);
    return c.body(null, 204);
  });

  app.get("/api/insights/iteration-trends", async (c) => {
    const sqlitePath = c.get("sqlitePath");
    const lesson = c.get("lesson");
    const db = c.get("db");
    const projectParam = c.req.query("projectId");
    const projectId = projectParam ? Number(projectParam) : null;
    if (projectParam && Number.isNaN(projectId)) return c.json({ error: "invalid projectId" }, 400);
    try {
      const iterations = await duckdbIterationTrends(sqlitePath, db, lesson, projectId);
      return c.json({
        projectId,
        iterations,
        engine: (process.env.INSIGHTS_ENGINE ?? "sqlite").toLowerCase(),
      });
    } catch (e) {
      console.error(e);
      return c.json({ error: String((e as Error).message) }, 500);
    }
  });

  app.get("/api/insights/iterations/:id", async (c) => {
    const iterationId = Number(c.req.param("id"));
    const sqlitePath = c.get("sqlitePath");
    const lesson = c.get("lesson");
    const db = c.get("db");
    const projectParam = c.req.query("projectId");
    const projectId = projectParam ? Number(projectParam) : null;
    if (projectParam && Number.isNaN(projectId)) return c.json({ error: "invalid projectId" }, 400);
    try {
      const labels = await duckdbLabelCounts(sqlitePath, db, lesson, iterationId, projectId);
      const events = await duckdbEventSummary(sqlitePath, db, lesson, iterationId, projectId);
      const completionTimes = await duckdbCompletionTimes(sqlitePath, db, iterationId, projectId);
      return c.json({
        iterationId,
        projectId,
        labels,
        events,
        completionTimes,
        engine: (process.env.INSIGHTS_ENGINE ?? "sqlite").toLowerCase(),
      });
    } catch (e) {
      console.error(e);
      return c.json({ error: String((e as Error).message) }, 500);
    }
  });

  app.get("/api/insights/iterations/:id/replay", async (c) => {
    const iterationId = Number(c.req.param("id"));
    const sqlitePath = c.get("sqlitePath");
    const lesson = c.get("lesson");
    const db = c.get("db");
    const projectParam = c.req.query("projectId");
    const projectId = projectParam ? Number(projectParam) : null;
    if (projectParam && Number.isNaN(projectId)) return c.json({ error: "invalid projectId" }, 400);
    try {
      const events = await duckdbReplay(sqlitePath, db, lesson, iterationId, projectId);
      return c.json({ iterationId, projectId, events });
    } catch (e) {
      console.error(e);
      return c.json({ error: String((e as Error).message) }, 500);
    }
  });

  return app;
}
