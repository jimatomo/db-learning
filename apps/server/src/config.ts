import { join } from "node:path";

export type Lesson = "a" | "b" | "c";

export function getLesson(): Lesson {
  const v = (process.env.LESSON ?? "c").toLowerCase();
  if (v === "a" || v === "b" || v === "c") return v;
  return "c";
}

export function getPort(): number {
  return Number(process.env.PORT) || 3000;
}

export function getDatabasePath(): string {
  const lesson = getLesson();
  return process.env.DATABASE_PATH ?? join(process.cwd(), "data", `app-${lesson}.db`);
}

export function getDuckdbPath(): string {
  return process.env.DUCKDB_PATH ?? join(process.cwd(), "data", `analytics-${getLesson()}.duckdb`);
}

export function getStaticRoot(): string {
  return (
    process.env.STATIC_ROOT ??
    join(import.meta.dir, "..", "..", "web", "dist")
  );
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}
