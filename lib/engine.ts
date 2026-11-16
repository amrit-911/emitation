"use client";

/**
 * The data side of a run, with every input passed explicitly so the prompt
 * pipeline can drive it without waiting on React state between steps.
 */

import { groupCommitsByDate, spreadCommitBursts } from "./commitPlanning";
import { eachDay, formatHours, fromKey, keepDay, keyToEpoch, toKey, weekdayShort } from "./dates";
import { composeDescription, remainingHours, splitHours } from "./emit";
import type {
  Commit,
  Day,
  EmitProfile,
  Entry,
  ExistingEntry,
  Repo,
  RepoMapping,
  RunConfig,
  Settings,
} from "./types";

export type ExistingByDate = Map<string, { hours: number; entries: ExistingEntry[] }>;

export const uid = () => Math.random().toString(36).slice(2, 10);

type TagDefaults = Pick<Settings, "repoMap" | "fallbackProject" | "fallbackActivity">;

async function post<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
  return data as T;
}

const dayBounds = (from: string, to: string) => {
  const since = fromKey(from);
  since.setHours(0, 0, 0, 0);
  const until = fromKey(to);
  until.setHours(23, 59, 59, 999);
  return { since, until };
};

export const dayKeys = (config: RunConfig) =>
  eachDay(config.from, config.to).filter((k) => keepDay(k, config.weekend));

/* --------------------------------------------------------------- timeline */

/** One entry per repo for a day's commits, hours split by commit count. */
export function entriesFromCommits(
  date: string,
  commits: Commit[],
  targetHours: number,
  tags: TagDefaults,
): Entry[] {
  if (!commits.length || targetHours <= 0) return [];
  const groups = new Map<string, Commit[]>();
  for (const c of commits) {
    if (!groups.has(c.repoId)) groups.set(c.repoId, []);
    groups.get(c.repoId)!.push(c);
  }
  const repoIds = Array.from(groups.keys());
  const hours = splitHours(targetHours, repoIds.map((r) => groups.get(r)!.length));
  return repoIds.map((repoId, i) => {
    const list = groups.get(repoId)!;
    const mapping: RepoMapping | undefined = tags.repoMap[repoId];
    const headline = list
      .map((c) => c.message)
      .filter((m) => !/^merge (branch|pull request)/i.test(m))
      .slice(0, 3)
      .join("; ");
    return {
      id: uid(),
      date,
      text: headline || list[0].message,
      project: mapping?.project || tags.fallbackProject || "",
      activity: mapping?.activity || tags.fallbackActivity || "",
      hours: hours[i],
      source: "commits",
      commitShas: list.map((c) => c.sha),
      status: "idle",
    };
  });
}

/**
 * Builds the day list for a config. `commitsByDate` reseeds commit-derived
 * entries; without it, existing days keep their entries and only the
 * already-logged hours from `existing` are refreshed.
 */
export function buildDays(args: {
  config: RunConfig;
  prev: Day[];
  commitsByDate?: Map<string, Commit[]>;
  existing?: ExistingByDate;
  tags: TagDefaults;
}): Day[] {
  const { config, prev, commitsByDate, existing, tags } = args;
  const prevByDate = new Map(prev.map((d) => [d.date, d]));
  return dayKeys(config).map((date) => {
    const old = prevByDate.get(date);
    const fresh = existing?.get(date);
    const existingHours = fresh?.hours ?? old?.existingHours ?? 0;
    const existingEntries = fresh?.entries ?? old?.existingEntries ?? [];
    const isWeekend = [0, 6].includes(fromKey(date).getDay());

    if (!commitsByDate) {
      if (old) return { ...old, existingHours, existingEntries };
      return { date, isWeekend, enabled: true, commits: [], entries: [], existingHours, existingEntries };
    }

    const dayCommits = commitsByDate.get(date) ?? [];
    const target = remainingHours({ existingHours }, config.hoursPerDay);
    return {
      date,
      isWeekend,
      enabled: old?.enabled ?? true,
      hint: old?.hint,
      commits: dayCommits,
      entries: entriesFromCommits(date, dayCommits, target, tags),
      existingHours,
      existingEntries,
    };
  });
}

/** Groups commits by authored day and, if enabled, spreads bursts back into empty days. */
export function placeCommits(
  commits: Commit[],
  config: RunConfig,
  existing?: ExistingByDate,
): Map<string, Commit[]> {
  const keys = dayKeys(config);
  const raw = groupCommitsByDate(commits);
  if (!config.spreadCommits) return raw;
  return spreadCommitBursts(
    raw,
    keys,
    (key) => remainingHours({ existingHours: existing?.get(key)?.hours ?? 0 }, config.hoursPerDay) > 0.01,
    config.spreadMaxDays,
  );
}

/* ------------------------------------------------------------------ emit */

