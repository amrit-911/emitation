import { NextResponse } from "next/server";
import { BITBUCKET_API, authHint, bitbucketError, bitbucketHeaders, paginate } from "@/lib/bitbucket";
import type { Repo } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_PAGES = 10;

type BbRepo = {
  full_name: string;
  is_private: boolean;
  updated_on: string | null;
  language: string | null;
  mainbranch?: { name?: string } | null;
};

type BbUser = { username?: string; nickname?: string; display_name?: string };

export async function POST(req: Request) {
  const { token, authEmail } = (await req.json()) as { token?: string; authEmail?: string };
  if (!token) return NextResponse.json({ error: "Bitbucket token is required" }, { status: 400 });

  const usingBasic = Boolean(authEmail?.trim());
  const headers = bitbucketHeaders(token, authEmail);

  try {
    // Access tokens are scoped to a workspace/repo and can't read /user, so a
    // failure here is never fatal — only the display name is lost. /user also
    // needs `read:account`, which a repo-only API token won't have. The reason
    // is kept so it can be reported if the repositories call fails too.
    let login = "";
    let userIssue = "";
    const me = await fetch(`${BITBUCKET_API}/user`, { headers, cache: "no-store" });
    if (me.ok) {
      const user = (await me.json()) as BbUser;
      login = user.username || user.nickname || user.display_name || "";
    } else {
      userIssue = `GET /user → ${me.status}: ${await bitbucketError(me)}`;
    }

    const repos: Repo[] = [];
    const result = await paginate<BbRepo>(
      `${BITBUCKET_API}/repositories?role=member&pagelen=100&sort=-updated_on`,
      headers,
      MAX_PAGES,
      (values) => {
        repos.push(
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
      const parts = [
        `Bitbucket responded ${result.status} listing repositories`,
        result.detail,
        authHint(result.status, usingBasic),
        userIssue,
      ].filter(Boolean);
      return NextResponse.json({ error: parts.join(" — ") }, { status: 502 });
    }

    return NextResponse.json({ login, repos, warning: userIssue || undefined });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
