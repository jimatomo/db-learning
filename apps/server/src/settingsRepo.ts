import { Database } from "bun:sqlite";

export type AppTimeZone = "UTC" | "Asia/Tokyo";
export type ApiSettings = { timeZone: AppTimeZone };

function normalizeTimeZone(value: unknown): AppTimeZone {
  return value === "UTC" ? "UTC" : "Asia/Tokyo";
}

export function getSettings(db: Database): ApiSettings {
  const row = db.query(`SELECT time_zone FROM app_settings WHERE id = 1`).get() as { time_zone: string } | null;
  return { timeZone: normalizeTimeZone(row?.time_zone) };
}

export function updateSettings(db: Database, patch: Partial<ApiSettings>): ApiSettings {
  const timeZone = normalizeTimeZone(patch.timeZone);
  db.query(
    `INSERT INTO app_settings (id, time_zone)
     VALUES (1, ?)
     ON CONFLICT(id) DO UPDATE SET time_zone = excluded.time_zone`,
  ).run(timeZone);
  return getSettings(db);
}
