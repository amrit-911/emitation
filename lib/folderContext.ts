"use client";

/**
 * Reads an attached folder entirely in the browser: git reflogs (your own
 * commits, with real timestamps — no token needed), the remote, a README
 * excerpt and which files were touched when. Only a compact summary of this
 * ever leaves the machine, as part of an AI request.
 */

import { toKey } from "./dates";
import type { Attachment, Commit, FileAttachment, FolderAttachment, Repo } from "./types";

const SKIP_DIRS = new Set([
  "node_modules", "dist", "build", "out", "coverage", "vendor", "venv", "__pycache__",
  "target", "Pods", "bin", "obj", "tmp", "temp", "logs",
]);
const MAX_FILES = 6000;
const MAX_DEPTH = 10;
const TEXT_EXT = /\.(md|mdx|txt|csv|tsv|json|ya?ml|log|eml|html?|xml|rtf|feature|gherkin|org|adoc|rst)$/i;

type RawFile = { path: string; modified: number; size: number; read: () => Promise<string> };
type Collected = { root: string; files: RawFile[]; git: Map<string, () => Promise<string>> };

const uid = () => Math.random().toString(36).slice(2, 10);

/* ------------------------------------------------------- File System Access */

type FileHandle = { kind: "file"; name: string; getFile(): Promise<File> };
type DirHandle = {
  kind: "directory";
  name: string;
  values(): AsyncIterable<DirHandle | FileHandle>;
};

export const canPickDirectory = () =>
  typeof window !== "undefined" && "showDirectoryPicker" in window;

/** Opens the native folder picker. Resolves null if the user cancels. */
export async function pickDirectory(): Promise<Collected | null> {
  const picker = (window as unknown as { showDirectoryPicker: (o?: object) => Promise<DirHandle> })
    .showDirectoryPicker;
  let root: DirHandle;
  try {
    root = await picker({ mode: "read" });
  } catch {
    return null;
  }
  const out: Collected = { root: root.name, files: [], git: new Map() };
  await walkHandle(root, "", 0, out);
  return out;
}

async function walkHandle(dir: DirHandle, prefix: string, depth: number, out: Collected) {
  for await (const child of dir.values()) {
    if (out.files.length >= MAX_FILES) return;
    if (child.kind === "directory") {
      if (depth === 0 && child.name === ".git") {
        await walkGitHandle(child, "", out);
        continue;
      }
      if (child.name.startsWith(".") || SKIP_DIRS.has(child.name) || depth >= MAX_DEPTH) continue;
      await walkHandle(child, `${prefix}${child.name}/`, depth + 1, out);
    } else {
      const file = await child.getFile();
      out.files.push({
        path: prefix + child.name,
        modified: file.lastModified,
        size: file.size,
        read: () => file.text(),
      });
    }
  }
}

/** Only HEAD, config and logs/** are needed — never the object store. */
async function walkGitHandle(dir: DirHandle, prefix: string, out: Collected) {
  for await (const child of dir.values()) {
    const path = prefix + child.name;
    if (child.kind === "file") {
      if (path === "HEAD" || path === "config" || path.startsWith("logs/")) {
        out.git.set(path, async () => (await child.getFile()).text());
      }
    } else if (path === "logs" || path.startsWith("logs/")) {
      await walkGitHandle(child, `${path}/`, out);
    }
  }
}

/* ----------------------------------------------- <input webkitdirectory> */

export function collectFromFileList(list: FileList): Collected | null {
  const files = Array.from(list);
  if (!files.length) return null;
  const root = files[0].webkitRelativePath.split("/")[0] || "folder";
  const out: Collected = { root, files: [], git: new Map() };
  for (const f of files) {
    const parts = f.webkitRelativePath.split("/").slice(1);
    if (parts[0] === ".git") {
      const path = parts.slice(1).join("/");
      if (path === "HEAD" || path === "config" || path.startsWith("logs/")) {
        out.git.set(path, () => f.text());
      }
      continue;
    }
    const dirs = parts.slice(0, -1);
    if (dirs.length > MAX_DEPTH || dirs.some((d) => d.startsWith(".") || SKIP_DIRS.has(d))) continue;
    if (out.files.length >= MAX_FILES) break;
    out.files.push({
      path: parts.join("/"),
      modified: f.lastModified,
      size: f.size,
      read: () => f.text(),
    });
  }
  return out;
}

/* --------------------------------------------------------- drag and drop */

function readAll(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = [];
    const next = () =>
      reader.readEntries((batch) => {
        if (!batch.length) return resolve(all);
        all.push(...batch);
        next();
      }, reject);
    next();
  });
}

const entryFile = (e: FileSystemFileEntry) =>
  new Promise<File>((resolve, reject) => e.file(resolve, reject));

