"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  AnimatePresence,
  motion,
  useMotionTemplate,
  useMotionValue,
  useSpring,
  useTransform,
} from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  ClipboardList,
  CloudUpload,
  CodeXml,
  FileText,
  FlaskConical,
  FolderOpen,
  GitBranch,
  GitCommitHorizontal,
  KeyRound,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { BlurText, CheckDraw, RevealLine, Ring } from "./fx";
import { BitbucketMark, Button, GithubMark, GitlabMark, Orb, cx, spring } from "./ui";
import { ROLE_LIST, roleOf } from "@/lib/roles";
import type { Role } from "@/lib/types";

const SCENES = ["welcome", "role", "ask", "context", "push", "ready"] as const;
type Scene = (typeof SCENES)[number];

const ROLE_ICON: Record<Role, ReactNode> = {
  developer: <CodeXml className="size-6" />,
  tester: <FlaskConical className="size-6" />,
  ba: <ClipboardList className="size-6" />,
};

/** Fires stage 1, 2, 3… at the given cumulative times. Remount (via key) to replay. */
function useStage(timings: number[]) {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const timers = timings.map((t, i) => setTimeout(() => setStage(i + 1), t));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return stage;
}

function useTyped(text: string, speed = 26) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((x) => (x >= text.length ? x : x + 1)), speed);
    return () => clearInterval(t);
  }, [text, speed]);
  return text.slice(0, n);
}

