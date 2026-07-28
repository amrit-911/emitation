"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Braces,
  CalendarRange,
  CheckCircle2,
  CloudUpload,
  GitCommitHorizontal,
  Layers,
  RefreshCw,
  Settings2,
  Sparkles,
  TriangleAlert,
  Wand2,
  Zap,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  GithubMark,
  GitlabMark,
  Input,
  Label,
  SectionTitle,
  TagPicker,
  Textarea,
  Toaster,
  Toggle,
  cx,
} from "@/components/ui";
import type { Toast } from "@/components/ui";
import { DayCard } from "@/components/DayCard";
import { RepoPicker } from "@/components/RepoPicker";
import { SettingsDrawer } from "@/components/SettingsDrawer";
import { useSettings } from "@/lib/storage";
import {
  activityTags,
  composeDescription,
  isDayCovered,
  parseProfile,
  projectTags,
  remainingHours,
  splitHours,
  validateEntry,
} from "@/lib/emit";
import {
  eachDay,
  formatHours,
  fromKey,
  isWeekend,
  keepDay,
  keyToEpoch,
  rangePreset,
  toKey,
  weekdayShort,
} from "@/lib/dates";
import type { Commit, Day, Entry, ExistingEntry, Repo, RepoProvider } from "@/lib/types";

type ExistingByDate = Map<string, { hours: number; entries: ExistingEntry[] }>;

const REPO_KEY = "emitation.repos.v2";

const uid = () => Math.random().toString(36).slice(2, 10);