/** Sums list_activities into per-day totals, keyed the same way as commits. */
export async function fetchExisting(args: {
  settings: Settings;
  profile: EmitProfile;
  from: string;
  to: string;
  signal?: AbortSignal;
}): Promise<ExistingByDate> {
  const { since, until } = dayBounds(args.from, args.to);
  const data = await post<{
    activities: { id: string; date: string; hours: number; description: string; tags: string[] }[];
  }>(
    "/api/emit/activities",
    {
      token: args.settings.token,
      cookie: args.settings.cookie,
      teamId: args.profile.activeTeam._id,
      fromISO: since.toISOString(),
      toISO: until.toISOString(),
    },
    args.signal,
  );
  const map: ExistingByDate = new Map();
  for (const a of data.activities) {
    const key = toKey(new Date(a.date));
    const bucket = map.get(key) ?? { hours: 0, entries: [] };
    bucket.hours += a.hours;
    bucket.entries.push({ id: a.id, description: a.description, hours: a.hours, tags: a.tags });
    map.set(key, bucket);
  }
  return map;
}

export async function pushEntry(args: {
  settings: Settings;
  profile: EmitProfile;
  entry: Entry;
  dryRun: boolean;
}) {
  return post("/api/emit/activity", {
    token: args.settings.token,
    cookie: args.settings.cookie,
    profile: args.profile,
    epochMs: keyToEpoch(args.entry.date),
    hours: args.entry.hours,
    description: composeDescription(args.entry),
    tags: [args.entry.project, args.entry.activity].filter(Boolean),
    mentions: args.entry.mentions ?? [],
    dryRun: args.dryRun,
  });
}

/* --------------------------------------------------------------- commits */

/** Which providers are missing a token for the repos asked for. */
export function missingTokens(settings: Settings, repos: Repo[]): string[] {
  const out: string[] = [];
  if (repos.some((r) => r.provider === "github") && !settings.githubToken) out.push("GitHub");
  if (repos.some((r) => r.provider === "gitlab") && !settings.gitlabToken) out.push("GitLab");
  if (repos.some((r) => r.provider === "bitbucket") && !settings.bitbucketToken) out.push("Bitbucket");
  return out;
}

/** Pulls commits in range across every provider at once. */
export async function pullCommits(args: {
  settings: Settings;
  repos: Repo[];
  from: string;
  to: string;
  signal?: AbortSignal;
}): Promise<{ commits: Commit[]; warnings: string[] }> {
  const { settings, signal } = args;
  const { since, until } = dayBounds(args.from, args.to);
  const sinceISO = since.toISOString();
  const untilISO = until.toISOString();
  const split = (s: string) => s.split(",").map((e) => e.trim()).filter(Boolean);

  const gh = args.repos.filter((r) => r.provider === "github" && settings.githubToken);
  const gl = args.repos.filter((r) => r.provider === "gitlab" && settings.gitlabToken);
  const bb = args.repos.filter((r) => r.provider === "bitbucket" && settings.bitbucketToken);

  type Result = { commits?: Commit[]; warnings?: string[] };
  const jobs: Promise<Result>[] = [];
  if (gh.length) {
    jobs.push(
      post<Result>(
        "/api/github/commits",
        {
          token: settings.githubToken,
          repos: gh.map((r) => r.fullName),
          sinceISO,
          untilISO,
          authors: [settings.githubUser, ...split(settings.githubEmails)].filter(Boolean),
          allBranches: settings.scanAllBranches,
        },
        signal,
      ),
    );
  }
  if (gl.length) {
    jobs.push(
      post<Result>(
        "/api/gitlab/commits",
        {
          token: settings.gitlabToken,
          baseUrl: settings.gitlabBaseUrl,
          projects: gl.map((r) => ({ providerId: r.providerId, fullName: r.fullName })),
          sinceISO,
          untilISO,
          authorEmails: split(settings.gitlabEmails),
          allBranches: settings.scanAllBranches,
        },
        signal,
      ),
    );
  }
  if (bb.length) {
    jobs.push(
      post<Result>(
        "/api/bitbucket/commits",
        {
          token: settings.bitbucketToken,
          authEmail: settings.bitbucketAuthEmail,
          repos: bb.map((r) => ({ fullName: r.fullName, defaultBranch: r.defaultBranch })),
          sinceISO,
          untilISO,
          authorEmails: split(settings.bitbucketEmails),
          authorUsernames: [settings.bitbucketUser].filter(Boolean),
          authorAccountIds: [settings.bitbucketAccountId].filter(Boolean),
          allBranches: settings.scanAllBranches,
        },
        signal,
      ),
    );
  }

  const results = await Promise.all(jobs);
  return {
    commits: results.flatMap((r) => r.commits ?? []),
    warnings: results.flatMap((r) => r.warnings ?? []),
  };
}

/* ---------------------------------------------------------------- planner */

export async function planPrompt(
  body: Record<string, unknown>,
  signal?: AbortSignal,
) {
  return post<{ plan: import("./types").Plan }>("/api/ai/plan", body, signal);
}

/* ----------------------------------------------------------------- writer */

export type WrittenDay = {
  date: string;
  skip: boolean;
  entries: { text: string; project: string; activity: string; hours: number; mentions: string[] }[];
};

