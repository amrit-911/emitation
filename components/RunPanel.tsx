"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertCircle,
  CalendarRange,
  Clock3,
  GitCommitHorizontal,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Split,
  SunMedium,
  X,
} from "lucide-react";
import { BlurText, CheckDraw, CountUp } from "./fx";
import { Button, Input, Orb, Switch, cx, spring } from "./ui";
import { formatHours, fromKey } from "@/lib/dates";
import type { RunConfig } from "@/lib/types";

export type StepState = "wait" | "active" | "done" | "skip" | "error";
export type Step = { id: string; label: string; state: StepState; detail?: string };
export type RunState = {
  id: string;
  prompt: string;
  status: "running" | "done" | "error" | "stopped";
  steps: Step[];
  summary?: string;
  startedAt: number;
  finishedAt?: number;
};

const short = (key: string) =>
  fromKey(key).toLocaleDateString(undefined, { day: "numeric", month: "short" });

export function rangeLabel(c: RunConfig) {
  return c.from === c.to ? short(c.from) : `${short(c.from)} → ${short(c.to)}`;
}

export function RunPanel({
  run,
  config,
  sourcesLabel,
  onRerun,
  onDismiss,
  busy,
}: {
  run: RunState | null;
  /** Null while the planner is still deciding. */
  config: RunConfig | null;
  sourcesLabel?: string;
  onRerun: (c: RunConfig) => void;
  onDismiss: () => void;
  busy: boolean;
}) {
  const [adjust, setAdjust] = useState(false);
  const [draft, setDraft] = useState<RunConfig | null>(config);
  const running = run?.status === "running";

  const weekends = !config
    ? ""
    : config.weekend.saturday && config.weekend.sunday
      ? "Every day"
      : config.weekend.saturday
        ? "Mon–Sat"
        : config.weekend.sunday
          ? "Sun–Fri"
          : "Weekdays";

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={spring.smooth}
      className="glass rim overflow-hidden rounded-[26px]"
    >
      <div className="flex items-start gap-3.5 px-5 pb-3 pt-4">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center">
          {running ? (
            <Orb className="size-6" />
          ) : run?.status === "error" ? (
            <AlertCircle className="size-6 text-rose-300" />
          ) : (
            <span className="grid size-8 place-items-center rounded-full text-white" style={{ background: "var(--accent-grad)" }}>
              <Sparkles className="size-4" />
            </span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          {run && (
            <p className="line-clamp-2 text-[13px] leading-relaxed text-label-3">&ldquo;{run.prompt}&rdquo;</p>
          )}
          <AnimatePresence mode="wait">
            {run?.summary ? (
              <motion.p key={run.summary} className="mt-0.5 text-[15px] font-medium leading-snug tracking-[-0.01em] text-label">
                <BlurText text={run.summary} />
              </motion.p>
            ) : running ? (
              <motion.p key="thinking" exit={{ opacity: 0 }} className="text-shimmer mt-0.5 text-[15px] font-medium">
                Thinking about your request…
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => {
              setDraft(config);
              setAdjust((a) => !a);
            }}
            disabled={busy || !config}
            aria-label="Adjust the plan"
            title="Adjust the plan"
            className={adjust ? "bg-white/10 text-label" : ""}
          >
            <SlidersHorizontal className="size-4" />
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={onDismiss} disabled={running} aria-label="Start over" title="Start over">
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {/* what the AI decided — every knob visible */}
      {config && (
        <div className="flex flex-wrap gap-1.5 px-5 pb-3.5 pl-[66px]">
          <PlanChip icon={<CalendarRange className="size-3" />}>{rangeLabel(config)}</PlanChip>
          <PlanChip icon={<SunMedium className="size-3" />}>{weekends}</PlanChip>
          <PlanChip icon={<Clock3 className="size-3" />}>{formatHours(config.hoursPerDay)} / day</PlanChip>
          {config.spreadCommits && sourcesLabel && (
            <PlanChip icon={<Split className="size-3" />}>spread ≤ {config.spreadMaxDays}d</PlanChip>
          )}
          {sourcesLabel && <PlanChip icon={<GitCommitHorizontal className="size-3" />}>{sourcesLabel}</PlanChip>}
        </div>
      )}

      <AnimatePresence initial={false}>
        {adjust && draft && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={spring.smooth}
            className="overflow-hidden"
          >
            <div className="mx-4 mb-4 grid gap-3 rounded-[18px] border border-white/[0.07] bg-black/20 p-4 sm:grid-cols-[1fr_1fr_auto]">
              <label className="text-[11px] text-label-3">
                From
                <Input
                  type="date"
                  value={draft.from}
                  max={draft.to}
                  onChange={(e) => setDraft((d) => d && { ...d, from: e.target.value })}
                  className="mt-1"
                />
              </label>
              <label className="text-[11px] text-label-3">
                To
                <Input
                  type="date"
                  value={draft.to}
                  min={draft.from}
                  onChange={(e) => setDraft((d) => d && { ...d, to: e.target.value })}
                  className="mt-1"
                />
              </label>
              <label className="text-[11px] text-label-3">
                Hours / day
                <Input
                  type="number"
                  min={0.25}
                  max={24}
                  step={0.25}
                  value={draft.hoursPerDay}
                  onChange={(e) => setDraft((d) => d && { ...d, hoursPerDay: Number(e.target.value) || 8 })}
                  className="mt-1 w-24"
                />
              </label>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 sm:col-span-3">
                <MiniSwitch
                  label="Saturdays"
                  checked={draft.weekend.saturday}
                  onChange={(v) => setDraft((d) => d && { ...d, weekend: { ...d.weekend, saturday: v } })}
                />
                <MiniSwitch
                  label="Sundays"
                  checked={draft.weekend.sunday}
                  onChange={(v) => setDraft((d) => d && { ...d, weekend: { ...d.weekend, sunday: v } })}
                />
                <MiniSwitch
                  label="Spread bursts"
                  checked={draft.spreadCommits}
                  onChange={(v) => setDraft((d) => d && { ...d, spreadCommits: v })}
                />
                <Button
                  variant="primary"
                  size="sm"
                  className="ml-auto"
                  disabled={busy || draft.from > draft.to}
                  onClick={() => {
                    setAdjust(false);
                    onRerun(draft);
                  }}
                >
                  <RefreshCw className="size-3.5" /> Re-run with these
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {run && run.steps.length > 0 && <StepRail steps={run.steps} />}
    </motion.section>
  );
}

function PlanChip({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={spring.bouncy}
      className="inline-flex h-7 items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.05] px-2.5 text-[11.5px] font-medium text-label-2"
    >
      <span className="text-accent">{icon}</span>
      {children}
    </motion.span>
  );
}

function MiniSwitch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <span className="flex items-center gap-2 text-xs text-label-2">
      <Switch size="sm" checked={checked} onChange={onChange} label={label} />
      {label}
    </span>
  );
}

/** Steps under a hairline that fills as the run moves forward. */
function StepRail({ steps }: { steps: Step[] }) {
  const settled = steps.filter((s) => s.state === "done" || s.state === "skip").length;
  const active = steps.some((s) => s.state === "active") ? 0.5 : 0;
  const fill = (settled + active) / steps.length;
  return (
    <div className="relative border-t border-white/[0.06] px-5 py-3.5">
      <motion.div
        className="pointer-events-none absolute -top-px left-0 h-[2px] w-full origin-left"
        style={{ background: "linear-gradient(90deg, var(--accent), var(--accent-2))", boxShadow: "0 0 12px var(--accent)" }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: fill, opacity: fill >= 1 ? 0 : 1 }}
        transition={{ scaleX: spring.smooth, opacity: { duration: 0.8, delay: 0.6 } }}
      />
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((s) => (
          <div key={s.id} className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="grid size-[18px] shrink-0 place-items-center">
                {s.state === "done" ? (
                  <CheckDraw className="size-[18px] text-emerald-300" />
                ) : s.state === "active" ? (
                  <Orb className="size-[16px]" />
                ) : s.state === "error" ? (
                  <AlertCircle className="size-[18px] text-rose-300" />
                ) : (
                  <span className={cx("size-1.5 rounded-full", s.state === "skip" ? "bg-white/15" : "bg-white/35")} />
                )}
              </span>
              <span
                className={cx(
                  "truncate text-xs font-medium",
                  s.state === "active"
                    ? "text-shimmer"
                    : s.state === "done"
                      ? "text-label"
                      : s.state === "error"
                        ? "text-rose-200"
                        : "text-label-4",
                )}
              >
                {s.label}
              </span>
            </div>
            <AnimatePresence mode="wait">
              {s.detail && (
                <motion.p
                  key={s.detail}
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className={cx(
                    "mt-1 line-clamp-2 pl-[26px] text-[11px] leading-snug",
                    s.state === "error" ? "text-rose-300/80" : "text-label-3",
                  )}
                >
                  {s.detail}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Live numbers for the timeline, springing as they change. */
export function StatStrip({ items }: { items: { icon: ReactNode; label: string; value: number; format?: (v: number) => string }[] }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {items.map((s, k) => (
        <motion.div
          key={s.label}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.smooth, delay: 0.05 * k }}
          className="glass-lite rounded-[18px] px-3.5 py-2.5"
        >
          <div className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wider text-label-4">
            {s.icon}
            {s.label}
          </div>
          <CountUp
            value={s.value}
            format={s.format}
            className="mt-0.5 block text-xl font-semibold tracking-[-0.03em] text-label"
          />
        </motion.div>
      ))}
    </div>
  );
}
