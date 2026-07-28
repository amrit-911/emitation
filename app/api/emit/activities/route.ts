import { NextResponse } from "next/server";
import { EMIT_API } from "@/lib/emit";

export const runtime = "nodejs";
export const maxDuration = 60;

const PAGE_SIZE = 50;
const MAX_PAGES = 30;

type EmitActivity = {
  _id: string;
  date: string;
  time: number;
  description: string;
  tags: string[];
  status: string;
};

type Body = {
  token?: string;
  cookie?: string;
  teamId?: string;
  /** Inclusive lower bound, ISO. */
  fromISO?: string;
  /** Inclusive upper bound, ISO — becomes the `toDate` anchor. */
  toISO?: string;
};

export async function POST(req: Request) {
  const { token, cookie, teamId, fromISO, toISO } = (await req.json()) as Body;

  if (!token) return NextResponse.json({ error: "Token is required" }, { status: 400 });
  if (!teamId) return NextResponse.json({ error: "teamId is required" }, { status: 400 });
  if (!fromISO || !toISO) {
    return NextResponse.json({ error: "fromISO and toISO are required" }, { status: 400 });
  }

  const fromMs = Date.parse(fromISO);
  const toMs = Date.parse(toISO);
  const headers = {
    accept: "application/json",
    token,
    origin: "https://app.emit.work",
    referer: "https://app.emit.work/",
    ...(cookie ? { cookie } : {}),
  };

  const collected: EmitActivity[] = [];

  try {
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const skip = page * PAGE_SIZE;
      const url =
        `${EMIT_API}/member/list_activities?teamId=${encodeURIComponent(teamId)}` +
        `&toDate=${toMs}&limit=${PAGE_SIZE}&skip=${skip}`;
      const res = await fetch(url, { headers, cache: "no-store" });
      if (!res.ok) {
        const text = await res.text();
        return NextResponse.json(
          { error: `Emit responded ${res.status}`, detail: text.slice(0, 300) },
          { status: 502 },
        );
      }
      const chunk = (await res.json()) as EmitActivity[];
      if (!chunk.length) break;

      let hitLowerBound = false;
      for (const a of chunk) {
        const ms = Date.parse(a.date);
        if (ms < fromMs) {
          hitLowerBound = true;
          break;
        }
        if (ms <= toMs) collected.push(a);
      }
      if (hitLowerBound || chunk.length < PAGE_SIZE) break;
    }

    return NextResponse.json({
      activities: collected.map((a) => ({
        id: a._id,
        date: a.date,
        hours: a.time,
        description: a.description,
        tags: a.tags,
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
