"use client";

import { clsx } from "clsx";
import { Loader2, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { initials } from "@/lib/format";

/* ----------------------------------------------------------------- Button */
type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export function Button({
  variant = "primary", size = "md", loading, className, children, disabled, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button
      disabled={disabled || loading}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed select-none whitespace-nowrap",
        size === "sm" && "h-8 px-3 text-[13px]",
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-12 px-6 text-base",
        variant === "primary" && "bg-accent text-white hover:bg-accent-hover shadow-sm",
        variant === "secondary" && "bg-surface border border-line-strong text-text hover:bg-surface-2",
        variant === "ghost" && "text-muted hover:text-text hover:bg-surface-2",
        variant === "danger" && "bg-danger-soft text-danger hover:brightness-95 border border-transparent",
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------- Card */
export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx("rounded-xl border border-line bg-surface shadow-card", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
      <div>
        <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ Badge */
type Tone = "neutral" | "accent" | "success" | "warn" | "danger";
export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={clsx(
      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium leading-5",
      tone === "neutral" && "bg-surface-2 text-muted",
      tone === "accent" && "bg-accent-soft text-accent-text",
      tone === "success" && "bg-success-soft text-success",
      tone === "warn" && "bg-warn-soft text-warn",
      tone === "danger" && "bg-danger-soft text-danger",
      className,
    )}>{children}</span>
  );
}

/* ------------------------------------------------------------ Form bits */
const fieldCls = "w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-text placeholder:text-faint focus:border-accent";

export function Field({ label, hint, children, required }: { label: string; hint?: string; children: ReactNode; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-text">
        {label}{required && <span className="text-danger"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx(fieldCls, "h-10", props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={clsx(fieldCls, "py-2 min-h-24 resize-y", props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={clsx(fieldCls, "h-10", props.className)} />;
}

/* ----------------------------------------------------------------- Avatar */
export function Avatar({ src, name, email, size = 36 }: { src?: string | null; name?: string | null; email?: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  const cls = "rounded-full shrink-0 object-cover";
  if (src && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={size} height={size} className={cls} referrerPolicy="no-referrer" onError={() => setBroken(true)} />;
  }
  return (
    <div style={{ width: size, height: size, fontSize: size * 0.38 }}
      className={clsx(cls, "flex items-center justify-center bg-accent-soft text-accent-text font-semibold")}>
      {initials(name, email)}
    </div>
  );
}

/* ---------------------------------------------------------------- Spinner */
export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
      <Loader2 className="h-4 w-4 animate-spin" /> {label ?? "Loading…"}
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      {icon && <div className="mb-1 text-faint">{icon}</div>}
      <p className="text-[15px] font-medium">{title}</p>
      {body && <p className="max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ Modal */
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className={clsx("fade-in w-full rounded-t-2xl border border-line bg-surface shadow-card sm:rounded-2xl max-h-[92vh] overflow-y-auto", wide ? "sm:max-w-2xl" : "sm:max-w-lg")}
        role="dialog" aria-modal
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-text" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Toast */
interface Toast { id: number; text: string; tone: "success" | "danger" | "neutral" }
const ToastCtx = createContext<(text: string, tone?: Toast["tone"]) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast["tone"] = "neutral") => {
    const id = Date.now() + Math.random();
    setItems((t) => [...t, { id, text, tone }]);
    setTimeout(() => setItems((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
        {items.map((t) => (
          <div key={t.id} className={clsx(
            "fade-in pointer-events-auto rounded-lg border px-4 py-2.5 text-sm shadow-card",
            t.tone === "success" && "border-success/30 bg-success-soft text-success",
            t.tone === "danger" && "border-danger/30 bg-danger-soft text-danger",
            t.tone === "neutral" && "border-line bg-surface text-text",
          )}>{t.text}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/* ------------------------------------------------------------- Page bits */
export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[] }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={clsx("rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors",
            value === o.value ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
