"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import {
  ArrowRight,
  CalendarRange,
  CheckCircle2,
  ClipboardList,
  CodeXml,
  FlaskConical,
  FolderOpen,
  GitCommitHorizontal,
  KeyRound,
  Layers,
  Pin,
  SlidersHorizontal,
  Sparkles,
  Clock3,
} from "lucide-react";
import { Composer } from "@/components/Composer";
import type { ComposerHandle } from "@/components/Composer";
import { ControlCenter } from "@/components/ControlCenter";
import type { CenterTab } from "@/components/ControlCenter";
import { DayCard } from "@/components/DayCard";
import { Onboarding } from "@/components/Onboarding";
import { PushDock } from "@/components/PushDock";
import { ProviderMark } from "@/components/RepoPicker";
import { RunPanel, StatStrip, rangeLabel } from "@/components/RunPanel";
import type { RunState, Step } from "@/components/RunPanel";
import { BlurText, Island, RevealLine } from "@/components/fx";
import type { IslandState } from "@/components/fx";
import { Wordmark, cx, spring, useSpotlight } from "@/components/ui";
import { useSettings } from "@/lib/storage";
import { roleOf } from "@/lib/roles";
import { localPlan } from "@/lib/localPlan";
import {
  activityTags,
  isDayCovered,
  parseProfile,
  projectTags,
  remainingHours,
  validateEntry,
} from "@/lib/emit";
import { formatHours, keyToEpoch, prettyDate, toKey, weekdayShort } from "@/lib/dates";
import { attachmentCommits, describeAttachments } from "@/lib/folderContext";
import {
  applyWritten,
  buildDays,
  fetchExisting,
  loadDraft,
  missingTokens,
  placeCommits,
  planPrompt,
  pullCommits,
  pushEntry,
  saveDraft,
  uid,
  writeDays,
} from "@/lib/engine";
import type { ExistingByDate } from "@/lib/engine";
import { DEFAULT_PROFILE_JSON } from "@/lib/default-profile";
import type { Attachment, Commit, Day, Entry, Plan, Repo, Role, RunConfig } from "@/lib/types";

const REPO_KEY = "emitation.repos.v2";

type Toast = { id: number; tone: "ok" | "err" | "info"; message: string };

const ROLE_ICON: Record<Role, React.ReactNode> = {
  developer: <CodeXml className="size-4" />,
  tester: <FlaskConical className="size-4" />,
  ba: <ClipboardList className="size-4" />,
};

/** A callback whose identity never changes but always sees the latest render. */
function useStable<A extends unknown[], R>(fn: (...args: A) => R) {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: A) => ref.current(...args), []);
}

const isAbort = (err: unknown) => (err as Error)?.name === "AbortError";

