/**
 * Shared UI primitives: Card, Button, Alert, Field, Badge.
 *
 * Icons come from `lucide-react`, carry `aria-hidden` and sit beside a text
 * label (14 px beside `text-sm`). Never text glyphs as icons.
 */
import type { ComponentProps, InputHTMLAttributes, ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

export function Card({ children, className = "", ...rest }: ComponentProps<"section">) {
  return (
    <section className={`rounded-lg border border-divider bg-card p-5 shadow-sm ${className}`} {...rest}>
      {children}
    </section>
  );
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
  const styles =
    variant === "primary"
      ? "bg-primary text-white hover:brightness-95 active:brightness-90"
      : variant === "secondary"
      ? "border border-divider bg-card text-ink hover:bg-body"
      : variant === "danger"
      ? "border border-danger text-danger hover:bg-danger/10 active:bg-danger/20"
      : "text-primary hover:underline";
  return <button type="button" className={`${base} ${styles} ${className}`} {...props} />;
}

export function Alert({ children, tone = "danger" }: { children: ReactNode; tone?: "danger" | "success" | "info" | "warning" }) {
  const styles =
    tone === "danger"
      ? "border-danger/40 bg-danger/10 text-danger"
      : tone === "success"
      ? "border-success/40 bg-success/10 text-success"
      : tone === "warning"
      ? "border-warning/50 bg-warning/10 text-ink"
      : "border-info/40 bg-info/10 text-ink";
  const Icon = tone === "danger" || tone === "warning" ? AlertTriangle : tone === "success" ? CheckCircle2 : Info;
  return (
    <div className={`mb-4 flex gap-2 rounded border px-3 py-2 text-sm ${styles}`} role={tone === "danger" ? "alert" : "status"}>
      <Icon size={16} aria-hidden className="mt-[2px] shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function Field({
  label,
  id,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; id: string; hint?: string }) {
  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-muted">
        {label}
      </label>
      <input
        id={id}
        className="w-full rounded border border-divider bg-card px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/40"
        {...props}
      />
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Badge({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "success" | "info" | "danger" }) {
  const styles =
    tone === "success"
      ? "bg-success/15 text-success"
      : tone === "info"
      ? "bg-info/15 text-ink"
      : tone === "danger"
      ? "bg-danger/15 text-danger"
      : "bg-divider/60 text-muted";
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${styles}`}>{children}</span>;
}

/** Page heading with an optional action on the right. */
export function PageTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h1 className="m-0">{children}</h1>
      {action}
    </div>
  );
}
