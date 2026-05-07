import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { lessonSchemaPath } from "@db-learning/db";
import type { Lesson } from "./config";

export function loadLessonSchema(db: Database, lesson: Lesson): void {
  const path = lessonSchemaPath(lesson);
  let sql: string;
  try {
    sql = readFileSync(path, "utf8");
  } catch {
    throw new Error(`No schema file for lesson ${lesson}: ${path}`);
  }

  db.run("BEGIN");
  try {
    db.exec(sql);
    db.run("COMMIT");
  } catch (e) {
    db.run("ROLLBACK");
    throw e;
  }
}
