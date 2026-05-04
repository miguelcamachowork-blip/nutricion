import * as React from "react";
import { cn } from "@/lib/utils";

export function SectionHeader({
  title,
  subtitle,
  actions,
  className,
  tone = "primary",
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  tone?: "primary" | "info" | "warning" | "neutral";
}) {
  const tones: Record<string, string> = {
    primary:
      "from-[var(--primary)]/12 via-[var(--primary)]/6 to-transparent",
    info: "from-[color:var(--info)]/12 via-[color:var(--info)]/6 to-transparent",
    warning:
      "from-[color:var(--warning)]/12 via-[color:var(--warning)]/6 to-transparent",
    neutral: "from-[var(--muted)] via-[var(--muted)]/40 to-transparent",
  };
  return (
    <div
      className={cn(
        "rounded-[var(--radius-xl)] border border-[var(--border)] bg-gradient-to-br p-5 sm:p-6",
        "shadow-[var(--shadow-sm)]",
        tones[tone],
        className,
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              {subtitle}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
