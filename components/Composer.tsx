"use client";

import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { MutableRefObject, ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUp,
  BookmarkPlus,
  CalendarRange,
  ChevronRight,
  FileText,
  FolderOpen,
  GitBranch,
  GitCommitHorizontal,
  Lock,
  Mic,
  Paperclip,
  Plus,
  Square,
  X,
} from "lucide-react";
import { Kbd, Spinner, cx, spring } from "./ui";
import { DateRangePicker, rangeText } from "./DateRangePicker";
import type { DateRange } from "./DateRangePicker";
import {
  canPickDirectory,
  collectFromDrop,
  collectFromFileList,
  pickDirectory,
  toAttachments,
} from "@/lib/folderContext";
import type { Attachment, Repo } from "@/lib/types";

export type ComposerHandle = {
  focus: () => void;
  attachFolder: () => void;
  /** Writes text in as if typed — used by the prompt pills. */
  typeIn: (text: string) => void;
  setValue: (text: string) => void;
};

type Props = {
  onSubmit: (v: string) => void;
  onStop?: () => void;
  busy: boolean;
  examples: string[];
  attachments: Attachment[];
  onAttach: (a: Attachment[]) => void;
  onRemoveAttachment: (id: string) => void;
  repos: Repo[];
  /** The window every run is held to, picked from the + menu. */
  lockedRange: DateRange | null;
  onLockRange: (r: DateRange | null) => void;
  /** Developers get a sources chip right on the composer. */
  sourcesChip?: { count: number; onClick: () => void } | null;
  onSavePrompt?: (v: string) => void;
  compact?: boolean;
  notify: (tone: "ok" | "err" | "info", message: string) => void;
};

/* ------------------------------------------------------------------ voice */

type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

const speechCtor = (): (new () => Recognition) | undefined => {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};
const noopSubscribe = () => () => {};

/* ------------------------------------------------------------ placeholder */

/**
 * Types an example in, holds it, dissolves it, types the next. Lives in its own
 * component so its ~30 updates a second never re-render the composer.
 */
const TypingPlaceholder = memo(function TypingPlaceholder({
  examples,
  compact,
  currentRef,
}: {
  examples: string[];
  compact?: boolean;
  currentRef: MutableRefObject<string>;
}) {
  const [text, setText] = useState("");
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<"type" | "hold" | "out">("type");
  const full = examples[idx % Math.max(1, examples.length)] ?? "";

  useEffect(() => {
    currentRef.current = full;
  }, [full, currentRef]);

  useEffect(() => {
    if (!full) return;
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const type = () => {
      i += 1;
      setText(full.slice(0, i));
      if (i < full.length) {
        // Human rhythm: quicker inside words, a beat after punctuation.
        const ch = full[i - 1];
        timer = setTimeout(type, /[,.—]/.test(ch) ? 180 : ch === " " ? 55 : 22 + Math.random() * 34);
      } else {
        setPhase("hold");
        timer = setTimeout(() => {
          setPhase("out");
          timer = setTimeout(() => setIdx((n) => n + 1), 520);
        }, 2600);
      }
    };
    // The previous example has dissolved by now, so resetting here is invisible.
    timer = setTimeout(() => {
      setPhase("type");
      setText("");
      type();
    }, 450);
    return () => clearTimeout(timer);
  }, [full]);

  return (
    <div
      aria-hidden
      className={cx(
        "pointer-events-none absolute inset-x-0 top-0 select-none",
        compact ? "px-4 pt-3 text-[15px] leading-7" : "px-5 pt-4 text-[17px] leading-8 tracking-[-0.01em]",
      )}
    >
      <span
        className={cx(
          "inline transition-[opacity,filter] duration-500 ease-apple",
          phase === "out" ? "opacity-0 blur-[6px]" : "opacity-100",
        )}
      >
        <span className="text-label-3">{text}</span>
        <span className="caret" />
      </span>
      {phase === "hold" && !compact && (
        <span className="ml-3 inline-flex translate-y-[-2px] items-center gap-1 align-middle text-[11px] text-label-4">
          <Kbd>Tab</Kbd> to use
        </span>
      )}
    </div>
  );
});

/* ---------------------------------------------------------------- composer */

