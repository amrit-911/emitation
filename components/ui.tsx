"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown, Search, X } from "lucide-react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/** Apple-ish springs, shared so everything moves with the same physics. */
export const spring = {
  snappy: { type: "spring", bounce: 0.18, visualDuration: 0.32 },
  smooth: { type: "spring", bounce: 0.12, visualDuration: 0.5 },
  bouncy: { type: "spring", bounce: 0.32, visualDuration: 0.45 },
} as const;

/* ---------------------------------------------------------------- marks */

/** lucide dropped brand marks in v1, so the logos live here. */
export function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className={cx("size-4", className)}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

export function BitbucketMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className={cx("size-4", className)}>
      <path d="M0.7 1.4a0.6 0.6 0 0 0-0.59 0.7l2.13 12.9a0.78 0.78 0 0 0 0.76 0.65h9.6a0.58 0.58 0 0 0 0.58-0.49L15.3 2.1a0.6 0.6 0 0 0-0.59-0.7ZM9.5 10.4H6.53l-0.8-4.7h4.5Z" />
    </svg>
  );
}

export function GitlabMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className={cx("size-4", className)}>
      <path d="M8 14.75 10.6 6.7H5.4L8 14.75Z" opacity={0.65} />
      <path d="M8 14.75 5.4 6.7H1.4L8 14.75Z" />
      <path d="M1.4 6.7.36 9.9c-.1.29 0 .61.25.79L8 14.75 1.4 6.7Z" opacity={0.85} />
      <path d="M1.4 6.7h4L3.7 1.6a.32.32 0 0 0-.6 0L1.4 6.7Z" />
      <path d="M8 14.75 10.6 6.7h4l-7.6 8.05Z" opacity={0.85} />
      <path d="M14.6 6.7h-4l1.7-5.1a.32.32 0 0 1 .6 0l1.7 5.1Z" />
      <path d="M14.6 6.7l1.04 3.2c.1.29 0 .61-.25.79L8 14.75l6.6-8.05Z" opacity={0.65} />
    </svg>
  );
}

/**
 * The Emitation wordmark: the name in Geist, tightly set, ending in a single
 * accent full stop. The stop breathes while the AI is working.
 */
export function Wordmark({ className, live }: { className?: string; live?: boolean }) {
  return (
    <span
      role="img"
      aria-label="Emitation"
      className={cx("inline-flex items-baseline font-semibold leading-none tracking-[-0.055em] text-label", className)}
    >
      <span aria-hidden>emitation</span>
      <span
        aria-hidden
        className={cx("wordmark-dot ml-[0.2em] inline-block size-[0.19em] rounded-full", live && "is-live")}
        style={{ background: "var(--accent-grad)" }}
      />
    </span>
  );
}

/* --------------------------------------------------------------- hooks */

