import { Database } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { lessonMigrationsDir } from "@db-learning/db";
import type { Lesson } from "./config";

export function ensureMigrationsTable(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    )
  `);
}

export function appliedMigrations(db: Database): Set<string> {
  const rows = db.query("SELECT name FROM schema_migrations").all() as { name: string }[];
  return new Set(rows.map((r) => r.name));
}

export function runLessonMigrations(db: Database, lesson: Lesson): void {
  ensureMigrationsTable(db);
  const dir = lessonMigrationsDir(lesson);
  let files: string[];
  try {
    files = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
  } catch {
    throw new Error(`No migrations directory for lesson ${lesson}: ${dir}`);
  }
  const applied = appliedMigrations(db);
  for (const file of files) {
    if (applied.has(file)) continue;
    const fullPath = join(dir, file);
    const sql = readFileSync(fullPath, "utf8");
    db.run("BEGIN");
    try {
      db.exec(sql);
      db.query("INSERT INTO schema_migrations (name) VALUES (?)").run(file);
      db.run("COMMIT");
    } catch (e) {
      db.run("ROLLBACK");
      throw e;
    }
  }
}
