import type { AppTimeZone } from "./api";

const TOKYO_OFFSET_MINUTES = 9 * 60;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatUtc(date: Date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(
    date.getUTCMinutes(),
  )}:00`;
}

function parseUtc(value: string) {
  const normalized = value.length <= 10 ? `${value}T00:00:00Z` : `${value.replace(" ", "T").replace(/Z$/, "")}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function utcToDateTimeInputValue(value: string | null, timeZone: AppTimeZone) {
  if (!value) return "";
  const date = parseUtc(value);
  if (!date) return value.slice(0, 16);
  if (timeZone === "UTC") {
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(
      date.getUTCMinutes(),
    )}`;
  }
  const tokyo = new Date(date.getTime() + TOKYO_OFFSET_MINUTES * 60_000);
  return `${tokyo.getUTCFullYear()}-${pad(tokyo.getUTCMonth() + 1)}-${pad(tokyo.getUTCDate())}T${pad(tokyo.getUTCHours())}:${pad(
    tokyo.getUTCMinutes(),
  )}`;
}

export function dateTimeInputValueToUtc(value: string, timeZone: AppTimeZone) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return value;
  const [, year, month, day, hour, minute] = match;
  const localUtcMs = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  const offsetMs = timeZone === "Asia/Tokyo" ? TOKYO_OFFSET_MINUTES * 60_000 : 0;
  return formatUtc(new Date(localUtcMs - offsetMs));
}

export function formatTimestampLabel(value: string | null, timeZone: AppTimeZone) {
  if (!value) return null;
  const date = parseUtc(value);
  if (!date) return value;
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
