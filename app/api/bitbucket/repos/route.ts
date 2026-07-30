import { NextResponse } from "next/server";
import { BITBUCKET_API, bitbucketHeaders, paginate } from "@/lib/bitbucket";
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

  const headers = bitbucketHeaders(token, authEmail);

  try {
    // Access tokens are scoped to a workspace/repo and can't read /user, so a
    // failure here isn't fatal — only the display name is lost.
    let login = "";
    const me = await fetch(`${BITBUCKET_API}/user`, { headers, cache: "no-store" });
    if (me.ok) {
      const user = (await me.json()) as BbUser;
      login = user.username || user.nickname || user.display_name || "";
    } else if (me.status === 401 || me.status === 403) {
      const usingBasic = Boolean(authEmail?.trim());
      return NextResponse.json(
        {
          error:
            `Bitbucket rejected the credentials (${me.status}). ` +
            (usingBasic
              ? "Check the Atlassian account email and that the API token has Repositories: Read."
              : "Leave the email blank only for workspace/repo access tokens; for an Atlassian API token, fill in the email."),
        },
        { status: 502 },
      );
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
      return NextResponse.json(
        { error: `Bitbucket responded ${result.status} while listing repositories` },
        { status: 502 },
      );
    }

    return NextResponse.json({ login, repos });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