export const Composer = forwardRef<ComposerHandle, Props>(function Composer(
  {
    onSubmit,
    onStop,
    busy,
    examples,
    attachments,
    onAttach,
    onRemoveAttachment,
    repos,
    lockedRange,
    onLockRange,
    sourcesChip,
    onSavePrompt,
    compact,
    notify,
  },
  ref,
) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState<string | null>(null);
  const [menu, setMenu] = useState<null | "root" | "dates">(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const plusRef = useRef<HTMLButtonElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const typing = useRef<ReturnType<typeof setInterval> | null>(null);
  const dragDepth = useRef(0);
  const example = useRef("");
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  // false on the server, the real answer in the browser — without a mount effect.
  const canDictate = useSyncExternalStore(noopSubscribe, () => Boolean(speechCtor()), () => false);

  const stopDictation = useCallback(() => recognition.current?.stop(), []);

  /** Speech → text, appended to whatever is already typed, words streaming in as you talk. */
  const toggleDictation = () => {
    if (listening) return stopDictation();
    const Ctor = speechCtor();
    if (!Ctor) return notify("info", "Voice input isn't supported in this browser — try Chrome or Edge");
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || "en-US";
    const base = area.current?.value.trimEnd() ?? "";
    rec.onresult = (e) => {
      let heard = "";
      for (let i = 0; i < e.results.length; i++) heard += e.results[i][0].transcript;
      setValue(`${base}${base && heard ? " " : ""}${heard.trimStart()}`);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") notify("err", "Microphone access was blocked");
      else if (e.error !== "no-speech" && e.error !== "aborted") notify("err", `Voice input: ${e.error}`);
    };
    rec.onend = () => {
      setListening(false);
      recognition.current = null;
      area.current?.focus();
    };
    recognition.current = rec;
    setListening(true);
    rec.start();
  };

  useEffect(() => () => recognition.current?.stop(), []);

  const ingest = useCallback(
    async (job: () => Promise<{ attachments: Attachment[]; rejected: string[] } | null>, label: string) => {
      setReading(label);
      try {
        const res = await job();
        if (!res) return;
        if (res.attachments.length) onAttach(res.attachments);
        if (res.rejected.length) notify("info", `Skipped ${res.rejected.join(", ")} — only text files are read`);
        const folder = res.attachments.find((a) => a.kind === "folder");
        if (folder && folder.kind === "folder") {
          notify(
            "ok",
            folder.commits.length
              ? `Read ${folder.name}: ${folder.commits.length} of your commits, ${folder.fileCount} files`
              : `Read ${folder.name}: ${folder.fileCount} files (no git history found)`,
          );
        }
      } catch (err) {
        notify("err", `Couldn't read that: ${(err as Error).message}`);
      } finally {
        setReading(null);
      }
    },
    [notify, onAttach],
  );

  const pickFolder = useCallback(() => {
    setMenu(null);
    if (canPickDirectory()) {
      void ingest(async () => {
        const c = await pickDirectory();
        return c ? toAttachments({ folders: [c], files: [] }, repos) : null;
      }, "Reading folder");
    } else {
      folderInput.current?.click();
    }
  }, [ingest, repos]);

  useImperativeHandle(ref, () => ({
    focus: () => area.current?.focus(),
    attachFolder: pickFolder,
    setValue,
    typeIn: (text: string) => {
      if (typing.current) clearInterval(typing.current);
      let i = 0;
      setValue("");
      typing.current = setInterval(() => {
        i = Math.min(text.length, i + 2 + Math.floor(Math.random() * 2));
        setValue(text.slice(0, i));
        if (i >= text.length) {
          clearInterval(typing.current!);
          typing.current = null;
          const el = area.current;
          el?.focus();
          el?.setSelectionRange(text.length, text.length);
        }
      }, 14);
    },
  }));

  useEffect(
    () => () => {
      if (typing.current) clearInterval(typing.current);
    },
    [],
  );

  // Grow with the text, up to a comfortable cap.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, compact ? 140 : 220)}px`;
  }, [value, compact]);

  const submit = () => {
    const v = value.trim();
    if (!v || busy) return;
    stopDictation();
    onSubmit(v);
  };

  const ringState = busy ? "busy" : focused || dragging || listening ? "focus" : "idle";
  const chips = attachments.length > 0 || Boolean(reading) || Boolean(lockedRange);

  return (
    <motion.div
      layout="position"
      transition={spring.smooth}
      className={cx("ai-ring relative z-20 w-full", compact ? "rounded-[24px]" : "rounded-[30px]")}
      data-state={ringState}
      onDragEnter={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (!dragDepth.current) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        const items = e.dataTransfer.items;
        void ingest(async () => toAttachments(await collectFromDrop(items), repos), "Reading drop");
      }}
    >
      <span className="ai-ring__glow">
        <i />
      </span>
      <span className="ai-ring__edge" />

      <div className={cx("glass relative overflow-hidden", compact ? "rounded-[24px]" : "rounded-[30px]")}>
        {/* drop overlay */}
        <AnimatePresence>
          {dragging && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none absolute inset-2 z-20 grid place-items-center rounded-[22px] border border-dashed border-white/25 bg-black/60"
            >
              <motion.div
                initial={{ scale: 0.85, y: 6 }}
                animate={{ scale: 1, y: 0 }}
                transition={spring.bouncy}
                className="flex items-center gap-2 text-sm font-medium text-label"
              >
                <FolderOpen className="size-5 text-accent" /> Drop a folder or notes to add context
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* context chips: locked dates, folders, notes */}
        <AnimatePresence initial={false}>
          {chips && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={spring.smooth}
              className="overflow-hidden"
            >
              <div className={cx("flex flex-wrap gap-2", compact ? "px-3 pt-3" : "px-4 pt-3.5")}>
                <AnimatePresence mode="popLayout">
                  {lockedRange && (
                    <Chip
                      key="dates"
                      icon={<CalendarRange className="size-3.5" />}
                      title={rangeText(lockedRange)}
                      meta={
                        <span className="flex items-center gap-1">
                          <Lock className="size-2.5" /> locked window
                        </span>
                      }
                      onClick={() => setMenu("dates")}
                      onRemove={() => onLockRange(null)}
                      removeLabel="Unlock dates"
                    />
                  )}
                  {attachments.map((a) => (
                    <Chip
                      key={a.id}
                      icon={a.kind === "folder" ? <FolderOpen className="size-3.5" /> : <FileText className="size-3.5" />}
                      title={a.name}
                      tooltip={a.kind === "folder" ? (a.remote ?? a.name) : a.name}
                      meta={
                        a.kind === "folder" ? (
                          <span className="flex items-center gap-1.5">
                            {a.commits.length > 0 && (
                              <span className="flex items-center gap-0.5">
                                <GitCommitHorizontal className="size-3" />
                                {a.commits.length}
                              </span>
                            )}
                            {a.branch && (
                              <span className="flex max-w-[90px] items-center gap-0.5 truncate">
                                <GitBranch className="size-3 shrink-0" />
                                {a.branch}
                              </span>
                            )}
                            <span>{a.fileCount} files</span>
                          </span>
                        ) : (
                          <span>{Math.max(1, Math.round(a.size / 1024))} KB · notes</span>
                        )
                      }
                      onRemove={() => onRemoveAttachment(a.id)}
                      removeLabel={`Remove ${a.name}`}
                    />
                  ))}
                  {reading && (
                    <motion.div
                      key="reading"
                      initial={{ opacity: 0, scale: 0.85 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.85 }}
                      className="skeleton flex h-[42px] items-center gap-2 rounded-[14px] border border-white/10 px-3"
                    >
                      <Spinner className="size-3.5 text-accent" />
                      <span className="text-shimmer text-xs font-medium">{reading}…</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* the prompt */}
        <div className={cx("relative", compact ? "px-4 pt-3" : "px-5 pt-4")}>
          <textarea
            ref={area}
            value={value}
            rows={compact ? 1 : 2}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              } else if (e.key === "Tab" && !value && example.current && !e.shiftKey) {
                e.preventDefault();
                setValue(example.current);
              }
            }}
            aria-label="Describe what to fill"
            spellCheck={false}
            className={cx(
              "block w-full resize-none bg-transparent text-label outline-none",
              compact ? "min-h-[28px] text-[15px] leading-7" : "min-h-[64px] text-[17px] leading-8 tracking-[-0.01em]",
            )}
          />
          {!value && <TypingPlaceholder examples={examples} compact={compact} currentRef={example} />}
        </div>

        {/* toolbar */}
        <div className={cx("flex items-center gap-1.5", compact ? "px-2.5 pb-2.5 pt-1" : "px-3 pb-3 pt-2")}>
          <button
            ref={plusRef}
            type="button"
            onClick={() => setMenu((m) => (m ? null : "root"))}
            className={cx(
              "grid size-9 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-label-2 transition-[transform,background-color,color] duration-200 hover:bg-white/10 hover:text-label active:scale-95",
              menu && "bg-white/[0.12] text-label",
            )}
            aria-label="Add dates or context"
            aria-expanded={Boolean(menu)}
          >
            <span className={cx("transition-transform duration-300 ease-apple", menu && "rotate-45")}>
              <Plus className="size-4" />
            </span>
          </button>

          {!lockedRange && (
            <button
              type="button"
              onClick={() => setMenu("dates")}
              className="hidden h-9 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3 text-xs font-medium text-label-2 transition-[transform,background-color,color] duration-200 hover:bg-white/10 hover:text-label active:scale-95 sm:flex"
            >
              <CalendarRange className="size-3.5" /> Dates
            </button>
          )}

          {sourcesChip && (
            <button
              type="button"
              onClick={sourcesChip.onClick}
              className="flex h-9 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3 text-xs font-medium text-label-2 transition-[transform,background-color,color] duration-200 hover:bg-white/10 hover:text-label active:scale-95"
            >
              <GitBranch className="size-3.5" />
              {sourcesChip.count ? `${sourcesChip.count} repo${sourcesChip.count === 1 ? "" : "s"}` : "Connect repos"}
            </button>
          )}

          <div className="ml-auto flex items-center gap-1.5">
            {onSavePrompt && value.trim().length > 8 && !busy && (
              <button
                type="button"
                onClick={() => onSavePrompt(value.trim())}
                className="grid size-9 place-items-center rounded-full text-label-3 transition hover:bg-white/10 hover:text-label"
                title="Pin this prompt as a pill"
                aria-label="Pin this prompt"
              >
                <BookmarkPlus className="size-4" />
              </button>
            )}
            {listening ? (
              <span className="flex items-center gap-2 pr-1">
                <span className="flex h-4 items-center gap-[3px]" aria-hidden>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span key={i} className="voice-bar w-[3px] rounded-full bg-accent" style={{ animationDelay: `${i * 110}ms` }} />
                  ))}
                </span>
                <span className="text-shimmer hidden text-xs font-medium sm:inline">Listening…</span>
              </span>
            ) : (
              !compact &&
              !busy && (
                <span className="hidden items-center gap-1 pr-1 text-[11px] text-label-4 sm:flex">
                  <Kbd>↵</Kbd> to run
                </span>
              )
            )}
            {canDictate && !busy && (
              <button
                type="button"
                onClick={toggleDictation}
                className={cx(
                  "relative grid size-9 place-items-center rounded-full transition-[background-color,color,transform] duration-200 active:scale-90",
                  listening
                    ? "bg-[color-mix(in_oklab,var(--accent)_22%,transparent)] text-accent"
                    : "text-label-3 hover:bg-white/10 hover:text-label",
                )}
                title={listening ? "Stop dictation" : "Dictate your prompt"}
                aria-label={listening ? "Stop dictation" : "Dictate your prompt"}
                aria-pressed={listening}
              >
                {listening && <span className="absolute inset-0 animate-ping rounded-full bg-accent/25 [animation-duration:1.6s]" />}
                <Mic className="relative size-4" />
              </button>
            )}
            <SendButton busy={busy} disabled={!value.trim()} onSend={submit} onStop={onStop} />
          </div>
        </div>

        <input
          ref={folderInput}
          type="file"
          className="hidden"
          // @ts-expect-error — non-standard but supported by every engine
          webkitdirectory=""
          onChange={(e) => {
            const list = e.target.files;
            if (list?.length) {
              void ingest(async () => {
                const c = collectFromFileList(list);
                return c ? toAttachments({ folders: [c], files: [] }, repos) : null;
              }, "Reading folder");
            }
            e.target.value = "";
          }}
        />
        <input
          ref={fileInput}
          type="file"
          multiple
          className="hidden"
          accept=".md,.mdx,.txt,.csv,.tsv,.json,.yaml,.yml,.log,.eml,.html,.xml,.rtf,.feature"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) void ingest(() => toAttachments({ folders: [], files }, repos), "Reading notes");
            e.target.value = "";
          }}
        />
      </div>

      <ContextMenu
        anchor={plusRef}
        page={menu}
        onPage={setMenu}
        lockedRange={lockedRange}
        onLockRange={(r) => {
          onLockRange(r);
          setMenu(null);
          area.current?.focus();
        }}
        onFolder={pickFolder}
        onNotes={() => {
          setMenu(null);
          fileInput.current?.click();
        }}
      />
    </motion.div>
  );
});

