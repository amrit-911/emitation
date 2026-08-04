import { NextResponse } from "next/server";
import {
  BITBUCKET_API,
  authHint,
  bitbucketError,
  bitbucketHeaders,
  listWorkspaces,
  mapLimit,
  paginate,
} from "@/lib/bitbucket";
import type { Repo } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_PAGES = 10;
const CONCURRENCY = 4;

type BbRepo = {
  full_name: string;
  is_private: boolean;
  updated_on: string | null;
  language: string | null;
  mainbranch?: { name?: string } | null;
};

type BbUser = {
  username?: string;
  nickname?: string;
  display_name?: string;
  account_id?: string;
  uuid?: string;
};

export async function POST(req: Request) {
  const { token, authEmail, workspaces } = (await req.json()) as {
    token?: string;
    authEmail?: string;
    /** Explicit slugs, needed when the credential can't enumerate workspaces. */
    workspaces?: string;
  };
  if (!token) return NextResponse.json({ error: "Bitbucket token is required" }, { status: 400 });

  const usingBasic = Boolean(authEmail?.trim());
  const headers = bitbucketHeaders(token, authEmail);

  try {
    // Access tokens are scoped to a workspace/repo and can't read /user, so a
    // failure here is never fatal — only the display name is lost. /user also
    // needs `read:account`, which a repo-only API token won't have. The reason
    // is kept so it can be reported if the repositories call fails too.
    let login = "";
    // Commits identify their author by account id, never by username, so this
    // is what makes author filtering work — see the commits route.
    let accountId = "";
    let userIssue = "";
    const me = await fetch(`${BITBUCKET_API}/user`, { headers, cache: "no-store" });
    if (me.ok) {
      const user = (await me.json()) as BbUser;
      login = user.username || user.nickname || user.display_name || "";
      accountId = user.account_id || user.uuid || "";
    } else {
      userIssue = `GET /user → ${me.status}: ${await bitbucketError(me)}`;
    }

    const explicit = (workspaces ?? "")
      .split(/[,\s]+/)
      .map((w) => w.trim())
      .filter(Boolean);

    let slugs = explicit;
    if (!slugs.length) {
      const found = await listWorkspaces(headers, MAX_PAGES);
      if (!found.ok) {
        const parts = [
          `Bitbucket responded ${found.status} listing workspaces`,
          found.detail,
          authHint(found.status, usingBasic),
          "Workspace and repository access tokens cannot enumerate workspaces — " +
            "name them in the Workspaces field instead.",
          userIssue,
        ].filter(Boolean);
        return NextResponse.json({ error: parts.join(" — ") }, { status: 502 });
      }
      slugs = found.slugs;
    }

    if (!slugs.length) {
      return NextResponse.json(
        { error: "No Bitbucket workspaces are visible to this token." },
        { status: 502 },
      );
    }

    const warnings: string[] = [];
    const perWorkspace = await mapLimit(slugs, CONCURRENCY, async (slug) => {
      const found: Repo[] = [];
      const result = await paginate<BbRepo>(
        `${BITBUCKET_API}/repositories/${encodeURIComponent(slug)}?pagelen=100&sort=-updated_on`,
        headers,
        MAX_PAGES,
        (values) => {
          found.push(
            ...values.map((r) => ({
              id: `bitbucket:${r.full_name}`,
              provider: "bitbucket" as const,
              fullName: r.full_name,
              private: r.is_private,
              pushedAt: r.updated_on,
              defaultBranch: r.mainbranch?.name ?? "main",
              language: r.language || null,
            })),
          );
        },
      );
      if (!result.ok) {
        warnings.push(
          [`${slug}: Bitbucket responded ${result.status}`, result.detail].filter(Boolean).join(" — "),
        );
      }
      return found;
    });

    const repos = perWorkspace.flat();
    // Every workspace failing is indistinguishable from a bad credential to the
    // user, so surface it as an error rather than a silent empty list.
    if (!repos.length && warnings.length === slugs.length) {
      return NextResponse.json({ error: warnings.join(" | ") }, { status: 502 });
    }

    if (userIssue) warnings.push(userIssue);
    return NextResponse.json({ login, accountId, repos, warnings });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