export default function Home() {
  const { settings, patch, hydrated } = useSettings();

  const [repos, setRepos] = useState<Repo[]>([]);
  const [range, setRange] = useState(() => rangePreset("thisMonth"));
  const [days, setDays] = useState<Day[]>([]);
  const [dryRun, setDryRun] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState<null | "commits" | "existing" | "ai" | "push">(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const notify = useCallback((tone: Toast["tone"], message: string) => {
    const id = (toastId.current += 1);
    setToasts((t) => [...t, { id, tone, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(REPO_KEY);
      if (raw) setRepos(JSON.parse(raw) as Repo[]);
    } catch {
      /* ignore */
    }
  }, []);

  const persistRepos = useCallback((next: Repo[]) => {
    setRepos(next);
    localStorage.setItem(REPO_KEY, JSON.stringify(next));
  }, []);

  const { profile, error: profileError } = useMemo(
    () => parseProfile(settings.profileJson),
    [settings.profileJson],
  );

  const projects = useMemo(() => projectTags(profile), [profile]);
  const activities = useMemo(() => activityTags(profile), [profile]);
  const minWords = profile?.activeTeam?.activityMinWordCount ?? 2;
  const minTags = profile?.activeTeam?.activityMinUniqueTags ?? 2;
  const maxDelay = profile?.activeTeam?.activityMaxAddDelay ?? 0;

  const ready = Boolean(settings.token && profile);

  /* ------------------------------------------------------------ timeline */

  const entriesFromCommits = useCallback(
    (date: string, commits: Commit[], targetHours: number): Entry[] => {
      if (!commits.length || targetHours <= 0) return [];
      const groups = new Map<string, Commit[]>();
      for (const c of commits) {
        if (!groups.has(c.repoId)) groups.set(c.repoId, []);
        groups.get(c.repoId)!.push(c);
      }
      const repoIds = Array.from(groups.keys());
      const hours = splitHours(
        targetHours,
        repoIds.map((r) => groups.get(r)!.length),
      );

      return repoIds.map((repoId, i) => {
        const list = groups.get(repoId)!;
        const mapping = settings.repoMap[repoId];
        const headline = list
          .map((c) => c.message)
          .filter((m) => !/^merge (branch|pull request)/i.test(m))
          .slice(0, 3)
          .join("; ");
        return {
          id: uid(),
          date,
          text: headline || list[0].message,
          project: mapping?.project || settings.fallbackProject || "",
          activity: mapping?.activity || settings.fallbackActivity || "",
          hours: hours[i],
          source: "commits",
          commitShas: list.map((c) => c.sha),
          status: "idle",
        };
      });
    },
    [settings.repoMap, settings.fallbackProject, settings.fallbackActivity],
  );

  /**
   * Rebuilds the day list for the range. Passing `commits` reseeds every
   * entry; passing `existing` refreshes already-logged hours from Emit
   * without touching entries that haven't been pushed yet.
   */
  const buildTimeline = useCallback(
    (opts?: { commits?: Commit[]; existing?: ExistingByDate }) => {
      const { commits, existing } = opts ?? {};
      const keys = eachDay(range.from, range.to).filter((k) => keepDay(k, settings.weekend));
      const byDate = new Map<string, Commit[]>();
      for (const c of commits ?? []) {
        const key = toKey(new Date(c.date));
        if (!byDate.has(key)) byDate.set(key, []);
        byDate.get(key)!.push(c);
      }

      setDays((prev) => {
        const prevByDate = new Map(prev.map((d) => [d.date, d]));
        return keys.map((date) => {
          const old = prevByDate.get(date);
          const fresh = existing?.get(date);
          const existingHours = fresh?.hours ?? old?.existingHours ?? 0;
          const existingEntries = fresh?.entries ?? old?.existingEntries ?? [];

          if (!commits) {
            if (old) return { ...old, existingHours, existingEntries };
            return {
              date,
              isWeekend: isWeekend(date),
              enabled: true,
              commits: [],
              entries: [],
              existingHours,
              existingEntries,
            };
          }

          const dayCommits = byDate.get(date) ?? [];
          const target = remainingHours({ existingHours }, settings.hoursPerDay);
          return {
            date,
            isWeekend: isWeekend(date),
            enabled: old?.enabled ?? true,
            hint: old?.hint,
            commits: dayCommits,
            entries: entriesFromCommits(date, dayCommits, target),
            existingHours,
            existingEntries,
          };
        });
      });
    },
    [range.from, range.to, settings.weekend, settings.hoursPerDay, entriesFromCommits],
  );

  useEffect(() => {
    if (hydrated) buildTimeline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, range.from, range.to, settings.weekend.saturday, settings.weekend.sunday]);

  /** Sums list_activities into per-day totals, keyed the same way as commits. */
  const fetchExistingActivities = useCallback(async (): Promise<ExistingByDate> => {
    if (!settings.token || !profile) throw new Error("Add your Emit token and profile first");

    const since = fromKey(range.from);
    since.setHours(0, 0, 0, 0);
    const until = fromKey(range.to);
    until.setHours(23, 59, 59, 999);

    const res = await fetch("/api/emit/activities", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token: settings.token,
        cookie: settings.cookie,
        teamId: profile.activeTeam._id,
        fromISO: since.toISOString(),
        toISO: until.toISOString(),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to fetch existing activities");

    const map: ExistingByDate = new Map();
    for (const a of data.activities as {
      id: string;
      date: string;
      hours: number;
      description: string;
      tags: string[];
    }[]) {
      const key = toKey(new Date(a.date));
      const bucket = map.get(key) ?? { hours: 0, entries: [] };
      bucket.hours += a.hours;
      bucket.entries.push({ id: a.id, description: a.description, hours: a.hours, tags: a.tags });
      map.set(key, bucket);
    }
    return map;
  }, [settings.token, settings.cookie, profile, range.from, range.to]);

  async function refreshExisting() {
    setBusy("existing");
    try {
      const existing = await fetchExistingActivities();
      buildTimeline({ existing });
      notify("ok", "Refreshed already-logged hours from Emit");
    } catch (err) {
      notify("err", `Filled hours: ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  /* ------------------------------------------------------------- commits */

  async function fetchCommits() {
    const selected = repos.filter((r) => settings.selectedRepos.includes(r.id));
    const ghRepos = selected.filter((r) => r.provider === "github");
    const glRepos = selected.filter((r) => r.provider === "gitlab");

    if (!selected.length) return notify("err", "Pick at least one repo");
    if (ghRepos.length && !settings.githubToken) {
      return notify("err", "Add a GitHub token in Connections first");
    }
    if (glRepos.length && !settings.gitlabToken) {
      return notify("err", "Add a GitLab token in Connections first");
    }

    setBusy("commits");
    try {
      const since = fromKey(range.from);
      since.setHours(0, 0, 0, 0);
      const until = fromKey(range.to);
      until.setHours(23, 59, 59, 999);

      const jobs: Promise<{ commits: Commit[]; warnings?: string[]; error?: string }>[] = [];

      if (ghRepos.length) {
        const authors = [
          settings.githubUser,
          ...settings.githubEmails.split(",").map((e) => e.trim()),
        ].filter(Boolean);
        jobs.push(
          fetch("/api/github/commits", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              token: settings.githubToken,
              repos: ghRepos.map((r) => r.fullName),
              sinceISO: since.toISOString(),
              untilISO: until.toISOString(),
              authors,
              allBranches: settings.scanAllBranches,
            }),
          }).then((r) => r.json()),
        );
      }

      if (glRepos.length) {
        const authorEmails = settings.gitlabEmails.split(",").map((e) => e.trim()).filter(Boolean);
        jobs.push(
          fetch("/api/gitlab/commits", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              token: settings.gitlabToken,
              baseUrl: settings.gitlabBaseUrl,
              projects: glRepos.map((r) => ({ providerId: r.providerId, fullName: r.fullName })),
              sinceISO: since.toISOString(),
              untilISO: until.toISOString(),
              authorEmails,
              allBranches: settings.scanAllBranches,
            }),
          }).then((r) => r.json()),
        );
      }

      const [results, existing] = await Promise.all([
        Promise.all(jobs),
        fetchExistingActivities().catch((err) => {
          notify("info", `Couldn't check already-logged hours: ${(err as Error).message}`);
          return undefined;
        }),
      ]);
      const failed = results.find((r) => r.error);
      if (failed) throw new Error(failed.error);

      const commits = results.flatMap((r) => r.commits ?? []);
      buildTimeline({ commits, existing });
      results.flatMap((r) => r.warnings ?? []).slice(0, 3).forEach((w) => notify("info", w));
      notify("ok", `${commits.length} commits pulled from ${selected.length} repos`);
    } catch (err) {
      notify("err", `Commits: ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  /* ------------------------------------------------------------------ ai */

  async function generate(scope: "gaps" | "all" | string) {
    const targets = days.filter((d) => {
      if (!d.enabled) return false;
      if (remainingHours(d, settings.hoursPerDay) < 0.01) return false;
      if (scope === "gaps") return d.commits.length === 0;
      if (scope === "all") return true;
      return d.date === scope;
    });
    if (!targets.length) return notify("info", "Nothing to generate — those days are already fully logged");

    const pool = new Set<string>();
    Object.values(settings.repoMap).forEach((m) => m.project && pool.add(m.project));
    if (settings.fallbackProject) pool.add(settings.fallbackProject);
    const projectPool = pool.size ? Array.from(pool) : projects;

    setBusy("ai");
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: settings.aiPrompt,
          projects: projectPool,
          activities,
          fallbackProject: settings.fallbackProject || projectPool[0],
          fallbackActivity: settings.fallbackActivity || activities[0],
          days: targets.map((d) => ({
            date: d.date,
            weekday: weekdayShort(d.date),
            hint: d.hint,
            hours: remainingHours(d, settings.hoursPerDay),
            commits: d.commits.map((c) => ({
              repo: c.repo,
              project: settings.repoMap[c.repoId]?.project,
              message: c.message,
            })),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");

      type Generated = { text: string; project: string; activity: string; hours: number };
      const generated = new Map<string, Generated[]>(
        (data.days as { date: string; entries: Generated[] }[]).map((d) => [d.date, d.entries]),
      );

      setDays((prev) =>
        prev.map((d) => {
          const gen = generated.get(d.date);
          if (!gen?.length) return d;
          const target = remainingHours(d, settings.hoursPerDay);
          const hours = splitHours(target || settings.hoursPerDay, gen.map((g) => g.hours || 1));
          return {
            ...d,
            entries: gen.map((g, i) => ({
              id: uid(),
              date: d.date,
              text: g.text,
              project: g.project,
              activity: g.activity,
              hours: hours[i],
              source: "ai" as const,
              commitShas: d.commits.map((c) => c.sha),
              status: "idle" as const,
            })),
          };
        }),
      );
      notify("ok", `Filled ${generated.size} day${generated.size === 1 ? "" : "s"}`);
    } catch (err) {
      notify("err", `AI: ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  /* ---------------------------------------------------------------- push */

  const pushable = useMemo(
    () => days.filter((d) => d.enabled).flatMap((d) => d.entries.filter((e) => e.status !== "done")),
    [days],
  );

  const totalHours = pushable.reduce((a, e) => a + e.hours, 0);

  const invalidCount = pushable.filter((e) =>
    validateEntry(e, { minWords, minTags, projects, activities }).some((p) => p.level === "error"),
  ).length;

  const setEntryState = useCallback((id: string, patchEntry: Partial<Entry>) => {
    setDays((prev) =>
      prev.map((d) => ({
        ...d,
        entries: d.entries.map((e) => (e.id === id ? { ...e, ...patchEntry } : e)),
      })),
    );
  }, []);

  async function push() {
    if (!profile) return notify("err", "Profile JSON missing");
    const queue = pushable.filter(
      (e) =>
        !validateEntry(e, { minWords, minTags, projects, activities }).some(
          (p) => p.level === "error",
        ),
    );
    if (!queue.length) return notify("err", "No valid entries to push");

    setBusy("push");
    setProgress({ done: 0, total: queue.length });
    let ok = 0;
    let failed = 0;

    for (const entry of queue) {
      setEntryState(entry.id, { status: "sending", message: undefined });
      try {
        const res = await fetch("/api/emit/activity", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            token: settings.token,
            cookie: settings.cookie,
            profile,
            epochMs: keyToEpoch(entry.date),
            hours: entry.hours,
            description: composeDescription(entry),
            tags: [entry.project, entry.activity].filter(Boolean),
            mentions: [],
            dryRun,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        ok += 1;
        setEntryState(entry.id, {
          status: "done",
          message: dryRun ? "dry run: payload built, nothing sent" : "added to Emit",
        });
      } catch (err) {
        failed += 1;
        setEntryState(entry.id, { status: "error", message: (err as Error).message });
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }));
      await new Promise((r) => setTimeout(r, 250));
    }

    setBusy(null);
    notify(failed ? "err" : "ok", `${ok} pushed${failed ? `, ${failed} failed` : ""}`);
  }

  /* -------------------------------------------------------------- render */

  const commitDays = days.filter((d) => d.commits.length > 0).length;
  const coveredDays = days.filter(
    (d) => d.enabled && isDayCovered(d, settings.hoursPerDay),
  ).length;
  const gapDays = days.filter(
    (d) =>
      d.enabled && d.commits.length === 0 && remainingHours(d, settings.hoursPerDay) > 0.01,
  ).length;
  const staleDays = maxDelay
    ? days.filter((d) => d.enabled && (Date.now() - keyToEpoch(d.date)) / 86_400_000 > maxDelay)
        .length
    : 0;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-ink-950/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] items-center gap-4 px-5 py-3">
          <div className="flex items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded-xl bg-linear-to-br from-brand-500 to-brand-700 shadow-[0_8px_24px_-10px_var(--color-brand-500)]">
              <Zap className="size-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-tight text-slate-100">Emitation</h1>
              <p className="text-[11px] text-slate-500">timesheet autopilot</p>
            </div>
          </div>

          <div className="ml-4 hidden items-center gap-2 md:flex">
            <StatusPill ok={Boolean(settings.token)} label="token" />
            <StatusPill ok={Boolean(profile)} label={profile?.activeTeam?.name ?? "profile"} />
            <StatusPill ok={Boolean(settings.githubToken)} label="github" />
            <StatusPill ok={Boolean(settings.gitlabToken)} label="gitlab" />
          </div>

          <div className="ml-auto flex items-center gap-3">
            <div className="w-28">
              <Toggle checked={dryRun} onChange={setDryRun} label="Dry run" />
            </div>
            <Button size="sm" onClick={() => setSettingsOpen(true)}>
              <Settings2 className="size-3.5" /> Connections
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1500px] flex-1 gap-5 px-5 py-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        <div className="space-y-4 lg:sticky lg:top-19 lg:self-start">
          <Card className="p-4">
            <SectionTitle
              icon={<CalendarRange className="size-4" />}
              title="Timeline"
              hint="Which days get filled in"
            />

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="from">From</Label>
                <Input
                  id="from"
                  type="date"
                  value={range.from}
                  max={range.to}
                  onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="to">To</Label>
                <Input
                  id="to"
                  type="date"
                  value={range.to}
                  min={range.from}
                  onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
                />
              </div>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {(
                [
                  ["thisMonth", "This month"],
                  ["lastMonth", "Last month"],
                  ["last7", "Last 7d"],
                  ["last30", "Last 30d"],
                ] as const
              ).map(([kind, label]) => (
                <Button
                  key={kind}
                  size="sm"
                  variant="subtle"
                  onClick={() => setRange(rangePreset(kind))}
                >
                  {label}
                </Button>
              ))}
            </div>

            <div className="mt-4 space-y-1 rounded-xl border border-white/8 bg-white/2 px-3 py-2">
              <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                Weekends
              </p>
              <Toggle
                checked={settings.weekend.saturday}
                onChange={(v) => patch({ weekend: { ...settings.weekend, saturday: v } })}
                label="Fill Saturdays"
              />
              <Toggle
                checked={settings.weekend.sunday}
                onChange={(v) => patch({ weekend: { ...settings.weekend, sunday: v } })}
                label="Fill Sundays"
              />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="hpd">Hours / day</Label>
                <Input
                  id="hpd"
                  type="number"
                  min={0.25}
                  max={24}
                  step={0.25}
                  value={settings.hoursPerDay}
                  onChange={(e) => patch({ hoursPerDay: Number(e.target.value) || 8 })}
                />
              </div>
              <div className="flex items-end">
                <Button className="w-full" onClick={() => buildTimeline()}>
                  <RefreshCw className="size-3.5" /> Rebuild
                </Button>
              </div>
            </div>

            <div className="mt-3 grid gap-2">
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
          </Card>

          <Card className="p-4">
            <SectionTitle
              icon={
                <span className="flex items-center gap-1">
                  <GithubMark className="size-4" />
                  <GitlabMark className="size-4 text-orange-400" />
                </span>
              }
              title="Repositories"
              hint="Map each repo onto an Emit project"
              right={
                <Button
                  size="sm"
                  variant="primary"
                  onClick={fetchCommits}
                  loading={busy === "commits"}
                  disabled={busy !== null}
                >
                  <GitCommitHorizontal className="size-3.5" /> Pull
                </Button>
              }
            />
            <div className="mt-3">
              <RepoPicker
                repos={repos}
                selected={settings.selectedRepos}
                repoMap={settings.repoMap}
                projects={projects}
                activities={activities}
                onToggle={(name, on) =>
                  patch({
                    selectedRepos: on
                      ? [...settings.selectedRepos, name]
                      : settings.selectedRepos.filter((r) => r !== name),
                  })
                }
                onSelectMany={(names, on) =>
                  patch({
                    selectedRepos: on
                      ? Array.from(new Set([...settings.selectedRepos, ...names]))
                      : settings.selectedRepos.filter((r) => !names.includes(r)),
                  })
                }
                onMap={(name, mapping) =>
                  patch({
                    repoMap: {
                      ...settings.repoMap,
                      [name]: {
                        ...(settings.repoMap[name] ?? { project: "", activity: "" }),
                        ...mapping,
                      },
                    },
                  })
                }
              />
            </div>
          </Card>

          <Card className="p-4">
            <SectionTitle
              icon={<Sparkles className="size-4" />}
              title="Gap filler"
              hint="How the model should write your entries"
            />
            <Textarea
              rows={4}
              className="mt-3 text-xs"
              value={settings.aiPrompt}
              onChange={(e) => patch({ aiPrompt: e.target.value })}
              placeholder="e.g. mostly backend work on Splainer, occasional client calls"
            />
            <div className="mt-2 flex gap-2">
              <Button
                className="flex-1"
                variant="primary"
                onClick={() => generate("gaps")}
                loading={busy === "ai"}
                disabled={busy !== null || !gapDays}
              >
                <Wand2 className="size-3.5" /> Fill {gapDays} gap{gapDays === 1 ? "" : "s"}
              </Button>
              <Button onClick={() => generate("all")} disabled={busy !== null || !days.length}>
                Rewrite all
              </Button>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3.5">
            <Stat icon={<Layers className="size-4" />} label="days" value={`${days.length}`} />
            <Stat
              icon={<GitCommitHorizontal className="size-4" />}
              label="with commits"
              value={`${commitDays}`}
            />
            <Stat icon={<Sparkles className="size-4" />} label="gaps" value={`${gapDays}`} />
            <Stat
              icon={<CheckCircle2 className="size-4" />}
              label="already filled"
              value={`${coveredDays}`}
            />
            <Stat
              icon={<Braces className="size-4" />}
              label="entries"
              value={`${pushable.length}`}
            />
            <Stat
              icon={<CalendarRange className="size-4" />}
              label="hours"
              value={formatHours(totalHours)}
            />

            <div className="ml-auto flex items-center gap-2">
              {invalidCount > 0 && (
                <Badge tone="amber">
                  <TriangleAlert className="size-3" /> {invalidCount} incomplete
                </Badge>
              )}
              {staleDays > 0 && (
                <Badge tone="rose">
                  <TriangleAlert className="size-3" /> {staleDays} past the {maxDelay}-day window
                </Badge>
              )}
              <Button
                size="sm"
                onClick={refreshExisting}
                loading={busy === "existing"}
                disabled={busy !== null || !ready}
                title="Re-check what's already logged on Emit for this range"
              >
                <RefreshCw className="size-3.5" /> Check Emit
              </Button>
              <Button
                variant="primary"
                onClick={push}
                loading={busy === "push"}
                disabled={busy !== null || !ready || pushable.length === 0}
              >
                <CloudUpload className="size-4" />
                {busy === "push"
                  ? `${progress.done}/${progress.total}`
                  : dryRun
                    ? `Dry run ${pushable.length}`
                    : `Push ${pushable.length} to Emit`}
              </Button>
            </div>
          </Card>

          {!ready && (
            <Card className="border-amber-500/25 bg-amber-500/5 px-5 py-4">
              <p className="text-sm text-amber-200">
                Add your Emit <strong>token</strong> and paste the <strong>profile JSON</strong> under
                Connections before pushing.
              </p>
              {profileError && settings.profileJson && (
                <p className="mt-1 text-xs text-amber-300/80">{profileError}</p>
              )}
            </Card>
          )}

          {days.length === 0 ? (
            <Card className="grid place-items-center px-6 py-16 text-center">
              <CalendarRange className="mb-3 size-8 text-slate-700" />
              <p className="text-sm text-slate-400">No days in this range.</p>
              <p className="mt-1 text-xs text-slate-600">
                Weekends stay out unless you switch them on.
              </p>
            </Card>
          ) : (
            <div className="space-y-2.5">
              {days.map((day) => (
                <DayCard
                  key={day.date}
                  day={day}
                  projects={projects}
                  activities={activities}
                  minWords={minWords}
                  minTags={minTags}
                  busy={busy !== null}
                  onToggleDay={(on) =>
                    setDays((prev) =>
                      prev.map((d) => (d.date === day.date ? { ...d, enabled: on } : d)),
                    )
                  }
                  onHintChange={(hint) =>
                    setDays((prev) => prev.map((d) => (d.date === day.date ? { ...d, hint } : d)))
                  }
                  onEntryChange={setEntryState}
                  onEntryRemove={(id) =>
                    setDays((prev) =>
                      prev.map((d) =>
                        d.date === day.date
                          ? { ...d, entries: d.entries.filter((e) => e.id !== id) }
                          : d,
                      ),
                    )
                  }
                  onEntryAdd={() =>
                    setDays((prev) =>
                      prev.map((d) =>
                        d.date === day.date
                          ? {
                              ...d,
                              entries: [
                                ...d.entries,
                                {
                                  id: uid(),
                                  date: d.date,
                                  text: "",
                                  project: settings.fallbackProject,
                                  activity: settings.fallbackActivity,
                                  hours: d.entries.length
                                    ? 1
                                    : remainingHours(d, settings.hoursPerDay) || settings.hoursPerDay,
                                  source: "manual" as const,
                                  commitShas: [],
                                  status: "idle" as const,
                                },
                              ],
                            }
                          : d,
                      ),
                    )
                  }
                  onFillDay={() => generate(day.date)}
                  hoursPerDay={settings.hoursPerDay}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        patch={patch}
        profile={profile}
        profileError={profileError}
        repos={repos}
        onReposLoaded={(list, provider) =>
          persistRepos([...repos.filter((r) => r.provider !== provider), ...list])
        }
        notify={notify}
      />

      <Toaster toasts={toasts} />
    </div>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
        ok
          ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
          : "border-white/10 bg-white/3 text-slate-500",
      )}
    >
      <span className={cx("size-1.5 rounded-full", ok ? "bg-emerald-400" : "bg-slate-600")} />
      {label}
    </span>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-slate-600">{icon}</span>
      <span className="font-mono text-sm text-slate-100">{value}</span>
      <span className="text-xs text-slate-500">{label}</span>
    </div>
  );
}
