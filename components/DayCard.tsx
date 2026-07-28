"use client";

import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  GitCommitHorizontal,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { Badge, Button, Input, TagPicker, Textarea, cx } from "./ui";
import { composeDescription, isDayCovered, remainingHours, validateEntry } from "@/lib/emit";
import { formatHours, prettyDate, weekdayShort } from "@/lib/dates";
import type { Day, Entry } from "@/lib/types";

export function DayCard({
  day,
  projects,
  activities,
  minWords,
  minTags,
  hoursPerDay,
  busy,
  onToggleDay,
  onEntryChange,
  onEntryRemove,
  onEntryAdd,
  onHintChange,
  onFillDay,
}: {
  day: Day;
  projects: string[];
  activities: string[];
  minWords: number;
  minTags: number;
  hoursPerDay: number;
  busy: boolean;
  onToggleDay: (on: boolean) => void;
  onEntryChange: (id: string, patch: Partial<Entry>) => void;
  onEntryRemove: (id: string) => void;
  onEntryAdd: () => void;
  onHintChange: (hint: string) => void;
  onFillDay: () => void;
}) {
  const [showCommits, setShowCommits] = useState(false);
  const [showExisting, setShowExisting] = useState(false);

  const totalHours = day.entries.reduce((a, e) => a + (e.hours || 0), 0);
  const allDone = day.entries.length > 0 && day.entries.every((e) => e.status === "done");
  const anyError = day.entries.some((e) => e.status === "error");
  const sending = day.entries.some((e) => e.status === "sending");
  const remaining = remainingHours(day, hoursPerDay);
  const covered = isDayCovered(day, hoursPerDay);

  return (
    <div
      className={cx(
        "rounded-2xl border transition",
        !day.enabled && "opacity-45",
        allDone
          ? "border-emerald-500/25 bg-emerald-500/[0.04]"
          : anyError
            ? "border-rose-500/25 bg-rose-500/[0.04]"
            : "border-white/[0.07] bg-ink-900/60",
      )}
    >
      {/* header */}
      <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.06] px-4 py-2.5">
        <input
          type="checkbox"
          checked={day.enabled}
          onChange={(e) => onToggleDay(e.target.checked)}
          className="size-4 accent-[var(--color-brand-500)]"
          aria-label={`Include ${day.date}`}
        />
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-slate-100">{prettyDate(day.date)}</span>
          <span className={cx("text-xs", day.isWeekend ? "text-amber-400/80" : "text-slate-500")}>
            {weekdayShort(day.date)}
          </span>
        </div>

        {day.commits.length > 0 ? (
          <button
            type="button"
            onClick={() => setShowCommits((s) => !s)}
            className="inline-flex items-center gap-1 rounded-md border border-cyan-500/25 bg-cyan-500/10 px-1.5 py-0.5 text-[11px] font-medium text-cyan-300 transition hover:bg-cyan-500/20"
          >
            <GitCommitHorizontal className="size-3" />
            {day.commits.length} commit{day.commits.length > 1 ? "s" : ""}
            <ChevronDown className={cx("size-3 transition", showCommits && "rotate-180")} />
          </button>
        ) : covered ? (
          <Badge tone="green">
            <CheckCircle2 className="size-3" /> already filled
          </Badge>
        ) : (
          <Badge tone="amber">
            <Sparkles className="size-3" /> gap
          </Badge>
        )}

        {day.existingHours > 0 && (
          <button
            type="button"
            onClick={() => setShowExisting((s) => !s)}
            className="inline-flex items-center gap-1 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-300 transition hover:bg-emerald-500/20"
          >
            <CheckCircle2 className="size-3" />
            {formatHours(day.existingHours)} logged on Emit
            <ChevronDown className={cx("size-3 transition", showExisting && "rotate-180")} />
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {sending && <Loader2 className="size-3.5 animate-spin text-brand-400" />}
          {allDone && (
            <Badge tone="green">
              <CheckCircle2 className="size-3" /> pushed
            </Badge>
          )}
          {anyError && (
            <Badge tone="rose">
              <AlertCircle className="size-3" /> failed
            </Badge>
          )}
          <span
            className={cx(
              "font-mono text-xs",
              Math.abs(totalHours) < 0.01 ? "text-slate-600" : "text-slate-300",
            )}
            title={`${formatHours(totalHours)} new of ${formatHours(remaining)} still needed`}
          >
            {formatHours(totalHours)}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={onFillDay}
            disabled={busy || !day.enabled || covered}
            title={covered ? "Target already met — nothing to fill" : "Regenerate this day with AI"}
          >
            <Wand2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {showCommits && day.commits.length > 0 && (
        <ul className="space-y-1 border-b border-white/[0.06] bg-black/20 px-4 py-2.5">
          {day.commits.map((c) => (
            <li key={c.sha} className="flex items-start gap-2 text-[11px] text-slate-400">
              <a
                href={c.url}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 font-mono text-brand-300 hover:underline"
              >
                {c.sha.slice(0, 7)}
              </a>
              <span className="shrink-0 text-slate-600">{c.repo.split("/").pop()}</span>
              <span className="truncate">{c.message}</span>
            </li>
          ))}
        </ul>
      )}

      {showExisting && day.existingEntries.length > 0 && (
        <ul className="space-y-1 border-b border-white/[0.06] bg-emerald-500/[0.03] px-4 py-2.5">
          {day.existingEntries.map((e) => (
            <li key={e.id} className="flex items-start gap-2 text-[11px] text-slate-400">
              <span className="shrink-0 font-mono text-emerald-300">{formatHours(e.hours)}</span>
              <span className="truncate">{e.description}</span>
            </li>
          ))}
        </ul>
      )}

      {/* entries */}
      <div className="space-y-3 px-4 py-3">
        {day.entries.length === 0 && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-white/10 px-3 py-3">
            <p className="text-xs text-slate-500">
              {covered
                ? `Already ${formatHours(day.existingHours)} on Emit — target met, nothing more to add.`
                : day.commits.length > 0
                  ? "Commits found but no entry built yet."
                  : day.existingHours > 0
                    ? `${formatHours(day.existingHours)} logged, ${formatHours(remaining)} still needed.`
                    : "Nothing logged for this day."}
            </p>
            <Button size="sm" onClick={onEntryAdd}>
              <Plus className="size-3.5" /> Add entry
            </Button>
          </div>
        )}

        {day.entries.map((entry) => {
          const problems = validateEntry(entry, { minWords, minTags, projects, activities });
          const errors = problems.filter((p) => p.level === "error");
          return (
            <div
              key={entry.id}
              className={cx(
                "rounded-xl border p-3 transition",
                entry.status === "error"
                  ? "border-rose-500/30 bg-rose-500/[0.05]"
                  : entry.status === "done"
                    ? "border-emerald-500/25 bg-emerald-500/[0.04]"
                    : errors.length
                      ? "border-amber-500/25 bg-white/[0.02]"
                      : "border-white/[0.07] bg-white/[0.02]",
              )}
            >
              <div className="flex flex-col gap-2.5 lg:flex-row">
                <div className="flex-1">
                  <Textarea
                    rows={2}
                    value={entry.text}
                    disabled={entry.status === "done"}
                    onChange={(e) => onEntryChange(entry.id, { text: e.target.value, source: "manual" })}
                    placeholder="what you worked on…"
                    className="text-sm"
                  />
                </div>

                <div className="flex shrink-0 flex-wrap items-start gap-2 lg:w-[26rem]">
                  <TagPicker
                    className="w-[11.5rem]"
                    value={entry.project}
                    options={projects}
                    disabled={entry.status === "done"}
                    onChange={(v) => onEntryChange(entry.id, { project: v })}
                    placeholder="#project"
                  />
                  <TagPicker
                    className="w-[11.5rem]"
                    value={entry.activity}
                    options={activities}
                    tone="cyan"
                    disabled={entry.status === "done"}
                    onChange={(v) => onEntryChange(entry.id, { activity: v })}
                    placeholder="#activity"
                  />
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min={0.25}
                      max={24}
                      step={0.25}
                      value={entry.hours}
                      disabled={entry.status === "done"}
                      onChange={(e) =>
                        onEntryChange(entry.id, { hours: Number(e.target.value) || 0 })
                      }
                      className="h-8 w-[4.5rem] px-2 py-0 text-center text-xs"
                    />
                    <span className="text-[11px] text-slate-500">h</span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onEntryRemove(entry.id)}
                    disabled={entry.status === "sending"}
                    aria-label="Remove entry"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="font-mono text-[11px] text-slate-500">
                  {composeDescription(entry) || "—"}
                </p>
                {entry.source === "ai" && <Badge tone="brand">ai</Badge>}
                {entry.source === "commits" && <Badge tone="cyan">commits</Badge>}
              </div>

              {errors.length > 0 && entry.status !== "done" && (
                <p className="mt-1.5 text-[11px] text-amber-300">
                  {errors.map((e) => e.message).join(" · ")}
                </p>
              )}
              {entry.message && (
                <p
                  className={cx(
                    "mt-1.5 text-[11px]",
                    entry.status === "error" ? "text-rose-300" : "text-emerald-300",
                  )}
                >
                  {entry.message}
                </p>
              )}
            </div>
          );
        })}

        <div className="flex items-center gap-2">
          {day.entries.length > 0 && (
            <Button size="sm" variant="ghost" onClick={onEntryAdd}>
              <Plus className="size-3.5" /> Split day
            </Button>
          )}
          {day.commits.length === 0 && (
            <Input
              value={day.hint ?? ""}
              onChange={(e) => onHintChange(e.target.value)}
              placeholder="nudge for this day (e.g. client call about invoicing)"
              className="h-8 flex-1 py-0 text-xs"
            />
          )}
        </div>
      </div>
    </div>
  );
}
