"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X } from "lucide-react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/** lucide dropped brand marks in v1, so the GitHub logo lives here. */
export function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className={cx("size-4", className)}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

/** Bitbucket's mark, since lucide only ships generic icons. */
export function BitbucketMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className={cx("size-4", className)}>
      <path d="M0.7 1.4a0.6 0.6 0 0 0-0.59 0.7l2.13 12.9a0.78 0.78 0 0 0 0.76 0.65h9.6a0.58 0.58 0 0 0 0.58-0.49L15.3 2.1a0.6 0.6 0 0 0-0.59-0.7ZM9.5 10.4H6.53l-0.8-4.7h4.5Z" />
    </svg>
  );
}

/** GitLab's tanuki mark, since lucide only ships generic icons. */
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

/* ---------------------------------------------------------------- button */

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline" | "danger" | "subtle";
  size?: "sm" | "md";
  loading?: boolean;
};

export function Button({
  variant = "outline",
  size = "md",
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all disabled:opacity-45 disabled:cursor-not-allowed select-none whitespace-nowrap";
  const sizes = { sm: "h-8 px-2.5 text-xs", md: "h-10 px-4 text-sm" }[size];
  const variants = {
    primary:
      "bg-brand-600 text-white shadow-[0_6px_20px_-8px_var(--color-brand-500)] hover:bg-brand-500 active:translate-y-px",
    outline:
      "border border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/[0.07] hover:border-white/20",
    ghost: "text-slate-400 hover:text-slate-100 hover:bg-white/[0.06]",
    subtle: "bg-white/[0.06] text-slate-200 hover:bg-white/10",
    danger: "border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20",
  }[variant];

  return (
    <button className={cx(base, sizes, variants, className)} disabled={disabled || loading} {...rest}>
      {loading && (
        <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  );
}

/* ----------------------------------------------------------------- cards */

export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cx(
        "rounded-2xl border border-white/[0.07] bg-ink-900/70 backdrop-blur-xl shadow-[0_20px_60px_-40px_rgba(0,0,0,0.9)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  icon,
  title,
  hint,
  right,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-2.5">
        {icon && <span className="mt-0.5 text-brand-400">{icon}</span>}
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-slate-100">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

/* ---------------------------------------------------------------- inputs */

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-500"
    >
      {children}
    </label>
  );
}

const fieldCls =
  "w-full rounded-lg border border-white/10 bg-ink-850/80 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 outline-none transition focus:border-brand-500/70 focus:ring-2 focus:ring-brand-500/20";

export function Input({ className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(fieldCls, className)} {...rest} />;
}

export function Textarea({
  className,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(fieldCls, "resize-y leading-relaxed", className)} {...rest} />;
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
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-1.5 text-left"
    >
      <span>
        <span className="block text-sm text-slate-200">{label}</span>
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
      <span
        className={cx(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          checked ? "bg-brand-500" : "bg-white/12",
        )}
      >
        <span
          className={cx(
            "absolute top-0.5 size-4 rounded-full bg-white transition-all",
            checked ? "left-[18px]" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}

export function Badge({
  children,
  tone = "slate",
  className,
}: {
  children: ReactNode;
  tone?: "slate" | "brand" | "green" | "amber" | "rose" | "cyan";
  className?: string;
}) {
  const tones = {
    slate: "bg-white/[0.06] text-slate-400 border-white/10",
    brand: "bg-brand-500/15 text-brand-200 border-brand-500/25",
    green: "bg-emerald-500/12 text-emerald-300 border-emerald-500/25",
    amber: "bg-amber-500/12 text-amber-300 border-amber-500/25",
    rose: "bg-rose-500/12 text-rose-300 border-rose-500/25",
    cyan: "bg-cyan-500/12 text-cyan-300 border-cyan-500/25",
  }[tone];
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
        tones,
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------- combobox */

export function TagPicker({
  value,
  options,
  onChange,
  placeholder = "Pick a tag",
  tone = "brand",
  disabled,
  className,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  placeholder?: string;
  tone?: "brand" | "cyan";
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState<{
    left: number;
    width: number;
    top?: number;
    bottom?: number;
    maxHeight: number;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();

  /**
   * The panel is portalled to <body> so a narrow sidebar or a card can't clip
   * it; position is measured off the trigger and flipped up near the bottom.
   */
  const place = useCallback(() => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const margin = 8;
    const width = Math.min(Math.max(r.width, 260), window.innerWidth - margin * 2);
    const left = Math.max(margin, Math.min(r.left, window.innerWidth - width - margin));
    const below = window.innerHeight - r.bottom;
    const above = r.top;
    const flip = below < 240 && above > below;
    setPos({
      left,
      width,
      top: flip ? undefined : r.bottom + 6,
      bottom: flip ? window.innerHeight - r.top + 6 : undefined,
      maxHeight: Math.max(140, Math.min(340, (flip ? above : below) - 16)),
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 300);
    return options.filter((o) => o.toLowerCase().includes(q)).slice(0, 300);
  }, [options, query]);

  const toneCls =
    tone === "brand"
      ? "border-brand-500/30 bg-brand-500/10 text-brand-200"
      : "border-cyan-500/30 bg-cyan-500/10 text-cyan-200";

  return (
    <div className={cx("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen((o) => !o);
          setQuery("");
        }}
        className={cx(
          "flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border px-2 text-xs font-medium transition disabled:opacity-50",
          value ? toneCls : "border-white/10 bg-white/[0.03] text-slate-500",
        )}
      >
        <span className="truncate">{value || placeholder}</span>
        <ChevronDown className="size-3.5 shrink-0 opacity-60" />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width }}
            className="fixed z-80 flex flex-col overflow-hidden rounded-xl border border-white/10 bg-ink-800 shadow-2xl animate-rise"
          >
            <div className="flex items-center gap-2 border-b border-white/8 px-2.5">
              <Search className="size-3.5 shrink-0 text-slate-500" />
              <input
                id={id}
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter tags"
                className="w-full bg-transparent py-2 text-xs text-slate-100 outline-none placeholder:text-slate-600"
              />
              {value && (
                <button
                  type="button"
                  onClick={() => {
                    onChange("");
                    setOpen(false);
                  }}
                  className="shrink-0 rounded px-1 py-0.5 text-[11px] text-slate-500 hover:text-slate-200"
                >
                  clear
                </button>
              )}
            </div>
            <div className="overflow-y-auto p-1" style={{ maxHeight: pos.maxHeight }}>
              {options.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-slate-500">
                  No tags loaded. Paste your profile JSON under Connections.
                </p>
              ) : filtered.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-slate-500">No matching tag</p>
              ) : (
                filtered.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      onChange(opt);
                      setOpen(false);
                    }}
                    className={cx(
                      "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition",
                      opt === value
                        ? "bg-brand-500/15 text-brand-200"
                        : "text-slate-300 hover:bg-white/6",
                    )}
                  >
                    <span className="truncate">{opt}</span>
                    {opt === value && <Check className="size-3.5 shrink-0" />}
                  </button>
                ))
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

/* ---------------------------------------------------------------- drawer */

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-xl flex-col border-l border-white/10 bg-ink-900 shadow-2xl animate-rise">
        <header className="flex items-start justify-between gap-4 border-b border-white/8 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-100">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </Button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <footer className="border-t border-white/8 px-6 py-4">{footer}</footer>}
      </aside>
    </div>
  );
}

/* --------------------------------------------------------------- toaster */

export type Toast = { id: number; tone: "ok" | "err" | "info"; message: string };

export function Toaster({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[60] flex w-full max-w-md -translate-x-1/2 flex-col gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cx(
            "animate-rise rounded-xl border px-4 py-2.5 text-sm shadow-2xl backdrop-blur-xl",
            t.tone === "ok" && "border-emerald-500/30 bg-emerald-500/12 text-emerald-200",
            t.tone === "err" && "border-rose-500/30 bg-rose-500/12 text-rose-200",
            t.tone === "info" && "border-white/12 bg-ink-800/90 text-slate-200",
          )}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
