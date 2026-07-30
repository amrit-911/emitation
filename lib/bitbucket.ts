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
 * Bitbucket paginates with an opaque `next` URL rather than page numbers.
 * `onPage` returns false to stop early (used to bail once commits predate
 * the requested range).
 */
export async function paginate<T>(
  startUrl: string,
  headers: Record<string, string>,
  maxPages: number,
  onPage: (values: T[]) => boolean | void,
): Promise<{ ok: true } | { ok: false; status: number }> {
  let url: string | undefined = startUrl;
  for (let page = 0; page < maxPages && url; page += 1) {
    const res: Response = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) return { ok: false, status: res.status };
    const body = (await res.json()) as BitbucketPage<T>;
    const values = body.values ?? [];
    if (onPage(values) === false) return { ok: true };
    url = body.next;
  }
  return { ok: true };
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
