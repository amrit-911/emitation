import type { Day, EmitProfile, Entry } from "./types";

export const EMIT_API = "https://api.emit.work";

export function parseProfile(raw: string): { profile?: EmitProfile; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { error: "Paste the profile JSON first." };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { error: "That isn't valid JSON." };
  }
  const p = parsed as EmitProfile;
  if (!p?.activeTeam?._id) return { error: "JSON parsed, but `activeTeam._id` is missing." };
  if (!Array.isArray(p.activeTeam.categorySets)) {
    return { error: "JSON parsed, but `activeTeam.categorySets` is missing." };
  }
  return { profile: p };
}

export function categoryTags(profile: EmitProfile | undefined, name: string): string[] {
  const set = profile?.activeTeam?.categorySets?.find(
    (c) => c.name.toLowerCase() === name.toLowerCase(),
  );
  return set?.tags ?? [];
}

export const projectTags = (p?: EmitProfile) => categoryTags(p, "Projects");
export const activityTags = (p?: EmitProfile) => categoryTags(p, "Activity");

/** The string Emit actually stores: free text with both tags inline. */
export function composeDescription(entry: Pick<Entry, "text" | "project" | "activity">): string {
  return [entry.text.trim(), entry.project, entry.activity].filter(Boolean).join(" ").trim();
}

export function extractTags(description: string): string[] {
  return Array.from(new Set(description.match(/#[\w-]+/g) ?? []));
}

export type EntryProblem = { level: "error" | "warn"; message: string };

export function validateEntry(
  entry: Entry,
  opts: { minWords: number; minTags: number; projects: string[]; activities: string[] },
): EntryProblem[] {
  const problems: EntryProblem[] = [];
  const description = composeDescription(entry);
  const words = description.split(/\s+/).filter(Boolean);
  const tags = extractTags(description);

  if (!entry.project) problems.push({ level: "error", message: "Project tag is required" });
  else if (opts.projects.length && !opts.projects.includes(entry.project)) {
    problems.push({ level: "error", message: `${entry.project} isn't a project tag on this team` });
  }

  if (!entry.activity) problems.push({ level: "error", message: "Activity tag is required" });
  else if (opts.activities.length && !opts.activities.includes(entry.activity)) {
    problems.push({ level: "error", message: `${entry.activity} isn't an activity tag on this team` });
  }

  if (words.length < opts.minWords) {
    problems.push({ level: "error", message: `Needs at least ${opts.minWords} words` });
  }
  if (tags.length < opts.minTags) {
    problems.push({ level: "error", message: `Needs at least ${opts.minTags} unique tags` });
  }
  if (!(entry.hours > 0)) problems.push({ level: "error", message: "Duration must be above zero" });
  if (entry.hours > 24) problems.push({ level: "error", message: "Duration can't exceed 24h" });
  if (!entry.text.trim()) {
    problems.push({ level: "warn", message: "No description text — only tags will be posted" });
  }
  return problems;
}

/**
 * Rebuilds the exact body app.emit.work sends, which echoes the whole
 * team + user objects back to the API.
 */
export function buildActivityPayload(args: {
  profile: EmitProfile;
  epochMs: number;
  hours: number;
  description: string;
  tags: string[];
  mentions?: string[];
}) {
  return {
    date: args.epochMs,
    time: args.hours,
    description: args.description,
    isTimeManuallySet: true,
    isDateManuallySet: true,
    isSharedActivityEdited: false,
    status: "ADDED",
    team: args.profile.activeTeam,
    user: args.profile,
    tags: args.tags,
    mentions: args.mentions ?? [],
  };
}

/** Hours still needed to hit the target, given what's already on Emit for that day. */
export function remainingHours(day: Pick<Day, "existingHours">, hoursPerDay: number): number {
  return Math.max(0, Math.round((hoursPerDay - day.existingHours) * 4) / 4);
}

/** True once existing Emit activities already cover the day's target. */
export function isDayCovered(day: Pick<Day, "existingHours">, hoursPerDay: number): boolean {
  return remainingHours(day, hoursPerDay) < 0.01;
}

/** Split a day's hours across n entries, in 15-minute steps, summing exactly. */
export function splitHours(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0) || weights.length;
  const units = Math.max(1, Math.round(total * 4));
  const raw = weights.map((w) => ((w || 1) / sum) * units);
  const floored = raw.map((r) => Math.max(1, Math.floor(r)));
  let left = units - floored.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);
  let k = 0;
  while (left > 0 && order.length) {
    floored[order[k % order.length].i] += 1;
    left -= 1;
    k += 1;
  }
  while (left < 0) {
    const idx = floored.findIndex((f) => f > 1);
    if (idx === -1) break;
    floored[idx] -= 1;
    left += 1;
  }
  return floored.map((u) => u / 4);
}
