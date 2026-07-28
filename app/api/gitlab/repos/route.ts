import { NextResponse } from "next/server";
import type { Repo } from "@/lib/types";

export const runtime = "nodejs";

type GlProject = {
  path_with_namespace: string;
  id: number;
  visibility: string;
  last_activity_at: string | null;
  default_branch: string | null;
};

export async function POST(req: Request) {
  const { token, baseUrl } = (await req.json()) as { token?: string; baseUrl?: string };
  if (!token) return NextResponse.json({ error: "GitLab token is required" }, { status: 400 });

  const base = (baseUrl || "https://gitlab.com").replace(/\/+$/, "");
  const headers = { "PRIVATE-TOKEN": token, accept: "application/json" };

  try {
    const me = await fetch(`${base}/api/v4/user`, { headers, cache: "no-store" });
    if (!me.ok) {
      return NextResponse.json(
        { error: `GitLab rejected the token (${me.status})` },
        { status: 502 },
      );
    }
    const user = (await me.json()) as { username: string };

    const repos: Repo[] = [];
    for (let page = 1; page <= 5; page += 1) {
      const res = await fetch(
        `${base}/api/v4/projects?membership=true&per_page=100&page=${page}&order_by=last_activity_at&simple=true`,
        { headers, cache: "no-store" },
      );
      if (!res.ok) break;
      const chunk = (await res.json()) as GlProject[];
      repos.push(
        ...chunk.map((p) => ({
          id: `gitlab:${p.path_with_namespace}`,
          provider: "gitlab" as const,
          fullName: p.path_with_namespace,
          private: p.visibility !== "public",
          pushedAt: p.last_activity_at,
          defaultBranch: p.default_branch ?? "main",
          language: null,
          providerId: p.id,
        })),
      );
      if (chunk.length < 100) break;
    }

    return NextResponse.json({ login: user.username, repos });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
