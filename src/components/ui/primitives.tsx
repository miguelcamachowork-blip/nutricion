"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// ─── Button ───────────────────────────────────────────────────────────────

type Variant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "success"
  | "outline"
  | "subtle";
type Size = "sm" | "md" | "lg" | "icon";

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm hover:brightness-110 active:brightness-95",
  secondary:
    "bg-[var(--muted)] text-[var(--foreground)] hover:bg-[var(--border)]",
  ghost:
    "bg-transparent text-[var(--foreground)] hover:bg-[var(--muted)]",
  danger:
    "bg-[var(--danger)] text-white shadow-sm hover:brightness-110 active:brightness-95",
  success:
    "bg-[var(--success)] text-white shadow-sm hover:brightness-110 active:brightness-95",
  outline:
    "bg-[var(--card)]/60 backdrop-blur-sm border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)] hover:border-[var(--border-strong)]",
  subtle:
    "bg-[var(--accent)] text-[var(--primary)] hover:brightness-105",
};

const SIZE: Record<Size, string> = {
  sm: "h-8 px-3 text-xs rounded-[var(--radius-sm)]",
  md: "h-10 px-4 text-sm rounded-[var(--radius)]",
  lg: "h-12 px-5 text-base rounded-[var(--radius-lg)]",
  icon: "h-9 w-9 rounded-[var(--radius)] flex items-center justify-center",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className, variant = "primary", size = "md", ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex select-none items-center justify-center gap-2 font-medium",
          "transition-[background-color,color,box-shadow,filter,transform] duration-150",
          "active:scale-[0.98]",
          "disabled:opacity-50 disabled:pointer-events-none",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-0 focus-visible:ring-[color:var(--ring)]",
          VARIANT[variant],
          SIZE[size],
          className,
        )}
        {...props}
      />
    );
  },
);

// ─── Input / Select / Label ──────────────────────────────────────────────

const FIELD =
  "h-10 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] px-3 text-sm shadow-sm placeholder:text-[var(--muted-foreground)]/70 transition-colors focus:outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[color:var(--ring)] disabled:opacity-60";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(FIELD, className)} {...props} />;
  },
);

export function Select({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(FIELD, "appearance-none pr-8 bg-no-repeat", className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")",
        backgroundPosition: "right 0.65rem center",
        backgroundSize: "0.85rem",
      }}
      {...props}
    />
  );
}

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "text-sm font-medium text-[var(--foreground)]",
        className,
      )}
      {...props}
    />
  );
}

// ─── Card ────────────────────────────────────────────────────────────────

type CardTone = "default" | "primary" | "warning" | "info" | "danger";
type CardVariant = "default" | "glass" | "elevated" | "flat";

const TONE_BORDER: Record<CardTone, string> = {
  default: "border-[var(--border)]",
  primary: "border-[var(--primary)]/30",
  warning: "border-[color:var(--warning)]/30",
  info: "border-[color:var(--info)]/30",
  danger: "border-[color:var(--danger)]/30",
};

export function Card({
  className,
  tone = "default",
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  tone?: CardTone;
  variant?: CardVariant;
}) {
  const base = "rounded-[var(--radius-lg)] border";
  const surfaces: Record<CardVariant, string> = {
    default: "bg-[var(--card)] shadow-[var(--shadow-sm)]",
    glass:
      "bg-[var(--card)]/70 backdrop-blur-md shadow-[var(--shadow)]",
    elevated:
      "bg-[var(--card)] shadow-[var(--shadow-lg)]",
    flat: "bg-[var(--card-2)]",
  };
  return (
    <div
      className={cn(base, surfaces[variant], TONE_BORDER[tone], className)}
      {...props}
    />
  );
}

// ─── Badge ───────────────────────────────────────────────────────────────

type BadgeTone = "neutral" | "ok" | "warn" | "danger" | "info" | "primary";

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral:
    "bg-[var(--muted)] text-[var(--foreground-soft)] border-[var(--border)]",
  ok: "bg-[var(--accent)] text-[var(--primary)] border-[var(--primary)]/20",
  primary:
    "bg-[var(--primary)] text-[var(--primary-foreground)] border-transparent",
  warn:
    "bg-[var(--warning-soft)] text-[var(--warning-soft-fg)] border-[color:var(--warning)]/25",
  danger:
    "bg-[var(--danger-soft)] text-[var(--danger-soft-fg)] border-[color:var(--danger)]/25",
  info: "bg-[var(--info-soft)] text-[var(--info-soft-fg)] border-[color:var(--info)]/25",
};

export function Badge({
  tone = "neutral",
  dot,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
  dot?: string; // CSS color
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        BADGE_TONES[tone],
        className,
      )}
      {...props}
    >
      {dot && (
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: dot }}
        />
      )}
      {children}
    </span>
  );
}
