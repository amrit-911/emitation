export const BITBUCKET_API = "https://api.bitbucket.org/2.0";

/**
 * Bitbucket Cloud takes either an Atlassian API token via Basic auth
 * (email:token) or a workspace/repo access token as a Bearer. App passwords
 * are being retired, so email + API token is the path we document.
 */
export function bitbucketHeaders(token: string, authEmail?: string): Record<string, string> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (authEmail?.trim()) {
    const basic = Buffer.from(`${authEmail.trim()}:${token}`).toString("base64");
    headers.authorization = `Basic ${basic}`;
  } else {
    headers.authorization = `Bearer ${token}`;
  }
  return headers;
}

export type BitbucketPage<T> = { values?: T[]; next?: string };

/**
 * Bitbucket errors carry the useful part in `error.message` — without it a 401
 * is indistinguishable from a wrong email, an unscoped token and a revoked one.
 */
export async function bitbucketError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const body = JSON.parse(text) as { error?: { message?: string; detail?: string } };
    return body.error?.detail || body.error?.message || text.slice(0, 200);
  } catch {
    return text.slice(0, 200);
  }
}

/** Turns a 401/403 into the specific thing that is most likely misconfigured. */
export function authHint(status: number, usingBasic: boolean): string {
  if (status !== 401 && status !== 403) return "";
  return usingBasic
    ? "Basic auth was used. The email must be the Atlassian account email (not the Bitbucket username), " +
        "and the token must be a scoped API token from id.atlassian.com — classic API tokens with no " +
        "scopes are rejected by Bitbucket."
    : "Bearer auth was used because the email field is blank. That only works for workspace or " +
        "repository access tokens; an Atlassian API token needs the email filled in.";
}

/**
 * Bitbucket paginates with an opaque `next` URL rather than page numbers.
 * `onPage` returns false to stop early (used to bail once commits predate
 * the requested range).
 */
export async function paginate<T>(
  startUrl: string,
  headers: Record<string, string>,
  maxPages: number,
  onPage: (values: T[]) => boolean | void,
): Promise<{ ok: true } | { ok: false; status: number; detail: string }> {
  let url: string | undefined = startUrl;
  for (let page = 0; page < maxPages && url; page += 1) {
    const res: Response = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) return { ok: false, status: res.status, detail: await bitbucketError(res) };
    const body = (await res.json()) as BitbucketPage<T>;
    const values = body.values ?? [];
    if (onPage(values) === false) return { ok: true };
    url = body.next;
  }
  return { ok: true };
}

/** Bounded-concurrency map, so a workspace with many repos can't fan out unbounded. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
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

type WorkspaceAccess = { workspace?: { slug?: string } };

/**
 * Repository discovery is workspace-scoped since CHANGE-2770 (April 2026) removed
 * every cross-workspace listing endpoint — `/repositories?role=member`,
 * `/workspaces` and `/user/permissions/workspaces` all return 410 now. The
 * surviving discovery route is `/user/workspaces`, which only works for
 * account-level credentials; workspace and repository access tokens have to be
 * told their workspace explicitly.
 */
export async function listWorkspaces(
  headers: Record<string, string>,
  maxPages: number,
): Promise<{ ok: true; slugs: string[] } | { ok: false; status: number; detail: string }> {
  const slugs: string[] = [];
  const result = await paginate<WorkspaceAccess>(
    `${BITBUCKET_API}/user/workspaces?pagelen=100`,
    headers,
    maxPages,
    (values) => {
      for (const v of values) if (v.workspace?.slug) slugs.push(v.workspace.slug);
    },
  );
  return result.ok ? { ok: true, slugs } : result;
}

/** `workspace/repo_slug` — neither part can contain a slash, so this is exact. */
export function splitFullName(fullName: string): { workspace: string; slug: string } {
  const idx = fullName.indexOf("/");
  return { workspace: fullName.slice(0, idx), slug: fullName.slice(idx + 1) };
}

/** Bitbucket's `author.raw` looks like `Name <email@host>`. */
export function emailFromRaw(raw: string | undefined): string | undefined {
  const match = raw?.match(/<([^>]+)>/);
  return match?.[1];
}
