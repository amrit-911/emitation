"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { Button, cx, spring } from "./ui";
import { eachDay, fromKey, toKey } from "@/lib/dates";

export type DateRange = { from: string; to: string };

const addDays = (key: string, n: number) => {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
};
const mondayOf = (key: string) => addDays(key, -((fromKey(key).getDay() + 6) % 7));

function presets(today: string): { label: string; range: DateRange }[] {
  const t = fromKey(today);
  const mon = mondayOf(today);
  const lastMon = addDays(mon, -7);
  return [
    { label: "This week", range: { from: mon, to: today } },
    { label: "Last week", range: { from: lastMon, to: addDays(lastMon, 6) } },
    { label: "Last 7 days", range: { from: addDays(today, -6), to: today } },
    { label: "This month", range: { from: toKey(new Date(t.getFullYear(), t.getMonth(), 1)), to: today } },
    {
      label: "Last month",
      range: {
        from: toKey(new Date(t.getFullYear(), t.getMonth() - 1, 1)),
        to: toKey(new Date(t.getFullYear(), t.getMonth(), 0)),
      },
    },
  ];
}

export const shortDate = (key: string) =>
  fromKey(key).toLocaleDateString(undefined, { day: "numeric", month: "short" });

export const rangeText = (r: DateRange) =>
  r.from === r.to ? shortDate(r.from) : `${shortDate(r.from)} – ${shortDate(r.to)}`;

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/** A calendar for picking the window a prompt is allowed to fill. */
export function DateRangePicker({
  value,
  onApply,
  onBack,
}: {
  value: DateRange | null;
  onApply: (r: DateRange) => void;
  onBack: () => void;
}) {
  const [today] = useState(() => toKey(new Date()));
  const [month, setMonth] = useState(() => {
    const d = fromKey(value?.to ?? today);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [dir, setDir] = useState(0);
  const [start, setStart] = useState<string | null>(value?.from ?? null);
  const [end, setEnd] = useState<string | null>(value?.to ?? null);
  const [hover, setHover] = useState<string | null>(null);

  const cells = useMemo(() => {
    const offset = (month.getDay() + 6) % 7;
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const out: (string | null)[] = Array(offset).fill(null);
    for (let d = 1; d <= days; d++) out.push(toKey(new Date(month.getFullYear(), month.getMonth(), d)));
    while (out.length % 7) out.push(null);
    return out;
  }, [month]);

  // While choosing the second end, the hovered day previews the range.
  const other = end ?? (start && hover ? hover : start);
  const [a, b] = start && other ? (start <= other ? [start, other] : [other, start]) : [null, null];
  const count = a && b ? eachDay(a, b).length : 0;

  const pick = (k: string) => {
    if (!start || end) {
      setStart(k);
      setEnd(null);
    } else if (k < start) {
      setEnd(start);
      setStart(k);
    } else {
      setEnd(k);
    }
  };

  const shift = (n: number) => {
    setDir(n);
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));
  };

  const jump = (r: DateRange) => {
    setStart(r.from);
    setEnd(r.to);
    const d = fromKey(r.to);
    const next = new Date(d.getFullYear(), d.getMonth(), 1);
    setDir(next > month ? 1 : next < month ? -1 : 0);
    setMonth(next);
  };

  return (
    <div className="w-[318px] p-1">
      <div className="flex items-center justify-between px-1.5 pb-2 pt-1">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-0.5 rounded-full py-1 pl-1 pr-2 text-xs text-accent transition hover:bg-white/[0.07]"
        >
          <ChevronLeft className="size-3.5" /> Back
        </button>
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <motion.span
            key={month.toISOString()}
            custom={dir}
            initial={{ opacity: 0, y: dir >= 0 ? 8 : -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: dir >= 0 ? -8 : 8 }}
            transition={spring.snappy}
            className="text-[13px] font-semibold tracking-[-0.01em] text-label"
          >
            {month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </motion.span>
        </AnimatePresence>
        <div className="flex">
          <button
            type="button"
            onClick={() => shift(-1)}
            className="grid size-7 place-items-center rounded-full text-label-2 transition hover:bg-white/[0.08] hover:text-label active:scale-90"
            aria-label="Previous month"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => shift(1)}
            className="grid size-7 place-items-center rounded-full text-label-2 transition hover:bg-white/[0.08] hover:text-label active:scale-90"
            aria-label="Next month"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 px-1 pb-2.5">
        {presets(today).map((p) => {
          const on = start === p.range.from && end === p.range.to;
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => jump(p.range)}
              className={cx(
                "h-6 rounded-full border px-2.5 text-[11px] font-medium transition-colors duration-200",
                on
                  ? "border-transparent text-white"
                  : "border-white/10 bg-white/[0.04] text-label-2 hover:bg-white/[0.09] hover:text-label",
              )}
              style={on ? { background: "var(--accent-grad)" } : undefined}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-7 px-1 pb-1">
        {WEEKDAYS.map((d, i) => (
          <span key={i} className={cx("text-center text-[10.5px] font-medium", i > 4 ? "text-label-4" : "text-label-3")}>
            {d}
          </span>
        ))}
      </div>

      <div className="relative overflow-hidden px-1" onMouseLeave={() => setHover(null)}>
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <motion.div
            key={month.toISOString()}
            custom={dir}
            initial={{ opacity: 0, x: dir * 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -40 }}
            transition={spring.snappy}
            className="grid grid-cols-7 gap-y-0.5"
          >
            {cells.map((k, i) => {
              if (!k) return <span key={`x${i}`} className="h-9" />;
              const inRange = a && b && k >= a && k <= b;
              const isA = k === a;
              const isB = k === b;
              const single = isA && isB;
              const col = i % 7;
              const future = k > today;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => pick(k)}
                  onMouseEnter={() => setHover(k)}
                  className="group relative grid h-9 place-items-center"
                >
                  {inRange && !single && (
                    <span
                      className={cx(
                        "absolute inset-y-[3px] bg-[color-mix(in_oklab,var(--accent)_18%,transparent)]",
                        isA ? "left-1/2 right-0" : isB ? "left-0 right-1/2" : "inset-x-0",
                        !isA && !isB && col === 0 && "rounded-l-full",
                        !isA && !isB && col === 6 && "rounded-r-full",
                      )}
                    />
                  )}
                  <span
                    className={cx(
                      "relative grid size-[30px] place-items-center rounded-full text-[12.5px] tabular-nums transition-[background-color,color,transform] duration-150 group-active:scale-90",
                      isA || isB
                        ? "font-semibold text-white shadow-[0_6px_16px_-6px_var(--accent)]"
                        : inRange
                          ? "text-label"
                          : future
                            ? "text-label-4 group-hover:bg-white/[0.06]"
                            : col > 4
                              ? "text-label-3 group-hover:bg-white/[0.08] group-hover:text-label"
                              : "text-label-2 group-hover:bg-white/[0.08] group-hover:text-label",
                    )}
                    style={isA || isB ? { background: "var(--accent-grad)" } : undefined}
                  >
                    {fromKey(k).getDate()}
                    {k === today && !(isA || isB) && (
                      <span className="absolute bottom-[3px] size-1 rounded-full bg-accent" />
                    )}
                  </span>
                </button>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 border-t border-white/[0.07] px-1.5 pt-2.5">
        <span className="min-w-0 text-xs text-label-3">
          {a && b ? (
            <>
              <span className="font-medium text-label">{rangeText({ from: a, to: b })}</span> · {count} day
              {count === 1 ? "" : "s"}
            </>
          ) : (
            "Pick a start day"
          )}
        </span>
        <Button
          size="sm"
          variant="primary"
          disabled={!a || !b}
          onClick={() => a && b && onApply({ from: a, to: b })}
        >
          <Lock className="size-3" /> Lock dates
        </Button>
      </div>
    </div>
  );
}
