import { NextResponse } from "next/server";
import { EMIT_API, buildActivityPayload } from "@/lib/emit";
import type { EmitProfile } from "@/lib/types";

export const runtime = "nodejs";

type Body = {
  token?: string;
  cookie?: string;
  profile?: EmitProfile;
  epochMs?: number;
  hours?: number;
  description?: string;
  tags?: string[];
  mentions?: string[];
  dryRun?: boolean;
};

export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  const { token, cookie, profile, epochMs, hours, description, tags } = body;

  if (!token) return NextResponse.json({ error: "Token is required" }, { status: 400 });
  if (!profile?.activeTeam?._id) {
    return NextResponse.json({ error: "Profile with activeTeam is required" }, { status: 400 });
  }
  if (!epochMs || !hours || !description) {
    return NextResponse.json({ error: "date, time and description are required" }, { status: 400 });
  }

  const payload = buildActivityPayload({
    profile,
    epochMs,
    hours,
    description,
    tags: tags ?? [],
    mentions: body.mentions,
  });

  if (body.dryRun) return NextResponse.json({ ok: true, dryRun: true, payload });

  const url = `${EMIT_API}/member/activity?teamId=${encodeURIComponent(profile.activeTeam._id)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        token,
        origin: "https://app.emit.work",
        referer: "https://app.emit.work/",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* keep raw text */
    }

    if (!res.ok) {
      const message =
        (parsed as { message?: string })?.message || `Emit responded ${res.status}`;
      return NextResponse.json({ error: message, status: res.status, detail: parsed }, { status: 502 });
    }

    return NextResponse.json({ ok: true, result: parsed });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