export function Onboarding({
  instant,
  role,
  onRole,
  onDone,
  onConnect,
}: {
  /** First visit: cover the page from the first frame instead of fading in over it. */
  instant?: boolean;
  role: Role | null;
  onRole: (r: Role) => void;
  onDone: () => void;
  onConnect: () => void;
}) {
  const [i, setI] = useState(0);
  /** Furthest step reached — the dots can go back, never ahead. */
  const [reached, setReached] = useState(0);
  const [dir, setDir] = useState(1);
  const scene: Scene = SCENES[i];
  const canNext = scene !== "role" || Boolean(role);

  const go = (next: number) => {
    if (next < 0 || next >= SCENES.length) return;
    if (next > i && (!canNext || next > Math.max(reached, i + 1))) return;
    setDir(next > i ? 1 : -1);
    setI(next);
    setReached((r) => Math.max(r, next));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "Enter") {
        if (i === SCENES.length - 1) onDone();
        else go(i + 1);
      } else if (e.key === "ArrowLeft") go(i - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const r = roleOf(role);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal aria-label="Quick tour">
      {/* the page stays visible behind, dimmed */}
      <motion.div
        className="absolute inset-0 bg-black/55"
        initial={instant ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.35 }}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12, transition: { duration: 0.2 } }}
        transition={spring.smooth}
        className="glass-strong rim relative flex h-[min(92vh,620px)] w-full max-w-[880px] flex-col overflow-hidden rounded-[32px]"
      >
        <div className="flex h-8 items-center px-6 pt-5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-label-4">
            Quick tour · {i + 1}/{SCENES.length}
          </span>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-y-auto overflow-x-hidden px-5 py-6 sm:px-10">
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div
              key={scene}
              custom={dir}
              variants={{
                enter: (d: number) => ({ opacity: 0, x: d * 50 }),
                center: { opacity: 1, x: 0 },
                exit: (d: number) => ({ opacity: 0, x: d * -50 }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={spring.smooth}
              className="w-full"
            >
              {scene === "welcome" && <Welcome />}
              {scene === "role" && <RolePick role={role} onRole={onRole} />}
              {scene === "ask" && <AskDemo role={role ?? "developer"} />}
              {scene === "context" && <ContextDemo role={role ?? "developer"} />}
              {scene === "push" && <PushDemo role={role ?? "developer"} />}
              {scene === "ready" && (
                <Ready
                  codeFirst={r.codeFirst}
                  label={r.label}
                  onConnect={() => {
                    onDone();
                    onConnect();
                  }}
                  onStart={onDone}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-white/[0.07] px-5 py-4">
          <Button variant="ghost" onClick={() => go(i - 1)} disabled={i === 0} className="w-28 justify-start">
            <ArrowLeft className="size-4" /> Back
          </Button>

          <div className="flex items-center gap-1.5">
            {SCENES.map((s, k) => (
              <button
                key={s}
                type="button"
                aria-label={`Step ${k + 1}`}
                onClick={() => go(k)}
                disabled={k > reached}
                className="group grid h-4 place-items-center disabled:cursor-default"
              >
                <motion.span
                  animate={{ width: k === i ? 24 : 6, opacity: k === i ? 1 : k < i ? 0.55 : 0.25 }}
                  transition={spring.snappy}
                  className="block h-1.5 rounded-full bg-white"
                />
              </button>
            ))}
          </div>

          {i < SCENES.length - 1 ? (
            <Button variant="primary" onClick={() => go(i + 1)} disabled={!canNext} className="w-28">
              {scene === "welcome" ? "Show me" : "Next"} <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button variant="primary" onClick={onDone} className="w-28">
              Done
            </Button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------ scenes */

function Heading({ eyebrow, title, sub }: { eyebrow?: string; title: ReactNode; sub?: string }) {
  return (
    <div className="mx-auto mb-7 max-w-2xl text-center">
      {eyebrow && (
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.smooth, delay: 0.05 }}
          className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-accent"
        >
          {eyebrow}
        </motion.p>
      )}
      <h2 className="text-balance text-2xl font-semibold tracking-[-0.035em] text-label sm:text-[30px] sm:leading-[1.15]">
        {title}
      </h2>
      {sub && (
        <p className="mx-auto mt-4 max-w-xl text-pretty text-[15px] leading-relaxed text-label-2">
          <BlurText text={sub} delay={250} step={14} />
        </p>
      )}
    </div>
  );
}

function Welcome() {
  return (
    <div className="flex flex-col items-center text-center">
      {/* The wordmark resolves letter by letter, then its full stop drops into place. */}
      <h1
        aria-label="Emitation"
        className="mb-6 flex items-baseline text-[56px] font-semibold leading-none tracking-[-0.065em] text-label sm:text-[80px]"
      >
        {"emitation".split("").map((ch, i) => (
          <span key={i} aria-hidden className="word-in" style={{ "--i": i, "--step": "55ms", "--d": "120ms" } as CSSProperties}>
            {ch}
          </span>
        ))}
        <motion.span
          aria-hidden
          initial={{ y: "-1.2em", opacity: 0, scale: 0.3 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ type: "spring", bounce: 0.55, visualDuration: 0.55, delay: 0.75 }}
          className="ml-[0.2em] inline-block size-[0.19em] rounded-full shadow-[0_0_28px_var(--accent)]"
          style={{ background: "var(--accent-grad)" }}
        />
      </h1>
      <h2 className="text-balance text-[26px] font-semibold leading-[1.15] tracking-[-0.035em] sm:text-[34px]">
        <BlurText text="Your timesheet," delay={900} step={50} />{" "}
        <RevealLine delay={1150} className="text-accent-grad pb-1">
          just ask.
        </RevealLine>
      </h2>
      <p className="mx-auto mt-5 max-w-lg text-pretty text-[16px] leading-relaxed text-label-2">
        <BlurText
          text="Describe your week in one sentence. Emitation reads your commits, folders and notes, writes every entry with the right tags, and pushes it to Emit."
          delay={1300}
          step={12}
        />
      </p>
    </div>
  );
}

/** A card that tilts toward the pointer with a moving glare, Apple TV style. */
function TiltCard({
  children,
  selected,
  dimmed,
  onClick,
  delay,
}: {
  children: ReactNode;
  selected: boolean;
  dimmed?: boolean;
  onClick: () => void;
  delay: number;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const rx = useSpring(useTransform(py, [0, 1], [9, -9]), { stiffness: 220, damping: 18 });
  const ry = useSpring(useTransform(px, [0, 1], [-11, 11]), { stiffness: 220, damping: 18 });
  const gx = useTransform(px, [0, 1], ["0%", "100%"]);
  const gy = useTransform(py, [0, 1], ["0%", "100%"]);
  const glare = useMotionTemplate`radial-gradient(420px circle at ${gx} ${gy}, rgba(255,255,255,0.16), transparent 55%)`;

  return (
    <motion.button
      ref={ref}
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring.smooth, delay }}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.97 }}
      role="radio"
      aria-checked={selected}
      onPointerMove={(e) => {
        const r = ref.current!.getBoundingClientRect();
        px.set((e.clientX - r.left) / r.width);
        py.set((e.clientY - r.top) / r.height);
      }}
      onPointerLeave={() => {
        px.set(0.5);
        py.set(0.5);
      }}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 900 }}
      className={cx(
        "glass rim group relative flex cursor-pointer flex-col items-start overflow-hidden rounded-[28px] p-6 text-left transition-[border-color,box-shadow,opacity,background-color] duration-300",
        selected
          ? "border-[color-mix(in_oklab,var(--accent)_55%,transparent)] bg-[color-mix(in_oklab,var(--accent)_8%,transparent)] shadow-[0_0_0_1px_color-mix(in_oklab,var(--accent)_40%,transparent),0_30px_80px_-30px_var(--accent)]"
          : "hover:border-white/25 hover:shadow-[0_24px_60px_-28px_rgba(0,0,0,0.9)]",
        dimmed && "opacity-60 hover:opacity-100",
      )}
    >
      <motion.span className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ background: glare }} />
      {children}
      {/* a radio, so it reads as something to pick */}
      <span
        aria-hidden
        className="absolute right-4 top-4 size-7 rounded-full border-2 border-white/25 transition-colors duration-300 group-hover:border-white/50"
      />
      <AnimatePresence>
        {selected && (
          <motion.span
            initial={{ scale: 0, rotate: -45 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0 }}
            transition={spring.bouncy}
            className="absolute right-4 top-4 grid size-7 place-items-center rounded-full text-white"
            style={{ background: "var(--accent-grad)" }}
          >
            <Check className="size-4" strokeWidth={3} />
          </motion.span>
        )}
      </AnimatePresence>
      <span
        className={cx(
          "mt-5 inline-flex items-center gap-1 text-xs font-medium transition-colors duration-300",
          selected ? "text-accent" : "text-label-3 group-hover:text-label",
        )}
      >
        {selected ? "Selected" : "Choose"}
        {!selected && <ArrowRight className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />}
      </span>
    </motion.button>
  );
}

