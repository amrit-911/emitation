"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, CloudUpload, RefreshCw, TriangleAlert } from "lucide-react";
import { CountUp, Ring } from "./fx";
import { Spinner, Switch, cx, spring } from "./ui";
import { formatHours } from "@/lib/dates";

/** The floating bar at the bottom: totals, dry run, refresh, and the push itself. */
export function PushDock({
  show,
  entries,
  hours,
  invalid,
  stale,
  maxDelay,
  dryRun,
  onDryRun,
  onRefresh,
  refreshing,
  onPush,
  pushing,
  progress,
  justPushed,
  canPush,
  reason,
}: {
  show: boolean;
  entries: number;
  hours: number;
  invalid: number;
  stale: number;
  maxDelay: number;
  dryRun: boolean;
  onDryRun: (v: boolean) => void;
  onRefresh?: () => void;
  refreshing: boolean;
  onPush: () => void;
  pushing: boolean;
  progress: { done: number; total: number };
  justPushed: boolean;
  canPush: boolean;
  reason?: string;
}) {
  const ratio = progress.total ? progress.done / progress.total : 0;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-3">
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ y: 90, opacity: 0, scale: 0.92, filter: "blur(10px)" }}
            animate={{ y: 0, opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={{ y: 90, opacity: 0, scale: 0.92, filter: "blur(10px)" }}
            transition={spring.bouncy}
            className="glass-float rim pointer-events-auto flex max-w-full items-center gap-2 rounded-full py-1.5 pl-5 pr-1.5 sm:gap-3"
          >
            <div className="flex items-baseline gap-1.5 whitespace-nowrap text-[13px]">
              <CountUp value={entries} className="font-semibold text-label" />
              <span className="text-label-3">{entries === 1 ? "entry" : "entries"}</span>
              <span className="text-label-4">·</span>
              <CountUp value={hours} format={formatHours} className="font-mono font-medium text-label" />
              <span className="text-label-3">hrs</span>
            </div>

            <AnimatePresence>
              {invalid > 0 && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.7, width: 0 }}
                  animate={{ opacity: 1, scale: 1, width: "auto" }}
                  exit={{ opacity: 0, scale: 0.7, width: 0 }}
                  className="hidden items-center gap-1 overflow-hidden whitespace-nowrap rounded-full bg-amber-400/10 px-2 py-1 text-[11px] font-medium text-amber-200 sm:inline-flex"
                  title="Entries missing a tag, words or hours — they're skipped on push"
                >
                  <TriangleAlert className="size-3" /> {invalid} to fix
                </motion.span>
              )}
              {stale > 0 && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.7 }}
                  className="hidden items-center gap-1 whitespace-nowrap rounded-full bg-rose-400/10 px-2 py-1 text-[11px] font-medium text-rose-200 md:inline-flex"
                  title={`Emit only accepts entries up to ${maxDelay} days back`}
                >
                  <TriangleAlert className="size-3" /> {stale} too old
                </motion.span>
              )}
            </AnimatePresence>

            <div className="mx-1 hidden h-6 w-px bg-white/10 sm:block" />

            <label className="flex cursor-pointer items-center gap-2 whitespace-nowrap text-xs text-label-2">
              <Switch size="sm" checked={dryRun} onChange={onDryRun} label="Dry run" />
              <span className="hidden sm:inline">Dry run</span>
            </label>

            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={refreshing || pushing}
                title="Re-check what's already logged on Emit"
                className="grid size-9 place-items-center rounded-full text-label-3 transition hover:bg-white/10 hover:text-label disabled:opacity-40"
                aria-label="Re-check Emit"
              >
                {refreshing ? <Spinner className="size-4" /> : <RefreshCw className="size-4" />}
              </button>
            )}

            <motion.button
              type="button"
              onClick={onPush}
              disabled={!canPush || pushing}
              title={reason}
              whileTap={{ scale: 0.95 }}
              className={cx(
                "relative flex h-11 items-center gap-2 overflow-hidden rounded-full pl-1.5 pr-5 text-[13px] font-semibold text-white transition-[opacity,box-shadow] duration-300 disabled:opacity-45",
                !canPush && "pointer-events-none",
              )}
              style={{
                background: justPushed ? "linear-gradient(135deg,#34d399,#14b8a6)" : "var(--accent-grad)",
                boxShadow: "0 10px 30px -10px var(--accent), inset 0 1px 0 rgba(255,255,255,0.3)",
              }}
            >
              <Ring value={pushing ? ratio : justPushed ? 1 : 0} size={32} stroke={2.5} tone="white">
                {justPushed ? <Check className="size-4" strokeWidth={3} /> : pushing ? null : <CloudUpload className="size-3.5" />}
              </Ring>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={pushing ? "p" : justPushed ? "d" : dryRun ? "dry" : "push"}
                  initial={{ y: 14, opacity: 0, filter: "blur(4px)" }}
                  animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
                  exit={{ y: -14, opacity: 0, filter: "blur(4px)" }}
                  transition={spring.snappy}
                  className="whitespace-nowrap"
                >
                  {pushing
                    ? `${dryRun ? "Checking" : "Pushing"} ${progress.done}/${progress.total}`
                    : justPushed
                      ? dryRun
                        ? "Dry run passed"
                        : "Pushed to Emit"
                      : dryRun
                        ? `Dry run ${entries}`
                        : `Push ${entries}`}
                </motion.span>
              </AnimatePresence>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
