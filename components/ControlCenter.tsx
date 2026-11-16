"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  CodeXml,
  Download,
  FlaskConical,
  GitBranch,
  KeyRound,
  Palette,
  Pin,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  Badge,
  BitbucketMark,
  Button,
  GithubMark,
  GitlabMark,
  Input,
  Label,
  Segmented,
  Sheet,
  Switch,
  TagPicker,
  Textarea,
  Toggle,
  cx,
  spring,
} from "./ui";
import { RepoPicker } from "./RepoPicker";
import { ACCENTS, ROLE_LIST, roleOf } from "@/lib/roles";
import { parseProfile } from "@/lib/emit";
import { DEFAULT_PROFILE_JSON } from "@/lib/default-profile";
import type { EmitProfile, Repo, RepoMapping, RepoProvider, Role, Settings } from "@/lib/types";

export type CenterTab = "sources" | "defaults" | "connections" | "look";
type Conn = "emit" | "github" | "gitlab" | "bitbucket";

const ROLE_ICON: Record<Role, ReactNode> = {
  developer: <CodeXml className="size-4" />,
  tester: <FlaskConical className="size-4" />,
  ba: <ClipboardList className="size-4" />,
};

export function ControlCenter({
  open,
  tab,
  onTab,
  onClose,
  settings,
  patch,
  profileError,
  repos,
  onReposLoaded,
  notify,
  projects,
  activities,
  onReplayTutorial,
}: {
  open: boolean;
  tab: CenterTab;
  onTab: (t: CenterTab) => void;
  onClose: () => void;
  settings: Settings;
  patch: (p: Partial<Settings>) => void;
  profile?: EmitProfile;
  profileError?: string;
  repos: Repo[];
  onReposLoaded: (repos: Repo[], provider: RepoProvider) => void;
  notify: (tone: "ok" | "err" | "info", message: string) => void;
  projects: string[];
  activities: string[];
  onReplayTutorial: () => void;
}) {
  const role = roleOf(settings.role);
  const [conn, setConn] = useState<Conn>("emit");

  // Code-first roles see Sources first; for everyone else repos sit at the end.
  const tabs: { id: CenterTab; label: string; icon: ReactNode }[] = role.codeFirst
    ? [
        { id: "sources", label: "Sources", icon: <GitBranch className="size-3.5" /> },
        { id: "defaults", label: "Defaults", icon: <SlidersHorizontal className="size-3.5" /> },
        { id: "connections", label: "Connect", icon: <KeyRound className="size-3.5" /> },
        { id: "look", label: "Look", icon: <Palette className="size-3.5" /> },
      ]
    : [
        { id: "defaults", label: "Defaults", icon: <SlidersHorizontal className="size-3.5" /> },
        { id: "connections", label: "Connect", icon: <KeyRound className="size-3.5" /> },
        { id: "look", label: "Look", icon: <Palette className="size-3.5" /> },
        { id: "sources", label: "Repos", icon: <GitBranch className="size-3.5" /> },
      ];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Control Center"
      subtitle="Everything is saved in this browser only."
      header={<Segmented value={tab} onChange={onTab} options={tabs} />}
      footer={
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-xs text-label-3">
            <ShieldCheck className="size-3.5" /> Tokens never leave this machine except to their own API
          </p>
          <Button variant="primary" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -6, filter: "blur(6px)" }}
          transition={spring.snappy}
        >
          {tab === "sources" && (
            <Sources
              settings={settings}
              patch={patch}
              repos={repos}
              projects={projects}
              activities={activities}
              optional={!role.codeFirst}
              onConnect={() => {
                onTab("connections");
                setConn("github");
              }}
            />
          )}
          {tab === "defaults" && (
            <Defaults settings={settings} patch={patch} projects={projects} activities={activities} codeFirst={role.codeFirst} />
          )}
          {tab === "connections" && (
            <Connections
              conn={conn}
              setConn={setConn}
              settings={settings}
              patch={patch}
              profileError={profileError}
              repos={repos}
              onReposLoaded={onReposLoaded}
              notify={notify}
              codeFirst={role.codeFirst}
            />
          )}
          {tab === "look" && <Look settings={settings} patch={patch} onReplayTutorial={onReplayTutorial} />}
        </motion.div>
      </AnimatePresence>
    </Sheet>
  );
}