function RolePick({ role, onRole }: { role: Role | null; onRole: (r: Role) => void }) {
  return (
    <div>
      <Heading
        eyebrow="Make it yours"
        title="What do you do?"
        sub="Examples, suggestions and what's front and centre adapt to your role. You can switch anytime."
      />
      <div className="grid gap-4 [perspective:1200px] sm:grid-cols-3" role="radiogroup" aria-label="Your role">
        {ROLE_LIST.map((r, k) => (
          <TiltCard
            key={r.id}
            selected={role === r.id}
            dimmed={Boolean(role) && role !== r.id}
            onClick={() => onRole(r.id)}
            delay={0.15 + k * 0.08}
          >
            <span
              className={cx(
                "mb-8 grid size-12 place-items-center rounded-2xl border border-white/10 transition-colors duration-500",
                role === r.id ? "text-white" : "bg-white/[0.06] text-label-2",
              )}
              style={role === r.id ? { background: "var(--accent-grad)" } : undefined}
            >
              {ROLE_ICON[r.id]}
            </span>
            <span className="text-lg font-semibold tracking-[-0.02em] text-label">{r.label}</span>
            <span className="mt-1.5 text-[13px] leading-relaxed text-label-2">{r.blurb}</span>
            <span className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[11px] text-label-3">
              {r.codeFirst ? (
                <>
                  <GitBranch className="size-3" /> Repos front and centre
                </>
              ) : (
                <>
                  <FileText className="size-3" /> Repos tucked away
                </>
              )}
            </span>
          </TiltCard>
        ))}
      </div>
      <p className={cx("mt-5 text-center text-xs transition-opacity duration-300", role ? "opacity-0" : "text-label-3")}>
        Pick the one closest to your work to continue
      </p>
    </div>
  );
}