export default function Home() {
  const { settings, patch, hydrated } = useSettings();
  const role = roleOf(settings.role);

  const [restored, setRestored] = useState(false);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [days, setDays] = useState<Day[]>([]);
  const [config, setConfig] = useState<RunConfig | null>(null);
  const [pulled, setPulled] = useState<Commit[]>([]);
  const [lastPlan, setLastPlan] = useState<Plan | null>(null);
  const [run, setRun] = useState<RunState | null>(null);
  /** Dates picked from the + menu; every run stays inside them until unlocked. */
  const [lockedRange, setLockedRange] = useState<{ from: string; to: string } | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState<null | "run" | "push" | "existing" | "day">(null);
  const [writing, setWriting] = useState<Set<string>>(() => new Set());
  const [dryRun, setDryRun] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [justPushed, setJustPushed] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [center, setCenter] = useState<{ open: boolean; tab: CenterTab }>({ open: false, tab: "defaults" });
  /** null = decide from settings: first visit gets the tour. */
  const [tourOpen, setTourOpen] = useState<boolean | null>(null);
  // Only brand-new users get the tour on their own; anyone already connected can replay it from Look.
  const alreadySetUp = Boolean(
    settings.token ||
      settings.githubToken ||
      settings.gitlabToken ||
      settings.bitbucketToken ||
      settings.selectedRepos.length,
  );
  const tour = tourOpen ?? (hydrated && !settings.onboarded && !alreadySetUp);
  const [now] = useState(() => Date.now());

  const composer = useRef<ComposerHandle>(null);
  const abort = useRef<AbortController | null>(null);
  const toastId = useRef(0);

  /* ------------------------------------------------------------- lifecycle */

  // Hydrating from localStorage is syncing with an external store; it can only happen after mount.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(REPO_KEY);
      if (raw) setRepos(JSON.parse(raw) as Repo[]);
    } catch {
      /* ignore */
    }
    const draft = loadDraft();
    if (draft) {
      setDays(draft.days);
      setConfig(draft.config);
      setPulled(draft.commits ?? []);
      if (draft.prompt) {
        setRun({
          id: "restored",
          prompt: draft.prompt,
          status: "done",
          steps: [],
          summary: draft.summary || undefined,
          startedAt: 0,
        });
      }
    }
    setRestored(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!restored) return;
    const t = setTimeout(() => {
      saveDraft(
        config && days.length
          ? { days, config, commits: pulled, prompt: run?.prompt ?? "", summary: run?.summary ?? "" }
          : null,
      );
    }, 500);
    return () => clearTimeout(t);
  }, [restored, days, config, pulled, run?.prompt, run?.summary]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.accent = settings.accent;
    root.dataset.motion = settings.reduceMotion ? "reduced" : "full";
  }, [settings.accent, settings.reduceMotion]);

  useEffect(() => {
    document.documentElement.dataset.overlay = tour ? "on" : "off";
  }, [tour]);

  const aiOn = busy === "run" || busy === "day";
  useEffect(() => {
    document.documentElement.dataset.ai = aiOn ? "on" : "off";
  }, [aiOn]);

  // ⌘K / Ctrl+K, or "/" outside a field, jumps to the prompt.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const field = (e.target as HTMLElement)?.closest("input, textarea, [contenteditable]");
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !field)) {
        e.preventDefault();
        composer.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const notify = useCallback((tone: Toast["tone"], message: string) => {
    const id = (toastId.current += 1);
    setToasts((t) => [...t.slice(-3), { id, tone, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "err" ? 6500 : 3600);
  }, []);

  const persistRepos = useCallback((next: Repo[]) => {
    setRepos(next);
    try {
      localStorage.setItem(REPO_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const openCenter = useCallback((tab: CenterTab) => setCenter({ open: true, tab }), []);
  const onAttach = useCallback((a: Attachment[]) => setAttachments((prev) => [...prev, ...a]), []);
  const onRemoveAttachment = useCallback((id: string) => setAttachments((prev) => prev.filter((a) => a.id !== id)), []);

  /* --------------------------------------------------------------- profile */

  const { profile, error: profileError } = useMemo(() => parseProfile(settings.profileJson), [settings.profileJson]);
  const projects = useMemo(() => projectTags(profile), [profile]);
  const activities = useMemo(() => activityTags(profile), [profile]);
  const minWords = profile?.activeTeam?.activityMinWordCount ?? 2;
  const minTags = profile?.activeTeam?.activityMinUniqueTags ?? 2;
  const maxDelay = profile?.activeTeam?.activityMaxAddDelay ?? 0;
  const ready = Boolean(settings.token && profile);
  const hoursPerDay = config?.hoursPerDay ?? settings.hoursPerDay;
  const firstName = settings.profileJson !== DEFAULT_PROFILE_JSON ? profile?.firstName : undefined;
  const selectedRepos = useMemo(
    () => repos.filter((r) => settings.selectedRepos.includes(r.id)),
    [repos, settings.selectedRepos],
  );

  /* ------------------------------------------------------------------- run */

  const setStep = useCallback((id: string, p: Partial<Step>) => {
    setRun((r) => (r ? { ...r, steps: r.steps.map((s) => (s.id === id ? { ...s, ...p } : s)) } : r));
  }, []);

  async function execute(text: string, forced?: RunConfig) {
    if (busy) return;
    const ctrl = new AbortController();
    abort.current = ctrl;
    const { signal } = ctrl;
    const hasTimeline = days.length > 0 && config !== null;
    const folders = attachments.filter((a) => a.kind === "folder");

    setRun({
      id: uid(),
      prompt: text,
      status: "running",
      startedAt: Date.now(),
      steps: [
        { id: "plan", label: forced ? "Your settings" : "Understanding", state: "active" },
        { id: "commits", label: "Commits", state: "wait" },
        { id: "emit", label: "Emit", state: "wait" },
        { id: "write", label: "Writing", state: "wait" },
      ],
    });
    setBusy("run");
    if (!forced) composer.current?.setValue("");

    let aiError: string | null = null;
    try {
      /* 1 · understand */
      let plan: Plan;
      if (forced) {
        plan = {
          mode: "build",
          config: forced,
          useCommits: lastPlan?.useCommits ?? pulled.length > 0,
          repoIds: lastPlan?.repoIds ?? [],
          summary: `Re-running ${rangeLabel(forced)} with your adjustments.`,
        };
        setStep("plan", { state: "done", label: "Your settings", detail: "Adjusted by you" });
      } else {
        setStep("plan", { label: "Understanding your request" });
        const today = toKey(new Date());
        try {
          const res = await planPrompt(
            {
              prompt: text,
              today,
              weekday: new Date().toLocaleDateString("en", { weekday: "long" }),
              persona: role.persona,
              defaults: {
                hoursPerDay: settings.hoursPerDay,
                saturday: settings.weekend.saturday,
                sunday: settings.weekend.sunday,
                spreadCommits: settings.spreadCommits,
                spreadMaxDays: settings.spreadMaxDays,
              },
              timeline: hasTimeline ? { from: config!.from, to: config!.to, days: days.length } : null,
              lockedRange,
              repos: repos.map((r) => ({ id: r.id, name: r.fullName, selected: settings.selectedRepos.includes(r.id) })),
              folders: folders.map((f) => ({
                name: f.name,
                commits: f.kind === "folder" ? f.commits.length : 0,
                remote: f.kind === "folder" ? f.remote : undefined,
                repoId: f.kind === "folder" ? (f.matchedRepoId ?? f.commits[0]?.repoId) : undefined,
              })),
              files: attachments.filter((a) => a.kind === "file").map((a) => a.name),
            },
            signal,
          );
          plan = res.plan;
        } catch (err) {
          if (isAbort(err)) throw err;
          // No key, no credits, offline: read the prompt in plain code so the run still happens.
          aiError = (err as Error).message;
          plan = localPlan({
            prompt: text,
            today,
            defaults: {
              weekend: settings.weekend,
              hoursPerDay: settings.hoursPerDay,
              spreadCommits: settings.spreadCommits,
              spreadMaxDays: settings.spreadMaxDays,
            },
            timeline: hasTimeline ? { from: config!.from, to: config!.to } : null,
            hasLocalCommits: folders.some((f) => f.kind === "folder" && f.commits.length > 0),
          });
          notify("info", "AI planner unavailable — read your prompt without it");
        }
        // Dates picked in the + menu always win over what the sentence implies.
        if (lockedRange) {
          const inside = hasTimeline && lockedRange.from >= config!.from && lockedRange.to <= config!.to;
          plan = {
            ...plan,
            mode: plan.mode === "refine" && inside ? "refine" : "build",
            config: { ...plan.config, from: lockedRange.from, to: lockedRange.to },
          };
        }
        setStep("plan", {
          state: "done",
          label: aiError ? "Read locally" : "Understood",
          detail: plan.mode === "refine" ? "Refining your timeline" : rangeLabel(plan.config),
        });
        setRun((r) => (r ? { ...r, summary: plan.summary } : r));
      }
      setLastPlan(plan);

      const refine = plan.mode === "refine" && hasTimeline;
      const cfg: RunConfig = refine
        ? { ...plan.config, from: config!.from, to: config!.to, weekend: config!.weekend }
        : plan.config;
      let windowFrom = refine && plan.config.from > cfg.from ? plan.config.from : cfg.from;
      let windowTo = refine && plan.config.to < cfg.to ? plan.config.to : cfg.to;
      if (windowFrom > windowTo) [windowFrom, windowTo] = [cfg.from, cfg.to];
      setConfig(cfg);

      let working = days;
      let pool = pulled;

      if (!refine) {
        /* 2 · commits */
        if (plan.useCommits) {
          setStep("commits", { state: "active", label: "Pulling commits" });
          const wanted = plan.repoIds.length ? repos.filter((r) => plan.repoIds.includes(r.id)) : selectedRepos;
          const missing = missingTokens(settings, wanted);
          const remote = wanted.length
            ? await pullCommits({ settings, repos: wanted, from: cfg.from, to: cfg.to, signal })
            : { commits: [], warnings: [] };
          const local = attachmentCommits(attachments).filter((c) => {
            const k = toKey(new Date(c.date));
            return k >= cfg.from && k <= cfg.to;
          });
          // Remote copies win: same sha, but they carry a link.
          const bySha = new Map<string, Commit>();
          [...local, ...remote.commits].forEach((c) => bySha.set(c.sha, c));
          pool = Array.from(bySha.values());

          const sources = [
            wanted.length ? `${wanted.length} repo${wanted.length === 1 ? "" : "s"}` : "",
            folders.length ? folders.map((f) => f.name).join(", ") : "",
          ].filter(Boolean);
          if (!sources.length) {
            setStep("commits", { state: "skip", label: "Commits", detail: "No repos or folder — attach one or connect a code host" });
          } else {
            setStep("commits", {
              state: "done",
              label: `${pool.length} commit${pool.length === 1 ? "" : "s"}`,
              detail: `from ${sources.join(" + ")}`,
            });
          }
          remote.warnings.slice(0, 2).forEach((w) => notify("info", w));
          if (missing.length) notify("info", `Add a ${missing.join(" / ")} token to pull those repos`);
        } else {
          setStep("commits", { state: "skip", detail: "Not needed for this one" });
          pool = [];
        }

        /* 3 · what's already on Emit */
        let existing: ExistingByDate | undefined;
        if (ready && profile) {
          setStep("emit", { state: "active", label: "Checking Emit" });
          try {
            existing = await fetchExisting({ settings, profile, from: cfg.from, to: cfg.to, signal });
            const total = Array.from(existing.values()).reduce((a, b) => a + b.hours, 0);
            setStep("emit", {
              state: "done",
              label: "Emit checked",
              detail: total ? `${formatHours(total)} already logged` : "Nothing logged yet",
            });
          } catch (err) {
            if (isAbort(err)) throw err;
            setStep("emit", { state: "error", detail: (err as Error).message });
          }
        } else {
          setStep("emit", { state: "skip", detail: "Connect Emit to respect logged hours" });
        }

        working = buildDays({
          config: cfg,
          prev: [],
          commitsByDate: placeCommits(pool, cfg, existing),
          existing,
          tags: settings,
        });
        setDays(working);
        setPulled(pool);
      } else {
        setStep("commits", { state: "skip", detail: "Reusing what's loaded" });
        setStep("emit", { state: "skip", detail: "Reusing what's loaded" });
      }

      /* 4 · write */
      const targets = working.filter(
        (d) =>
          d.enabled &&
          d.date >= windowFrom &&
          d.date <= windowTo &&
          (remainingHours(d, cfg.hoursPerDay) > 0.01 || d.entries.some((e) => e.status !== "done")),
      );
      if (!targets.length) {
        setStep("write", { state: "skip", detail: working.length ? "Every day is already filled" : "No days in that range" });
      } else {
        setStep("write", { state: "active", label: `Writing ${targets.length} day${targets.length === 1 ? "" : "s"}` });
        setWriting(new Set(targets.map((d) => d.date)));
        try {
          const { written, truncated } = await writeDays({
            prompt: text,
            persona: role.persona,
            style: settings.aiPrompt,
            contextFor: (f, t) => describeAttachments(attachments, f, t),
            days: targets,
            commits: pool,
            config: cfg,
            settings,
            projects,
            activities,
            selfMention: profile?.activeMember?.mention,
            signal,
            onProgress: (done, total) => {
              if (total > 31) setStep("write", { detail: `${done}/${total} days` });
            },
          });
          setDays((prev) => applyWritten(prev, written));
          const skipped = Array.from(written.values()).filter((d) => d.skip).length;
          setStep("write", {
            state: "done",
            label: "Written",
            detail: `${written.size - skipped} day${written.size - skipped === 1 ? "" : "s"}${skipped ? ` · ${skipped} skipped` : ""}`,
          });
          if (truncated) notify("info", "Lots of commits — only the first 400 per window were read");
        } catch (err) {
          if (isAbort(err)) throw err;
          // Keep whatever the commits already built; the run is still useful.
          aiError = (err as Error).message;
          setStep("write", {
            state: "error",
            label: "Couldn't write",
            detail: pool.length ? "Kept the entries built from your commits" : aiError,
          });
        }
      }

      setRun((r) => (r ? { ...r, status: "done", finishedAt: Date.now() } : r));
      if (aiError) notify("err", `AI: ${aiError}`);
      else notify("ok", refine ? "Timeline updated" : "Ready — review, then push");
    } catch (err) {
      const stopped = signal.aborted || isAbort(err);
      const message = stopped ? "Stopped" : (err as Error).message;
      setRun((r) =>
        r
          ? {
              ...r,
              status: stopped ? "stopped" : "error",
              steps: r.steps.map((s) => (s.state === "active" ? { ...s, state: "error", detail: message } : s)),
            }
          : r,
      );
      notify(stopped ? "info" : "err", stopped ? "Stopped" : message);
      if (!forced) composer.current?.setValue(text);
    } finally {
      setBusy(null);
      setWriting(new Set());
      abort.current = null;
    }
  }

  const stop = useCallback(() => abort.current?.abort(), []);

  /* -------------------------------------------------------------- day ops */

  const onToggleDay = useCallback(
    (date: string, on: boolean) => setDays((prev) => prev.map((d) => (d.date === date ? { ...d, enabled: on } : d))),
    [],
  );
  const onHintChange = useCallback(
    (date: string, hint: string) => setDays((prev) => prev.map((d) => (d.date === date ? { ...d, hint } : d))),
    [],
  );
  const onEntryChange = useCallback((id: string, p: Partial<Entry>) => {
    setDays((prev) =>
      prev.map((d) =>
        d.entries.some((e) => e.id === id) ? { ...d, entries: d.entries.map((e) => (e.id === id ? { ...e, ...p } : e)) } : d,
      ),
    );
  }, []);
  const onEntryRemove = useCallback((date: string, id: string) => {
    setDays((prev) => prev.map((d) => (d.date === date ? { ...d, entries: d.entries.filter((e) => e.id !== id) } : d)));
  }, []);
  const onEntryAdd = useStable((date: string) => {
    setDays((prev) =>
      prev.map((d) =>
        d.date === date
          ? {
              ...d,
              entries: [
                ...d.entries,
                {
                  id: uid(),
                  date,
                  text: "",
                  project: settings.fallbackProject,
                  activity: settings.fallbackActivity,
                  hours: d.entries.length ? 1 : remainingHours(d, hoursPerDay) || hoursPerDay,
                  source: "manual",
                  commitShas: [],
                  status: "idle",
                },
              ],
            }
          : d,
      ),
    );
  });

  const onFillDay = useStable(async (date: string) => {
    if (busy || !config) return;
    const day = days.find((d) => d.date === date);
    if (!day) return;
    const ctrl = new AbortController();
    abort.current = ctrl;
    setBusy("day");
    setWriting(new Set([date]));
    try {
      const instructions = [
        `Rewrite ${date} (${weekdayShort(date)}) only.`,
        day.hint ? `Note for this day: ${day.hint}` : "",
        run?.prompt ? `The original request, for context: ${run.prompt}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      const { written } = await writeDays({
        prompt: instructions,
        persona: role.persona,
        style: settings.aiPrompt,
        contextFor: (f, t) => describeAttachments(attachments, f, t),
        days: [day],
        commits: pulled,
        config,
        settings,
        projects,
        activities,
        selfMention: profile?.activeMember?.mention,
        signal: ctrl.signal,
      });
      setDays((prev) => applyWritten(prev, written));
      notify("ok", `Rewrote ${prettyDate(date)}`);
    } catch (err) {
      if (!isAbort(err)) notify("err", (err as Error).message);
    } finally {
      setBusy(null);
      setWriting(new Set());
      abort.current = null;
    }
  });

  /* ------------------------------------------------------------------ push */

  const pushable = useMemo(
    () => days.filter((d) => d.enabled).flatMap((d) => d.entries.filter((e) => e.status !== "done")),
    [days],
  );
  const totalHours = pushable.reduce((a, e) => a + e.hours, 0);
  const isValid = useCallback(
    (e: Entry) => !validateEntry(e, { minWords, minTags, projects, activities }).some((p) => p.level === "error"),
    [minWords, minTags, projects, activities],
  );
  const invalidCount = pushable.filter((e) => !isValid(e)).length;

  async function push() {
    if (!profile || !settings.token) {
      notify("err", "Connect Emit first");
      openCenter("connections");
      return;
    }
    const queue = pushable.filter(isValid);
    if (!queue.length) return notify("err", "No valid entries to push");

    setBusy("push");
    setProgress({ done: 0, total: queue.length });
    let ok = 0;
    let failed = 0;
    for (const entry of queue) {
      onEntryChange(entry.id, { status: "sending", message: undefined });
      try {
        await pushEntry({ settings, profile, entry, dryRun });
        ok += 1;
        onEntryChange(entry.id, {
          status: "done",
          message: dryRun ? "Dry run: payload built, nothing sent" : "Added to Emit",
        });
      } catch (err) {
        failed += 1;
        onEntryChange(entry.id, { status: "error", message: (err as Error).message });
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }));
      await new Promise((r) => setTimeout(r, 250));
    }
    setBusy(null);
    if (!failed) {
      setJustPushed(true);
      setTimeout(() => setJustPushed(false), 2800);
    }
    notify(failed ? "err" : "ok", `${ok} ${dryRun ? "checked" : "pushed"}${failed ? `, ${failed} failed` : ""}`);
  }

  async function refreshExisting() {
    if (!profile || !config) return;
    setBusy("existing");
    try {
      const existing = await fetchExisting({ settings, profile, from: config.from, to: config.to });
      setDays((prev) => buildDays({ config, prev, existing, tags: settings }));
      notify("ok", "Refreshed what's already on Emit");
    } catch (err) {
      notify("err", `Emit: ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  function startOver() {
    if (pushable.length && !window.confirm("Clear this timeline? Unsent entries will be lost.")) return;
    setDays([]);
    setConfig(null);
    setPulled([]);
    setRun(null);
    setLastPlan(null);
    saveDraft(null);
    composer.current?.focus();
  }

  /* --------------------------------------------------------------- derived */

  const hasResults = days.length > 0 || run?.status === "running";
  const commitDays = days.filter((d) => d.commits.length > 0).length;
  const coveredDays = days.filter((d) => d.enabled && isDayCovered(d, hoursPerDay)).length;
  const gapDays = days.filter(
    (d) => d.enabled && !d.entries.length && remainingHours(d, hoursPerDay) > 0.01,
  ).length;
  const staleDays = maxDelay
    ? days.filter((d) => d.enabled && (now - keyToEpoch(d.date)) / 86_400_000 > maxDelay).length
    : 0;

  const activeStep = run?.status === "running" ? run.steps.find((s) => s.state === "active") : undefined;
  const lastToast = toasts[toasts.length - 1];
  const island: IslandState = lastToast
    ? { kind: "toast", ...lastToast }
    : busy === "push"
      ? { kind: "busy", label: dryRun ? "Dry-running entries" : "Pushing to Emit", detail: `${progress.done}/${progress.total}` }
      : activeStep
        ? { kind: "busy", label: activeStep.label, detail: activeStep.detail }
        : busy === "day"
          ? { kind: "busy", label: "Rewriting the day" }
          : busy === "existing"
            ? { kind: "busy", label: "Checking Emit" }
            : null;

  const sourcesLabel = useMemo(() => {
    if (!lastPlan?.useCommits) return undefined;
    const n = lastPlan.repoIds.length || selectedRepos.length;
    const folders = attachments.filter((a) => a.kind === "folder").length;
    return [n ? `${n} repo${n === 1 ? "" : "s"}` : "", folders ? `${folders} folder${folders === 1 ? "" : "s"}` : ""]
      .filter(Boolean)
      .join(" + ") || undefined;
  }, [lastPlan, selectedRepos.length, attachments]);

  const hour = new Date().getHours();
  const greeting = `${hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"}${firstName ? `, ${firstName}` : ""}.`;

  const pills = [
    ...settings.savedPrompts.map((p) => ({ label: p.length > 38 ? `${p.slice(0, 36)}…` : p, prompt: p, pinned: true })),
    ...(hasResults ? role.refine : role.pills).map((p) => ({ ...p, pinned: false })),
  ];

  return (
    <MotionConfig reducedMotion={settings.reduceMotion ? "always" : "user"}>
      {!tour && (
        <TopBar
          aiOn={aiOn}
          role={settings.role}
          ready={ready}
          team={profile?.activeTeam?.name}
          repos={selectedRepos}
          codeFirst={role.codeFirst}
          onOpen={openCenter}
          onHome={() => (hasResults ? undefined : composer.current?.focus())}
        />
      )}
      <Island state={island} onStop={busy === "run" || busy === "day" ? stop : undefined} />

      {restored && (
        <main
          className={cx(
            "mx-auto flex w-full max-w-[920px] flex-1 flex-col px-4 transition-[padding] duration-700 ease-apple sm:px-6",
            hasResults ? "pb-40 pt-[84px]" : "pb-24 pt-[14vh]",
            tour && "invisible",
          )}
        >
          <AnimatePresence mode="popLayout">
            {!hasResults && (
              <motion.div
                key="hero"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, y: -30, filter: "blur(12px)", transition: { duration: 0.35 } }}
                className="mb-9 text-center"
              >
                <motion.span
                  initial={{ opacity: 0, y: 8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ ...spring.smooth, delay: 0.05 }}
                  className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] py-1 pl-1.5 pr-3 text-xs text-label-2"
                >
                  <span className="grid size-5 place-items-center rounded-full text-white [&>svg]:size-3" style={{ background: "var(--accent-grad)" }}>
                    {settings.role ? ROLE_ICON[settings.role] : <Sparkles />}
                  </span>
                  {role.label} mode
                </motion.span>
                <h1 className="text-balance text-[38px] font-semibold leading-[1.06] tracking-[-0.045em] sm:text-[54px]">
                  <BlurText text={greeting} step={45} />
                  <br />
                  <RevealLine delay={300} className="text-ai pb-1.5">
                    What did you work on?
                  </RevealLine>
                </h1>
                <p className="mx-auto mt-4 max-w-md text-pretty text-[15px] leading-relaxed text-label-3">
                  <BlurText text={role.blurb} delay={600} step={10} />
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <Composer
            ref={composer}
            onSubmit={(v) => void execute(v)}
            onStop={stop}
            busy={busy === "run"}
            examples={hasResults ? role.refine.map((p) => p.prompt) : role.examples}
            attachments={attachments}
            onAttach={onAttach}
            onRemoveAttachment={onRemoveAttachment}
            repos={repos}
            lockedRange={lockedRange}
            onLockRange={setLockedRange}
            sourcesChip={role.codeFirst ? { count: selectedRepos.length, onClick: () => openCenter("sources") } : null}
            onSavePrompt={(v) => {
              if (settings.savedPrompts.includes(v)) return notify("info", "Already pinned");
              patch({ savedPrompts: [v, ...settings.savedPrompts].slice(0, 8) });
              notify("ok", "Pinned — it's a pill now");
            }}
            compact={hasResults}
            notify={notify}
          />

          {/* prompt pills */}
          {busy !== "run" && (
            <div className={cx("flex flex-wrap gap-2", hasResults ? "mt-3" : "mt-5 justify-center")}>
              <AnimatePresence mode="popLayout">
                {pills.map((p, k) => (
                  <Pill key={`${hasResults}-${p.prompt}`} index={k} pinned={p.pinned} onClick={() => composer.current?.typeIn(p.prompt)}>
                    {p.label}
                  </Pill>
                ))}
              </AnimatePresence>
            </div>
          )}

          <AnimatePresence mode="popLayout">
            {!hasResults ? (
              <motion.div
                key="home"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0, transition: { ...spring.smooth, delay: 0.45 } }}
                exit={{ opacity: 0, y: 20, filter: "blur(10px)", transition: { duration: 0.3 } }}
                className="mt-12 grid gap-3 sm:grid-cols-2"
              >
                {role.codeFirst ? (
                  <ContextCard
                    icon={<GitCommitHorizontal className="size-4" />}
                    title={selectedRepos.length ? `${selectedRepos.length} repo${selectedRepos.length === 1 ? "" : "s"} ready` : "Connect your repos"}
                    body={
                      selectedRepos.length ? (
                        <span className="flex flex-wrap gap-1.5">
                          {selectedRepos.slice(0, 4).map((r) => (
                            <span key={r.id} className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-label-2">
                              <ProviderMark provider={r.provider} className="size-3" />
                              {r.fullName.split("/").pop()}
                            </span>
                          ))}
                          {selectedRepos.length > 4 && <span className="text-[11px] text-label-3">+{selectedRepos.length - 4}</span>}
                        </span>
                      ) : (
                        "GitHub, GitLab or Bitbucket — or skip tokens entirely and attach a repo folder."
                      )
                    }
                    action={selectedRepos.length ? "Manage" : "Connect"}
                    onClick={() => openCenter(selectedRepos.length || repos.length ? "sources" : "connections")}
                  />
                ) : (
                  <ContextCard
                    icon={<FolderOpen className="size-4" />}
                    title={settings.role === "tester" ? "Bring your test plans" : "Bring your notes"}
                    body={
                      settings.role === "tester"
                        ? "Attach a folder of test cases or specs — files you edited on a day hint at what you did."
                        : "Attach meeting notes, BRDs or a docs folder — entries get grounded in real work."
                    }
                    action="Attach"
                    onClick={() => composer.current?.attachFolder()}
                  />
                )}
                <ContextCard
                  icon={ready ? <CheckCircle2 className="size-4" /> : <KeyRound className="size-4" />}
                  title={ready ? `Connected to ${profile?.activeTeam?.name ?? "Emit"}` : "Connect Emit to push"}
                  body={
                    ready
                      ? `${projects.length} projects · ${activities.length} activities · up to ${maxDelay || "∞"} days back`
                      : "Paste your token once. You can write and review without it — pushing needs it."
                  }
                  action={ready ? "Settings" : "Connect"}
                  tone={ready ? "ok" : undefined}
                  onClick={() => openCenter("connections")}
                />
              </motion.div>
            ) : (
              <motion.div key="results" className="mt-5 space-y-4">
                <RunPanel
                  run={run}
                  config={config}
                  sourcesLabel={sourcesLabel}
                  busy={busy !== null}
                  onRerun={(c) => void execute(run?.prompt ?? "Fill these days", c)}
                  onDismiss={startOver}
                />

                {days.length > 0 && (
                  <StatStrip
                    items={[
                      { icon: <Layers className="size-3" />, label: "days", value: days.length },
                      { icon: <GitCommitHorizontal className="size-3" />, label: "commits", value: commitDays },
                      { icon: <Sparkles className="size-3" />, label: "gaps", value: gapDays },
                      { icon: <CheckCircle2 className="size-3" />, label: "filled", value: coveredDays },
                      { icon: <CalendarRange className="size-3" />, label: "entries", value: pushable.length },
                      { icon: <Clock3 className="size-3" />, label: "hours", value: totalHours, format: formatHours },
                    ]}
                  />
                )}

                <div className="space-y-3">
                  {days.map((day) => (
                    <DayCard
                      key={day.date}
                      day={day}
                      projects={projects}
                      activities={activities}
                      minWords={minWords}
                      minTags={minTags}
                      hoursPerDay={hoursPerDay}
                      busy={busy !== null}
                      writing={writing.has(day.date)}
                      onToggleDay={onToggleDay}
                      onEntryChange={onEntryChange}
                      onEntryRemove={onEntryRemove}
                      onEntryAdd={onEntryAdd}
                      onHintChange={onHintChange}
                      onFillDay={onFillDay}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      )}

      <PushDock
        show={days.length > 0 && busy !== "run" && !tour}
        entries={pushable.length}
        hours={totalHours}
        invalid={invalidCount}
        stale={staleDays}
        maxDelay={maxDelay}
        dryRun={dryRun}
        onDryRun={setDryRun}
        onRefresh={ready ? refreshExisting : undefined}
        refreshing={busy === "existing"}
        onPush={push}
        pushing={busy === "push"}
        progress={progress}
        justPushed={justPushed}
        canPush={pushable.length > invalidCount && busy === null}
        reason={!ready ? "Connect Emit first" : pushable.length ? undefined : "Nothing left to push"}
      />

      <ControlCenter
        open={center.open}
        tab={center.tab}
        onTab={(tab) => setCenter((c) => ({ ...c, tab }))}
        onClose={() => setCenter((c) => ({ ...c, open: false }))}
        settings={settings}
        patch={patch}
        profile={profile}
        profileError={profileError}
        repos={repos}
        onReposLoaded={(list, provider) => persistRepos([...repos.filter((r) => r.provider !== provider), ...list])}
        notify={notify}
        projects={projects}
        activities={activities}
        onReplayTutorial={() => {
          setCenter((c) => ({ ...c, open: false }));
          setTourOpen(true);
        }}
      />

      <AnimatePresence>
        {tour && (
          <Onboarding
            instant={tourOpen === null}
            role={settings.role}
            onRole={(r) => patch({ role: r })}
            onDone={() => {
              setTourOpen(false);
              patch({ onboarded: true, role: settings.role ?? "developer" });
              setTimeout(() => composer.current?.focus(), 400);
            }}
            onConnect={() => openCenter("connections")}
          />
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}

/* ------------------------------------------------------------------- parts */

function TopBar({
  aiOn,
  role,
  ready,
  team,
  repos,
  codeFirst,
  onOpen,
  onHome,
}: {
  aiOn: boolean;
  role: Role | null;
  ready: boolean;
  team?: string;
  repos: Repo[];
  codeFirst: boolean;
  onOpen: (t: CenterTab) => void;
  onHome: () => void;
}) {
  const providers = Array.from(new Set(repos.map((r) => r.provider)));
  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50 flex items-center justify-between px-3 pt-3 sm:px-5">
      <button
        type="button"
        onClick={onHome}
        className="glass-float pointer-events-auto flex h-11 items-center rounded-full px-5 transition-transform duration-300 active:scale-95"
      >
        <Wordmark className="text-[19px]" live={aiOn} />
      </button>

      <div className="glass-float pointer-events-auto flex h-11 items-center gap-0.5 rounded-full p-1">
        <button
          type="button"
          onClick={() => onOpen("look")}
          className="flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-label-2 transition hover:bg-white/[0.08] hover:text-label"
          title="Change role"
        >
          {role ? ROLE_ICON[role] : <Sparkles className="size-4" />}
          <span className="hidden sm:inline">{roleOf(role).short}</span>
        </button>
        {codeFirst && (
          <button
            type="button"
            onClick={() => onOpen("sources")}
            className="hidden h-9 items-center gap-1.5 rounded-full px-3 text-xs text-label-2 transition hover:bg-white/[0.08] hover:text-label sm:flex"
            title="Repositories"
          >
            {providers.length ? providers.map((p) => <ProviderMark key={p} provider={p} className="size-3.5" />) : <GitCommitHorizontal className="size-4" />}
            <span>{repos.length || "No"} repos</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => onOpen("connections")}
          className="flex h-9 items-center gap-2 rounded-full px-3 text-xs text-label-2 transition hover:bg-white/[0.08] hover:text-label"
          title={ready ? `Connected to ${team}` : "Connect Emit"}
        >
          <span className="relative flex size-2">
            {ready && <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/60 [animation-duration:2.5s]" />}
            <span className={cx("relative size-2 rounded-full", ready ? "bg-emerald-400" : "bg-amber-300")} />
          </span>
          <span className="hidden max-w-[140px] truncate sm:inline">{ready ? team : "Connect Emit"}</span>
        </button>
        <button
          type="button"
          onClick={() => onOpen(codeFirst ? "sources" : "defaults")}
          className="grid size-9 place-items-center rounded-full text-label-2 transition hover:bg-white/[0.08] hover:text-label"
          aria-label="Control Center"
          title="Control Center"
        >
          <SlidersHorizontal className="size-4" />
        </button>
      </div>
    </header>
  );
}

function Pill({
  children,
  onClick,
  index,
  pinned,
}: {
  children: React.ReactNode;
  onClick: () => void;
  index: number;
  pinned: boolean;
}) {
  const ref = useSpotlight<HTMLButtonElement>();
  return (
    <motion.button
      ref={ref}
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 10, scale: 0.92, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)", transition: { ...spring.smooth, delay: 0.25 + index * 0.05 } }}
      exit={{ opacity: 0, scale: 0.9, filter: "blur(6px)", transition: { duration: 0.2 } }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.96 }}
      className="spotlight glass-lite flex h-9 items-center gap-1.5 overflow-hidden rounded-full px-3.5 text-[12.5px] font-medium text-label-2 transition-colors duration-200 hover:border-white/15 hover:text-label"
    >
      {pinned ? <Pin className="size-3 text-accent" /> : <Sparkles className="size-3 text-accent" />}
      {children}
    </motion.button>
  );
}

function ContextCard({
  icon,
  title,
  body,
  action,
  onClick,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
  action: string;
  onClick: () => void;
  tone?: "ok";
}) {
  const ref = useSpotlight<HTMLButtonElement>();
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className="spotlight glass-lite group flex items-start gap-3.5 rounded-[22px] p-4 text-left transition-[border-color,transform] duration-300 hover:border-white/14 active:scale-[0.985]"
    >
      <span
        className={cx(
          "grid size-9 shrink-0 place-items-center rounded-[12px] border border-white/10",
          tone === "ok" ? "bg-emerald-400/10 text-emerald-300" : "bg-white/[0.06] text-accent",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-medium tracking-[-0.01em] text-label">{title}</span>
        <span className="mt-1 block text-xs leading-relaxed text-label-3">{body}</span>
      </span>
      <span className="mt-0.5 flex shrink-0 items-center gap-1 text-xs font-medium text-label-3 transition-colors group-hover:text-label">
        {action}
        <ArrowRight className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
      </span>
    </button>
  );
}
