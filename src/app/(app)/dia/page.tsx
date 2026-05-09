"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import {
  deleteRecipe,
  deleteScheduledRecipe,
  listFoods,
  listForbidden,
  listGroups,
  listMeals,
  listPlan,
  listRecipes,
  listScheduledRecipes,
  listUnits,
  partitionForbidden,
} from "@/lib/db/repos";
import { todayISO } from "@/lib/utils";
import { useActiveProfileStore } from "@/hooks/useActiveProfile";
import { Badge, Button, Card } from "@/components/ui/primitives";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  amountToPortions,
  formatPortion,
  recipePortionsByGroup,
} from "@/lib/balance";
import { Ban, ChefHat, Clock, Pencil, Plus, Trash2 } from "lucide-react";
import { getGroupColor } from "@/lib/ui/groupColor";
import type { Food, FoodGroup, Recipe, ScheduledRecipe } from "@/lib/types";

const EMPTY: never[] = [];

export default function PlanDelDiaPage() {
  const profileId = useActiveProfileStore((s) => s.activeProfileId)!;
  const meals = useLiveQuery(() => listMeals(profileId), [profileId]) ?? EMPTY;
  const groups = useLiveQuery(() => listGroups(), []) ?? EMPTY;
  const foods = useLiveQuery(() => listFoods(), []) ?? EMPTY;
  const units = useLiveQuery(() => listUnits(), []) ?? EMPTY;
  const plan = useLiveQuery(() => listPlan(profileId), [profileId]) ?? EMPTY;
  const recipes =
    useLiveQuery(() => listRecipes(profileId), [profileId]) ?? EMPTY;
  const todayIso = todayISO();
  const todaysScheduled =
    useLiveQuery(
      () => listScheduledRecipes(profileId, todayIso, todayIso),
      [profileId, todayIso],
    ) ?? EMPTY;
  const forbidden =
    useLiveQuery(() => listForbidden(profileId), [profileId]) ?? EMPTY;

  const { customs: forbiddenCustoms } = partitionForbidden(forbidden);

  const foodById = new Map(foods.map((f) => [f.id, f]));
  const unitById = new Map(units.map((u) => [u.id, u]));
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const templateByMeal = new Map(recipes.map((r) => [r.mealId, r]));
  const scheduledByMeal = new Map(
    todaysScheduled.map((r) => [r.mealId, r]),
  );
  /** For each meal: prefer today's scheduled recipe (calendar) over the
   *  per-meal template. */
  const recipeByMeal = new Map<
    string,
    { recipe: Recipe | ScheduledRecipe; source: "template" | "scheduled" }
  >();
  for (const m of meals) {
    const sched = scheduledByMeal.get(m.id);
    if (sched) {
      recipeByMeal.set(m.id, { recipe: sched, source: "scheduled" });
      continue;
    }
    const tmpl = templateByMeal.get(m.id);
    if (tmpl) recipeByMeal.set(m.id, { recipe: tmpl, source: "template" });
  }
  const planByCell = new Map(
    plan.map((c) => [`${c.mealId}::${c.groupId}`, c.portions]),
  );

  const today = new Date().toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  // Build a single, page-wide footnote index across every recipe of the day.
  // Each unique group with a `note` gets a stable number; the same number is
  // referenced from every meal that uses that group, and the explanatory list
  // is rendered just once at the bottom of the page.
  const footnoteOrder: { groupId: string; label: string; note: string }[] = [];
  const footnoteIndex = new Map<string, number>();
  for (const m of meals) {
    const r = recipeByMeal.get(m.id)?.recipe;
    if (!r) continue;
    for (const it of r.items) {
      const food = foodById.get(it.foodId);
      if (!food) continue;
      const g = groupById.get(food.groupId);
      if (!g?.note || footnoteIndex.has(g.id)) continue;
      footnoteIndex.set(g.id, footnoteOrder.length + 1);
      footnoteOrder.push({ groupId: g.id, label: g.label, note: g.note });
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-5 sm:px-6 sm:py-6">
      <SectionHeader
        title="Plan del día"
        subtitle={`Hoy · ${today}`}
        tone="primary"
      />

      {forbiddenCustoms.length > 0 && (
        <Card
          variant="flat"
          tone="danger"
          className="flex items-start gap-3 px-4 py-3 sm:px-5"
        >
          <Ban className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]" />
          <div className="min-w-0 text-sm">
            <span className="font-semibold text-[var(--danger-soft-fg)]">
              Evitar:
            </span>{" "}
            <span className="text-[var(--foreground-soft)]">
              {forbiddenCustoms.map((it) => it.label).join(", ")}
            </span>
          </div>
        </Card>
      )}

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
        <>
          <div className="grid grid-cols-1 gap-4">
            {meals.map((m) => {
              const entry = recipeByMeal.get(m.id);
              return (
                <MealCard
                  key={m.id}
                  profileId={profileId}
                  mealId={m.id}
                  mealLabel={m.label}
                  mealTime={m.time}
                  recipe={entry?.recipe}
                  recipeSource={entry?.source}
                  todayIso={todayIso}
                  groups={groups}
                  groupById={groupById}
                  planByCell={planByCell}
                  foodById={foodById}
                  unitById={unitById}
                  footnoteIndex={footnoteIndex}
                />
              );
            })}
          </div>

          {/* Global footnotes: one numbered list shared by all meals so the
              same group note is never repeated under each card. */}
          {footnoteOrder.length > 0 && (
            <Card variant="flat" className="px-4 py-3 sm:px-5">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                Notas
              </p>
              <ol className="space-y-1 text-xs text-[var(--muted-foreground)]">
                {footnoteOrder.map((f, idx) => (
                  <li key={f.groupId} className="flex gap-2">
                    <span className="shrink-0 font-medium text-[var(--primary)] tabular-nums">
                      {idx + 1}.
                    </span>
                    <span className="whitespace-pre-wrap">
                      <span className="font-medium text-[var(--foreground-soft)]">
                        {f.label}:
                      </span>{" "}
                      {f.note}
                    </span>
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </>
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
  recipeSource,
  todayIso,
  groups,
  groupById,
  planByCell,
  foodById,
  unitById,
  footnoteIndex,
}: {
  profileId: string;
  mealId: string;
  mealLabel: string;
  mealTime?: string;
  recipe: Recipe | ScheduledRecipe | undefined;
  recipeSource: "template" | "scheduled" | undefined;
  todayIso: string;
  groups: { id: string; label: string }[];
  groupById: Map<string, FoodGroup>;
  planByCell: Map<string, number>;
  foodById: Map<string, Food>;
  unitById: Map<string, { label: string }>;
  /** Page-wide map of `groupId → footnote number` (1-based). */
  footnoteIndex: Map<string, number>;
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

  const editHref =
    recipeSource === "scheduled"
      ? `/recetas/calendario/${todayIso}/${encodeURIComponent(mealId)}`
      : `/dia/editar/${encodeURIComponent(mealId)}`;
  const isAI =
    recipeSource === "scheduled" &&
    (recipe as ScheduledRecipe | undefined)?.source === "ai";

  return (
    <Card variant="elevated" className="overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] bg-gradient-to-br from-[var(--accent)] to-transparent px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-semibold tracking-tight sm:text-lg">
              {mealLabel}
            </h2>
            {recipeSource === "scheduled" && (
              <Badge tone={isAI ? "info" : "neutral"} className="text-[10px]">
                {isAI ? "IA · Programada" : "Programada"}
              </Badge>
            )}
          </div>
          {recipe?.title && (
            <p className="mt-0.5 truncate text-sm text-[var(--foreground-soft)]">
              {recipe.title}
            </p>
          )}
          {mealTime && (
            <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
              <Clock className="h-3 w-3" />
              {mealTime}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Link href={editHref}>
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
                if (confirm(`¿Eliminar la receta de "${mealLabel}"?`)) {
                  if (recipeSource === "scheduled" && recipe && "id" in recipe) {
                    void deleteScheduledRecipe(recipe.id);
                  } else {
                    void deleteRecipe(profileId, mealId);
                  }
                }
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
          <div
            className={
              recipe.preparation && recipe.preparation.length > 0
                ? "grid gap-0 lg:grid-cols-[2fr_1fr] lg:divide-x lg:divide-[var(--border)]"
                : undefined
            }
          >
            <div className="min-w-0 overflow-x-auto">
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
                const fnNum = food ? footnoteIndex.get(food.groupId) : undefined;
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
                          {fnNum !== undefined && (
                            <sup className="ml-0.5 text-[var(--primary)]">
                              {fnNum}
                            </sup>
                          )}
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
            {recipe.preparation && recipe.preparation.length > 0 && (
              <aside className="border-t border-[var(--border)] px-4 py-3 sm:px-5 lg:border-t-0">
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                  Preparación
                </p>
                <ol className="space-y-1.5 text-sm text-[var(--foreground-soft)]">
                  {recipe.preparation.map((step, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="shrink-0 font-medium tabular-nums text-[var(--primary)]">
                        {i + 1}.
                      </span>
                      <span className="whitespace-pre-wrap">{step}</span>
                    </li>
                  ))}
                </ol>
              </aside>
            )}
          </div>
        </div>
      ) : (
        <div className="border-t border-[var(--border)] px-4 py-4 text-center text-sm text-[var(--muted-foreground)] sm:px-5">
          Sin receta todavía.
        </div>
      )}
    </Card>
  );
}
