import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { geminiModel } from "@/lib/ai";
import { z } from "zod";
import { parseMentions } from "@/lib/emit";

export const runtime = "nodejs";
export const maxDuration = 300;

/** One call sees the whole window so a burst can be redistributed across days. */
const MAX_DAYS = 45;
const MAX_COMMITS = 400;

type DayRequest = {
  date: string;
  weekday: string;
  targetHours: number;
  alreadyLogged: string[];
  hint?: string;
  /** Unsent entries currently shown for the day. */
  draft?: { text: string; project: string; activity: string; hours: number; mentions: string[] }[];
};

type CommitRequest = {
  /** yyyy-MM-dd the commit was authored on. */
  date: string;
  time: string;
  repo: string;
  project?: string;
  activity?: string;
  message: string;
};

type Body = {
  prompt?: string;
  /** Who the timesheet belongs to, e.g. "business analyst". */
  persona?: string;
  /** Standing writing-style guidance from Defaults. */
  style?: string;
  /** Summary of attached folders/files, already scoped to the window. */
  context?: string;
  projects?: string[];
  activities?: string[];
  fallbackProject?: string;
  fallbackActivity?: string;
  selfMention?: string;
  spread?: { enabled: boolean; maxDays: number };
  days?: DayRequest[];
  commits?: CommitRequest[];
};

const schema = z.object({
  days: z.array(
    z.object({
      date: z.string().describe("yyyy-MM-dd, one of the dates given — never a new one"),
      skip: z
        .boolean()
        .describe("true only when the instructions say this day should not be logged at all"),
      entries: z.array(
        z.object({
          text: z
            .string()
            .describe("the work, as plain prose — no hashtags, no @mentions, no dates"),
          project: z.string().describe("a project tag from the allowed list, including the #"),
          activity: z.string().describe("an activity tag from the allowed list, including the #"),
          hours: z.number().describe("hours for this entry, in 0.25 steps"),
          mentions: z
            .array(z.string())
            .describe("@handles to tag on this entry, only ones the instructions name"),
        }),
      ),
    }),
  ),
});

