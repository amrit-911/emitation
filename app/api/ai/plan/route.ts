import { NextResponse } from "next/server";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Longest window a single prompt may cover. */
const MAX_SPAN_DAYS = 92;

type Body = {
  prompt?: string;
  /** yyyy-MM-dd in the user's local time. */
  today?: string;
  weekday?: string;
  persona?: string;
  defaults?: {
    hoursPerDay: number;
    saturday: boolean;
    sunday: boolean;
    spreadCommits: boolean;
    spreadMaxDays: number;
  };
  timeline?: { from: string; to: string; days: number } | null;
  /** Dates the user picked by hand — fixed, never reinterpreted. */
  lockedRange?: { from: string; to: string } | null;
  repos?: { id: string; name: string; selected: boolean }[];
  folders?: { name: string; commits: number; remote?: string; repoId?: string }[];
  files?: string[];
};

const schema = z.object({
  mode: z
    .enum(["build", "refine"])
    .describe("refine = adjust the existing timeline; build = (re)create it for a period"),
  from: z.string().describe("first day, yyyy-MM-dd"),
  to: z.string().describe("last day, yyyy-MM-dd"),
  useCommits: z.boolean().describe("pull commits for this period"),
  repoIds: z
    .array(z.string())
    .describe("ids from REPOS the user explicitly narrows to; empty = use the default selection"),
  saturday: z.boolean().nullable().describe("null unless the request says whether to fill Saturdays"),
  sunday: z.boolean().nullable().describe("null unless the request says whether to fill Sundays"),
  hoursPerDay: z.number().nullable().describe("null unless the request sets a daily total"),
  spreadBursts: z
    .boolean()
    .nullable()
    .describe("null unless the request says to spread (or not spread) commit bursts into empty days"),
  spreadMaxDays: z.number().nullable().describe("null unless the request says how far back to spread"),
  summary: z
    .string()
    .describe("one short sentence to the user saying what will happen, e.g. 'Filling 12–15 Sep from your commits in 2 repos'"),
});

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const shift = (key: string, days: number) => {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
};

const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

export async function POST(req: Request) {
  const apiKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "No Gemini key found. Set GEMINI_API_KEY in .env.local and restart the dev server." },
      { status: 500 },
    );
  }

  const body = (await req.json()) as Body;
  const prompt = body.prompt?.trim();
  const today = body.today && DATE.test(body.today) ? body.today : new Date().toISOString().slice(0, 10);
  if (!prompt) return NextResponse.json({ error: "Say what to fill first" }, { status: 400 });

  const defaults = body.defaults ?? {
    hoursPerDay: 8,
    saturday: false,
    sunday: false,
    spreadCommits: true,
    spreadMaxDays: 3,
  };
  const repos = body.repos ?? [];
  const folders = body.folders ?? [];

  const google = createGoogleGenerativeAI({ apiKey });
  const model = google(process.env.GEMINI_MODEL || "gemini-2.5-flash");

  const system = [
    "You turn a timesheet request into run settings for Emitation, which fills Emit timesheets.",
    `Today is ${today} (${body.weekday ?? ""}). The user is a ${body.persona ?? "software engineer"}.`,
    "",
    "Dates:",
    "- Resolve relative dates against today. Weeks start on Monday.",
    "- 'this week' = Monday of this week → today. 'last week' = the previous Monday → Sunday.",
    "- 'this month' / 'month to date' = the 1st → today. 'last month' = the whole previous month.",
    "- 'last N days' ends today. 'last N working days' counts back N weekdays, ending today.",
    "- A bare date like '12 Sept' means its most recent occurrence that isn't in the future.",
    "- If no period is mentioned: in refine mode keep the current timeline; otherwise use this week.",
    "- Never put `to` after today unless the user explicitly asks for future days.",
    "",
    "Mode:",
    "- 'refine' when a timeline exists and the request only adjusts it (skip a day, add a meeting,",
    "  rewrite, shorten, fill remaining gaps, change tags) without naming a new period or asking to re-pull.",
    "- 'build' for everything else.",
    "",
    "Sources:",
    "- useCommits = true when the request mentions commits, code, repos, pushes, a repo/project name,",
    "  or an attached folder that has commits and the request is about that work.",
    "  For testers and business analysts it is usually false unless they mention commits.",
    "  In refine mode it is false unless they ask to pull again.",
    "- repoIds only when the user names specific repos or 'this project' with a matching folder; otherwise [].",
    "",
    "Weekends, hours and spreading are null unless the request explicitly sets them.",
  ].join("\n");

  const context = [
    `REQUEST: ${prompt}`,
    "",
    `DEFAULTS: ${JSON.stringify(defaults)}`,
    `TIMELINE: ${body.timeline ? JSON.stringify(body.timeline) : "none yet"}`,
    body.lockedRange
      ? `LOCKED PERIOD: ${body.lockedRange.from} → ${body.lockedRange.to} (picked by hand — use exactly this as from/to)`
      : "",
    repos.length
      ? `REPOS (id · name · selected):\n${repos
          .slice(0, 200)
          .map((r) => `- ${r.id} · ${r.name}${r.selected ? " · selected" : ""}`)
          .join("\n")}`
      : "REPOS: none connected",
    folders.length
      ? `ATTACHED FOLDERS:\n${folders
          .map(
            (f) =>
              `- ${f.name}: ${f.commits} local commits${f.remote ? `, remote ${f.remote}` : ""}${f.repoId ? `, matches ${f.repoId}` : ""}`,
          )
          .join("\n")}`
      : "",
    body.files?.length ? `ATTACHED FILES: ${body.files.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const { object } = await generateObject({ model, schema, system, prompt: context, temperature: 0 });

    // Guard everything the model hands back before the client trusts it.
    const locked = body.lockedRange;
    let from = locked?.from ?? (DATE.test(object.from) ? object.from : (body.timeline?.from ?? today));
    let to = locked?.to ?? (DATE.test(object.to) ? object.to : (body.timeline?.to ?? today));
    if (from > to) [from, to] = [to, from];
    if (daysBetween(from, to) > MAX_SPAN_DAYS - 1) from = shift(to, -(MAX_SPAN_DAYS - 1));

    const known = new Set([...repos.map((r) => r.id), ...folders.map((f) => f.repoId).filter(Boolean)]);
    const mode = object.mode === "refine" && body.timeline ? "refine" : "build";

    return NextResponse.json({
      plan: {
        mode,
        config: {
          from,
          to,
          weekend: {
            saturday: object.saturday ?? defaults.saturday,
            sunday: object.sunday ?? defaults.sunday,
          },
          hoursPerDay: Math.min(24, Math.max(0.25, Math.round((object.hoursPerDay ?? defaults.hoursPerDay) * 4) / 4)),
          spreadCommits: object.spreadBursts ?? defaults.spreadCommits,
          spreadMaxDays: Math.min(14, Math.max(1, Math.round(object.spreadMaxDays ?? defaults.spreadMaxDays))),
        },
        useCommits: object.useCommits,
        repoIds: object.repoIds.filter((id) => known.has(id)),
        summary: object.summary.trim(),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || "Couldn't plan that" }, { status: 500 });
  }
}
