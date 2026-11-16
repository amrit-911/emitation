"use client";

import { memo, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView } from "motion/react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  GitCommitHorizontal,
  Minus,
  Plus,
  Sparkles,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { BlurText, CheckDraw, Ring } from "./fx";
import { Badge, Orb, Switch, TagPicker, cx, spring } from "./ui";
import { isDayCovered, parseMentions, remainingHours, validateEntry } from "@/lib/emit";
import { formatHours, fromKey, prettyDate, toKey } from "@/lib/dates";
import type { Day, Entry } from "@/lib/types";

export type DayHandlers = {
  onToggleDay: (date: string, on: boolean) => void;
  onEntryChange: (id: string, patch: Partial<Entry>) => void;
  onEntryRemove: (date: string, id: string) => void;
  onEntryAdd: (date: string) => void;
  onHintChange: (date: string, hint: string) => void;
  onFillDay: (date: string) => void;
};

type Props = DayHandlers & {
  day: Day;
  projects: string[];
  activities: string[];
  minWords: number;
  minTags: number;
  hoursPerDay: number;
  busy: boolean;
  /** The writer is working on this day right now. */
  writing: boolean;
};

function DayCardImpl({
  day,
  projects,
  activities,
  minWords,
  minTags,
  hoursPerDay,
  busy,
  writing,
  onToggleDay,
  onEntryChange,
  onEntryRemove,
  onEntryAdd,
  onHintChange,
  onFillDay,
}: Props) {
  const [showCommits, setShowCommits] = useState(false);
  const [showExisting, setShowExisting] = useState(false);

  const newHours = day.entries.filter((e) => e.status !== "done").reduce((a, e) => a + (e.hours || 0), 0);
  const pushedHours = day.entries.filter((e) => e.status === "done").reduce((a, e) => a + (e.hours || 0), 0);
  const filled = day.existingHours + newHours + pushedHours;
  const allDone = day.entries.length > 0 && day.entries.every((e) => e.status === "done");
  const anyError = day.entries.some((e) => e.status === "error");
  const remaining = remainingHours(day, hoursPerDay);
  const covered = isDayCovered(day, hoursPerDay);
  const date = fromKey(day.date);
  const over = filled - hoursPerDay > 0.01;

  return (
    <motion.article
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -40px 0px" }}
      transition={spring.smooth}
      className={cx(
        "glass-lite relative overflow-hidden rounded-[24px] transition-[border-color,opacity,box-shadow] duration-500",
        !day.enabled && "opacity-45",
        allDone && "border-emerald-300/25 shadow-[0_0_0_1px_rgba(110,231,183,0.08),0_20px_60px_-30px_rgba(52,211,153,0.5)]",
        anyError && "border-rose-300/25",
        writing && "sheen",
      )}
    >
      {/* header */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
        <div className="flex w-[64px] shrink-0 items-baseline gap-1.5">
          <span className="text-[26px] font-semibold leading-none tracking-[-0.04em] text-label tabular-nums">
            {date.getDate()}
          </span>
          <span className="flex flex-col text-[10.5px] font-medium uppercase leading-tight tracking-wide">
            <span className={day.isWeekend ? "text-amber-300/90" : "text-label-2"}>
              {date.toLocaleDateString(undefined, { weekday: "short" })}
            </span>
            <span className="text-label-4">{date.toLocaleDateString(undefined, { month: "short" })}</span>
          </span>
        </div>

        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {day.commits.length > 0 && (
            <Chip tone="cyan" open={showCommits} onClick={() => setShowCommits((s) => !s)}>
              <GitCommitHorizontal className="size-3" />
              {day.commits.length} commit{day.commits.length > 1 ? "s" : ""}
            </Chip>
          )}
          {day.existingHours > 0 && (
            <Chip tone="green" open={showExisting} onClick={() => setShowExisting((s) => !s)}>
              <CheckCircle2 className="size-3" />
              {formatHours(day.existingHours)} on Emit
            </Chip>
          )}
          {day.commits.length === 0 && !day.existingHours && !day.entries.length && day.enabled && (
            <Badge tone="amber">
              <Sparkles className="size-3" /> gap
            </Badge>
          )}
          {covered && !day.entries.some((e) => e.status !== "done") && (
            <Badge tone="green">already filled</Badge>
          )}
          {!day.enabled && <Badge>skipped</Badge>}
          {anyError && (
            <Badge tone="rose">
              <AlertCircle className="size-3" /> failed
            </Badge>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2.5">
          <div
            className="flex items-center gap-2"
            title={`${formatHours(filled)} of ${formatHours(hoursPerDay)} — ${formatHours(remaining)} still needed before this run`}
          >
            <Ring value={filled / hoursPerDay} size={22} stroke={2.5} tone={allDone ? "green" : over ? "amber" : "accent"} />
            <span className={cx("font-mono text-xs tabular-nums", over ? "text-amber-200" : "text-label-2")}>
              {formatHours(filled)}
              <span className="text-label-4">/{formatHours(hoursPerDay)}</span>
            </span>
          </div>
          <button
            type="button"
            onClick={() => onFillDay(day.date)}
            disabled={busy || !day.enabled || covered}
            title={covered ? "Target already met" : "Rewrite this day with AI"}
            className="grid size-8 place-items-center rounded-full text-label-3 transition-[background-color,color,transform] duration-200 hover:bg-white/10 hover:text-accent active:scale-90 disabled:pointer-events-none disabled:opacity-30"
          >
            <WandSparkles className="size-4" />
          </button>
          <Switch size="sm" checked={day.enabled} onChange={(on) => onToggleDay(day.date, on)} label={`Include ${day.date}`} />
        </div>
      </div>

      <Disclosure open={showCommits && day.commits.length > 0}>
        <ul className="space-y-1.5 border-t border-white/[0.06] bg-black/20 px-5 py-3">
          {day.commits.map((c) => {
            const authoredKey = toKey(new Date(c.date));
            const moved = authoredKey !== day.date;
            return (
              <li key={c.sha} className="flex items-start gap-2.5 text-[11.5px] text-label-2">
                {c.url ? (
                  <a href={c.url} target="_blank" rel="noreferrer" className="shrink-0 font-mono text-accent hover:underline">
                    {c.sha.slice(0, 7)}
                  </a>
                ) : (
                  <span className="shrink-0 font-mono text-accent">{c.sha.slice(0, 7)}</span>
                )}
                <span className="shrink-0 text-label-4">{c.repo.split("/").pop()}</span>
                <span className="truncate">{c.message}</span>
                {moved && (
                  <span className="ml-auto shrink-0 text-amber-200/80" title="Spread from a commit burst">
                    ↦ {prettyDate(authoredKey)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </Disclosure>

      <Disclosure open={showExisting && day.existingEntries.length > 0}>
        <ul className="space-y-1.5 border-t border-white/[0.06] bg-emerald-400/[0.03] px-5 py-3">
          {day.existingEntries.map((e) => (
            <li key={e.id} className="flex items-start gap-2.5 text-[11.5px] text-label-2">
              <span className="shrink-0 font-mono text-emerald-200">{formatHours(e.hours)}</span>
              <span className="truncate">{e.description}</span>
            </li>
          ))}
        </ul>
      </Disclosure>

      {/* entries */}
      <div className="space-y-2 border-t border-white/[0.05] px-3 py-3 sm:px-4">
        {writing && !day.entries.some((e) => e.status === "done") ? (
          <div className="space-y-2.5 px-2 py-2">
            <div className="skeleton h-3.5 w-11/12 rounded-full" />
            <div className="skeleton h-3.5 w-2/3 rounded-full" />
            <div className="flex gap-2 pt-1">
              <div className="skeleton h-6 w-24 rounded-full" />
              <div className="skeleton h-6 w-28 rounded-full" />
            </div>
          </div>
        ) : (
          <AnimatePresence initial={false} mode="popLayout">
            {day.entries.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                projects={projects}
                activities={activities}
                minWords={minWords}
                minTags={minTags}
                onChange={onEntryChange}
                onRemove={(id) => onEntryRemove(day.date, id)}
              />
            ))}
          </AnimatePresence>
        )}

        {!writing && (
          <div className="flex items-center gap-2 px-1 pt-0.5">
            <button
              type="button"
              onClick={() => onEntryAdd(day.date)}
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs text-label-3 transition hover:bg-white/[0.07] hover:text-label"
            >
              <Plus className="size-3.5" /> {day.entries.length ? "Split" : "Add entry"}
            </button>
            {day.commits.length === 0 && day.enabled && !covered && (
              <input
                value={day.hint ?? ""}
                onChange={(e) => onHintChange(day.date, e.target.value)}
                placeholder="note for the AI — e.g. client call about invoicing"
                className="h-8 min-w-0 flex-1 rounded-full bg-transparent px-3 text-xs text-label-2 outline-none transition placeholder:text-label-4 hover:bg-white/[0.04] focus:bg-white/[0.06]"
              />
            )}
          </div>
        )}
      </div>
    </motion.article>
  );
}

export const DayCard = memo(DayCardImpl);

/* ------------------------------------------------------------------ parts */

function Chip({
  tone,
  open,
  onClick,
  children,
}: {
  tone: "cyan" | "green";
  open: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[11px] font-medium transition-[background-color,transform] duration-200 active:scale-95",
        tone === "cyan"
          ? "border-sky-400/20 bg-sky-400/10 text-sky-200 hover:bg-sky-400/20"
          : "border-emerald-400/20 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/20",
      )}
    >
      {children}
      <ChevronDown className={cx("size-3 transition-transform duration-300", open && "rotate-180")} />
    </button>
  );
}

function Disclosure({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={spring.smooth}
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * The entry's text. AI-written text resolves word by word the first time it
 * scrolls into view, then hands over to a plain editable textarea.
 */
function EntryText({
  entry,
  onChange,
}: {
  entry: Entry;
  onChange: (id: string, patch: Partial<Entry>) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const inView = useInView(wrap, { once: true, margin: "0px 0px -30px 0px" });
  const [revealing, setRevealing] = useState(entry.source !== "manual" && entry.status === "idle" && Boolean(entry.text));

  useEffect(() => {
    if (!revealing || !inView) return;
    const words = entry.text.split(/\s+/).length;
    const t = setTimeout(() => setRevealing(false), words * 18 + 600);
    return () => clearTimeout(t);
  }, [revealing, inView, entry.text]);

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [entry.text]);

  const shared = "w-full whitespace-pre-wrap break-words rounded-[12px] px-2.5 py-1.5 text-[14px] leading-[1.55] tracking-[-0.005em]";

  return (
    <div ref={wrap} className="relative">
      <textarea
        ref={area}
        rows={1}
        value={entry.text}
        disabled={entry.status === "done"}
        onChange={(e) => onChange(entry.id, { text: e.target.value, source: "manual" })}
        placeholder="What you worked on…"
        spellCheck={false}
        className={cx(
          shared,
          "block resize-none overflow-hidden border border-transparent bg-transparent text-label outline-none transition-[background-color,border-color] duration-200 placeholder:text-label-4 hover:bg-white/[0.035] focus:border-white/10 focus:bg-black/25 disabled:text-label-2",
          revealing && "text-transparent caret-transparent",
        )}
      />
      {revealing && inView && (
        <div aria-hidden className={cx(shared, "pointer-events-none absolute inset-0 border border-transparent text-label")}>
          <BlurText text={entry.text} soft />
        </div>
      )}
    </div>
  );
}

function HoursStepper({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  const step = (d: number) => onChange(Math.max(0.25, Math.min(24, Math.round((value + d) * 4) / 4)));
  return (
    <div className="flex h-8 items-center rounded-full border border-white/10 bg-white/[0.04]">
      <button
        type="button"
        disabled={disabled}
        onClick={() => step(-0.25)}
        className="grid size-8 place-items-center rounded-full text-label-3 transition hover:text-label active:scale-90 disabled:opacity-40"
        aria-label="Less time"
      >
        <Minus className="size-3" />
      </button>
      <motion.span
        key={value}
        initial={{ y: -6, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={spring.snappy}
        className="min-w-[38px] text-center font-mono text-xs tabular-nums text-label"
      >
        {formatHours(value)}
      </motion.span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => step(0.25)}
        className="grid size-8 place-items-center rounded-full text-label-3 transition hover:text-label active:scale-90 disabled:opacity-40"
        aria-label="More time"
      >
        <Plus className="size-3" />
      </button>
    </div>
  );
}

const EntryRow = memo(function EntryRow({
  entry,
  projects,
  activities,
  minWords,
  minTags,
  onChange,
  onRemove,
}: {
  entry: Entry;
  projects: string[];
  activities: string[];
  minWords: number;
  minTags: number;
  onChange: (id: string, patch: Partial<Entry>) => void;
  onRemove: (id: string) => void;
}) {
  const problems = validateEntry(entry, { minWords, minTags, projects, activities });
  const errors = problems.filter((p) => p.level === "error");
  const done = entry.status === "done";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={spring.smooth}
      className={cx(
        "rounded-[18px] border p-1.5 transition-[background-color,border-color] duration-500",
        entry.status === "error"
          ? "border-rose-300/25 bg-rose-400/[0.05]"
          : done
            ? "border-emerald-300/15 bg-emerald-400/[0.04]"
            : errors.length
              ? "border-amber-300/20 bg-white/[0.02]"
              : "border-white/[0.06] bg-white/[0.02] hover:border-white/10",
      )}
    >
      <EntryText entry={entry} onChange={onChange} />

      <div className="flex flex-wrap items-center gap-1.5 px-1 pb-0.5 pt-1.5">
        <TagPicker
          className="w-[10.5rem]"
          value={entry.project}
          options={projects}
          disabled={done}
          onChange={(v) => onChange(entry.id, { project: v })}
          placeholder="#project"
        />
        <TagPicker
          className="w-[10.5rem]"
          value={entry.activity}
          options={activities}
          tone="cyan"
          disabled={done}
          onChange={(v) => onChange(entry.id, { activity: v })}
          placeholder="#activity"
        />
        <input
          // Parsed on blur so a half-typed "@" isn't eaten mid-keystroke.
          key={(entry.mentions ?? []).join(" ")}
          defaultValue={(entry.mentions ?? []).join(" ")}
          disabled={done}
          onBlur={(e) => onChange(entry.id, { mentions: parseMentions(e.target.value) })}
          placeholder="@mention"
          className="h-8 w-28 min-w-0 rounded-full border border-transparent bg-transparent px-3 text-xs text-label-2 outline-none transition placeholder:text-label-4 hover:bg-white/[0.04] focus:border-white/10 focus:bg-black/25"
        />

        <div className="ml-auto flex items-center gap-1.5">
          {entry.source === "custom" || entry.source === "ai" ? (
            <span className="text-ai flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wider">
              <Sparkles className="size-3 text-[#c686ff]" /> AI
            </span>
          ) : entry.source === "commits" ? (
            <span className="text-[10.5px] font-semibold uppercase tracking-wider text-sky-300/80">commits</span>
          ) : null}
          <HoursStepper value={entry.hours} disabled={done} onChange={(hours) => onChange(entry.id, { hours })} />
          <AnimatePresence mode="popLayout" initial={false}>
            {entry.status === "sending" ? (
              <motion.span key="s" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="grid size-8 place-items-center">
                <Orb className="size-4" />
              </motion.span>
            ) : done ? (
              <motion.span key="d" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={spring.bouncy} className="grid size-8 place-items-center">
                <CheckDraw className="size-5 text-emerald-300" />
              </motion.span>
            ) : (
              <motion.button
                key="r"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                type="button"
                onClick={() => onRemove(entry.id)}
                className="grid size-8 place-items-center rounded-full text-label-4 transition hover:bg-rose-400/10 hover:text-rose-300 active:scale-90"
                aria-label="Remove entry"
              >
                <Trash2 className="size-3.5" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {((errors.length > 0 && !done) || entry.message) && (
          <motion.p
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className={cx(
              "overflow-hidden px-2.5 pb-1 text-[11px]",
              entry.status === "error" ? "text-rose-300" : done ? "text-emerald-300/90" : "text-amber-200/90",
            )}
          >
            {entry.message ?? errors.map((e) => e.message).join(" · ")}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
});