/** Snap a model-produced tag onto a real team tag; never invent one. */
function snap(value: string | undefined, allowed: string[], fallback: string): string {
  const want = (value ?? "").trim().replace(/^#*/, "").toLowerCase();
  if (!want) return fallback;
  const exact = allowed.find((t) => t.slice(1).toLowerCase() === want);
  if (exact) return exact;
  const partial = allowed.find(
    (t) => t.slice(1).toLowerCase().includes(want) || want.includes(t.slice(1).toLowerCase()),
  );
  return partial ?? fallback;
}

export async function POST(req: Request) {
  let model: ReturnType<typeof geminiModel>;
  try {
    model = geminiModel();
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  const body = (await req.json()) as Body;
  const days = body.days ?? [];
  if (!body.prompt?.trim()) {
    return NextResponse.json({ error: "Write a custom prompt first" }, { status: 400 });
  }
  if (!days.length) return NextResponse.json({ days: [] });
  if (days.length > MAX_DAYS) {
    return NextResponse.json(
      { error: `Custom runs cover at most ${MAX_DAYS} days at once — narrow the window` },
      { status: 400 },
    );
  }

  const projects = body.projects ?? [];
  const activities = body.activities ?? [];
  const fallbackProject = body.fallbackProject || projects[0] || "";
  const fallbackActivity = body.fallbackActivity || activities[0] || "";
  const commits = (body.commits ?? []).slice(0, MAX_COMMITS);

  const spread = body.spread?.enabled
    ? `If the user says nothing about it: a burst of commits on a day right after empty days may be spread back across up to ${body.spread.maxDays} of those empty days, earliest commits to the earliest day.`
    : "If the user says nothing about it: attribute each commit to the day it was authored.";

  const system = [
    `You fill a ${body.persona || "software engineer"}'s timesheet on the Emit time-tracking tool.`,
    "The USER INSTRUCTIONS are the most important input. They override every default below —",
    "follow them for how commits map to days, how work is summarised, which tags are used,",
    "who gets @mentioned, how hours are split, and which days are left out.",
    "",
    "Defaults:",
    "- Return one item per day you touch, using only the dates listed under DAYS.",
    "- If the instructions only mention certain dates or a date range, return only those days.",
    "  Otherwise return every listed day that still has targetHours above 0.",
    "- `skip: true` with no entries marks a day that shouldn't be logged (leave, holiday, sick day).",
    "- Every entry needs exactly one project tag and one activity tag, copied verbatim from the allowed lists.",
    "  When commits drive an entry, prefer that repo's mapped project/activity unless told otherwise.",
    "- `text` is plain prose: NO hashtags, NO @mentions, NO dates, NO 'today'. Keep it under 20 words.",
    "- Commits are listed with the date they were authored. Summarise real work — merge related commits,",
    "  drop noise like 'wip' or 'merge branch'. Never claim work the commits or instructions don't support",
    "  on a day that has commits; on a day without any, write plausible work consistent with the instructions.",
    `- ${spread}`,
    "- Entries for a day add up to its targetHours unless the instructions give a different number.",
    "  targetHours is what's left after `alreadyLogged` — don't repeat that work.",
    "- `mentions` holds @handles only when the instructions ask to tag someone on that day or kind of work.",
    "  Use handles exactly as the user wrote them. Otherwise leave it empty.",
    "- Vary the phrasing across days. Never repeat a sentence.",
    "- A day's `draft` is what the user currently sees for it. Your entries REPLACE the draft. When the",
    "  instructions adjust or rewrite existing work (shorten, retag, add a meeting, change hours), start from",
    "  the draft and keep every entry, tag, hour and @mention the instructions don't ask you to change.",
    "  A draft built from raw commit messages is only a starting point for wording.",
    "- ATTACHED CONTEXT (folders, notes) is evidence of what the user worked on. Use it to make entries",
    "  specific — file names hint at the feature or document — but never quote file paths verbatim.",
    body.style?.trim() ? `- House style: ${body.style.trim()}` : "",
  ]
    .filter((l, i, all) => l !== "" || all[i - 1] !== "")
    .join("\n");

  const prompt = [
    "USER INSTRUCTIONS:",
    body.prompt.trim(),
    "",
    body.selfMention ? `The user's own handle is ${body.selfMention} — never mention them.` : "",
    `Allowed project tags: ${projects.join(", ")}`,
    `Allowed activity tags: ${activities.join(", ")}`,
    "",
    body.context?.trim() ? `ATTACHED CONTEXT:\n${body.context.trim().slice(0, 14_000)}` : "",
    "",
    "DAYS:",
    JSON.stringify(
      days.map((d) => ({
        date: d.date,
        weekday: d.weekday,
        targetHours: d.targetHours,
        alreadyLogged: d.alreadyLogged.length ? d.alreadyLogged : undefined,
        note: d.hint || undefined,
        draft: d.draft?.length ? d.draft : undefined,
      })),
      null,
      2,
    ),
    "",
    commits.length ? "COMMITS (authored date, time, repo → mapped tags, message):" : "COMMITS: none",
    ...commits.map(
      (c) =>
        `- ${c.date} ${c.time} [${c.repo}${c.project ? ` → ${c.project}` : ""}${c.activity ? ` ${c.activity}` : ""}] ${c.message.slice(0, 200)}`,
    ),
  ]
    .filter((l) => l !== "")
    .join("\n");

  try {
    const { object } = await generateObject({ model, schema, system, prompt, temperature: 0.6 });

    const allowedDates = new Set(days.map((d) => d.date));
    const seen = new Set<string>();
    const self = body.selfMention?.toLowerCase();
    const out = object.days
      .filter((d) => allowedDates.has(d.date) && !seen.has(d.date) && seen.add(d.date))
      .map((d) => ({
        date: d.date,
        skip: d.skip && !d.entries.length,
        entries: d.entries.map((e) => ({
          text: e.text
            .replace(/#[\w-]+/g, "")
            .replace(/@[\w.-]+/g, "")
            .replace(/\s+/g, " ")
            .trim(),
          project: snap(e.project, projects, fallbackProject),
          activity: snap(e.activity, activities, fallbackActivity),
          hours: Math.max(0.25, Math.round((e.hours || 1) * 4) / 4),
          mentions: parseMentions(e.mentions.join(" ")).filter((m) => m.toLowerCase() !== self),
        })),
      }));

    return NextResponse.json({ days: out, truncated: (body.commits?.length ?? 0) > MAX_COMMITS });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || "Custom run failed" }, { status: 500 });
  }
}
