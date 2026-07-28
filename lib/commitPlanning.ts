import { toKey } from "./dates";
import type { Commit } from "./types";

export function groupCommitsByDate(commits: Commit[]): Map<string, Commit[]> {
  const map = new Map<string, Commit[]>();
  for (const c of commits) {
    const key = toKey(new Date(c.date));
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(c);
  }
  return map;
}

/**
 * A commit day right after one or more empty gap days usually means "worked
 * for a few days, committed once" — not that no work happened on those days.
 * Spreads that day's commits backward across the empty run (chronologically,
 * earliest commits to the earliest day) so each day gets its fair share
 * instead of dumping everything on the day it happened to land on.
 *
 * Only reassigns which day-bucket a commit lands in — never mutates the
 * commit's own authored date, so "moved from" provenance stays intact.
 */
export function spreadCommitBursts(
  byDate: Map<string, Commit[]>,
  orderedKeys: string[],
  isEligibleRecipient: (key: string) => boolean,
  maxLookback: number,
): Map<string, Commit[]> {
  const result = new Map<string, Commit[]>();
  orderedKeys.forEach((k) => result.set(k, []));

  orderedKeys.forEach((key, i) => {
    const commits = byDate.get(key);
    if (!commits?.length) return;

    let start = i;
    while (
      i - start < maxLookback &&
      start > 0 &&
      !byDate.get(orderedKeys[start - 1])?.length &&
      isEligibleRecipient(orderedKeys[start - 1])
    ) {
      start -= 1;
    }

    const window = orderedKeys.slice(start, i + 1);
    if (window.length === 1) {
      result.set(key, commits);
      return;
    }

    const sorted = [...commits].sort((a, b) => a.date.localeCompare(b.date));
    const n = window.length;
    const base = Math.floor(sorted.length / n);
    let extra = sorted.length % n;
    let cursor = 0;
    window.forEach((wk) => {
      const count = base + (extra > 0 ? 1 : 0);
      if (extra > 0) extra -= 1;
      result.set(wk, sorted.slice(cursor, cursor + count));
      cursor += count;
    });
  });

  return result;
}
