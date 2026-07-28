import { NextResponse } from "next/server";
import type { Commit } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const GH = "https://api.github.com";
const MAX_BRANCHES = 25;
const CONCURRENCY = 6;

type GhCommit = {
  sha: string;
  html_url: string;
  author: { login: string } | null;
  commit: {
    message: string;
    author: { name: string; email: string; date: string };
  };
};

type Body = {
  token?: string;
  repos?: string[];
  sinceISO?: string;
  untilISO?: string;
  authors?: string[];
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
  const { token, repos = [], sinceISO, untilISO, authors = [], allBranches } =
    (await req.json()) as Body;

  if (!token) return NextResponse.json({ error: "GitHub token is required" }, { status: 400 });
  if (!repos.length) return NextResponse.json({ error: "Pick at least one repo" }, { status: 400 });

  const headers = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "x-github-api-version": "2022-11-28",
    "user-agent": "emitation",
  };

  const warnings: string[] = [];
  const byShaPerRepo = new Map<string, Map<string, Commit>>();

  async function pull(repo: string, branch: string | undefined, author: string | undefined) {
    const params = new URLSearchParams({ per_page: "100" });
    if (sinceISO) params.set("since", sinceISO);
    if (untilISO) params.set("until", untilISO);
    if (branch) params.set("sha", branch);
    if (author) params.set("author", author);

    for (let page = 1; page <= 5; page += 1) {
      params.set("page", `${page}`);
      const res = await fetch(`${GH}/repos/${repo}/commits?${params}`, {
        headers,
        cache: "no-store",
      });
      if (!res.ok) {
        // An empty repo / missing branch 409s or 404s — not worth surfacing per branch.
        if (res.status !== 409 && res.status !== 404) {
          warnings.push(`${repo}${branch ? `@${branch}` : ""}: GitHub responded ${res.status}`);
        }
        return;
      }
      const chunk = (await res.json()) as GhCommit[];
      const bucket = byShaPerRepo.get(repo)!;
      for (const c of chunk) {
        if (bucket.has(c.sha)) continue;
        bucket.set(c.sha, {
          sha: c.sha,
          repoId: `github:${repo}`,
          provider: "github",
          repo,
          message: c.commit.message.split("\n")[0].trim(),
          date: c.commit.author.date,
          url: c.html_url,
          authorLogin: c.author?.login ?? null,
          authorEmail: c.commit.author.email,
          branch,
        });
      }
      if (chunk.length < 100) return;
    }
  }

  try {
    await mapLimit(repos, CONCURRENCY, async (repo) => {
      byShaPerRepo.set(repo, new Map());

      let branches: (string | undefined)[] = [undefined];
      if (allBranches) {
        const res = await fetch(`${GH}/repos/${repo}/branches?per_page=100`, {
          headers,
          cache: "no-store",
        });
        if (res.ok) {
          const list = (await res.json()) as { name: string }[];
          if (list.length > MAX_BRANCHES) {
            warnings.push(`${repo}: scanning first ${MAX_BRANCHES} of ${list.length} branches`);
          }
          branches = list.slice(0, MAX_BRANCHES).map((b) => b.name);
        }
      }

      const jobs: { branch: string | undefined; author: string | undefined }[] = [];
      for (const branch of branches) {
        if (authors.length) authors.forEach((a) => jobs.push({ branch, author: a }));
        else jobs.push({ branch, author: undefined });
      }
      await mapLimit(jobs, CONCURRENCY, (job) => pull(repo, job.branch, job.author));
    });

    const commits = Array.from(byShaPerRepo.values())
      .flatMap((m) => Array.from(m.values()))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({ commits, warnings });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
