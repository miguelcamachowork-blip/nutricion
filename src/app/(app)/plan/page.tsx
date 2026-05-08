"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useLiveQuery } from "dexie-react-hooks";
import {
  addMeal,
  deleteMeal,
  listGroups,
  listMeals,
  listPlan,
  reorderGroups,
  setPlanCell,
  updateMeal,
} from "@/lib/db/repos";
import { useActiveProfileStore } from "@/hooks/useActiveProfile";
import { Button, Card, Input } from "@/components/ui/primitives";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { PortionPicker } from "@/components/app/PortionPicker";
import { Eye, EyeOff, GripVertical, Plus, Trash2 } from "lucide-react";
import { addPortion, formatPortion } from "@/lib/balance";
import { getGroupColor } from "@/lib/ui/groupColor";
import type { FoodGroup, Meal, PlanCell } from "@/lib/types";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const EMPTY: never[] = [];

/**
 * Wrapper around `setPlanCell` that surfaces a toast when the change
 * affects future scheduled recipes (so the user knows to revisit them).
 * Errors are also surfaced to the user since plan edits are user-initiated
 * and silent failures would be confusing.
 */
async function handlePlanChange(
  profileId: string,
  mealId: string,
  groupId: string,
  portions: number,
): Promise<void> {
  try {
    const { affectedScheduled } = await setPlanCell(
      profileId,
      mealId,
      groupId,
      portions,
    );
    if (affectedScheduled > 0) {
      toast.warning(
        `${affectedScheduled} receta${affectedScheduled === 1 ? "" : "s"} futura${affectedScheduled === 1 ? "" : "s"} pueden estar afectada${affectedScheduled === 1 ? "" : "s"} por este cambio`,
        {
          description: "Revísalas en la sección Recetas.",
          action: {
            label: "Ir a Recetas",
            onClick: () => {
              window.location.assign("/recetas");
            },
          },
        },
      );
    }
  } catch (err) {
    toast.error("No se pudo guardar el cambio en el plan");
    console.error(err);
  }
}

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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = visibleGroups.findIndex((g) => g.id === active.id);
    const newIdx = visibleGroups.findIndex((g) => g.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(visibleGroups, oldIdx, newIdx).map((g) => g.id);
    const visibleSet = new Set(visibleGroups.map((g) => g.id));
    let i = 0;
    const finalIds = groups.map((g) =>
      visibleSet.has(g.id) ? reordered[i++] : g.id,
    );
    void reorderGroups(profileId, finalIds);
  }

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
              <tr className="bg-[var(--primary)] text-[color:var(--primary-foreground)]">
                <th className="sticky left-0 z-10 bg-[var(--primary)] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[color:var(--primary-foreground)]/85 min-w-40">
                  Grupo
                </th>
                {meals.map((m) => (
                  <th
                    key={m.id}
                    className="px-2 py-2 text-center font-medium min-w-32 border-l border-[color:var(--primary-foreground)]/15 text-[color:var(--primary-foreground)]"
                  >
                    <MealHeader meal={m} />
                  </th>
                ))}
                <th
                  className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide border-l border-[color:var(--primary-foreground)]/15 text-[color:var(--primary-foreground)]/85"
                  style={{
                    backgroundColor:
                      "color-mix(in oklab, var(--primary), black 18%)",
                  }}
                >
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={visibleGroups.map((g) => g.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {visibleGroups.map((g, idx) => (
                    <SortableGroupRow
                      key={g.id}
                      group={g}
                      idx={idx}
                      total={groupTotals.get(g.id) ?? 0}
                      meals={meals}
                      cellMap={cellMap}
                      profileId={profileId}
                    />
                  ))}
                </SortableContext>
              </DndContext>
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

interface SortableGroupRowProps {
  group: FoodGroup;
  idx: number;
  total: number;
  meals: Meal[];
  cellMap: Map<string, PlanCell>;
  profileId: string;
}

function SortableGroupRow({
  group: g,
  idx,
  total,
  meals,
  cellMap,
  profileId,
}: SortableGroupRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: g.id });
  const color = getGroupColor(g.id);
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    position: isDragging ? "relative" : undefined,
    zIndex: isDragging ? 20 : undefined,
  };
  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={
        idx % 2 === 1 ? "bg-[var(--card-2)]/40" : "bg-transparent"
      }
    >
      <td className="sticky left-0 z-10 bg-[var(--card)] px-3 py-2.5 font-medium border-t border-[var(--border)]">
        <div className="flex items-center gap-2">
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`Reordenar ${g.label}`}
            className="-ml-1 flex h-7 w-6 cursor-grab items-center justify-center rounded text-[var(--muted-foreground)] hover:bg-[var(--muted)] active:cursor-grabbing touch-none"
          >
            <GripVertical className="h-4 w-4" />
          </button>
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
                    backgroundColor: `color-mix(in oklab, ${color} ${14 + intensity * 24}%, transparent)`,
                  }
                : undefined
            }
          >
            <PortionPicker
              value={portions}
              onChange={(n) => void handlePlanChange(profileId, m.id, g.id, n)}
              size="sm"
            />
          </td>
        );
      })}
      <td
        className="px-3 py-2.5 text-center font-semibold tabular-nums border-t border-l border-[var(--border)]"
        style={
          total > 0
            ? {
                backgroundColor: `color-mix(in oklab, ${color} ${22 + Math.min(1, total / 8) * 22}%, transparent)`,
              }
            : undefined
        }
      >
        {formatPortion(total)}
      </td>
    </tr>
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
        className="rounded-md px-2 py-0.5 text-sm font-semibold tracking-tight transition-colors hover:bg-[color:var(--primary-foreground)]/15"
      >
        {meal.label}
      </button>
      {meal.time && (
        <span className="text-xs font-medium text-[color:var(--primary-foreground)]/75 tabular-nums">
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
