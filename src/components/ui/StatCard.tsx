import * as React from "react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "primary",
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: "primary" | "info" | "warning" | "danger" | "neutral";
  className?: string;
}) {
  const tones: Record<string, { ring: string; iconBg: string; iconFg: string }> = {
    primary: {
      ring: "ring-[var(--primary)]/15",
      iconBg: "bg-[var(--accent)]",
      iconFg: "text-[var(--primary)]",
    },
    info: {
      ring: "ring-[color:var(--info)]/15",
      iconBg: "bg-[var(--info-soft)]",
      iconFg: "text-[var(--info-soft-fg)]",
    },
    warning: {
      ring: "ring-[color:var(--warning)]/15",
      iconBg: "bg-[var(--warning-soft)]",
      iconFg: "text-[var(--warning-soft-fg)]",
    },
    danger: {
      ring: "ring-[color:var(--danger)]/15",
      iconBg: "bg-[var(--danger-soft)]",
      iconFg: "text-[var(--danger-soft-fg)]",
    },
    neutral: {
      ring: "ring-[var(--border)]",
      iconBg: "bg-[var(--muted)]",
      iconFg: "text-[var(--foreground-soft)]",
    },
  };
  const t = tones[tone];
  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] bg-[var(--card)] p-4 ring-1 shadow-[var(--shadow-sm)]",
        t.ring,
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
          {label}
        </p>
        {Icon && (
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-[var(--radius)]",
              t.iconBg,
              t.iconFg,
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
        {value}
      </p>
      {hint && (
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">{hint}</p>
      )}
    </div>
  );
}