const DEMO_DAYS: Record<Role, { day: string; text: string; activity: string; hours: string }[]> = {
  developer: [
    { day: "Mon 12", text: "Built the commit importer with workspace discovery", activity: "#Development", hours: "7:30" },
    { day: "Tue 13", text: "Fixed pagination edge cases in the commit sync", activity: "#Development", hours: "8:00" },
    { day: "Wed 14", text: "Reviewed pull requests and polished the timeline", activity: "#CodeReview", hours: "8:00" },
  ],
  tester: [
    { day: "Mon 12", text: "Ran the checkout regression suite, logged three defects", activity: "#Testing", hours: "7:00" },
    { day: "Tue 13", text: "Retested payment fixes on staging", activity: "#Testing", hours: "8:00" },
    { day: "Wed 14", text: "Smoke tested the release candidate", activity: "#QA", hours: "8:00" },
  ],
  ba: [
    { day: "Mon 12", text: "Requirements workshop with finance stakeholders", activity: "#Analysis", hours: "8:00" },
    { day: "Tue 13", text: "Wrote invoicing user stories and acceptance criteria", activity: "#Documentation", hours: "8:00" },
    { day: "Wed 14", text: "Backlog grooming with the product owner", activity: "#Meeting", hours: "8:00" },
  ],
};

function MockComposer({ text, sent, chip }: { text: string; sent: boolean; chip?: ReactNode }) {
  return (
    <div className="ai-ring rounded-[26px]" data-state={sent ? "busy" : "focus"}>
      <span className="ai-ring__glow">
        <i />
      </span>
      <span className="ai-ring__edge" />
      <div className="glass relative rounded-[26px] px-5 pb-3 pt-4">
        <AnimatePresence>{chip}</AnimatePresence>
        <p className="min-h-[52px] text-[16px] leading-7 tracking-[-0.01em] text-label">
          {text}
          {!sent && <span className="caret" />}
        </p>
        <div className="mt-2 flex items-center justify-end">
          <motion.span
            animate={sent ? { scale: [1, 0.85, 1.08, 1] } : { scale: 1 }}
            transition={{ duration: 0.5 }}
            className="grid size-9 place-items-center rounded-full text-white"
            style={{ background: "var(--accent-grad)" }}
          >
            <ArrowUp className="size-4" strokeWidth={2.5} />
          </motion.span>
        </div>
      </div>
    </div>
  );
}

function DemoStep({ state, label }: { state: "wait" | "active" | "done"; label: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10, filter: "blur(6px)" }}
      animate={{ opacity: state === "wait" ? 0.35 : 1, x: 0, filter: "blur(0px)" }}
      transition={spring.smooth}
      className="flex items-center gap-3 text-[13px]"
    >
      <span className="grid size-5 place-items-center">
        {state === "done" ? (
          <CheckDraw className="size-5 text-emerald-300" />
        ) : state === "active" ? (
          <Orb className="size-4" />
        ) : (
          <span className="size-1.5 rounded-full bg-white/40" />
        )}
      </span>
      <span className={state === "active" ? "text-shimmer font-medium" : "text-label-2"}>{label}</span>
    </motion.div>
  );
}

function MiniDay({ d, k, written }: { d: (typeof DEMO_DAYS)["developer"][number]; k: number; written: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...spring.smooth, delay: k * 0.12 }}
      className={cx("glass-lite rounded-[20px] p-4", written && "sheen")}
    >
      <div className="mb-2 flex items-center justify-between text-[11px] text-label-3">
        <span className="font-medium text-label-2">{d.day} Sep</span>
        <span className="font-mono">{d.hours}</span>
      </div>
      <p className="min-h-[40px] text-[13px] leading-snug text-label">
        {written ? <BlurText text={d.text} delay={k * 140} /> : <span className="skeleton block h-3.5 w-4/5 rounded-full" />}
      </p>
      <div className="mt-3 flex gap-1.5">
        <span className="rounded-full border border-[color-mix(in_oklab,var(--accent)_30%,transparent)] bg-[color-mix(in_oklab,var(--accent)_14%,transparent)] px-2 py-0.5 text-[10.5px] text-[color-mix(in_oklab,var(--accent)_65%,white)]">
          #Atlas
        </span>
        <span className="rounded-full border border-sky-400/25 bg-sky-400/10 px-2 py-0.5 text-[10.5px] text-sky-200">
          {d.activity}
        </span>
      </div>
    </motion.div>
  );
}

function AskDemo({ role }: { role: Role }) {
  const [run, setRun] = useState(0);
  return (
    <div>
      <Heading
        eyebrow="Prompt first"
        title={
          <>
            Say it like you&rsquo;d say it <span className="text-accent-grad">to a colleague</span>
          </>
        }
      />
      <AskBody key={run} role={role} onReplay={() => setRun((x) => x + 1)} />
    </div>
  );
}

