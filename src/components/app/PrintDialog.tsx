"use client";

/**
 * Dialog that lets the user pick which sections to send to the printer.
 * Building a printable view as a separate route keeps the AppShell out of
 * the printout and lets the browser drive @media print rules cleanly.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui/primitives";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Printer } from "lucide-react";
import { todayISO } from "@/lib/utils";
import { useActiveProfileStore } from "@/hooks/useActiveProfile";

export type PrintSection =
  | "plan"
  | "recetas"
  | "dia"
  | "alimentos";

const SECTION_LABELS: Record<PrintSection, string> = {
  plan: "Plan (matriz por porciones)",
  recetas: "Recetas calendarizadas",
  dia: "Plan del día",
  alimentos: "Tabla de alimentos",
};

interface PrintDialogProps {
  /** Custom trigger; defaults to a ghost icon button. */
  children?: React.ReactNode;
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function PrintDialog({ children }: PrintDialogProps) {
  const router = useRouter();
  const profileId = useActiveProfileStore((s) => s.activeProfileId);
  const [open, setOpen] = useState(false);
  const today = todayISO();
  const [sel, setSel] = useState<Record<PrintSection, boolean>>({
    plan: true,
    recetas: true,
    dia: false,
    alimentos: false,
  });
  const [from, setFrom] = useState<string>(today);
  const [to, setTo] = useState<string>(addDays(today, 6));
  const [day, setDay] = useState<string>(today);
  const [includePreparation, setIncludePreparation] = useState(true);
  const [orientation, setOrientation] = useState<"portrait" | "landscape">(
    "portrait",
  );

  function toggle(key: PrintSection) {
    setSel((s) => ({ ...s, [key]: !s[key] }));
  }

  function handlePrint() {
    if (!profileId) return;
    const sections = (Object.keys(sel) as PrintSection[]).filter((k) => sel[k]);
    if (sections.length === 0) return;
    const params = new URLSearchParams({
      pid: profileId,
      sections: sections.join(","),
    });
    if (sel.recetas) {
      params.set("from", from);
      params.set("to", to);
    }
    if (sel.dia) {
      params.set("day", day);
    }
    if (!includePreparation && (sel.dia || sel.recetas)) {
      params.set("prep", "0");
    }
    if (orientation === "landscape") {
      params.set("orient", "h");
    }
    setOpen(false);
    router.push(`/imprimir?${params.toString()}`);
  }

  const anySelected = Object.values(sel).some(Boolean);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children ?? (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Imprimir"
            title="Imprimir"
          >
            <Printer className="h-5 w-5" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        title="Imprimir"
        description="Selecciona qué secciones quieres incluir en la impresión."
      >
        <div className="space-y-3">
          <fieldset className="space-y-1.5">
            <legend className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
              Secciones
            </legend>
            {(Object.keys(SECTION_LABELS) as PrintSection[]).map((k) => (
              <label
                key={k}
                className="flex cursor-pointer items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card-2)] px-3 py-2 text-sm hover:bg-[var(--muted)]"
              >
                <input
                  type="checkbox"
                  checked={sel[k]}
                  onChange={() => toggle(k)}
                  className="h-4 w-4 accent-[var(--primary)]"
                />
                <span>{SECTION_LABELS[k]}</span>
              </label>
            ))}
          </fieldset>

          {sel.recetas && (
            <Card variant="flat" className="space-y-2 p-3">
              <div className="text-xs font-medium text-[var(--foreground-soft)]">
                Rango para recetas calendarizadas
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-xs text-[var(--muted-foreground)]">
                    Desde
                  </span>
                  <input
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    className="h-10 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] px-2 text-sm"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-[var(--muted-foreground)]">
                    Hasta
                  </span>
                  <input
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className="h-10 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] px-2 text-sm"
                  />
                </label>
              </div>
            </Card>
          )}

          {sel.dia && (
            <Card variant="flat" className="space-y-2 p-3">
              <label className="space-y-1">
                <span className="text-xs text-[var(--muted-foreground)]">
                  Día a imprimir
                </span>
                <input
                  type="date"
                  value={day}
                  onChange={(e) => setDay(e.target.value)}
                  className="h-10 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] px-2 text-sm"
                />
              </label>
            </Card>
          )}

          {(sel.dia || sel.recetas) && (
            <label className="flex cursor-pointer items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card-2)] px-3 py-2 text-sm hover:bg-[var(--muted)]">
              <input
                type="checkbox"
                checked={includePreparation}
                onChange={(e) => setIncludePreparation(e.target.checked)}
                className="h-4 w-4 accent-[var(--primary)]"
              />
              <span>Incluir modo de preparación</span>
            </label>
          )}

          <fieldset>
            <legend className="mb-1.5 text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
              Orientación
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: "portrait", label: "Vertical" },
                { value: "landscape", label: "Horizontal" },
              ] as const).map((opt) => (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-center justify-center gap-2 rounded-[var(--radius)] border px-3 py-2 text-sm ${
                    orientation === opt.value
                      ? "border-[var(--primary)] bg-[var(--primary)]/10 font-medium"
                      : "border-[var(--border)] bg-[var(--card-2)] hover:bg-[var(--muted)]"
                  }`}
                >
                  <input
                    type="radio"
                    name="orientation"
                    value={opt.value}
                    checked={orientation === opt.value}
                    onChange={() => setOrientation(opt.value)}
                    className="sr-only"
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handlePrint}
              disabled={!anySelected || !profileId}
            >
              <Printer className="h-4 w-4" />
              Imprimir
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
