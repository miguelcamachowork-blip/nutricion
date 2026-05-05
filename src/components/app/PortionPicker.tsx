"use client";

import * as React from "react";
import * as Popover from "@radix-ui/react-popover";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPortion, portionOptions } from "@/lib/balance";

interface PortionPickerProps {
  value: number;
  onChange: (n: number) => void;
  max?: number;
  /** Optional “suggested” marker, e.g. recommended portion. */
  suggested?: number;
  className?: string;
  size?: "sm" | "md";
  disabled?: boolean;
}

export function PortionPicker({
  value,
  onChange,
  max = 6,
  suggested,
  className,
  size = "md",
  disabled,
}: PortionPickerProps) {
  const opts = React.useMemo(() => portionOptions(max), [max]);
  const isZero = value === 0;
  return (
    <Popover.Root>
      <Popover.Trigger asChild disabled={disabled}>
        <button
          className={cn(
            "inline-flex items-center justify-between gap-1 rounded-lg border bg-[var(--card)] font-medium shadow-sm transition-all hover:border-[var(--border-strong)] hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--card)] disabled:opacity-50",
            isZero
              ? "border-dashed border-[var(--border)] text-[var(--muted-foreground)]"
              : "border-[var(--border)]",
            size === "sm" ? "h-8 px-2 text-sm min-w-14" : "h-10 px-3 text-base min-w-16",
            className,
          )}
        >
          <span className="tabular-nums">{formatPortion(value)}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="center"
          sideOffset={6}
          className="z-50 w-56 rounded-xl border border-[var(--border)] bg-[var(--primary-50)] p-2 shadow-[var(--shadow-lg)]"
        >
          <div className="mb-1 px-1 text-xs text-[var(--muted-foreground)]">
            Selecciona porción
          </div>
          <div className="grid grid-cols-4 gap-1 max-h-64 overflow-y-auto">
            {opts.map((n) => {
              const isSel = Math.abs(n - value) < 1e-9;
              const isSug =
                suggested !== undefined &&
                Math.abs(n - suggested) < 1e-9 &&
                !isSel;
              return (
                <Popover.Close key={n} asChild>
                  <button
                    onClick={() => onChange(n)}
                    className={cn(
                      "h-9 rounded-md text-sm tabular-nums transition-colors",
                      isSel
                        ? "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm"
                        : isSug
                          ? "bg-[var(--accent)] text-[var(--primary)] ring-1 ring-[color:var(--primary)]/40"
                          : "hover:bg-[var(--muted)]",
                    )}
                  >
                    {formatPortion(n)}
                  </button>
                </Popover.Close>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
