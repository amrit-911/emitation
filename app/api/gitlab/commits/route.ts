import { NextResponse } from "next/server";
import type { Commit } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const CONCURRENCY = 6;

type GlCommit = {
  id: string;
  title: string;
  created_at: string;
  web_url: string;
  author_email?: string;
  author_name?: string;
};

type Body = {
  token?: string;
  baseUrl?: string;
  projects?: { providerId: number; fullName: string }[];
  sinceISO?: string;
  untilISO?: string;
  /** No author query param exists on this endpoint — filtered client-side by email. */
  authorEmails?: string[];
  allBranches?: boolean;
};

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor;
      cursor += 1;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function POST(req: Request) {
  const {
    token,
    baseUrl,
    projects = [],
    sinceISO,
    untilISO,
    authorEmails = [],
    allBranches,
  } = (await req.json()) as Body;

  if (!token) return NextResponse.json({ error: "GitLab token is required" }, { status: 400 });
  if (!projects.length) return NextResponse.json({ error: "Pick at least one project" }, { status: 400 });

  const base = (baseUrl || "https://gitlab.com").replace(/\/+$/, "");
  const headers = { "PRIVATE-TOKEN": token, accept: "application/json" };
  const emailSet = new Set(authorEmails.map((e) => e.toLowerCase()));
  const warnings: string[] = [];

  async function pull(project: { providerId: number; fullName: string }): Promise<Commit[]> {
    const params = new URLSearchParams({ per_page: "100", all: allBranches ? "true" : "false" });
    if (sinceISO) params.set("since", sinceISO);
    if (untilISO) params.set("until", untilISO);

    const out: Commit[] = [];
    for (let page = 1; page <= 5; page += 1) {
      params.set("page", `${page}`);
      const res = await fetch(
        `${base}/api/v4/projects/${project.providerId}/repository/commits?${params}`,
        { headers, cache: "no-store" },
      );
      if (!res.ok) {
        if (res.status !== 404) {
          warnings.push(`${project.fullName}: GitLab responded ${res.status}`);
        }
        return out;
      }
      const chunk = (await res.json()) as GlCommit[];
      for (const c of chunk) {
        if (emailSet.size && !emailSet.has((c.author_email ?? "").toLowerCase())) continue;
        out.push({
          sha: c.id,
          repoId: `gitlab:${project.fullName}`,
          provider: "gitlab",
          repo: project.fullName,
          message: c.title.trim(),
          date: c.created_at,
          url: c.web_url,
          authorLogin: null,
          authorEmail: c.author_email,
        });
      }
      if (chunk.length < 100) return out;
    }
    return out;
  }

  try {
    const perProject = await mapLimit(projects, CONCURRENCY, pull);
    const commits = perProject.flat().sort((a, b) => a.date.localeCompare(b.date));
    return NextResponse.json({ commits, warnings });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
