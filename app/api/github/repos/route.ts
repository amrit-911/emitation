import { NextResponse } from "next/server";
import type { Repo } from "@/lib/types";

export const runtime = "nodejs";

const GH = "https://api.github.com";

type GhRepo = {
  full_name: string;
  private: boolean;
  pushed_at: string | null;
  default_branch: string;
  language: string | null;
};

export async function POST(req: Request) {
  const { token } = (await req.json()) as { token?: string };
  if (!token) return NextResponse.json({ error: "GitHub token is required" }, { status: 400 });

  const headers = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "x-github-api-version": "2022-11-28",
    "user-agent": "emitation",
  };

  try {
    const me = await fetch(`${GH}/user`, { headers, cache: "no-store" });
    if (!me.ok) {
      return NextResponse.json(
        { error: `GitHub rejected the token (${me.status})` },
        { status: 502 },
      );
    }
    const user = (await me.json()) as { login: string };

    const repos: Repo[] = [];
    for (let page = 1; page <= 5; page += 1) {
      const res = await fetch(
        `${GH}/user/repos?per_page=100&page=${page}&sort=pushed&affiliation=owner,collaborator,organization_member`,
        { headers, cache: "no-store" },
      );
      if (!res.ok) break;
      const chunk = (await res.json()) as GhRepo[];
      repos.push(
        ...chunk.map((r) => ({
          id: `github:${r.full_name}`,
          provider: "github" as const,
          fullName: r.full_name,
          private: r.private,
          pushedAt: r.pushed_at,
          defaultBranch: r.default_branch,
          language: r.language,
        })),
      );
      if (chunk.length < 100) break;
    }

    return NextResponse.json({ login: user.login, repos });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