/* ---------------------------------------------------------------- groups */

function Group({ title, hint, children }: { title?: string; hint?: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      {title && (
        <div className="mb-2 px-1">
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-label-3">{title}</h4>
          {hint && <p className="mt-0.5 text-xs text-label-4">{hint}</p>}
        </div>
      )}
      <div className="rounded-[20px] border border-white/[0.07] bg-white/[0.025] px-4 py-2">{children}</div>
    </section>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="mt-1.5 text-xs leading-relaxed text-label-3">{children}</p>;
}

/* --------------------------------------------------------------- sources */

function Sources({
  settings,
  patch,
  repos,
  projects,
  activities,
  optional,
  onConnect,
}: {
  settings: Settings;
  patch: (p: Partial<Settings>) => void;
  repos: Repo[];
  projects: string[];
  activities: string[];
  optional: boolean;
  onConnect: () => void;
}) {
  return (
    <div>
      {optional && (
        <p className="mb-4 rounded-[16px] border border-white/[0.07] bg-white/[0.03] px-4 py-3 text-xs leading-relaxed text-label-3">
          Optional for your role — only needed if you want entries built from commits. Attaching a folder to the
          prompt works without any of this.
        </p>
      )}
      <RepoPicker
        repos={repos}
        selected={settings.selectedRepos}
        repoMap={settings.repoMap}
        projects={projects}
        activities={activities}
        onToggle={(id, on) =>
          patch({
            selectedRepos: on ? [...settings.selectedRepos, id] : settings.selectedRepos.filter((r) => r !== id),
          })
        }
        onSelectMany={(ids, on) =>
          patch({
            selectedRepos: on
              ? Array.from(new Set([...settings.selectedRepos, ...ids]))
              : settings.selectedRepos.filter((r) => !ids.includes(r)),
          })
        }
        onMap={(id, mapping: Partial<RepoMapping>) =>
          patch({
            repoMap: {
              ...settings.repoMap,
              [id]: { ...(settings.repoMap[id] ?? { project: "", activity: "" }), ...mapping },
            },
          })
        }
      />
      {!repos.length && (
        <div className="mt-3 flex justify-center">
          <Button size="sm" onClick={onConnect}>
            <KeyRound className="size-3.5" /> Add a code host
          </Button>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- defaults */

function Defaults({
  settings,
  patch,
  projects,
  activities,
  codeFirst,
}: {
  settings: Settings;
  patch: (p: Partial<Settings>) => void;
  projects: string[];
  activities: string[];
  codeFirst: boolean;
}) {
  return (
    <div>
      <p className="mb-5 px-1 text-xs leading-relaxed text-label-3">
        What a prompt starts from. Anything you say in the prompt — &ldquo;6 hours a day&rdquo;, &ldquo;include
        Saturday&rdquo;, &ldquo;don&rsquo;t spread&rdquo; — wins for that run.
      </p>

      <Group title="Days">
        <div className="flex items-center justify-between gap-4 py-2">
          <div>
            <p className="text-[13px] text-label">Hours per day</p>
            <p className="mt-0.5 text-xs text-label-3">The target each day is filled up to</p>
          </div>
          <Input
            type="number"
            min={0.25}
            max={24}
            step={0.25}
            value={settings.hoursPerDay}
            onChange={(e) => patch({ hoursPerDay: Number(e.target.value) || 8 })}
            className="h-9 w-20 text-center"
          />
        </div>
        <Divider />
        <Toggle
          checked={settings.weekend.saturday}
          onChange={(v) => patch({ weekend: { ...settings.weekend, saturday: v } })}
          label="Fill Saturdays"
        />
        <Divider />
        <Toggle
          checked={settings.weekend.sunday}
          onChange={(v) => patch({ weekend: { ...settings.weekend, sunday: v } })}
          label="Fill Sundays"
        />
      </Group>

      <Group title="Tags" hint="Used when nothing else decides — unmapped repos, or the AI can't tell">
        <div className="grid grid-cols-2 gap-3 py-2.5">
          <div>
            <Label>Default project</Label>
            <TagPicker
              value={settings.fallbackProject}
              options={projects}
              onChange={(v) => patch({ fallbackProject: v })}
              placeholder="#project"
            />
          </div>
          <div>
            <Label>Default activity</Label>
            <TagPicker
              value={settings.fallbackActivity}
              options={activities}
              tone="cyan"
              onChange={(v) => patch({ fallbackActivity: v })}
              placeholder="#activity"
            />
          </div>
        </div>
      </Group>

      {codeFirst && (
        <Group title="Commits">
          <Toggle
            checked={settings.spreadCommits}
            onChange={(v) => patch({ spreadCommits: v })}
            label="Spread bursts into empty days"
            hint="Committed once after a few quiet days? Those commits get shared back across them."
          />
          <AnimatePresence initial={false}>
            {settings.spreadCommits && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="flex items-center justify-between gap-3 pb-2.5 pt-1">
                  <span className="text-xs text-label-3">Look back up to</span>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={14}
                      value={settings.spreadMaxDays}
                      onChange={(e) => patch({ spreadMaxDays: Math.max(1, Number(e.target.value) || 3) })}
                      className="h-8 w-16 text-center text-xs"
                    />
                    <span className="text-xs text-label-3">days</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <Divider />
          <Toggle
            checked={settings.scanAllBranches}
            onChange={(v) => patch({ scanAllBranches: v })}
            label="Scan all branches"
            hint="Slower, but catches work that never reached the default branch"
          />
        </Group>
      )}

      <Group title="Writing style" hint="Standing guidance for every entry the AI writes">
        <Textarea
          rows={3}
          value={settings.aiPrompt}
          onChange={(e) => patch({ aiPrompt: e.target.value })}
          placeholder="e.g. concrete and specific, lowercase start, no fluff"
          className="my-2.5 border-white/[0.06] text-xs"
        />
      </Group>
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-white/[0.06]" />;
}

/* ----------------------------------------------------------- connections */

function Connections({
  conn,
  setConn,
  settings,
  patch,
  profileError,
  repos,
  onReposLoaded,
  notify,
  codeFirst,
}: {
  conn: Conn;
  setConn: (c: Conn) => void;
  settings: Settings;
  patch: (p: Partial<Settings>) => void;
  profileError?: string;
  repos: Repo[];
  onReposLoaded: (repos: Repo[], provider: RepoProvider) => void;
  notify: (tone: "ok" | "err" | "info", message: string) => void;
  codeFirst: boolean;
}) {
  const [busy, setBusy] = useState<Conn | "profile" | null>(null);
  const parsed = parseProfile(settings.profileJson);

  async function call<T>(url: string, body: unknown): Promise<T> {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed");
    return data as T;
  }

  async function fetchProfile() {
    setBusy("profile");
    try {
      const data = await call<{ profile: unknown }>("/api/emit/profile", {
        token: settings.token,
        cookie: settings.cookie,
        url: settings.profileUrl,
      });
      patch({ profileJson: JSON.stringify(data.profile, null, 2) });
      notify("ok", "Profile fetched");
    } catch (err) {
      notify("err", `Profile fetch failed: ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function loadRepos(provider: RepoProvider) {
    setBusy(provider);
    try {
      if (provider === "github") {
        const data = await call<{ repos: Repo[]; login: string }>("/api/github/repos", { token: settings.githubToken });
        onReposLoaded(data.repos, "github");
        if (!settings.githubUser) patch({ githubUser: data.login });
        notify("ok", `Loaded ${data.repos.length} GitHub repos for @${data.login}`);
      } else if (provider === "gitlab") {
        const data = await call<{ repos: Repo[]; login: string }>("/api/gitlab/repos", {
          token: settings.gitlabToken,
          baseUrl: settings.gitlabBaseUrl,
        });
        onReposLoaded(data.repos, "gitlab");
        if (!settings.gitlabUser) patch({ gitlabUser: data.login });
        notify("ok", `Loaded ${data.repos.length} GitLab projects for @${data.login}`);
      } else {
        const data = await call<{ repos: Repo[]; login?: string; accountId?: string; warnings?: string[] }>(
          "/api/bitbucket/repos",
          {
            token: settings.bitbucketToken,
            authEmail: settings.bitbucketAuthEmail,
            workspaces: settings.bitbucketWorkspaces,
          },
        );
        onReposLoaded(data.repos, "bitbucket");
        // Always refresh: the account id is the commit filter key and nobody can type it.
        if (data.accountId) patch({ bitbucketAccountId: data.accountId });
        const warnings = data.warnings ?? [];
        notify(
          warnings.length ? "err" : "ok",
          `Loaded ${data.repos.length} Bitbucket repos${data.login ? ` for @${data.login}` : ""}` +
            (warnings.length ? ` — ${warnings.join(" | ")}` : ""),
        );
      }
    } catch (err) {
      notify("err", `${provider}: ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  const count = (p: RepoProvider) => repos.filter((r) => r.provider === p).length;
  const dot = (ok: boolean) => (
    <span className={cx("size-1.5 rounded-full", ok ? "bg-emerald-400 shadow-[0_0_6px_#34d399]" : "bg-white/25")} />
  );

  return (
    <div>
      <Segmented
        size="sm"
        className="mb-5"
        value={conn}
        onChange={setConn}
        options={[
          { id: "emit", label: "Emit", icon: dot(Boolean(settings.token && parsed.profile)) },
          { id: "github", label: "GitHub", icon: <GithubMark className="size-3" /> },
          { id: "gitlab", label: "GitLab", icon: <GitlabMark className="size-3" /> },
          { id: "bitbucket", label: "Bitbucket", icon: <BitbucketMark className="size-3" /> },
        ]}
      />

      {!codeFirst && conn !== "emit" && (
        <p className="mb-4 rounded-[16px] border border-white/[0.07] bg-white/[0.03] px-4 py-3 text-xs leading-relaxed text-label-3">
          Code hosts are optional for your role. Skip this unless you want entries built from commits.
        </p>
      )}

      {conn === "emit" && (
        <div className="space-y-5">
          <div>
            <Label htmlFor="token">Token header</Label>
            <Textarea
              id="token"
              rows={3}
              spellCheck={false}
              value={settings.token}
              onChange={(e) => patch({ token: e.target.value.trim() })}
              placeholder="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9…"
              className="font-mono text-[11px]"
            />
            <Hint>
              DevTools → Network → any api.emit.work call → Request Headers → <code>token</code>.
            </Hint>
          </div>

          <div>
            <Label htmlFor="cookie">Cookie header (optional)</Label>
            <Input
              id="cookie"
              spellCheck={false}
              value={settings.cookie}
              onChange={(e) => patch({ cookie: e.target.value })}
              placeholder="only if your instance also checks cookies"
              className="font-mono text-[11px]"
            />
          </div>

          <div className="rounded-[20px] border border-white/[0.07] bg-white/[0.025] p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-[13px] font-medium text-label">Profile JSON</p>
                <p className="mt-0.5 text-xs leading-relaxed text-label-3">
                  Supplies your team, projects and activity tags. A bundled copy is preloaded; paste a fresh{" "}
                  <code>get_profile</code> response to replace it.
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
              rows={6}
              spellCheck={false}
              value={settings.profileJson}
              onChange={(e) => patch({ profileJson: e.target.value })}
              placeholder='{ "_id": "…", "activeTeam": { … } }'
              className="font-mono text-[11px]"
            />
            {(parsed.error || profileError) && settings.profileJson && (
              <p className="mt-2 text-xs text-rose-300">{parsed.error || profileError}</p>
            )}
            {settings.profileJson !== DEFAULT_PROFILE_JSON && (
              <button
                type="button"
                onClick={() => patch({ profileJson: DEFAULT_PROFILE_JSON })}
                className="mt-2 inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
              >
                <RotateCcw className="size-3" /> Restore bundled profile
              </button>
            )}
            {parsed.profile && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-label-3">
                <Badge tone="accent">{parsed.profile.activeTeam.name}</Badge>
                <span>
                  {parsed.profile.activeTeam.categorySets
                    .map((c) => `${c.tags.length} ${c.name.toLowerCase()}`)
                    .join(" · ")}
                </span>
              </div>
            )}
            <div className="mt-4 border-t border-white/[0.07] pt-3">
              <Label htmlFor="profileUrl">Auto-fetch URL (optional)</Label>
              <div className="flex gap-2">
                <Input
                  id="profileUrl"
                  spellCheck={false}
                  value={settings.profileUrl}
                  onChange={(e) => patch({ profileUrl: e.target.value })}
                  placeholder="https://api.emit.work/…/profile"
                  className="font-mono text-[11px]"
                />
                <Button
                  onClick={fetchProfile}
                  loading={busy === "profile"}
                  disabled={!settings.token || !settings.profileUrl}
                >
                  {busy !== "profile" && <Download className="size-4" />}
                  Fetch
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {conn === "github" && (
        <div className="space-y-5">
          <TokenRow
            id="ghToken"
            label="Personal access token"
            value={settings.githubToken}
            onChange={(v) => patch({ githubToken: v })}
            placeholder="ghp_… (repo scope for private repos)"
            onLoad={() => loadRepos("github")}
            loading={busy === "github"}
            mark={<GithubMark className="size-4" />}
          />
          <Hint>
            Classic token with <code>repo</code> scope, or fine-grained with Contents + Metadata read.
          </Hint>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ghUser">Username</Label>
              <Input id="ghUser" value={settings.githubUser} onChange={(e) => patch({ githubUser: e.target.value.trim() })} placeholder="octocat" />
            </div>
            <div>
              <Label htmlFor="ghEmails">Other commit emails</Label>
              <Input id="ghEmails" value={settings.githubEmails} onChange={(e) => patch({ githubEmails: e.target.value })} placeholder="me@work.com, me@home.com" />
            </div>
          </div>
          <Hint>Leave both blank to pull every commit in the selected repos.</Hint>
          {count("github") > 0 && <Loaded n={count("github")} what="repos" />}
        </div>
      )}

      {conn === "gitlab" && (
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
            <Hint>Leave as-is for gitlab.com, or point it at your self-hosted instance.</Hint>
          </div>
          <TokenRow
            id="glToken"
            label="Personal access token"
            value={settings.gitlabToken}
            onChange={(v) => patch({ gitlabToken: v })}
            placeholder="glpat-…"
            onLoad={() => loadRepos("gitlab")}
            loading={busy === "gitlab"}
            mark={<GitlabMark className="size-4" />}
          />
          <Hint>
            User Settings → Access Tokens → scope <code>read_api</code>.
          </Hint>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="glUser">Username</Label>
              <Input id="glUser" value={settings.gitlabUser} onChange={(e) => patch({ gitlabUser: e.target.value.trim() })} placeholder="octocat" />
            </div>
            <div>
              <Label htmlFor="glEmails">Commit emails</Label>
              <Input id="glEmails" value={settings.gitlabEmails} onChange={(e) => patch({ gitlabEmails: e.target.value })} placeholder="me@work.com" />
            </div>
          </div>
          <Hint>GitLab&rsquo;s commits API has no username filter — list your emails to filter, or leave blank for every commit.</Hint>
          {count("gitlab") > 0 && <Loaded n={count("gitlab")} what="projects" />}
        </div>
      )}

      {conn === "bitbucket" && (
        <div className="space-y-5">
          <div>
            <Label htmlFor="bbEmail">Atlassian account email</Label>
            <Input
              id="bbEmail"
              spellCheck={false}
              value={settings.bitbucketAuthEmail}
              onChange={(e) => patch({ bitbucketAuthEmail: e.target.value.trim() })}
              placeholder="you@example.com"
              className="font-mono text-[11px]"
            />
            <Hint>
              Paired with the API token for Basic auth. Leave blank only for a workspace or repository{" "}
              <em>access token</em>, which authenticates on its own.
            </Hint>
          </div>
          <TokenRow
            id="bbToken"
            label="API token"
            value={settings.bitbucketToken}
            onChange={(v) => patch({ bitbucketToken: v })}
            placeholder="ATATT…"
            onLoad={() => loadRepos("bitbucket")}
            loading={busy === "bitbucket"}
            mark={<BitbucketMark className="size-4" />}
          />
          <Hint>
            id.atlassian.com → Security → <strong>Create API token with scopes</strong>: <code>read:repository:bitbucket</code>,{" "}
            <code>read:workspace:bitbucket</code>, <code>read:account</code>. Unscoped tokens are rejected.
          </Hint>
          <div>
            <Label htmlFor="bbWorkspaces">Workspaces (optional)</Label>
            <Input
              id="bbWorkspaces"
              spellCheck={false}
              value={settings.bitbucketWorkspaces}
              onChange={(e) => patch({ bitbucketWorkspaces: e.target.value })}
              placeholder="my-workspace, other-workspace"
              className="font-mono text-[11px]"
            />
            <Hint>
              Discovered automatically when blank. Access tokens can&rsquo;t enumerate them — the slug is the first path
              segment of <code>bitbucket.org/<strong>workspace</strong>/repo</code>.
            </Hint>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="bbUser">Display name</Label>
              <Input id="bbUser" value={settings.bitbucketUser} onChange={(e) => patch({ bitbucketUser: e.target.value.trim() })} placeholder="Ada Lovelace" />
            </div>
            <div>
              <Label htmlFor="bbEmails">Commit emails</Label>
              <Input id="bbEmails" value={settings.bitbucketEmails} onChange={(e) => patch({ bitbucketEmails: e.target.value })} placeholder="me@work.com" />
            </div>
          </div>
          <Hint>
            Bitbucket has no author filter; your commits are recognised by account id once repos load. These two only
            widen that — commits carry a display name, never a username.
          </Hint>
          {count("bitbucket") > 0 && <Loaded n={count("bitbucket")} what="repos" />}
        </div>
      )}
    </div>
  );
}

function TokenRow({
  id,
  label,
  value,
  onChange,
  placeholder,
  onLoad,
  loading,
  mark,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  onLoad: () => void;
  loading: boolean;
  mark: ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          type="password"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
          placeholder={placeholder}
          className="font-mono text-[11px]"
        />
        <Button onClick={onLoad} loading={loading} disabled={!value}>
          {!loading && mark}
          Load repos
        </Button>
      </div>
    </div>
  );
}

function Loaded({ n, what }: { n: number; what: string }) {
  return (
    <p className="flex items-center gap-1.5 text-xs text-emerald-200/80">
      <CheckCircle2 className="size-3.5" /> {n} {what} loaded — pick them under Sources.
    </p>
  );
}

/* ------------------------------------------------------------------- look */

function Look({
  settings,
  patch,
  onReplayTutorial,
}: {
  settings: Settings;
  patch: (p: Partial<Settings>) => void;
  onReplayTutorial: () => void;
}) {
  const [justSet, setJustSet] = useState<string | null>(null);
  useEffect(() => {
    if (!justSet) return;
    const t = setTimeout(() => setJustSet(null), 900);
    return () => clearTimeout(t);
  }, [justSet]);

  return (
    <div>
      <Group title="I am a">
        <div className="grid grid-cols-3 gap-2 py-2.5">
          {ROLE_LIST.map((r) => {
            const on = settings.role === r.id;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => patch({ role: r.id })}
                className={cx(
                  "relative flex flex-col items-center gap-2 rounded-[16px] border px-2 py-3.5 text-xs font-medium transition-[background-color,border-color,color,transform] duration-300 active:scale-95",
                  on
                    ? "border-[color-mix(in_oklab,var(--accent)_45%,transparent)] bg-[color-mix(in_oklab,var(--accent)_12%,transparent)] text-label"
                    : "border-white/[0.07] text-label-3 hover:bg-white/[0.05] hover:text-label-2",
                )}
              >
                <span className={on ? "text-accent" : ""}>{ROLE_ICON[r.id]}</span>
                {r.label}
              </button>
            );
          })}
        </div>
      </Group>

      <Group title="Accent">
        <div className="flex items-center justify-between gap-2 py-3">
          {ACCENTS.map((a) => {
            const on = settings.accent === a.id;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  patch({ accent: a.id });
                  setJustSet(a.id);
                }}
                className="group flex flex-col items-center gap-1.5"
                aria-label={a.label}
              >
                <motion.span
                  animate={{ scale: on ? 1 : 0.86 }}
                  transition={spring.bouncy}
                  className={cx(
                    "relative block size-10 rounded-full ring-offset-2 ring-offset-[#14141c] transition-shadow duration-300",
                    on ? "ring-2 ring-white/80" : "group-hover:ring-1 group-hover:ring-white/30",
                  )}
                  style={{ background: a.swatch }}
                >
                  {justSet === a.id && (
                    <motion.span
                      initial={{ scale: 1, opacity: 0.7 }}
                      animate={{ scale: 2.2, opacity: 0 }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                      className="absolute inset-0 rounded-full"
                      style={{ background: a.swatch }}
                    />
                  )}
                </motion.span>
                <span className={cx("text-[10.5px]", on ? "text-label" : "text-label-3")}>{a.label}</span>
              </button>
            );
          })}
        </div>
      </Group>

      <Group title="Motion">
        <div className="flex items-center justify-between gap-4 py-2">
          <div>
            <p className="text-[13px] text-label">Reduce motion</p>
            <p className="mt-0.5 text-xs text-label-3">Keeps the glass, drops the animation</p>
          </div>
          <Switch checked={settings.reduceMotion} onChange={(v) => patch({ reduceMotion: v })} label="Reduce motion" />
        </div>
      </Group>

      <Group title="Pinned prompts" hint="Pin a prompt from the composer to keep it as a pill">
        {settings.savedPrompts.length === 0 ? (
          <p className="py-3 text-xs text-label-4">Nothing pinned yet.</p>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            <AnimatePresence initial={false}>
              {settings.savedPrompts.map((p) => (
                <motion.li
                  key={p}
                  layout
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-2 py-2.5"
                >
                  <Pin className="size-3.5 shrink-0 text-accent" />
                  <span className="min-w-0 flex-1 truncate text-xs text-label-2">{p}</span>
                  <button
                    type="button"
                    onClick={() => patch({ savedPrompts: settings.savedPrompts.filter((x) => x !== p) })}
                    className="grid size-6 place-items-center rounded-full text-label-4 hover:bg-white/10 hover:text-label"
                    aria-label="Unpin"
                  >
                    <X className="size-3" />
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </Group>

      <Button className="w-full" onClick={onReplayTutorial}>
        <RotateCcw className="size-3.5" /> Replay the tour
      </Button>
    </div>
  );
}
