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
/**
 * There is no `since` on Bitbucket's commits endpoint, so reaching an older
 * range means walking back to it a page at a time — 10 pages only covered a
 * couple of months on an active repo, which silently returned nothing. The
 * whole-page-predates check below still stops recent ranges after a page or two.
 */
const MAX_PAGES = 80;

type BbCommit = {
  hash: string;
  date: string;
  message: string;
  author?: {
    raw?: string;
    /**
     * No `username` here — Bitbucket dropped it from commit user objects, so
     * `nickname` holds the display name and `account_id`/`uuid` are the only
     * stable identifiers.
     */
    user?: {
      nickname?: string;
      display_name?: string;
      account_id?: string;
      uuid?: string;
    };
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
  /** `account_id`/`uuid` from /2.0/user — the only identifiers commits carry. */
  authorAccountIds?: string[];
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
    authorAccountIds = [],
    allBranches,
  } = (await req.json()) as Body;

  if (!token) return NextResponse.json({ error: "Bitbucket token is required" }, { status: 400 });
  if (!repos.length) return NextResponse.json({ error: "Pick at least one repo" }, { status: 400 });

  const norm = (v: string) => v.trim().toLowerCase();
  const headers = bitbucketHeaders(token, authEmail);
  const emailSet = new Set(authorEmails.map(norm).filter(Boolean));
  const userSet = new Set(authorUsernames.map(norm).filter(Boolean));
  // `{uuid}` braces come and go depending on the endpoint, so compare bare.
  const idSet = new Set(authorAccountIds.map((v) => norm(v).replace(/[{}]/g, "")).filter(Boolean));
  const filtering = emailSet.size > 0 || userSet.size > 0 || idSet.size > 0;

  const sinceMs = sinceISO ? Date.parse(sinceISO) : Number.NEGATIVE_INFINITY;
  const untilMs = untilISO ? Date.parse(untilISO) : Number.POSITIVE_INFINITY;
  const warnings: string[] = [];
  // Tracked so "your filter matched nothing" can be told apart from "the range
  // is empty" — the two are indistinguishable in the response otherwise.
  let inRange = 0;

  function isMine(c: BbCommit): boolean {
    if (!filtering) return true;
    const u = c.author?.user;
    if (
      [u?.account_id, u?.uuid]
        .filter(Boolean)
        .some((v) => idSet.has(norm(v!).replace(/[{}]/g, "")))
    ) {
      return true;
    }
    const email = emailFromRaw(c.author?.raw)?.toLowerCase();
    if (email && emailSet.has(email)) return true;
    // `raw` is `Name <email>`; the name is often the git author, which may differ
    // from the Bitbucket display name.
    const rawName = c.author?.raw?.replace(/\s*<[^>]*>\s*$/, "");
    return [u?.nickname, u?.display_name, rawName]
      .filter(Boolean)
      .some((n) => userSet.has(norm(n!)));
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
        inRange += 1;
        if (!isMine(c)) continue;
        out.push({
          sha: c.hash,
          repoId: `bitbucket:${repo.fullName}`,
          provider: "bitbucket",
          repo: repo.fullName,
          message: c.message.split("\n")[0].trim(),
          date: new Date(c.date).toISOString(),
          url: c.links?.html?.href ?? `https://bitbucket.org/${repo.fullName}/commits/${c.hash}`,
          authorLogin: c.author?.user?.nickname ?? c.author?.user?.display_name ?? null,
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
    } else if (result.ok && result.exhausted) {
      warnings.push(
        `${repo.fullName}: stopped after ${MAX_PAGES} pages without reaching the start of the ` +
          `range, so older commits are missing. Narrow the range or pick a later start date.`,
      );
    }
    return out;
  }

  try {
    const perRepo = await mapLimit(repos, CONCURRENCY, pull);
    const commits = perRepo.flat().sort((a, b) => a.date.localeCompare(b.date));

    if (filtering && !commits.length && inRange > 0) {
      warnings.push(
        `${inRange} commits are in range but none match the author filter. Bitbucket commits carry ` +
          `a display name and account id, never a username — clear the username field or add your ` +
          `commit email.`,
      );
    }

    return NextResponse.json({ commits, warnings });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
