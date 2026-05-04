"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  getPlanAt,
  getRecipesAt,
  listFoods,
  listGroups,
  listMeals,
  listPlanSnapshotDates,
  listRecipeSnapshotDates,
  listUnits,
} from "@/lib/db/repos";
import { useActiveProfileStore } from "@/hooks/useActiveProfile";
import { Button, Card } from "@/components/ui/primitives";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { getGroupColor } from "@/lib/ui/groupColor";
import { amountToPortions, formatPortion } from "@/lib/balance";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn, todayISO } from "@/lib/utils";

const EMPTY: never[] = [];

export default function HistoricoPage() {
  const profileId = useActiveProfileStore((s) => s.activeProfileId)!;
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [selected, setSelected] = useState<string>(todayISO());

  const meals = useLiveQuery(() => listMeals(profileId), [profileId]) ?? EMPTY;
  const groups = useLiveQuery(() => listGroups(profileId), [profileId]) ?? EMPTY;
  const foods = useLiveQuery(() => listFoods(profileId), [profileId]) ?? EMPTY;
  const units = useLiveQuery(() => listUnits(profileId), [profileId]) ?? EMPTY;

  const planSnapDates =
    useLiveQuery(() => listPlanSnapshotDates(profileId), [profileId]) ?? EMPTY;
  const recipeSnapDates =
    useLiveQuery(() => listRecipeSnapshotDates(profileId), [profileId]) ?? EMPTY;
  const planAt = useLiveQuery(
    () => getPlanAt(profileId, selected),
    [profileId, selected],
  );
  const recipesAt = useLiveQuery(
    () => getRecipesAt(profileId, selected),
    [profileId, selected],
  );

  const days = useMemo(() => buildMonthGrid(cursor), [cursor]);

  const foodById = new Map(foods.map((f) => [f.id, f]));
  const unitById = new Map(units.map((u) => [u.id, u]));
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const mealById = new Map(meals.map((m) => [m.id, m]));

  const planSnapSet = useMemo(() => new Set(planSnapDates), [planSnapDates]);
  const recipeSnapSet = useMemo(
    () => new Set(recipeSnapDates),
    [recipeSnapDates],
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-5 sm:px-6 sm:py-6">
      <SectionHeader
        title="Histórico"
        subtitle="Plan y recetas vigentes en cada fecha. Solo se guarda una nueva versión cuando hay cambios."
        tone="info"
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <Card variant="elevated" className="p-4">
        <div className="flex items-center justify-between">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => {
              const d = new Date(cursor);
              d.setMonth(d.getMonth() - 1);
              setCursor(d);
            }}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="font-medium">
            {cursor.toLocaleDateString("es-MX", {
              month: "long",
              year: "numeric",
            })}
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => {
              const d = new Date(cursor);
              d.setMonth(d.getMonth() + 1);
              setCursor(d);
            }}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs font-medium text-[var(--muted-foreground)]">
          {["L", "M", "X", "J", "V", "S", "D"].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {days.map((d, i) => {
            if (!d) return <div key={i} />;
            const date = isoOf(d);
            const hasPlan = planSnapSet.has(date);
            const hasRecipe = recipeSnapSet.has(date);
            const hasSnap = hasPlan || hasRecipe;
            const isSel = date === selected;
            const isToday = date === todayISO();
            return (
              <button
                key={i}
                onClick={() => setSelected(date)}
                className={cn(
                  "relative h-11 rounded-lg text-sm tabular-nums font-medium transition-all",
                  isSel
                    ? "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm"
                    : hasSnap
                      ? "bg-[var(--accent)] text-[var(--foreground)] hover:bg-[var(--muted)]"
                      : "text-[var(--muted-foreground)] hover:bg-[var(--muted)]",
                  isToday && !isSel && "ring-1 ring-inset ring-[color:var(--primary)]/40",
                )}
              >
                {d.getDate()}
                {hasSnap && !isSel && (
                  <span className="absolute bottom-1 left-1/2 flex -translate-x-1/2 gap-0.5">
                    {hasPlan && (
                      <span className="h-1 w-1 rounded-full bg-[var(--primary)]" />
                    )}
                    {hasRecipe && (
                      <span className="h-1 w-1 rounded-full bg-[var(--info)]" />
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[var(--muted-foreground)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)]" />
            Plan
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--info)]" />
            Recetas
          </span>
        </div>
      </Card>

      <Card variant="elevated" className="p-4">
        <div className="mb-3 font-medium">
          {new Date(selected + "T00:00").toLocaleDateString("es-MX", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </div>

        {/* Plan */}
        <div className="mb-4">
          <h2 className="mb-2 text-sm font-semibold uppercase text-[var(--color-muted-foreground)]">
            Plan
          </h2>
          {planAt && planAt.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-[var(--color-muted-foreground)]">
                    <th className="py-2 pr-3">Grupo</th>
                    {meals.map((m) => (
                      <th key={m.id} className="py-2 pr-3">
                        {m.label}
                      </th>
                    ))}
                    <th className="py-2 pr-3">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {groups.map((g) => {
                    const cells = planAt.filter((c) => c.groupId === g.id);
                    if (cells.length === 0) return null;
                    const total = cells.reduce((s, c) => s + c.portions, 0);
                    return (
                      <tr key={g.id}>
                        <td className="py-2 pr-3 font-medium">{g.label}</td>
                        {meals.map((m) => {
                          const c = cells.find((x) => x.mealId === m.id);
                          return (
                            <td
                              key={m.id}
                              className="py-2 pr-3 tabular-nums text-center"
                            >
                              {c ? formatPortion(c.portions) : "—"}
                            </td>
                          );
                        })}
                        <td className="py-2 pr-3 tabular-nums font-semibold">
                          {formatPortion(total)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-sm text-[var(--color-muted-foreground)]">
              Aún no hay plan registrado para esta fecha.
            </div>
          )}
        </div>

        {/* Recipes */}
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase text-[var(--color-muted-foreground)]">
            Recetas
          </h2>
          {recipesAt && recipesAt.length > 0 ? (
            <div className="space-y-3">
              {recipesAt.map((r, idx) => {
                const meal = mealById.get(r.mealId);
                if (!meal) return null;
                return (
                  <div
                    key={idx}
                    className="rounded-lg border border-[var(--border)] bg-[var(--card-2)] p-3"
                  >
                    <div className="font-semibold mb-2">{meal.label}</div>
                    {r.items.length === 0 ? (
                      <div className="text-xs text-[var(--color-muted-foreground)]">
                        (sin alimentos)
                      </div>
                    ) : (
                      <ul className="space-y-1 text-sm">
                        {r.items.map((it, i) => {
                          const f = foodById.get(it.foodId);
                          const u = f && unitById.get(f.unitId);
                          const g = f && groupById.get(f.groupId);
                          const p = f ? amountToPortions(it.amount, f) : 0;
                          const color = f
                            ? getGroupColor(f.groupId)
                            : "var(--muted)";
                          return (
                            <li key={i} className="flex items-baseline gap-2">
                              <span
                                aria-hidden
                                className="h-1.5 w-1.5 shrink-0 translate-y-[-2px] rounded-full"
                                style={{ backgroundColor: color }}
                              />
                              <span className="font-medium">
                                {f?.name ?? "—"}
                              </span>
                              <span className="text-[var(--muted-foreground)]">
                                {" · "}
                                {formatPortion(it.amount)} {u?.label ?? ""}
                                {" · "}
                                {formatPortion(p)} porciones
                                {g ? ` · ${g.label}` : ""}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-sm text-[var(--color-muted-foreground)]">
              Aún no hay recetas registradas para esta fecha.
            </div>
          )}
        </div>
      </Card>
      </div>
    </div>
  );
}

function buildMonthGrid(cursor: Date): (Date | null)[] {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const firstWeekday = (first.getDay() + 6) % 7;
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= last.getDate(); d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
