import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Root of @db-learning/db package (for resolving lesson SQL paths from server). */
export function dbPackageRoot(): string {
  return join(__dirname, "..");
}

export function lessonMigrationsDir(lesson: "a" | "b" | "c"): string {
  return join(dbPackageRoot(), "lessons", lesson, "migrations");
}