/* -------------------------------------------------------------------- chips */

const Chip = forwardRef<
  HTMLDivElement,
  {
    icon: ReactNode;
    title: string;
    meta: ReactNode;
    tooltip?: string;
    onClick?: () => void;
    onRemove: () => void;
    removeLabel: string;
  }
>(function Chip({ icon, title, meta, tooltip, onClick, onRemove, removeLabel }, ref) {
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={spring.bouncy}
      className="group flex items-center gap-1 rounded-[14px] border border-white/10 bg-white/[0.06] p-1 transition-colors hover:bg-white/[0.09]"
      title={tooltip}
    >
      <button
        type="button"
        onClick={onClick}
        className={cx("flex min-w-0 items-center gap-2 rounded-[10px] py-0.5 pl-0.5 pr-1 text-left", !onClick && "cursor-default")}
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-[9px] text-white" style={{ background: "var(--accent-grad)" }}>
          {icon}
        </span>
        <span className="min-w-0">
          <span className="block max-w-[180px] truncate text-xs font-medium text-label">{title}</span>
          <span className="block text-[10.5px] text-label-3">{meta}</span>
        </span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="grid size-6 shrink-0 place-items-center rounded-full text-label-3 opacity-70 transition hover:bg-white/10 hover:text-label group-hover:opacity-100"
        aria-label={removeLabel}
      >
        <X className="size-3" />
      </button>
    </motion.div>
  );
});

