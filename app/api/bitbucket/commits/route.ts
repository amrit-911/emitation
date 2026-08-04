import { NextResponse } from "next/server";
import {
  BITBUCKET_API,
  authHint,
  bitbucketHeaders,
  emailFromRaw,
  mapLimit,
  paginate,
  splitFullName,
} from "@/lib/bitbucket";
import type { Commit } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const CONCURRENCY = 4;
const MAX_PAGES = 10;

type BbCommit = {
  hash: string;
  date: string;
  message: string;
  author?: {
    raw?: string;
    user?: { username?: string; nickname?: string; display_name?: string };
  };
  links?: { html?: { href?: string } };
};

type Body = {
  token?: string;
  authEmail?: string;
  repos?: { fullName: string; defaultBranch?: string }[];
  sinceISO?: string;
  untilISO?: string;
  /** Bitbucket has no author query param — matched post-hoc. */
  authorEmails?: string[];
  authorUsernames?: string[];
  allBranches?: boolean;
};

export async function POST(req: Request) {
  const {
    token,
    authEmail,
    repos = [],
    sinceISO,
    untilISO,
    authorEmails = [],
    authorUsernames = [],
    allBranches,
  } = (await req.json()) as Body;

  if (!token) return NextResponse.json({ error: "Bitbucket token is required" }, { status: 400 });
  if (!repos.length) return NextResponse.json({ error: "Pick at least one repo" }, { status: 400 });

  const headers = bitbucketHeaders(token, authEmail);
  const emailSet = new Set(authorEmails.map((e) => e.toLowerCase()).filter(Boolean));
  const userSet = new Set(authorUsernames.map((u) => u.toLowerCase()).filter(Boolean));
  const filtering = emailSet.size > 0 || userSet.size > 0;

  const sinceMs = sinceISO ? Date.parse(sinceISO) : Number.NEGATIVE_INFINITY;
  const untilMs = untilISO ? Date.parse(untilISO) : Number.POSITIVE_INFINITY;
  const warnings: string[] = [];

  function isMine(c: BbCommit): boolean {
    if (!filtering) return true;
    const email = emailFromRaw(c.author?.raw)?.toLowerCase();
    if (email && emailSet.has(email)) return true;
    const u = c.author?.user;
    return [u?.username, u?.nickname, u?.display_name]
      .filter(Boolean)
      .some((n) => userSet.has(n!.toLowerCase()));
  }

  async function pull(repo: { fullName: string; defaultBranch?: string }): Promise<Commit[]> {
    const { workspace, slug } = splitFullName(repo.fullName);
    // The bare /commits endpoint walks every ref; /commits/{branch} walks one.
    const path = allBranches
      ? `commits`
      : `commits/${encodeURIComponent(repo.defaultBranch || "main")}`;
    const url = `${BITBUCKET_API}/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(slug)}/${path}?pagelen=100`;

    const out: Commit[] = [];
    const result = await paginate<BbCommit>(url, headers, MAX_PAGES, (values) => {
      if (!values.length) return false;
      for (const c of values) {
        const ms = Date.parse(c.date);
        if (ms < sinceMs || ms > untilMs) continue;
        if (!isMine(c)) continue;
        out.push({
          sha: c.hash,
          repoId: `bitbucket:${repo.fullName}`,
          provider: "bitbucket",
          repo: repo.fullName,
          message: c.message.split("\n")[0].trim(),
          date: new Date(c.date).toISOString(),
          url: c.links?.html?.href ?? `https://bitbucket.org/${repo.fullName}/commits/${c.hash}`,
          authorLogin: c.author?.user?.nickname ?? c.author?.user?.username ?? null,
          authorEmail: emailFromRaw(c.author?.raw),
        });
      }
      // Results come newest-first; once an entire page predates the range there
      // is nothing left to find. Checking the whole page (not the first commit)
      // tolerates the interleaving you get when walking every branch at once.
      return !values.every((c) => Date.parse(c.date) < sinceMs);
    });

    if (!result.ok && result.status !== 404) {
      const parts = [
        `${repo.fullName}: Bitbucket responded ${result.status}`,
        result.detail,
        authHint(result.status, Boolean(authEmail?.trim())),
      ].filter(Boolean);
      warnings.push(parts.join(" — "));
    }
    return out;
  }

  try {
    const perRepo = await mapLimit(repos, CONCURRENCY, pull);
    const commits = perRepo.flat().sort((a, b) => a.date.localeCompare(b.date));
    return NextResponse.json({ commits, warnings });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
