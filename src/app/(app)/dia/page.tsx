"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import {
  deleteRecipe,
  listFoods,
  listGroups,
  listMeals,
  listPlan,
  listRecipes,
  listUnits,
} from "@/lib/db/repos";
import { useActiveProfileStore } from "@/hooks/useActiveProfile";
import { Badge, Button, Card } from "@/components/ui/primitives";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  amountToPortions,
  formatPortion,
  recipePortionsByGroup,
} from "@/lib/balance";
import { ChefHat, Clock, Pencil, Plus, Trash2 } from "lucide-react";
import { getGroupColor } from "@/lib/ui/groupColor";
import type { Food, Recipe } from "@/lib/types";

const EMPTY: never[] = [];

export default function PlanDelDiaPage() {
  const profileId = useActiveProfileStore((s) => s.activeProfileId)!;
  const meals = useLiveQuery(() => listMeals(profileId), [profileId]) ?? EMPTY;
  const groups = useLiveQuery(() => listGroups(profileId), [profileId]) ?? EMPTY;
  const foods = useLiveQuery(() => listFoods(profileId), [profileId]) ?? EMPTY;
  const units = useLiveQuery(() => listUnits(profileId), [profileId]) ?? EMPTY;
  const plan = useLiveQuery(() => listPlan(profileId), [profileId]) ?? EMPTY;
  const recipes =
    useLiveQuery(() => listRecipes(profileId), [profileId]) ?? EMPTY;

  const foodById = new Map(foods.map((f) => [f.id, f]));
  const unitById = new Map(units.map((u) => [u.id, u]));
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const recipeByMeal = new Map(recipes.map((r) => [r.mealId, r]));
  const planByCell = new Map(
    plan.map((c) => [`${c.mealId}::${c.groupId}`, c.portions]),
  );

  const today = new Date().toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-5 sm:px-6 sm:py-6">
      <SectionHeader
        title="Plan del día"
        subtitle={`Hoy · ${today}`}
        tone="primary"
      />

      {meals.length === 0 ? (
        <Card className="p-2">
          <EmptyState
            icon={ChefHat}
            title="No hay horarios todavía"
            description="Crea tus comidas en la sección Plan."
            action={
              <Link href="/plan">
                <Button>
                  <Plus className="h-4 w-4" />
                  Ir al Plan
                </Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {meals.map((m) => {
            const recipe = recipeByMeal.get(m.id);
            return (
              <MealCard
                key={m.id}
                profileId={profileId}
                mealId={m.id}
                mealLabel={m.label}
                mealTime={m.time}
                recipe={recipe}
                groups={groups}
                groupById={groupById}
                planByCell={planByCell}
                foodById={foodById}
                unitById={unitById}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function MealCard({
  profileId,
  mealId,
  mealLabel,
  mealTime,
  recipe,
  groups,
  groupById,
  planByCell,
  foodById,
  unitById,
}: {
  profileId: string;
  mealId: string;
  mealLabel: string;
  mealTime?: string;
  recipe: Recipe | undefined;
  groups: { id: string; label: string }[];
  groupById: Map<string, { label: string }>;
  planByCell: Map<string, number>;
  foodById: Map<string, Food>;
  unitById: Map<string, { label: string }>;
}) {
  const aported = recipe
    ? recipePortionsByGroup(recipe, foodById)
    : new Map<string, number>();

  const rows = groups
    .map((g) => ({
      g,
      planned: planByCell.get(`${mealId}::${g.id}`) ?? 0,
      aported: aported.get(g.id) ?? 0,
    }))
    .filter((r) => r.planned > 0 || r.aported > 0);

  return (
    <Card variant="elevated" className="overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] bg-gradient-to-br from-[var(--accent)] to-transparent px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight sm:text-lg">
            {mealLabel}
          </h2>
          {mealTime && (
            <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
              <Clock className="h-3 w-3" />
              {mealTime}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Link href={`/dia/editar/${mealId}`}>
            <Button size="sm" variant={recipe ? "outline" : "primary"}>
              {recipe ? (
                <>
                  <Pencil className="h-3.5 w-3.5" />
                  Editar
                </>
              ) : (
                <>
                  <ChefHat className="h-3.5 w-3.5" />
                  Crear
                </>
              )}
            </Button>
          </Link>
          {recipe && (
            <Button
              size="icon"
              variant="ghost"
              title="Eliminar receta"
              onClick={() => {
                if (confirm(`¿Eliminar la receta de "${mealLabel}"?`))
                  void deleteRecipe(profileId, mealId);
              }}
              className="text-[var(--danger)] hover:bg-[var(--danger-soft)]"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Compact group summary chips */}
      {rows.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 py-3 sm:px-5">
          {rows.map((r) => {
            const ok = Math.abs(r.planned - r.aported) < 0.01;
            const tone = ok
              ? "ok"
              : r.aported < r.planned
                ? "warn"
                : "danger";
            const color = getGroupColor(r.g.id);
            return (
              <Badge
                key={r.g.id}
                tone={tone}
                className="gap-1.5 tabular-nums text-[11px]"
              >
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="truncate">
                  {groupById.get(r.g.id)?.label}
                </span>
                <span className="opacity-70">
                  {formatPortion(r.aported)}/{formatPortion(r.planned)}
                </span>
              </Badge>
            );
          })}
        </div>
      )}

      {/* Items table */}
      {recipe && recipe.items.length > 0 ? (
        <div className="border-t border-[var(--border)]">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col style={{ width: "26%" }} />
              <col style={{ width: "32%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "16%" }} />
              <col style={{ width: "12%" }} />
            </colgroup>
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
                <th className="px-3 sm:px-4 py-2 font-medium">Grupo</th>
                <th className="px-2 py-2 font-medium">Alimento</th>
                <th className="px-2 py-2 font-medium text-right tabular-nums">
                  Cant.
                </th>
                <th className="px-2 py-2 font-medium">Unidades</th>
                <th className="px-3 sm:px-4 py-2 font-medium text-right tabular-nums">
                  Porc.
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {recipe.items.map((it, i) => {
                const food = foodById.get(it.foodId);
                const unit = food && unitById.get(food.unitId);
                const porciones = food
                  ? amountToPortions(it.amount, food)
                  : 0;
                const color = food
                  ? getGroupColor(food.groupId)
                  : "var(--muted)";
                const groupLabel = food
                  ? groupById.get(food.groupId)?.label ?? ""
                  : "";
                return (
                  <tr key={i}>
                    <td className="px-3 sm:px-4 py-2">
                      <span className="flex items-center gap-2 min-w-0">
                        <span
                          aria-hidden
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        <span
                          className="truncate text-[var(--muted-foreground)]"
                          title={groupLabel}
                        >
                          {groupLabel}
                        </span>
                      </span>
                    </td>
                    <td
                      className="px-2 py-2 truncate font-medium"
                      title={food?.name ?? ""}
                    >
                      {food?.name ?? "—"}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {formatPortion(it.amount)}
                    </td>
                    <td
                      className="px-2 py-2 truncate text-[var(--muted-foreground)]"
                      title={unit?.label ?? ""}
                    >
                      {unit?.label ?? ""}
                    </td>
                    <td className="px-3 sm:px-4 py-2 text-right tabular-nums text-[var(--foreground-soft)] font-medium">
                      {formatPortion(porciones)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="border-t border-[var(--border)] px-4 py-4 text-center text-sm text-[var(--muted-foreground)] sm:px-5">
          Sin receta todavía.
        </div>
      )}
    </Card>
  );
}