async function walkEntry(
  dir: FileSystemDirectoryEntry,
  prefix: string,
  depth: number,
  out: Collected,
  gitMode = false,
) {
  for (const child of await readAll(dir.createReader())) {
    if (!gitMode && out.files.length >= MAX_FILES) return;
    const path = prefix + child.name;
    if (gitMode) {
      if (child.isFile && (path === "HEAD" || path === "config" || path.startsWith("logs/"))) {
        const file = await entryFile(child as FileSystemFileEntry);
        out.git.set(path, () => file.text());
      } else if (child.isDirectory && (path === "logs" || path.startsWith("logs/"))) {
        await walkEntry(child as FileSystemDirectoryEntry, `${path}/`, depth + 1, out, true);
      }
      continue;
    }
    if (child.isDirectory) {
      if (depth === 0 && child.name === ".git") {
        await walkEntry(child as FileSystemDirectoryEntry, "", 0, out, true);
        continue;
      }
      if (child.name.startsWith(".") || SKIP_DIRS.has(child.name) || depth >= MAX_DEPTH) continue;
      await walkEntry(child as FileSystemDirectoryEntry, `${path}/`, depth + 1, out);
    } else {
      const file = await entryFile(child as FileSystemFileEntry);
      out.files.push({ path, modified: file.lastModified, size: file.size, read: () => file.text() });
    }
  }
}

/** Folders dropped onto the composer, plus any loose text files alongside them. */
export async function collectFromDrop(
  items: DataTransferItemList,
): Promise<{ folders: Collected[]; files: File[] }> {
  const entries = Array.from(items)
    .map((i) => (i.kind === "file" ? i.webkitGetAsEntry() : null))
    .filter(Boolean) as FileSystemEntry[];
  const folders: Collected[] = [];
  const files: File[] = [];
  for (const entry of entries) {
    if (entry.isDirectory) {
      const out: Collected = { root: entry.name, files: [], git: new Map() };
      await walkEntry(entry as FileSystemDirectoryEntry, "", 0, out);
      folders.push(out);
    } else {
      files.push(await entryFile(entry as FileSystemFileEntry));
    }
  }
  return { folders, files };
}

/* -------------------------------------------------------------- analysis */

const REFLOG = /^([0-9a-f]{40,64}) ([0-9a-f]{40,64}) (.*?) <([^>]*)> (\d+) [+-]\d{4}\t(.*)$/;
const COMMIT_KIND = /^(commit(?: \((?:initial|amend|merge)\))?|cherry-pick|revert): (.*)$/;

/**
 * Every `commit`, `cherry-pick` and `revert` in the reflogs was made in this
 * clone by its owner, so these are the user's own commits. Pulls and rebases
 * are skipped — they replay other people's or already-seen work.
 */
export function parseReflog(
  text: string,
  meta: { repoId: string; repo: string; branch?: string },
  into: Map<string, Commit>,
) {
  for (const line of text.split(/\r?\n/)) {
    const m = REFLOG.exec(line);
    if (!m) continue;
    const kind = COMMIT_KIND.exec(m[6]);
    if (!kind) continue;
    const [, oldSha, sha, name, email, ts] = m;
    // An amend replaces the commit it was made on top of.
    if (kind[1] === "commit (amend)") into.delete(oldSha);
    if (into.has(sha)) continue;
    into.set(sha, {
      sha,
      repoId: meta.repoId,
      provider: "local",
      repo: meta.repo,
      message: kind[2].trim(),
      date: new Date(Number(ts) * 1000).toISOString(),
      url: "",
      authorLogin: name,
      authorEmail: email,
      branch: meta.branch,
    });
  }
}

/** git@github.com-work:o/r.git, https://u@bitbucket.org/o/r → { provider, path } */
export function parseRemote(url: string): { provider?: Repo["provider"]; path: string } | null {
  const trimmed = url.trim();
  const m =
    /^[\w.-]+@([^:]+):(.+?)(?:\.git)?\/?$/.exec(trimmed) ||
    /^(?:https?|ssh|git):\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+?)(?:\.git)?\/?$/.exec(trimmed);
  if (!m) return null;
  const host = m[1].toLowerCase();
  const provider = host.includes("github")
    ? "github"
    : host.includes("gitlab")
      ? "gitlab"
      : host.includes("bitbucket")
        ? "bitbucket"
        : undefined;
  return { provider, path: m[2] };
}