function AskBody({ role, onReplay }: { role: Role; onReplay: () => void }) {
  const r = roleOf(role);
  const prompt = r.examples[role === "developer" ? 0 : 1];
  const typeMs = prompt.length * 26;
  const stage = useStage([typeMs + 500, typeMs + 1500, typeMs + 2600, typeMs + 3700, typeMs + 4300]);
  const text = useTyped(prompt, 26);
  const steps =
    role === "developer"
      ? ["Understanding your request", "Pulling 23 commits from 2 repos", "Writing 3 days"]
      : ["Understanding your request", "Reading your notes", "Writing 3 days"];

  return (
    <div className="mx-auto grid max-w-3xl gap-6 md:grid-cols-[1.1fr_1fr]">
      <div className="space-y-5">
        <MockComposer text={text} sent={stage >= 1} />
        <div className="space-y-2.5 pl-2">
          {stage >= 1 &&
            steps.map((s, k) => (
              <DemoStep key={s} label={s} state={stage > k + 1 ? "done" : stage === k + 1 ? "active" : "wait"} />
            ))}
        </div>
      </div>
      <div className="space-y-3">
        {stage >= 4 ? (
          DEMO_DAYS[role].map((d, k) => <MiniDay key={d.day} d={d} k={k} written />)
        ) : (
          <div className="grid h-full min-h-[220px] place-items-center rounded-[22px] border border-dashed border-white/10 text-xs text-label-4">
            your days land here
          </div>
        )}
        {stage >= 5 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-end">
            <Button size="xs" variant="ghost" onClick={onReplay}>
              <RotateCcw className="size-3" /> Replay
            </Button>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function ContextDemo({ role }: { role: Role }) {
  const stage = useStage([700, 1500, 2300]);
  const chip =
    role === "developer"
      ? { name: "emitation", meta: "38 commits · main · 412 files", icon: <FolderOpen className="size-3.5" /> }
      : role === "tester"
        ? { name: "test-plans", meta: "46 files · 9 edited this week", icon: <FolderOpen className="size-3.5" /> }
        : { name: "meeting-notes.md", meta: "12 KB · notes", icon: <FileText className="size-3.5" /> };
  const points =
    role === "developer"
      ? [
          { icon: <GitCommitHorizontal className="size-4" />, text: "Reads your own commits straight from .git — no token needed" },
          { icon: <GitBranch className="size-4" />, text: "Recognises the remote, so your repo's tag mapping applies" },
          { icon: <ShieldCheck className="size-4" />, text: "Read on this device; only a short summary goes to the AI" },
        ]
      : [
          { icon: <FileText className="size-4" />, text: "Test plans, specs and notes ground every entry in real work" },
          { icon: <FolderOpen className="size-4" />, text: "Files edited on a day hint at what you did that day" },
          { icon: <ShieldCheck className="size-4" />, text: "Read on this device; only a short summary goes to the AI" },
        ];

  return (
    <div>
      <Heading
        eyebrow="Context"
        title={
          <>
            Drop in a folder. <span className="text-accent-grad">It reads the room.</span>
          </>
        }
      />
      <div className="mx-auto grid max-w-3xl items-center gap-8 md:grid-cols-2">
        <div className="relative">
          <motion.div
            initial={{ x: -120, y: -90, rotate: -18, opacity: 0, scale: 1.2 }}
            animate={
              stage >= 1
                ? { x: 30, y: 40, rotate: 0, opacity: 0, scale: 0.5 }
                : { x: -40, y: -60, rotate: -10, opacity: 1, scale: 1 }
            }
            transition={stage >= 1 ? { duration: 0.6, ease: [0.5, 0, 0.75, 0] } : spring.bouncy}
            className="absolute left-6 top-0 z-10 grid size-16 place-items-center rounded-2xl text-white shadow-2xl"
            style={{ background: "var(--accent-grad)" }}
          >
            <FolderOpen className="size-7" />
          </motion.div>
          <MockComposer
            text={stage >= 2 ? "Fill last week from this" : ""}
            sent={false}
            chip={
              stage >= 1 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.6, filter: "blur(8px)" }}
                  animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                  transition={spring.bouncy}
                  className="mb-3 inline-flex items-center gap-2 rounded-[14px] border border-white/10 bg-white/[0.06] py-1.5 pl-2 pr-3"
                >
                  <span className="grid size-7 place-items-center rounded-[9px] text-white" style={{ background: "var(--accent-grad)" }}>
                    {chip.icon}
                  </span>
                  <span>
                    <span className="block text-xs font-medium">{chip.name}</span>
                    <span className="block text-[10.5px] text-label-3">{chip.meta}</span>
                  </span>
                </motion.div>
              )
            }
          />
        </div>
        <ul className="space-y-4">
          {points.map((p, k) => (
            <motion.li
              key={p.text}
              initial={{ opacity: 0, x: 16, filter: "blur(6px)" }}
              animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              transition={{ ...spring.smooth, delay: 0.3 + k * 0.12 }}
              className="flex items-start gap-3"
            >
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.06] text-accent">
                {p.icon}
              </span>
              <span className="pt-1 text-[14px] leading-relaxed text-label-2">{p.text}</span>
            </motion.li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function PushDemo({ role }: { role: Role }) {
  const stage = useStage([600, 900, 1200, 1500, 2200]);
  const progress = Math.min(1, Math.max(0, (stage - 1) / 3));
  return (
    <div>
      <Heading
        eyebrow="Review & push"
        title={
          <>
            Edit anything. <span className="text-accent-grad">Push when it&rsquo;s right.</span>
          </>
        }
        sub="Every entry is checked against your team's rules first. Hours already on Emit are respected, and a dry run is always one switch away."
      />
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-6">
        <div className="grid w-full gap-3 sm:grid-cols-3">
          {DEMO_DAYS[role].map((d, k) => (
            <div key={d.day} className="relative">
              <MiniDay d={d} k={k} written={false} />
              <AnimatePresence>
                {stage > k + 1 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={spring.bouncy}
                    className="absolute -right-1.5 -top-1.5 rounded-full bg-[#04050a]"
                  >
                    <CheckDraw className="size-6 text-emerald-300" />
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ ...spring.bouncy, delay: 0.3 }}
          className="glass rim flex items-center gap-4 rounded-full py-2 pl-5 pr-2"
        >
          <span className="text-[13px] text-label-2">
            <span className="font-semibold text-label">3 entries</span> · 23:30 hrs
          </span>
          <span
            className="flex h-10 items-center gap-2 rounded-full pl-2 pr-4 text-[13px] font-medium text-white"
            style={{ background: stage >= 5 ? "linear-gradient(135deg,#34d399,#14b8a6)" : "var(--accent-grad)" }}
          >
            <Ring value={progress} size={26} stroke={2.5} tone="white">
              {stage >= 5 ? <Check className="size-3.5" strokeWidth={3} /> : <CloudUpload className="size-3" />}
            </Ring>
            {stage >= 5 ? "Pushed to Emit" : stage >= 2 ? `Pushing ${Math.min(3, stage - 1)}/3` : "Push 3 to Emit"}
          </span>
        </motion.div>
      </div>
    </div>
  );
}

function Ready({
  codeFirst,
  label,
  onConnect,
  onStart,
}: {
  codeFirst: boolean;
  label: string;
  onConnect: () => void;
  onStart: () => void;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <motion.div
        initial={{ scale: 0, rotate: -30 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ ...spring.bouncy, delay: 0.1 }}
        className="mb-8"
      >
        <CheckDraw className="size-20 text-emerald-300" delay={0.2} />
      </motion.div>
      <h2 className="text-[30px] font-semibold tracking-[-0.04em]">
        <BlurText text="You're all set." delay={150} step={60} />
      </h2>
      <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-label-2">
        <BlurText
          text={`Tuned for a ${label.toLowerCase()}. Connect Emit to push — everything is stored only in this browser.`}
          delay={450}
          step={14}
        />
      </p>
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring.smooth, delay: 0.8 }}
        className="mt-9 flex flex-wrap items-center justify-center gap-3"
      >
        <Button variant="glass" size="lg" onClick={onConnect}>
          <KeyRound className="size-4" /> Connect Emit
          {codeFirst && (
            <span className="ml-1 flex items-center gap-1 text-label-3">
              <GithubMark className="size-3.5" />
              <GitlabMark className="size-3.5" />
              <BitbucketMark className="size-3.5" />
            </span>
          )}
        </Button>
        <Button variant="primary" size="lg" onClick={onStart}>
          Start writing <ArrowRight className="size-4" />
        </Button>
      </motion.div>
    </div>
  );
}
