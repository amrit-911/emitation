import type { WeekendPolicy } from "./types";

/** yyyy-MM-dd in local time (never use toISOString here — it shifts by the TZ offset). */
export function toKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function fromKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Noon local time, so the epoch we send can't slide into the neighbouring day. */
export function keyToEpoch(key: string): number {
  const d = fromKey(key);
  d.setHours(12, 0, 0, 0);
  return d.getTime();
}

export function isWeekend(key: string): boolean {
  const day = fromKey(key).getDay();
  return day === 0 || day === 6;
}

export function weekdayShort(key: string): string {
  return fromKey(key).toLocaleDateString(undefined, { weekday: "short" });
}

export function prettyDate(key: string): string {
  return fromKey(key).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function eachDay(fromKeyStr: string, toKeyStr: string): string[] {
  const out: string[] = [];
  const cur = fromKey(fromKeyStr);
  const end = fromKey(toKeyStr);
  if (cur > end) return out;
  while (cur <= end) {
    out.push(toKey(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function keepDay(key: string, weekend: WeekendPolicy): boolean {
  const day = fromKey(key).getDay();
  if (day === 6) return weekend.saturday;
  if (day === 0) return weekend.sunday;
  return true;
}

export function formatHours(h: number): string {
  const total = Math.round(h * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${hh}:${`${mm}`.padStart(2, "0")}`;
}

/** Presets for the range picker. */
export function rangePreset(kind: "thisMonth" | "lastMonth" | "last7" | "last30") {
  const now = new Date();
  if (kind === "thisMonth") {
    return {
      from: toKey(new Date(now.getFullYear(), now.getMonth(), 1)),
      to: toKey(now),
    };
  }
  if (kind === "lastMonth") {
    return {
      from: toKey(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      to: toKey(new Date(now.getFullYear(), now.getMonth(), 0)),
    };
  }
  const back = kind === "last7" ? 6 : 29;
  const start = new Date(now);
  start.setDate(start.getDate() - back);
  return { from: toKey(start), to: toKey(now) };
}