/** Feeds --mx/--my to a `.spotlight` element so its light follows the pointer. */
export function useSpotlight<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${e.clientX - r.left}px`);
        el.style.setProperty("--my", `${e.clientY - r.top}px`);
      });
    };
    const enter = () => el.style.setProperty("--spot", "1");
    const leave = () => el.style.setProperty("--spot", "0");
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerenter", enter);
    el.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerenter", enter);
      el.removeEventListener("pointerleave", leave);
    };
  }, []);
  return ref;
}

/* --------------------------------------------------------------- button */

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "glass" | "ghost" | "danger" | "plain";
  size?: "xs" | "sm" | "md" | "lg" | "icon" | "icon-sm";
  loading?: boolean;
};

export function Button({
  variant = "glass",
  size = "md",
  loading,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  const base =
    "relative inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap font-medium tracking-[-0.01em] transition-[transform,background-color,border-color,color,box-shadow,opacity] duration-200 ease-apple active:scale-[0.965] disabled:pointer-events-none disabled:opacity-40";
  const sizes = {
    xs: "h-7 rounded-full px-2.5 text-[11.5px]",
    sm: "h-8 rounded-full px-3 text-xs",
    md: "h-10 rounded-full px-4 text-[13px]",
    lg: "h-12 rounded-full px-6 text-sm",
    icon: "size-10 rounded-full",
    "icon-sm": "size-8 rounded-full",
  }[size];
  const variants = {
    primary:
      "text-white shadow-[0_10px_30px_-12px_var(--accent),inset_0_1px_0_rgba(255,255,255,0.35)] hover:brightness-110 [background:var(--accent-grad)] [text-shadow:0_1px_1px_rgba(0,0,0,0.18)]",
    glass:
      "border border-white/10 bg-white/[0.06] text-label shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] hover:border-white/16 hover:bg-white/[0.1]",
    ghost: "text-label-2 hover:bg-white/[0.07] hover:text-label",
    danger: "border border-rose-400/25 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20",
    plain: "",
  }[variant];

  return (
    <button
      type={type}
      className={cx(base, sizes, variants, className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Spinner className="size-3.5" />}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cx("size-4 animate-spin", className)} aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/** The AI's "thinking" mark: a small breathing orb of the intelligence gradient. */
export function Orb({ className }: { className?: string }) {
  return <span className={cx("orb inline-block size-4 shrink-0", className)} aria-hidden />;
}

/* --------------------------------------------------------------- panels */

export function Panel({
  className,
  children,
  as: Tag = "div",
}: {
  className?: string;
  children: ReactNode;
  as?: "div" | "section" | "aside";
}) {
  return <Tag className={cx("glass rim rounded-[28px]", className)}>{children}</Tag>;
}

export function SectionTitle({
  icon,
  title,
  hint,
  right,
}: {
  icon?: ReactNode;
  title: string;
  hint?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && <span className="mt-px text-accent">{icon}</span>}
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold tracking-[-0.01em] text-label">{title}</h3>
          {hint && <p className="mt-0.5 text-xs leading-relaxed text-label-3">{hint}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

/* --------------------------------------------------------------- inputs */

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[11px] font-medium tracking-wide text-label-3">
      {children}
    </label>
  );
}

export const fieldCls =
  "w-full rounded-[12px] border border-white/[0.08] bg-black/25 px-3 py-2 text-[13px] text-label placeholder:text-label-4 outline-none transition-[border-color,box-shadow,background-color] duration-200 hover:border-white/14 focus:border-[color-mix(in_oklab,var(--accent)_70%,transparent)] focus:bg-black/35 focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--accent)_16%,transparent)] disabled:opacity-60";

export function Input({ className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(fieldCls, className)} {...rest} />;
}

export function Textarea({
  className,
  autoGrow,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { autoGrow?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!autoGrow || !el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [autoGrow, rest.value]);
  return (
    <textarea
      ref={ref}
      className={cx(fieldCls, autoGrow ? "resize-none overflow-hidden" : "resize-y", "leading-relaxed", className)}
      {...rest}
    />
  );
}

export function Switch({
  checked,
  onChange,
  label,
  size = "md",
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  size?: "sm" | "md";
}) {
  const dims = size === "sm" ? { w: 30, h: 18, k: 14 } : { w: 40, h: 24, k: 20 };
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative shrink-0 rounded-full p-[2px] transition-colors duration-300 ease-apple",
        checked ? "bg-accent" : "bg-white/14",
      )}
      style={{ width: dims.w, height: dims.h }}
    >
      <span
        className="switch-knob block rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.35)]"
        style={{
          width: dims.k,
          height: dims.k,
          transform: `translateX(${checked ? dims.w - dims.k - 4 : 0}px)`,
        }}
      />
    </button>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className="text-[13px] text-label">{label}</p>
        {hint && <p className="mt-0.5 text-xs leading-relaxed text-label-3">{hint}</p>}
      </div>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

/** iOS-style segmented control; the selection pill glides between options. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
  size = "md",
}: {
  value: T;
  options: { id: T; label: ReactNode; icon?: ReactNode }[];
  onChange: (v: T) => void;
  className?: string;
  size?: "sm" | "md";
}) {
  const group = useId();
  return (
    <div
      className={cx(
        "relative flex rounded-full border border-white/[0.07] bg-black/30 p-1",
        className,
      )}
      role="tablist"
    >
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            className={cx(
              "relative flex flex-1 items-center justify-center gap-1.5 rounded-full font-medium transition-colors duration-200",
              size === "sm" ? "h-7 px-2.5 text-[11.5px]" : "h-8 px-3 text-xs",
              active ? "text-label" : "text-label-3 hover:text-label-2",
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${group}`}
                transition={spring.snappy}
                className="absolute inset-0 rounded-full border border-white/10 bg-white/[0.12] shadow-[0_4px_14px_-4px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.12)]"
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {o.icon}
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function Badge({
  children,
  tone = "slate",
  className,
}: {
  children: ReactNode;
  tone?: "slate" | "accent" | "green" | "amber" | "rose" | "cyan";
  className?: string;
}) {
  const tones = {
    slate: "bg-white/[0.06] text-label-2 border-white/10",
    accent: "bg-[color-mix(in_oklab,var(--accent)_16%,transparent)] text-[color-mix(in_oklab,var(--accent)_70%,white)] border-[color-mix(in_oklab,var(--accent)_30%,transparent)]",
    green: "bg-emerald-400/10 text-emerald-200 border-emerald-400/20",
    amber: "bg-amber-400/10 text-amber-200 border-amber-400/20",
    rose: "bg-rose-400/10 text-rose-200 border-rose-400/20",
    cyan: "bg-sky-400/10 text-sky-200 border-sky-400/20",
  }[tone];
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        tones,
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-white/10 bg-white/[0.06] px-1 font-sans text-[10.5px] font-medium text-label-3">
      {children}
    </kbd>
  );
}