/* --------------------------------------------------------------------- menu */

/**
 * The + menu. Portalled to <body> so the composer's rounded glass can't clip
 * it, and its pages (menu ↔ calendar) morph into each other.
 */
function ContextMenu({
  anchor,
  page,
  onPage,
  lockedRange,
  onLockRange,
  onFolder,
  onNotes,
}: {
  anchor: React.RefObject<HTMLButtonElement | null>;
  page: null | "root" | "dates";
  onPage: (p: null | "root" | "dates") => void;
  lockedRange: DateRange | null;
  onLockRange: (r: DateRange | null) => void;
  onFolder: () => void;
  onNotes: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; up: boolean } | null>(null);

  useLayoutEffect(() => {
    if (!page) return;
    const place = () => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      const height = page === "dates" ? 440 : 260;
      const below = window.innerHeight - r.bottom;
      const up = below < height + 16 && r.top > below;
      setPos({
        left: Math.max(8, Math.min(r.left, window.innerWidth - 336)),
        top: up ? undefined : r.bottom + 10,
        bottom: up ? window.innerHeight - r.top + 10 : undefined,
        up,
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [page, anchor]);

  useEffect(() => {
    if (!page) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !anchor.current?.contains(t)) onPage(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onPage(null);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [page, onPage, anchor]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {page && pos && (
        <motion.div
          ref={panel}
          layout
          initial={{ opacity: 0, scale: 0.92, y: pos.up ? 8 : -8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: pos.up ? 6 : -6, transition: { duration: 0.15 } }}
          transition={spring.snappy}
          style={{
            left: pos.left,
            top: pos.top,
            bottom: pos.bottom,
            borderRadius: 22,
            transformOrigin: pos.up ? "bottom left" : "top left",
          }}
          className="glass-strong fixed z-[90] overflow-hidden"
        >
          <AnimatePresence mode="popLayout" initial={false}>
            {page === "root" ? (
              <motion.div
                key="root"
                initial={{ opacity: 0, x: -24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={spring.snappy}
                className="w-[300px] p-1.5"
              >
                <MenuItem
                  icon={<CalendarRange className="size-4" />}
                  title={lockedRange ? rangeText(lockedRange) : "Pick dates"}
                  hint={lockedRange ? "Locked — every prompt stays inside these days" : "Lock the window instead of describing it"}
                  onClick={() => onPage("dates")}
                  chevron
                />
                <div className="mx-2.5 my-1 h-px bg-white/[0.07]" />
                <MenuItem
                  icon={<FolderOpen className="size-4" />}
                  title="Attach a folder"
                  hint="Your commits from .git, the README and recent edits — read on this device"
                  onClick={onFolder}
                />
                <MenuItem
                  icon={<Paperclip className="size-4" />}
                  title="Attach notes"
                  hint="Meeting notes, test plans, ticket exports (.md, .txt, .csv…)"
                  onClick={onNotes}
                />
                <p className="px-3 pb-1.5 pt-2 text-[10.5px] text-label-4">Tip: drop a folder straight onto the prompt.</p>
              </motion.div>
            ) : (
              <motion.div
                key="dates"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 24 }}
                transition={spring.snappy}
              >
                <DateRangePicker value={lockedRange} onApply={onLockRange} onBack={() => onPage("root")} />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function MenuItem({
  icon,
  title,
  hint,
  onClick,
  chevron,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
  chevron?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-[14px] px-2.5 py-2.5 text-left transition-colors hover:bg-white/[0.07]"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-[11px] border border-white/10 bg-white/[0.05] text-accent transition-colors group-hover:bg-white/[0.09]">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-label">{title}</span>
        <span className="block text-[11px] leading-snug text-label-3">{hint}</span>
      </span>
      {chevron && <ChevronRight className="size-4 shrink-0 text-label-4 transition-transform group-hover:translate-x-0.5" />}
    </button>
  );
}

/** Arrow when idle; morphs into a stop button wrapped in a spinning ring while running. */
function SendButton({
  busy,
  disabled,
  onSend,
  onStop,
}: {
  busy: boolean;
  disabled: boolean;
  onSend: () => void;
  onStop?: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={busy ? onStop : onSend}
      disabled={!busy && disabled}
      whileTap={{ scale: 0.9 }}
      aria-label={busy ? "Stop" : "Run"}
      className={cx(
        "relative grid size-9 place-items-center rounded-full text-white transition-[opacity,box-shadow] duration-300",
        disabled && !busy ? "opacity-35" : "shadow-[0_8px_24px_-8px_var(--accent)]",
      )}
      style={{ background: busy ? "rgba(255,255,255,0.12)" : "var(--accent-grad)" }}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {busy ? (
          <motion.span
            key="stop"
            initial={{ scale: 0.4, opacity: 0, rotate: -90 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 0.4, opacity: 0 }}
            transition={spring.bouncy}
            className="grid place-items-center"
          >
            <Square className="size-3 fill-current" />
          </motion.span>
        ) : (
          <motion.span
            key="send"
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -12, opacity: 0 }}
            transition={spring.bouncy}
          >
            <ArrowUp className="size-4" strokeWidth={2.5} />
          </motion.span>
        )}
      </AnimatePresence>
      {busy && (
        <svg className="absolute -inset-[3px] size-[42px] animate-spin [animation-duration:1.1s]" viewBox="0 0 42 42">
          <defs>
            <linearGradient id="send-ring" x1="0" x2="1">
              <stop offset="0%" stopColor="#bc82f3" />
              <stop offset="50%" stopColor="#8d9fff" />
              <stop offset="100%" stopColor="#ffba71" stopOpacity="0" />
            </linearGradient>
          </defs>
          <circle cx="21" cy="21" r="19.5" fill="none" stroke="url(#send-ring)" strokeWidth="2" strokeLinecap="round" strokeDasharray="70 60" />
        </svg>
      )}
    </motion.button>
  );
}
