"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  addMeal,
  deleteMeal,
  listGroups,
  listMeals,
  listPlan,
  setPlanCell,
  updateMeal,
} from "@/lib/db/repos";
import { useActiveProfileStore } from "@/hooks/useActiveProfile";
import { Button, Card, Input } from "@/components/ui/primitives";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { PortionPicker } from "@/components/app/PortionPicker";
import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { addPortion, formatPortion } from "@/lib/balance";
import { getGroupColor } from "@/lib/ui/groupColor";
import type { Meal, PlanCell } from "@/lib/types";

const EMPTY: never[] = [];

export default function PlanPage() {
  const profileId = useActiveProfileStore((s) => s.activeProfileId)!;
  const meals = useLiveQuery(() => listMeals(profileId), [profileId]) ?? EMPTY;
  const groups = useLiveQuery(() => listGroups(profileId), [profileId]) ?? EMPTY;
  const plan = useLiveQuery(() => listPlan(profileId), [profileId]) ?? EMPTY;
  const [hideEmpty, setHideEmpty] = useState(false);

  const cellMap = new Map<string, PlanCell>();
  for (const c of plan) cellMap.set(`${c.mealId}::${c.groupId}`, c);

  const groupTotals = new Map<string, number>();
  for (const g of groups) {
    let total = 0;
    for (const m of meals) {
      const c = cellMap.get(`${m.id}::${g.id}`);
      if (c) total = addPortion(total, c.portions);
    }
    groupTotals.set(g.id, total);
  }
  const visibleGroups = hideEmpty
    ? groups.filter((g) => (groupTotals.get(g.id) ?? 0) > 0)
    : groups;
  const hiddenCount = groups.length - visibleGroups.length;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-5 sm:px-6 sm:py-6">
      <SectionHeader
        title="Plan de la Nutrióloga"
        subtitle="Define cuántas porciones de cada grupo corresponden a cada horario."
        tone="primary"
        actions={
          <>
            <Button
              variant={hideEmpty ? "subtle" : "outline"}
              size="sm"
              onClick={() => setHideEmpty((v) => !v)}
              title="Ocultar grupos sin porciones en el total"
            >
              {hideEmpty ? (
                <>
                  <Eye className="h-4 w-4" />
                  Mostrar todos
                  {hiddenCount > 0 && ` (${hiddenCount})`}
                </>
              ) : (
                <>
                  <EyeOff className="h-4 w-4" />
                  Ocultar vacíos
                </>
              )}
            </Button>
            <AddMealDialog profileId={profileId} />
          </>
        }
      />

      <Card variant="elevated" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--card-2)]">
                <th className="sticky left-0 z-10 bg-[var(--card-2)] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)] min-w-40">
                  Grupo
                </th>
                {meals.map((m) => (
                  <th
                    key={m.id}
                    className="px-2 py-2 text-center font-medium min-w-32 border-l border-[var(--border)]"
                  >
                    <MealHeader meal={m} />
                  </th>
                ))}
                <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)] border-l border-[var(--border)] bg-[var(--accent)]">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleGroups.map((g, idx) => {
                const total = groupTotals.get(g.id) ?? 0;
                const color = getGroupColor(g.id);
                return (
                  <tr
                    key={g.id}
                    className={
                      idx % 2 === 1
                        ? "bg-[var(--card-2)]/40"
                        : "bg-transparent"
                    }
                  >
                    <td className="sticky left-0 z-10 bg-[var(--card)] px-4 py-2.5 font-medium border-t border-[var(--border)]">
                      <div className="flex items-center gap-2.5">
                        <span
                          aria-hidden
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        <span className="truncate">{g.label}</span>
                      </div>
                    </td>
                    {meals.map((m) => {
                      const c = cellMap.get(`${m.id}::${g.id}`);
                      const portions = c?.portions ?? 0;
                      const intensity = Math.min(1, portions / 4);
                      return (
                        <td
                          key={m.id}
                          className="px-2 py-1.5 text-center border-t border-l border-[var(--border)] transition-colors"
                          style={
                            portions > 0
                              ? {
                                  backgroundColor: `color-mix(in oklab, ${color} ${intensity * 12}%, transparent)`,
                                }
                              : undefined
                          }
                        >
                          <PortionPicker
                            value={portions}
                            onChange={(n) =>
                              void setPlanCell(profileId, m.id, g.id, n)
                            }
                            size="sm"
                          />
                        </td>
                      );
                    })}
                    <td className="px-3 py-2.5 text-center font-semibold tabular-nums border-t border-l border-[var(--border)] bg-[var(--accent)]/30">
                      {formatPortion(total)}
                    </td>
                  </tr>
                );
              })}
              {groups.length === 0 && (
                <tr>
                  <td
                    colSpan={meals.length + 2}
                    className="py-10 text-center text-[var(--muted-foreground)]"
                  >
                    No hay grupos.
                  </td>
                </tr>
              )}
              {groups.length > 0 && visibleGroups.length === 0 && (
                <tr>
                  <td
                    colSpan={meals.length + 2}
                    className="py-10 text-center text-[var(--muted-foreground)]"
                  >
                    Todos los grupos están vacíos. Pulsa &quot;Mostrar todos&quot; para verlos.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function MealHeader({ meal }: { meal: Meal }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(meal.label);
  const [time, setTime] = useState(meal.time ?? "");
  return (
    <div className="flex flex-col items-center gap-0.5">
      <button
        onClick={() => {
          setLabel(meal.label);
          setTime(meal.time ?? "");
          setEditing(true);
        }}
        className="rounded-md px-2 py-0.5 text-sm font-semibold tracking-tight transition-colors hover:bg-[var(--muted)]"
      >
        {meal.label}
      </button>
      {meal.time && (
        <span className="text-[10.5px] text-[var(--muted-foreground)] tabular-nums">
          {meal.time}
        </span>
      )}

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent title="Editar horario">
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Nombre</label>
              <Input
                className="mt-1"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Hora (opcional)</label>
              <Input
                className="mt-1"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
            <div className="flex justify-between">
              <Button
                variant="danger"
                onClick={async () => {
                  if (
                    confirm(
                      `Eliminar "${meal.label}"? Se borrarán sus porciones del plan.`,
                    )
                  ) {
                    await deleteMeal(meal.id);
                    setEditing(false);
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
                Eliminar
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setEditing(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={async () => {
                    await updateMeal(meal.id, {
                      label: label.trim() || meal.label,
                      time: time || undefined,
                    });
                    setEditing(false);
                  }}
                >
                  Guardar
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddMealDialog({ profileId }: { profileId: string }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          Horario
        </Button>
      </DialogTrigger>
      <DialogContent title="Nuevo horario">
        <div className="space-y-3">
          <Input
            placeholder='Ej. "Pre-entreno"'
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                if (!label.trim()) return;
                await addMeal(profileId, label.trim());
                setLabel("");
                setOpen(false);
              }}
            >
              Crear
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