/* ------------------------------------------------------------- combobox */

export function TagPicker({
  value,
  options,
  onChange,
  placeholder = "Pick a tag",
  tone = "accent",
  disabled,
  className,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  placeholder?: string;
  tone?: "accent" | "cyan";
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [pos, setPos] = useState<{
    left: number;
    width: number;
    top?: number;
    bottom?: number;
    maxHeight: number;
    flip: boolean;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const id = useId();

  /** Portalled to <body> so cards can't clip it; flips up near the bottom edge. */
  const place = useCallback(() => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const margin = 8;
    const width = Math.min(Math.max(r.width, 260), window.innerWidth - margin * 2);
    const left = Math.max(margin, Math.min(r.left, window.innerWidth - width - margin));
    const below = window.innerHeight - r.bottom;
    const above = r.top;
    const flip = below < 260 && above > below;
    setPos({
      left,
      width,
      flip,
      top: flip ? undefined : r.bottom + 6,
      bottom: flip ? window.innerHeight - r.top + 6 : undefined,
      maxHeight: Math.max(140, Math.min(320, (flip ? above : below) - 70)),
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
    return list.slice(0, 300);
  }, [options, query]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const choose = (v: string) => {
    onChange(v);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const toneCls =
    tone === "accent"
      ? "border-[color-mix(in_oklab,var(--accent)_32%,transparent)] bg-[color-mix(in_oklab,var(--accent)_13%,transparent)] text-[color-mix(in_oklab,var(--accent)_60%,white)]"
      : "border-sky-400/25 bg-sky-400/10 text-sky-200";

  return (
    <div className={cx("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen((o) => !o);
          setQuery("");
          setCursor(0);
        }}
        className={cx(
          "flex h-8 w-full items-center justify-between gap-1.5 rounded-full border px-3 text-xs font-medium transition-[background-color,border-color,transform] duration-200 active:scale-[0.98] disabled:opacity-50",
          value ? toneCls : "border-white/10 bg-white/[0.04] text-label-3 hover:bg-white/[0.07]",
        )}
      >
        <span className="truncate">{value || placeholder}</span>
        <ChevronDown className={cx("size-3.5 shrink-0 opacity-60 transition-transform duration-300", open && "rotate-180")} />
      </button>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && pos && (
              <motion.div
                ref={panelRef}
                initial={{ opacity: 0, scale: 0.94, y: pos.flip ? 8 : -8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: pos.flip ? 4 : -4, transition: { duration: 0.12 } }}
                transition={spring.snappy}
                style={{
                  left: pos.left,
                  top: pos.top,
                  bottom: pos.bottom,
                  width: pos.width,
                  transformOrigin: pos.flip ? "bottom left" : "top left",
                }}
                className="glass-strong fixed z-[90] flex flex-col overflow-hidden rounded-[18px]"
              >
                <div className="flex items-center gap-2 border-b border-white/[0.07] px-3">
                  <Search className="size-3.5 shrink-0 text-label-3" />
                  <input
                    id={id}
                    autoFocus
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setCursor(0);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setCursor((c) => Math.min(filtered.length - 1, c + 1));
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setCursor((c) => Math.max(0, c - 1));
                      } else if (e.key === "Enter" && filtered[cursor]) {
                        e.preventDefault();
                        choose(filtered[cursor]);
                      } else if (e.key === "Escape") {
                        setOpen(false);
                      }
                    }}
                    placeholder="Search tags"
                    className="w-full bg-transparent py-2.5 text-xs text-label outline-none placeholder:text-label-4"
                  />
                  {value && (
                    <button
                      type="button"
                      onClick={() => choose("")}
                      className="shrink-0 rounded-full px-1.5 py-0.5 text-[11px] text-label-3 hover:bg-white/10 hover:text-label"
                    >
                      clear
                    </button>
                  )}
                </div>
                <div ref={listRef} className="overflow-y-auto p-1.5" style={{ maxHeight: pos.maxHeight }}>
                  {options.length === 0 ? (
                    <p className="px-2 py-4 text-center text-xs text-label-3">
                      No tags yet — add your profile under Connections.
                    </p>
                  ) : filtered.length === 0 ? (
                    <p className="px-2 py-4 text-center text-xs text-label-3">No matching tag</p>
                  ) : (
                    filtered.map((opt, i) => (
                      <button
                        key={opt}
                        type="button"
                        data-idx={i}
                        onMouseEnter={() => setCursor(i)}
                        onClick={() => choose(opt)}
                        className={cx(
                          "flex w-full items-center justify-between rounded-[10px] px-2.5 py-1.5 text-left text-xs transition-colors duration-150",
                          i === cursor ? "bg-white/[0.09] text-label" : "text-label-2",
                        )}
                      >
                        <span className="truncate">{opt}</span>
                        {opt === value && <Check className="size-3.5 shrink-0 text-accent" />}
                      </button>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}

/* ---------------------------------------------------------------- sheet */

export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  header,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  header?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex justify-end p-2 sm:p-3">
          <motion.div
            className="absolute inset-0 bg-black/55"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: "calc(100% + 24px)", scale: 0.98 }}
            animate={{ x: 0, scale: 1 }}
            exit={{ x: "calc(100% + 24px)", scale: 0.98 }}
            transition={spring.smooth}
            className="glass-strong rim relative flex h-full w-full max-w-[540px] flex-col overflow-hidden rounded-[30px]"
          >
            <header className="flex items-start justify-between gap-4 px-6 pb-3 pt-5">
              <div>
                <h2 className="text-lg font-semibold tracking-[-0.02em] text-label">{title}</h2>
                {subtitle && <p className="mt-0.5 text-xs text-label-3">{subtitle}</p>}
              </div>
              <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
                <X className="size-4" />
              </Button>
            </header>
            {header && <div className="px-6 pb-3">{header}</div>}
            <div className="flex-1 overflow-y-auto px-6 pb-6 pt-2">{children}</div>
            {footer && <footer className="border-t border-white/[0.07] px-6 py-4">{footer}</footer>}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
