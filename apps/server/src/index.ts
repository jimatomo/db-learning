import { Database } from "bun:sqlite";
import { mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { createApp } from "./app";
import { getDatabasePath, getLesson, getPort, getStaticRoot, isProduction } from "./config";
import { runLessonMigrations } from "./migrate";

const lesson = getLesson();
const sqlitePath = getDatabasePath();
mkdirSync(dirname(sqlitePath), { recursive: true });

const db = new Database(sqlitePath, { create: true });
db.run("PRAGMA foreign_keys = ON;");
db.run("PRAGMA journal_mode=WAL;");
db.run("PRAGMA busy_timeout = 8000;");
runLessonMigrations(db, lesson);

const app = createApp(db, lesson, sqlitePath);

if (isProduction()) {
  const root = getStaticRoot();
  app.get("/assets/*", async (c) => {
    const rel = c.req.path.replace(/^\/+/, "");
    const path = join(root, rel);
    const file = Bun.file(path);
    if (await file.exists()) {
      return new Response(file);
    }
    return c.body(null, 404);
  });
}

app.notFound(async (c) => {
  if (c.req.path.startsWith("/api")) {
    return c.json({ error: "not found" }, 404);
  }
  if (isProduction()) {
    const root = getStaticRoot();
    const path = join(root, "index.html");
    const file = Bun.file(path);
    if (await file.exists()) {
      return new Response(file, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
  }
  return c.text("Frontend not built. Run `bun run dev` with Vite or build apps/web.", 404);
});

const port = getPort();
console.log(`db-learning server lesson=${lesson} db=${sqlitePath} port=${port}`);

Bun.serve({
  port,
  fetch: app.fetch,
});
