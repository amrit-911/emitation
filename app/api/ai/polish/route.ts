import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { geminiModel } from "@/lib/ai";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 120;

type Item = { id: string; repo: string; messages: string[] };

const schema = z.object({
  results: z.array(
    z.object({
      id: z.string().describe("echoed back exactly as given"),
      text: z.string().describe("one polished sentence, no hashtags, no dates"),
    }),
  ),
});

export async function POST(req: Request) {
  let model: ReturnType<typeof geminiModel>;
  try {
    model = geminiModel();
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  const { items } = (await req.json()) as { items?: Item[] };
  if (!items?.length) return NextResponse.json({ results: [] });

  const system = [
    "You clean up terse git commit messages into ONE polished sentence per group, for a developer's timesheet.",
    "Rules:",
    "- Merge every message in a group into a single coherent sentence describing the actual work.",
    "- Drop noise words: 'wip', 'fix', 'update', 'stuff', bare ticket numbers, 'merge branch ...'.",
    "- If the messages are too vague to say anything specific (e.g. just 'fix', 'wip'), infer a plausible " +
      "generic description from the repo name and any wording present — never invent a named feature that isn't implied.",
    "- No hashtags, no dates, no 'today'. Under 18 words. Echo the id back exactly as given, unchanged.",
  ].join("\n");

  const prompt = JSON.stringify(items, null, 2);

  try {
    const { object } = await generateObject({ model, schema, system, prompt, temperature: 0.4 });
    return NextResponse.json({ results: object.results });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || "Polish failed" }, { status: 500 });
  }
}
