import { NextResponse } from "next/server";
import { EMIT_API } from "@/lib/emit";

export const runtime = "nodejs";

/**
 * Emit's profile endpoint isn't public, so the URL is user-supplied.
 * We only proxy it to dodge CORS — the token never leaves the machine.
 */
export async function POST(req: Request) {
  const { token, cookie, url } = (await req.json()) as {
    token?: string;
    cookie?: string;
    url?: string;
  };

  if (!token) return NextResponse.json({ error: "Token is required" }, { status: 400 });

  const target = (url || `${EMIT_API}/member/profile`).trim();
  if (!/^https?:\/\//.test(target)) {
    return NextResponse.json({ error: "Profile URL must be absolute" }, { status: 400 });
  }

  try {
    const res = await fetch(target, {
      headers: {
        accept: "application/json",
        token,
        origin: "https://app.emit.work",
        referer: "https://app.emit.work/",
        ...(cookie ? { cookie } : {}),
      },
      cache: "no-store",
    });
    const text = await res.text();
    if (!res.ok) {
      return NextResponse.json(
        { error: `Emit responded ${res.status}`, detail: text.slice(0, 500) },
        { status: 502 },
      );
    }
    try {
      return NextResponse.json({ profile: JSON.parse(text) });
    } catch {
      return NextResponse.json({ error: "Response wasn't JSON", detail: text.slice(0, 300) }, { status: 502 });
    }
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