/** The writer handles at most 45 days per call; longer windows go in chunks. */
const CHUNK_DAYS = 31;

/**
 * Hands the model the prompt, the target days and the raw commit pool (at
 * authored dates, so it can decide how bursts map to days). Days it doesn't
 * return are left untouched.
 */
export async function writeDays(args: {
  prompt: string;
  persona: string;
  style: string;
  /** Called per chunk window so the attachment summary is scoped to it. */
  contextFor: (from: string, to: string) => string;
  days: Day[];
  commits: Commit[];
  config: RunConfig;
  settings: Settings;
  projects: string[];
  activities: string[];
  selfMention?: string;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}): Promise<{ written: Map<string, WrittenDay>; truncated: boolean }> {
  const { days, config, settings } = args;
  const written = new Map<string, WrittenDay>();
  let truncated = false;
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));

  for (let i = 0; i < sorted.length; i += CHUNK_DAYS) {
    const chunk = sorted.slice(i, i + CHUNK_DAYS);
    const from = chunk[0].date;
    const to = chunk[chunk.length - 1].date;
    // A burst just past the window can still belong to days inside it.
    const tail = fromKey(to);
    tail.setDate(tail.getDate() + (config.spreadCommits ? config.spreadMaxDays : 0));
    const poolEnd = toKey(tail);
    const pool = args.commits
      .map((c) => ({ c, key: toKey(new Date(c.date)) }))
      .filter(({ key }) => key >= from && key <= poolEnd)
      .sort((a, b) => a.c.date.localeCompare(b.c.date));

    args.onProgress?.(i, sorted.length);
    const data = await post<{ days: WrittenDay[]; truncated?: boolean }>(
      "/api/ai/custom",
      {
        prompt: args.prompt,
        persona: args.persona,
        style: args.style,
        context: args.contextFor(from, to),
        projects: args.projects,
        activities: args.activities,
        fallbackProject: settings.fallbackProject || args.projects[0],
        fallbackActivity: settings.fallbackActivity || args.activities[0],
        selfMention: args.selfMention,
        spread: { enabled: config.spreadCommits, maxDays: config.spreadMaxDays },
        days: chunk.map((d) => ({
          date: d.date,
          weekday: weekdayShort(d.date),
          targetHours: remainingHours(d, config.hoursPerDay),
          alreadyLogged: d.existingEntries.map((e) => `${formatHours(e.hours)} ${e.description}`),
          hint: d.hint,
          // What the user is looking at now, so a follow-up edits it instead of starting over.
          draft: d.entries
            .filter((e) => e.status !== "done")
            .map((e) => ({
              text: e.text,
              project: e.project,
              activity: e.activity,
              hours: e.hours,
              mentions: e.mentions ?? [],
            })),
        })),
        commits: pool.map(({ c, key }) => ({
          date: key,
          time: new Date(c.date).toTimeString().slice(0, 5),
          repo: c.repo,
          project: settings.repoMap[c.repoId]?.project,
          activity: settings.repoMap[c.repoId]?.activity,
          message: c.message,
        })),
      },
      args.signal,
    );
    data.days.forEach((d) => written.set(d.date, d));
    truncated ||= Boolean(data.truncated);
  }
  args.onProgress?.(sorted.length, sorted.length);
  return { written, truncated };
}

/** Folds writer output into the timeline. Pushed entries are never replaced. */
export function applyWritten(days: Day[], written: Map<string, WrittenDay>): Day[] {
  return days.map((d) => {
    const gen = written.get(d.date);
    if (!gen) return d;
    const kept = d.entries.filter((e) => e.status === "done");
    if (gen.skip) return { ...d, enabled: false, entries: kept };
    return {
      ...d,
      entries: [
        ...kept,
        ...gen.entries.map(
          (g): Entry => ({
            id: uid(),
            date: d.date,
            text: g.text,
            project: g.project,
            activity: g.activity,
            hours: g.hours,
            mentions: g.mentions,
            source: "custom",
            commitShas: d.commits.map((c) => c.sha),
            status: "idle",
          }),
        ),
      ],
    };
  });
}

/* ------------------------------------------------------------------ draft */

const DRAFT_KEY = "emitation.draft.v1";

export type Draft = {
  days: Day[];
  config: RunConfig;
  commits: Commit[];
  prompt: string;
  summary: string;
};

/** The working timeline survives a reload; in-flight sends come back as unsent. */
export function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    if (!Array.isArray(d.days) || !d.config) return null;
    d.days = d.days.map((day) => ({
      ...day,
      entries: day.entries.map((e) =>
        e.status === "sending" || e.status === "queued" ? { ...e, status: "idle" as const } : e,
      ),
    }));
    return d;
  } catch {
    return null;
  }
}

export function saveDraft(draft: Draft | null) {
  try {
    if (!draft) localStorage.removeItem(DRAFT_KEY);
    else localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, commits: draft.commits.slice(-2000) }));
  } catch {
    /* quota or private mode — the draft is a convenience */
  }
}
