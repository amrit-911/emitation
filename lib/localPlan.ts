import { fromKey, toKey } from "./dates";
import type { Plan, RunConfig } from "./types";

/**
 * A plain-code reading of a prompt, used when the AI planner is unreachable
 * (no key, no credits, offline). It understands the common date phrasings and
 * a few switches, so "from my commits" runs still build a real timeline.
 */

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const DAY = "(\\d{1,2})(?:st|nd|rd|th)?";

const monthIndex = (m: string) => MONTHS.indexOf(m.slice(0, 3).toLowerCase());

const addDays = (key: string, n: number) => {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
};

/** The most recent occurrence of day/month that isn't after today. */
function resolve(day: number, month: number, today: string): string {
  const year = Number(today.slice(0, 4));
  const key = toKey(new Date(year, month, day));
  return key > today ? toKey(new Date(year - 1, month, day)) : key;
}

function mondayOf(key: string) {
  const d = fromKey(key);
  const shift = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - shift);
  return toKey(d);
}

export function findRange(prompt: string, today: string): { from: string; to: string } | null {
  const p = prompt.toLowerCase();

  const iso = p.match(/\d{4}-\d{2}-\d{2}/g);
  if (iso?.length) return { from: iso[0], to: iso[1] ?? iso[0] };

  // "12 to 15 sept", "12-15 sept"
  const span = new RegExp(`${DAY}\\s*(?:to|-|–|—|until|till|through|and)\\s*${DAY}\\s+${MONTH}`, "i").exec(p);
  if (span) {
    const m = monthIndex(span[3]);
    return { from: resolve(Number(span[1]), m, today), to: resolve(Number(span[2]), m, today) };
  }

  // "12 sept … 15 sept" or "sept 12 … sept 15"
  const dates: string[] = [];
  const re = new RegExp(`${DAY}\\s+(?:of\\s+)?${MONTH}|${MONTH}\\s+${DAY}`, "gi");
  for (const m of p.matchAll(re)) {
    const day = Number(m[1] ?? m[4]);
    const month = monthIndex(m[2] ?? m[3]);
    if (day >= 1 && day <= 31 && month >= 0) dates.push(resolve(day, month, today));
  }
  if (dates.length) {
    const [a, b = dates[0]] = dates;
    return a <= b ? { from: a, to: b } : { from: b, to: a };
  }

  if (/\byesterday\b/.test(p)) return { from: addDays(today, -1), to: addDays(today, -1) };
  if (/\btoday\b/.test(p)) return { from: today, to: today };

  const lastN = /last\s+(\d+|two|three|four)\s+(working\s+days|weekdays|days|weeks)/.exec(p);
  if (lastN) {
    const n = { two: 2, three: 3, four: 4 }[lastN[1]] ?? Number(lastN[1]);
    if (lastN[2].startsWith("week")) return { from: addDays(today, -(n * 7 - 1)), to: today };
    if (lastN[2] === "days") return { from: addDays(today, -(n - 1)), to: today };
    let from = today;
    let left = n;
    while (left > 0) {
      const dow = fromKey(from).getDay();
      if (dow !== 0 && dow !== 6) left -= 1;
      if (left > 0) from = addDays(from, -1);
    }
    return { from, to: today };
  }

  if (/last\s+week/.test(p)) {
    const mon = addDays(mondayOf(today), -7);
    return { from: mon, to: addDays(mon, 6) };
  }
  if (/this\s+week/.test(p)) return { from: mondayOf(today), to: today };

  const t = fromKey(today);
  const wholeMonth = new RegExp(`\\b(?:in|for|during|of|whole|all(?:\\s+of)?)\\s+${MONTH}\\b`, "i").exec(p);
  if (wholeMonth) {
    const m = monthIndex(wholeMonth[1]);
    const year = m > t.getMonth() ? t.getFullYear() - 1 : t.getFullYear();
    const last = toKey(new Date(year, m + 1, 0));
    return { from: toKey(new Date(year, m, 1)), to: last > today ? today : last };
  }
  if (/last\s+month/.test(p)) {
    return {
      from: toKey(new Date(t.getFullYear(), t.getMonth() - 1, 1)),
      to: toKey(new Date(t.getFullYear(), t.getMonth(), 0)),
    };
  }
  if (/this\s+month|month\s+to\s+date/.test(p)) {
    return { from: toKey(new Date(t.getFullYear(), t.getMonth(), 1)), to: today };
  }
  return null;
}

export function localPlan(args: {
  prompt: string;
  today: string;
  defaults: Omit<RunConfig, "from" | "to">;
  timeline: { from: string; to: string } | null;
  hasLocalCommits: boolean;
}): Plan {
  const { prompt, today, defaults, timeline } = args;
  const p = prompt.toLowerCase();
  const range = findRange(prompt, today);
  const mentionsCode = /\bcommits?\b|\brepos?\b|\bcode\b|\bgit\b|\bpush(es|ed)?\b/.test(p);
  const refine = Boolean(timeline) && !range && !mentionsCode;

  const fallback = { from: mondayOf(today), to: today };
  const { from, to } = refine ? timeline! : (range ?? fallback);

  const hours = /(\d+(?:\.\d+)?)\s*(?:h|hrs?|hours?)\s*(?:a|per|\/)\s*day/.exec(p);
  const sat = /\b(include|fill|with)\b[^.]*\b(saturdays?|weekends?)\b/.test(p) ? true : null;
  const sun = /\b(include|fill|with)\b[^.]*\b(sundays?|weekends?)\b/.test(p) ? true : null;
  const noSpread = /\b(don'?t|do not|no)\s+spread/.test(p);
  const spread = /\bspread\b/.test(p) && !noSpread;

  const config: RunConfig = {
    from,
    to,
    weekend: { saturday: sat ?? defaults.weekend.saturday, sunday: sun ?? defaults.weekend.sunday },
    hoursPerDay: hours ? Math.min(24, Math.max(0.25, Number(hours[1]))) : defaults.hoursPerDay,
    spreadCommits: noSpread ? false : spread || defaults.spreadCommits,
    spreadMaxDays: defaults.spreadMaxDays,
  };

  const short = (k: string) => fromKey(k).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return {
    mode: refine ? "refine" : "build",
    config,
    useCommits: !refine && (mentionsCode || args.hasLocalCommits),
    repoIds: [],
    summary: refine
      ? "Applying that to your current timeline."
      : `Filling ${from === to ? short(from) : `${short(from)} – ${short(to)}`}${mentionsCode ? " from your commits" : ""}.`,
  };
}
