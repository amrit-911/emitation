"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  KeyRound,
  Loader2,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import {
  Badge,
  BitbucketMark,
  Button,
  Drawer,
  GithubMark,
  GitlabMark,
  Input,
  Label,
  Textarea,
  Toggle,
  cx,
} from "./ui";
import type { EmitProfile, Repo, RepoProvider, Settings } from "@/lib/types";
import { parseProfile } from "@/lib/emit";
import { DEFAULT_PROFILE_JSON } from "@/lib/default-profile";

type Tab = "emit" | "github" | "gitlab" | "bitbucket";

export function SettingsDrawer({
  open,
  onClose,
  settings,
  patch,
  profileError,
  repos,
  onReposLoaded,
  notify,
}: {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  patch: (p: Partial<Settings>) => void;
  profile?: EmitProfile;
  profileError?: string;
  repos: Repo[];
  onReposLoaded: (repos: Repo[], provider: RepoProvider, login: string) => void;
  notify: (tone: "ok" | "err" | "info", message: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("emit");
  const [fetchingProfile, setFetchingProfile] = useState(false);
  const [loadingGithub, setLoadingGithub] = useState(false);
  const [loadingGitlab, setLoadingGitlab] = useState(false);

  async function fetchProfile() {
    setFetchingProfile(true);
    try {
      const res = await fetch("/api/emit/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token: settings.token,
          cookie: settings.cookie,
          url: settings.profileUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      patch({ profileJson: JSON.stringify(data.profile, null, 2) });
      notify("ok", "Profile fetched");
    } catch (err) {
      notify("err", `Profile fetch failed: ${(err as Error).message}`);
    } finally {
      setFetchingProfile(false);
    }
  }

  async function loadGithubRepos() {
    setLoadingGithub(true);
    try {
      const res = await fetch("/api/github/repos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: settings.githubToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      onReposLoaded(data.repos as Repo[], "github", data.login as string);
      if (!settings.githubUser) patch({ githubUser: data.login });
      notify("ok", `Loaded ${data.repos.length} GitHub repos for @${data.login}`);
    } catch (err) {
      notify("err", `GitHub: ${(err as Error).message}`);
    } finally {
      setLoadingGithub(false);
    }
  }

  async function loadGitlabRepos() {
    setLoadingGitlab(true);
    try {
      const res = await fetch("/api/gitlab/repos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: settings.gitlabToken, baseUrl: settings.gitlabBaseUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      onReposLoaded(data.repos as Repo[], "gitlab", data.login as string);
      if (!settings.gitlabUser) patch({ gitlabUser: data.login });
      notify("ok", `Loaded ${data.repos.length} GitLab projects for @${data.login}`);
    } catch (err) {
      notify("err", `GitLab: ${(err as Error).message}`);
    } finally {
      setLoadingGitlab(false);
    }
  }

  const parsed = parseProfile(settings.profileJson);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Connections"
      subtitle="Everything here stays in this browser's localStorage. Nothing is persisted server-side."
      footer={
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <ShieldCheck className="size-3.5" /> Stored locally on this machine
          </p>
          <Button variant="primary" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      }
    >
      <div className="mb-5 flex gap-1 rounded-xl border border-white/8 bg-ink-850 p-1">
        {(
          [
            { id: "emit", label: "Emit", icon: <KeyRound className="size-3.5" /> },
            { id: "github", label: "GitHub", icon: <GithubMark className="size-3.5" /> },
            { id: "gitlab", label: "GitLab", icon: <GitlabMark className="size-3.5" /> },
            { id: "bitbucket", label: "Bitbucket", icon: <BitbucketMark className="size-3.5" /> },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cx(
              "flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium transition",
              tab === t.id ? "bg-brand-600 text-white" : "text-slate-400 hover:text-slate-200",
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === "emit" ? (
        <div className="space-y-5">
          <div>
            <Label htmlFor="token">Token header</Label>
            <Textarea
              id="token"
              rows={4}
              spellCheck={false}
              value={settings.token}
              onChange={(e) => patch({ token: e.target.value.trim() })}
              placeholder="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
              className="font-mono text-[11px]"
            />
            <p className="mt-1.5 text-xs text-slate-500">
              DevTools &rarr; Network &rarr; any api.emit.work call &rarr; Request Headers &rarr;{" "}
              <code>token</code>.
            </p>
          </div>

          <div>
            <Label htmlFor="cookie">Cookie header (optional)</Label>
            <Input
              id="cookie"
              spellCheck={false}
              value={settings.cookie}
              onChange={(e) => patch({ cookie: e.target.value })}
              placeholder="only needed if your instance also checks cookies"
              className="font-mono text-[11px]"
            />
          </div>

          <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-slate-200">Profile JSON</p>
                <p className="text-xs text-slate-500">
                  Supplies the team, projects and activity tags. A bundled copy is preloaded; paste a
                  fresh <code>get_profile</code> response to replace it.
                </p>
              </div>
              {parsed.profile ? (
                <Badge tone="green">
                  <CheckCircle2 className="size-3" /> valid
                </Badge>
              ) : settings.profileJson ? (
                <Badge tone="rose">
                  <AlertTriangle className="size-3" /> invalid
                </Badge>
              ) : null}
            </div>

            <Textarea
              rows={7}
              spellCheck={false}
              value={settings.profileJson}
              onChange={(e) => patch({ profileJson: e.target.value })}
              placeholder='{ "_id": "...", "activeTeam": { ... } }'
              className="font-mono text-[11px]"
            />

            {(parsed.error || profileError) && settings.profileJson && (
              <p className="mt-2 text-xs text-rose-300">{parsed.error || profileError}</p>
            )}

            {settings.profileJson !== DEFAULT_PROFILE_JSON && (
              <button
                type="button"
                onClick={() => patch({ profileJson: DEFAULT_PROFILE_JSON })}
                className="mt-2 inline-flex items-center gap-1.5 text-xs text-brand-300 hover:underline"
              >
                <RotateCcw className="size-3" /> Restore bundled profile
              </button>
            )}

            {parsed.profile && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <Badge tone="brand">{parsed.profile.activeTeam.name}</Badge>
                <span>{parsed.profile.email}</span>
                <span className="text-slate-600">&middot;</span>
                <span>
                  {parsed.profile.activeTeam.categorySets
                    .map((c) => `${c.tags.length} ${c.name.toLowerCase()}`)
                    .join(", ")}
                </span>
              </div>
            )}

            <div className="mt-4 border-t border-white/8 pt-3">
              <Label htmlFor="profileUrl">Auto-fetch URL (optional)</Label>
              <div className="flex gap-2">
                <Input
                  id="profileUrl"
                  spellCheck={false}
                  value={settings.profileUrl}
                  onChange={(e) => patch({ profileUrl: e.target.value })}
                  placeholder="https://api.emit.work/.../profile"
                  className="font-mono text-[11px]"
                />
                <Button
                  size="md"
                  onClick={fetchProfile}
                  disabled={!settings.token || !settings.profileUrl || fetchingProfile}
                >
                  {fetchingProfile ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Download className="size-4" />
                  )}
                  Fetch
                </Button>
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                Copy the profile request URL from DevTools to refresh it in one click next time.
              </p>
            </div>
          </div>
        </div>
      ) : tab === "github" ? (
        <div className="space-y-5">
          <div>
            <Label htmlFor="ghToken">Personal access token</Label>
            <div className="flex gap-2">
              <Input
                id="ghToken"
                type="password"
                spellCheck={false}
                value={settings.githubToken}
                onChange={(e) => patch({ githubToken: e.target.value.trim() })}
                placeholder="ghp_... (repo scope for private repos)"
                className="font-mono text-[11px]"
              />
              <Button onClick={loadGithubRepos} disabled={!settings.githubToken || loadingGithub}>
                {loadingGithub ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <GithubMark className="size-4" />
                )}
                Load repos
              </Button>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              Classic token with <code>repo</code> scope, or a fine-grained token with read access to
              Contents + Metadata.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ghUser">GitHub username</Label>
              <Input
                id="ghUser"
                value={settings.githubUser}
                onChange={(e) => patch({ githubUser: e.target.value.trim() })}
                placeholder="octocat"
              />
            </div>
            <div>
              <Label htmlFor="ghEmails">Other commit emails</Label>
              <Input
                id="ghEmails"
                value={settings.githubEmails}
                onChange={(e) => patch({ githubEmails: e.target.value })}
                placeholder="me@work.com, me@home.com"
              />
            </div>
          </div>
          <p className="-mt-2 text-xs text-slate-500">
            Leave both blank to pull every commit in the selected repos.
          </p>

          <div className="rounded-xl border border-white/8 bg-white/2 px-3 py-2">
            <Toggle
              checked={settings.scanAllBranches}
              onChange={(v) => patch({ scanAllBranches: v })}
              label="Scan all branches"
              hint="Slower, but catches work that never hit the default branch."
            />
          </div>

          {repos.some((r) => r.provider === "github") && (
            <p className="text-xs text-slate-500">
              {repos.filter((r) => r.provider === "github").length} repos available. Pick and map
              them on the main screen.
            </p>
          )}
        </div>
      ) : tab === "gitlab" ? (
        <div className="space-y-5">
          <div>
            <Label htmlFor="glBaseUrl">Instance URL</Label>
            <Input
              id="glBaseUrl"
              spellCheck={false}
              value={settings.gitlabBaseUrl}
              onChange={(e) => patch({ gitlabBaseUrl: e.target.value.trim() })}
              placeholder="https://gitlab.com"
              className="font-mono text-[11px]"
            />
            <p className="mt-1.5 text-xs text-slate-500">
              Leave as-is for gitlab.com, or point it at your self-hosted instance.
            </p>
          </div>

          <div>
            <Label htmlFor="glToken">Personal access token</Label>
            <div className="flex gap-2">
              <Input
                id="glToken"
                type="password"
                spellCheck={false}
                value={settings.gitlabToken}
                onChange={(e) => patch({ gitlabToken: e.target.value.trim() })}
                placeholder="glpat-..."
                className="font-mono text-[11px]"
              />
              <Button onClick={loadGitlabRepos} disabled={!settings.gitlabToken || loadingGitlab}>
                {loadingGitlab ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <GitlabMark className="size-4" />
                )}
                Load repos
              </Button>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              User Settings &rarr; Access Tokens &rarr; scope <code>read_api</code>. GitLab has no
              fine-grained repo scope like GitHub's Contents-only.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="glUser">GitLab username</Label>
              <Input
                id="glUser"
                value={settings.gitlabUser}
                onChange={(e) => patch({ gitlabUser: e.target.value.trim() })}
                placeholder="octocat"
              />
            </div>
            <div>
              <Label htmlFor="glEmails">Commit emails</Label>
              <Input
                id="glEmails"
                value={settings.gitlabEmails}
                onChange={(e) => patch({ gitlabEmails: e.target.value })}
                placeholder="me@work.com, me@home.com"
              />
            </div>
          </div>
          <p className="-mt-2 text-xs text-slate-500">
            GitLab's commits API has no username filter — leave emails blank to pull every commit in
            the selected projects, or list yours to filter.
          </p>

          <div className="rounded-xl border border-white/8 bg-white/2 px-3 py-2">
            <Toggle
              checked={settings.scanAllBranches}
              onChange={(v) => patch({ scanAllBranches: v })}
              label="Scan all branches"
              hint="Shared with GitHub — slower, but catches work off the default branch."
            />
          </div>

          {repos.some((r) => r.provider === "gitlab") && (
            <p className="text-xs text-slate-500">
              {repos.filter((r) => r.provider === "gitlab").length} projects available. Pick and map
              them on the main screen.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/10 px-6 py-12 text-center">
          <BitbucketMark className="size-8 text-slate-600" />
          <div>
            <p className="text-sm font-medium text-slate-300">Coming soon</p>
            <p className="mt-1 text-xs text-slate-500">
              Bitbucket repos aren&rsquo;t wired up yet — GitHub and GitLab work today.
            </p>
          </div>
          <Badge tone="slate">
            <Clock className="size-3" /> not yet available
          </Badge>
        </div>
      )}
    </Drawer>
  );
}
