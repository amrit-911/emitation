"use client";

import { useEffect, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import { AnimatePresence, motion, useMotionValueEvent, useSpring } from "motion/react";
import { AlertCircle, Info, Square } from "lucide-react";
import { Orb, cx, spring } from "./ui";

/** Text that resolves word by word out of a blur, the way Apple Intelligence writes. */
export function BlurText({
  text,
  delay = 0,
  step,
  className,
  soft,
}: {
  text: string;
  delay?: number;
  step?: number;
  className?: string;
  /** Fade/rise only — no per-word blur layers. For long or repeated text. */
  soft?: boolean;
}) {
  const parts = text.split(/(\s+)/);
  let i = 0;
  return (
    <span className={className} aria-label={text}>
      {parts.map((w, k) =>
        /^\s+$/.test(w) || !w ? (
          w
        ) : (
          <span
            key={k}
            aria-hidden
            className={soft ? "word-in-soft" : "word-in"}
            style={
              {
                "--i": i++,
                "--d": `${delay}ms`,
                ...(step ? { "--step": `${step}ms` } : {}),
              } as CSSProperties
            }
          >
            {w}
          </span>
        ),
      )}
    </span>
  );
}

/** A gradient line that wipes in out of a blur (gradient text can't be split per word). */
export function RevealLine({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <span className="line-in" style={{ "--d": `${delay}ms` } as CSSProperties}>
      <span className={className}>{children}</span>
    </span>
  );
}

/** A number that springs to its new value instead of jumping. */
export function CountUp({
  value,
  format = (v) => `${Math.round(v)}`,
  className,
}: {
  value: number;
  format?: (v: number) => string;
  className?: string;
}) {
  const mv = useSpring(0, { stiffness: 90, damping: 18, mass: 0.8 });
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    mv.set(value);
  }, [mv, value]);
  useMotionValueEvent(mv, "change", (v) => {
    if (ref.current) ref.current.textContent = format(v);
  });
  return (
    <span ref={ref} className={cx("tabular-nums", className)}>
      {format(0)}
    </span>
  );
}

/** A checkmark that draws itself inside a filling circle. */
export function CheckDraw({ className, delay = 0 }: { className?: string; delay?: number }) {
  return (
    <motion.svg viewBox="0 0 24 24" className={cx("size-4", className)} initial="hidden" animate="shown">
      <motion.circle
        cx="12"
        cy="12"
        r="10"
        fill="currentColor"
        fillOpacity={0.16}
        stroke="currentColor"
        strokeWidth={1.6}
        variants={{ hidden: { pathLength: 0, opacity: 0 }, shown: { pathLength: 1, opacity: 1 } }}
        transition={{ duration: 0.45, delay, ease: [0.16, 1, 0.3, 1] }}
      />
      <motion.path
        d="M7.5 12.5l3 3 6-6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        variants={{ hidden: { pathLength: 0 }, shown: { pathLength: 1 } }}
        transition={{ duration: 0.35, delay: delay + 0.28, ease: [0.16, 1, 0.3, 1] }}
      />
    </motion.svg>
  );
}

/** Circular progress, used for a day's hours and for the push button. */
export function Ring({
  value,
  size = 28,
  stroke = 3,
  className,
  children,
  tone = "accent",
}: {
  value: number;
  size?: number;
  stroke?: number;
  className?: string;
  children?: ReactNode;
  tone?: "accent" | "green" | "amber" | "white";
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = {
    accent: "var(--accent)",
    green: "#5eead4",
    amber: "#fcd34d",
    white: "#fff",
  }[tone];
  return (
    <span className={cx("relative inline-grid place-items-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - Math.max(0, Math.min(1, value))) }}
          transition={spring.smooth}
          style={{ filter: `drop-shadow(0 0 4px ${color})` }}
        />
      </svg>
      {children && <span className="absolute inset-0 grid place-items-center">{children}</span>}
    </span>
  );
}

/* ---------------------------------------------------------- dynamic island */

export type IslandState =
  | { kind: "busy"; label: string; detail?: string }
  | { kind: "toast"; id: number; tone: "ok" | "err" | "info"; message: string }
  | null;

/**
 * A Dynamic-Island-style status capsule: it morphs to fit whatever it says —
 * the AI's current step while a run is going, otherwise the latest message.
 */
export function Island({ state, onStop }: { state: IslandState; onStop?: () => void }) {
  const key = !state ? "none" : state.kind === "busy" ? `busy:${state.label}` : `toast:${state.id}`;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[78px] z-[80] flex justify-center px-4 lg:bottom-auto lg:top-3 lg:px-20">
      <AnimatePresence>
        {state && (
          <motion.div
            layout
            initial={{ opacity: 0, scale: 0.5, y: -10, filter: "blur(10px)" }}
            animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 0.6, y: -8, filter: "blur(10px)" }}
            transition={spring.bouncy}
            style={{ borderRadius: 22 }}
            className="pointer-events-auto relative max-w-[min(92vw,560px)] overflow-hidden border border-white/[0.08] bg-black/90 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.08)]"
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={key}
                layout="position"
                initial={{ opacity: 0, filter: "blur(6px)", scale: 0.92 }}
                animate={{ opacity: 1, filter: "blur(0px)", scale: 1 }}
                exit={{ opacity: 0, filter: "blur(6px)", scale: 0.92 }}
                transition={spring.snappy}
                className="flex h-11 min-w-0 items-center gap-2.5 pl-3.5 pr-4"
              >
                {state.kind === "busy" ? (
                  <>
                    <Orb className="size-[18px]" />
                    <span className="text-shimmer truncate text-[13px] font-medium">{state.label}</span>
                    {state.detail && (
                      <motion.span
                        key={state.detail}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="hidden shrink-0 text-xs tabular-nums text-white/45 sm:inline"
                      >
                        {state.detail}
                      </motion.span>
                    )}
                    {onStop && (
                      <button
                        type="button"
                        onClick={onStop}
                        className="ml-1 grid size-6 shrink-0 place-items-center rounded-full bg-white/10 text-white/80 transition hover:bg-white/20"
                        aria-label="Stop"
                      >
                        <Square className="size-2.5 fill-current" />
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    {state.tone === "ok" ? (
                      <CheckDraw className="size-[18px] shrink-0 text-emerald-300" />
                    ) : state.tone === "err" ? (
                      <AlertCircle className="size-[18px] shrink-0 text-rose-300" />
                    ) : (
                      <Info className="size-[18px] shrink-0 text-sky-300" />
                    )}
                    <span className="line-clamp-2 text-[13px] font-medium leading-snug text-white/90">
                      {state.message}
                    </span>
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
