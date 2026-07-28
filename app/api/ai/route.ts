import { NextResponse } from "next/server";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 300;

const CHUNK = 8;

type DayRequest = {
  date: string;
  weekday: string;
  hint?: string;
  hours: number;
  commits?: { repo: string; project?: string; message: string }[];
};

type Body = {
  prompt?: string;
  projects?: string[];
  activities?: string[];
  fallbackProject?: string;
  fallbackActivity?: string;
  days?: DayRequest[];
};

const schema = z.object({
  days: z.array(
    z.object({
      date: z.string().describe("yyyy-MM-dd, echoed back exactly as given"),
      entries: z
        .array(
          z.object({
            text: z
              .string()
              .describe("one short sentence describing the work — no hashtags, no dates"),
            project: z.string().describe("a project tag from the allowed list, including the #"),
            activity: z.string().describe("an activity tag from the allowed list, including the #"),
            hours: z.number().describe("hours for this entry, in 0.25 steps"),
          }),
        )
        .min(1),
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
  const days = body.days ?? [];
  if (!days.length) return NextResponse.json({ days: [] });

  const projects = body.projects ?? [];
  const activities = body.activities ?? [];
  const fallbackProject = body.fallbackProject || projects[0] || "";
  const fallbackActivity = body.fallbackActivity || activities[0] || "";

  const google = createGoogleGenerativeAI({ apiKey });
  const model = google(process.env.GEMINI_MODEL || "gemini-2.5-flash");

  const system = [
    "You write daily timesheet entries for a software engineer on the Emit time-tracking tool.",
    "Rules:",
    "- Every entry needs exactly one project tag and one activity tag, both copied verbatim from the allowed lists.",
    "- `text` is plain prose with NO hashtags, NO dates, NO 'today'. Keep it under 18 words.",
    "- When commits are supplied, the text must describe that actual work — merge related commits, drop noise like 'wip' or 'merge branch'.",
    "- When no commits are supplied, invent plausible day-to-day work consistent with the user's instructions.",
    "- The entries for a day must add up to the day's target hours.",
    "- Vary the phrasing across days. Never repeat a sentence you've already written.",
  ].join("\n");

  const used: string[] = [];
  const out: { date: string; entries: { text: string; project: string; activity: string; hours: number }[] }[] = [];

  try {
    for (let i = 0; i < days.length; i += CHUNK) {
      const slice = days.slice(i, i + CHUNK);

      const prompt = [
        `User instructions: ${body.prompt || "keep it factual and concise"}`,
        "",
        `Allowed project tags: ${projects.join(", ")}`,
        `Allowed activity tags: ${activities.join(", ")}`,
        used.length ? `\nAlready used sentences (do not repeat):\n- ${used.slice(-24).join("\n- ")}` : "",
        "",
        "Produce entries for these days:",
        JSON.stringify(
          slice.map((d) => ({
            date: d.date,
            weekday: d.weekday,
            targetHours: d.hours,
            note: d.hint || undefined,
            commits: d.commits?.length
              ? d.commits.map((c) => `[${c.project ?? c.repo}] ${c.message}`)
              : undefined,
          })),
          null,
          2,
        ),
      ].join("\n");

      const { object } = await generateObject({
        model,
        schema,
        system,
        prompt,
        temperature: 0.85,
      });

      for (const day of object.days) {
        const req = slice.find((d) => d.date === day.date);
        if (!req) continue;
        const entries = day.entries.map((e) => {
          used.push(e.text);
          return {
            text: e.text.replace(/#[\w-]+/g, "").replace(/\s+/g, " ").trim(),
            project: snap(e.project, projects, fallbackProject),
            activity: snap(e.activity, activities, fallbackActivity),
            hours: Math.max(0.25, Math.round((e.hours || req.hours) * 4) / 4),
          };
        });
        out.push({ date: day.date, entries });
      }
    }

    return NextResponse.json({ days: out });
  } catch (err) {
    const message = (err as Error).message || "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