async function analyse(c: Collected, repos: Repo[]): Promise<FolderAttachment> {
  const readGit = async (p: string) => (await c.git.get(p)?.().catch(() => "")) ?? "";

  const head = await readGit("HEAD");
  const branch = /ref: refs\/heads\/(.+)/.exec(head)?.[1]?.trim();

  const config = await readGit("config");
  const remote = /\[remote "origin"\][^[]*?url\s*=\s*(.+)/.exec(config)?.[1]?.trim();
  const parsed = remote ? parseRemote(remote) : null;

  const matched = parsed
    ? repos.find(
        (r) =>
          r.fullName.toLowerCase() === parsed.path.toLowerCase() &&
          (!parsed.provider || r.provider === parsed.provider),
      )
    : undefined;
  const repoId =
    matched?.id ?? (parsed?.provider ? `${parsed.provider}:${parsed.path}` : `local:${c.root}`);
  const repoName = matched?.fullName ?? parsed?.path ?? c.root;

  const commits = new Map<string, Commit>();
  const logs = Array.from(c.git.keys()).filter((k) => k.startsWith("logs/"));
  // HEAD first: its entries carry the richest messages; branch logs fill in the rest.
  logs.sort((a, b) => (a === "logs/HEAD" ? -1 : b === "logs/HEAD" ? 1 : a.localeCompare(b)));
  for (const log of logs) {
    if (log.startsWith("logs/refs/remotes/") || log.startsWith("logs/refs/stash")) continue;
    const b = log.startsWith("logs/refs/heads/") ? log.slice("logs/refs/heads/".length) : branch;
    parseReflog(await readGit(log), { repoId, repo: repoName, branch: b }, commits);
  }

  const find = (re: RegExp) => c.files.find((f) => !f.path.includes("/") && re.test(f.path));
  let manifest: string | undefined;
  const pkg = find(/^package\.json$/i);
  if (pkg) {
    try {
      const j = JSON.parse(await pkg.read()) as { name?: string; description?: string };
      manifest = [j.name, j.description].filter(Boolean).join(" — ") || undefined;
    } catch {
      /* not JSON we can use */
    }
  }
  if (!manifest) {
    const other = find(/^(pubspec\.ya?ml|pyproject\.toml|Cargo\.toml|composer\.json|pom\.xml)$/i);
    if (other) manifest = (await other.read()).slice(0, 300).replace(/\s+/g, " ").trim();
  }

  const readmeFile = find(/^readme(\.md|\.txt|\.rst)?$/i);
  const readme = readmeFile
    ? (await readmeFile.read()).replace(/\s+/g, " ").trim().slice(0, 1500)
    : undefined;

  const files = c.files
    .filter((f) => !/(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|\.DS_Store)$/.test(f.path))
    .sort((a, b) => b.modified - a.modified)
    .slice(0, 1500)
    .map((f) => ({ path: f.path, modified: f.modified }));

  return {
    kind: "folder",
    id: uid(),
    name: c.root,
    fileCount: c.files.length,
    commits: Array.from(commits.values()).sort((a, b) => a.date.localeCompare(b.date)),
    remote,
    branch,
    matchedRepoId: matched?.id,
    manifest,
    readme,
    files,
  };
}

export async function toAttachments(
  collected: { folders: Collected[]; files: File[] },
  repos: Repo[],
): Promise<{ attachments: Attachment[]; rejected: string[] }> {
  const attachments: Attachment[] = [];
  const rejected: string[] = [];
  for (const f of collected.folders) attachments.push(await analyse(f, repos));
  for (const file of collected.files) {
    if (!TEXT_EXT.test(file.name) || file.size > 2_000_000) {
      rejected.push(file.name);
      continue;
    }
    const text = (await file.text()).slice(0, 40_000);
    attachments.push({ kind: "file", id: uid(), name: file.name, size: file.size, text } satisfies FileAttachment);
  }
  return { attachments, rejected };
}

/** Every commit carried by attached folders, deduped by sha. */
export function attachmentCommits(attachments: Attachment[]): Commit[] {
  const seen = new Map<string, Commit>();
  for (const a of attachments) {
    if (a.kind === "folder") a.commits.forEach((c) => seen.set(c.sha, c));
  }
  return Array.from(seen.values());
}

/** The compact, AI-facing description of everything attached, scoped to a window. */
export function describeAttachments(attachments: Attachment[], from: string, to: string): string {
  const parts: string[] = [];
  for (const a of attachments) {
    if (a.kind === "folder") {
      const lines = [
        `FOLDER "${a.name}"${a.remote ? ` (remote ${a.remote})` : ""}${a.branch ? `, branch ${a.branch}` : ""}`,
      ];
      if (a.manifest) lines.push(`About: ${a.manifest}`);
      if (a.readme) lines.push(`README: ${a.readme.slice(0, 700)}`);
      const byDay = new Map<string, string[]>();
      for (const f of a.files) {
        const key = toKey(new Date(f.modified));
        if (key < from || key > to) continue;
        const list = byDay.get(key) ?? [];
        if (list.length < 12) list.push(f.path);
        byDay.set(key, list);
      }
      if (byDay.size) {
        lines.push("Files last edited on each day (only each file's latest edit is known):");
        Array.from(byDay.keys())
          .sort()
          .forEach((k) => lines.push(`- ${k}: ${byDay.get(k)!.join(", ")}`));
      }
      parts.push(lines.join("\n"));
    } else {
      parts.push(`FILE "${a.name}":\n${a.text.slice(0, 6000)}`);
    }
  }
  return parts.join("\n\n").slice(0, 14_000);
}
