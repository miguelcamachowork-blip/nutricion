"use client";

import "react-day-picker/style.css";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { DayPicker } from "react-day-picker";
import { es } from "react-day-picker/locale";
import {
  deleteScheduledRecipe,
  getPlanAt,
  listFoods,
  listForbidden,
  listGroups,
  listMeals,
  listScheduledRecipes,
  listUnits,
  upsertScheduledRecipe,
} from "@/lib/db/repos";
import { useActiveProfileStore } from "@/hooks/useActiveProfile";
import { useAIRecipe } from "@/hooks/useAIRecipe";
import { buildMealContext } from "@/lib/ai/buildContext";
import { Badge, Button, Card } from "@/components/ui/primitives";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarPlus,
  ChefHat,
  Pencil,
  Sparkles,
  Trash2,
} from "lucide-react";
import { recipePortionsByGroup } from "@/lib/balance";
import type { Food, ScheduledRecipe } from "@/lib/types";

/**
 * Calendar view for scheduled recipes. Lets the user pick a date and create,
 * edit or delete a recipe per meal slot for that date. Marks days that
 * already have at least one scheduled recipe with a dot, and adds an amber
 * dot for days with recipes flagged `needsReview` (after a plan change).
 */
export default function RecetasCalendarPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const profileId = useActiveProfileStore((s) => s.activeProfileId)!;

  const queryDate = searchParams.get("date");
  const initialDate = queryDate && /^\d{4}-\d{2}-\d{2}$/.test(queryDate)
    ? parseISODate(queryDate)
    : new Date();
  const [selected, setSelected] = useState<Date>(initialDate);
  const selectedISO = toISODate(selected);

  const meals = useLiveQuery(() => listMeals(profileId), [profileId]) ?? [];
  const foods = useLiveQuery(() => listFoods(profileId), [profileId]) ?? [];
  const groups = useLiveQuery(() => listGroups(profileId), [profileId]) ?? [];
  const units = useLiveQuery(() => listUnits(profileId), [profileId]) ?? [];
  const forbidden =
    useLiveQuery(() => listForbidden(profileId), [profileId]) ?? [];
  // Load all scheduled recipes for this profile (the dataset will stay small
  // in practice). Avoids re-fetching when navigating between months.
  const scheduledQuery = useLiveQuery(
    () => listScheduledRecipes(profileId),
    [profileId],
  );
  const scheduled = useMemo(() => scheduledQuery ?? [], [scheduledQuery]);

  const byDate = useMemo(() => {
    const map = new Map<string, ScheduledRecipe[]>();
    for (const r of scheduled) {
      const arr = map.get(r.date) ?? [];
      arr.push(r);
      map.set(r.date, arr);
    }
    return map;
  }, [scheduled]);

  const scheduledDays = useMemo(
    () => Array.from(byDate.keys()).map(parseISODate),
    [byDate],
  );
  const reviewDays = useMemo(
    () =>
      Array.from(byDate.entries())
        .filter(([, list]) => list.some((r) => r.needsReview))
        .map(([d]) => parseISODate(d)),
    [byDate],
  );

  const todaysRecipes = byDate.get(selectedISO) ?? [];
  const recipesByMeal = new Map(todaysRecipes.map((r) => [r.mealId, r]));

  const handleSelect = (d: Date | undefined) => {
    if (!d) return;
    setSelected(d);
    const iso = toISODate(d);
    router.replace(`/recetas?date=${iso}`, { scroll: false });
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-6 space-y-6">
      <SectionHeader
        title="Recetas calendarizadas"
        subtitle="Programa recetas para cualquier fecha futura. Cuando el plan cambie, te avisaremos qué recetas revisar."
      />

      <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
        {/* Calendar */}
        <Card variant="elevated" className="p-3 sm:p-4 self-start">
          <DayPicker
            mode="single"
            locale={es}
            selected={selected}
            onSelect={handleSelect}
            weekStartsOn={1}
            modifiers={{
              hasRecipes: scheduledDays,
              needsReview: reviewDays,
            }}
            modifiersClassNames={{
              hasRecipes: "rdp-day-has-recipes",
              needsReview: "rdp-day-needs-review",
            }}
            classNames={{
              today: "rdp-day-today",
              selected: "rdp-day-selected",
            }}
          />
          <div className="mt-3 flex flex-wrap gap-3 px-2 text-[11px] text-[var(--muted-foreground)]">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)]" />
              Con recetas
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Requiere revisión
            </span>
          </div>
        </Card>

        {/* Day detail */}
        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold capitalize">
              {formatHumanDate(selectedISO)}
            </h2>
            <span className="text-xs text-[var(--muted-foreground)] tabular-nums">
              {todaysRecipes.length} receta
              {todaysRecipes.length === 1 ? "" : "s"}
            </span>
          </div>

          {meals.length === 0 ? (
            <EmptyState
              title="No hay horarios"
              description="Configura los horarios de comidas en la sección Plan."
            />
          ) : (
            <div className="space-y-3">
              {meals
                .slice()
                .sort((a, b) =>
                  (a.time ?? a.label).localeCompare(b.time ?? b.label),
                )
                .map((meal) => {
                  const r = recipesByMeal.get(meal.id);
                  return (
                    <MealSlotCard
                      key={meal.id}
                      profileId={profileId}
                      mealLabel={meal.label}
                      mealTime={meal.time}
                      mealId={meal.id}
                      date={selectedISO}
                      recipe={r}
                      foods={foods}
                      groups={groups}
                      units={units}
                      forbidden={forbidden}
                    />
                  );
                })}
            </div>
          )}
        </div>
      </div>

      {/* Lightweight CSS overrides for react-day-picker, scoped enough to
          look at home with the rest of the design system. */}
      <style jsx global>{`
        .rdp-root {
          --rdp-accent-color: var(--primary);
          --rdp-accent-background-color: var(--accent);
          --rdp-day_button-border-radius: var(--radius);
          --rdp-selected-border: 2px solid var(--primary);
          --rdp-day-height: 2.5rem;
          --rdp-day-width: 2.5rem;
          font-family: inherit;
        }
        .rdp-day_button {
          font-size: 0.875rem;
        }
        .rdp-day-has-recipes:not(.rdp-selected) .rdp-day_button {
          position: relative;
        }
        .rdp-day-has-recipes:not(.rdp-selected) .rdp-day_button::after {
          content: "";
          position: absolute;
          left: 50%;
          bottom: 4px;
          width: 4px;
          height: 4px;
          border-radius: 9999px;
          background: var(--primary);
          transform: translateX(-50%);
        }
        .rdp-day-needs-review:not(.rdp-selected) .rdp-day_button::after {
          background: rgb(245 158 11);
        }
      `}</style>
    </div>
  );
}

function MealSlotCard({
  profileId,
  mealLabel,
  mealTime,
  mealId,
  date,
  recipe,
  foods,
  groups,
  units,
  forbidden,
}: {
  profileId: string;
  mealLabel: string;
  mealTime?: string;
  mealId: string;
  date: string;
  recipe: ScheduledRecipe | undefined;
  foods: Food[];
  groups: import("@/lib/types").FoodGroup[];
  units: import("@/lib/types").UnitType[];
  forbidden: import("@/lib/types").ForbiddenItem[];
}) {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ai = useAIRecipe();
  const editHref = `/recetas/calendario/${date}/${encodeURIComponent(mealId)}`;
  const foodById = useMemo(
    () => new Map(foods.map((f) => [f.id, f])),
    [foods],
  );

  /**
   * Calls the AI route, persists the result as a `source: "ai"` scheduled
   * recipe, then navigates to the editor so the user can review/refine.
   * Errors are surfaced via toast — the editor is not opened on failure.
   */
  const handleGenerateAI = async () => {
    try {
      const plan = await getPlanAt(profileId, date);
      const meal = { id: mealId, label: mealLabel, time: mealTime };
      const context = buildMealContext({
        meal,
        groups,
        foods,
        units,
        plan,
        forbidden,
        date,
      });
      if (context.groupTargets.length === 0) {
        toast.error("No hay porciones planeadas para este horario");
        return;
      }
      const result = await ai.suggest({ context, foods, groups });
      await upsertScheduledRecipe({
        profileId,
        mealId,
        date,
        items: result.items,
        title: result.title,
        preparation: result.preparation,
        notes: result.notes,
        source: "ai",
        markReviewed: true,
      });
      toast.success("Receta generada con IA", {
        description:
          result.unresolved.length > 0
            ? `${result.unresolved.length} alimento(s) sin resolver. Revísala.`
            : "Revísala antes de cocinar.",
        action: { label: "Editar", onClick: () => router.push(editHref) },
      });
    } catch (err) {
      toast.error("No se pudo generar la receta", {
        description: (err as Error).message,
      });
    }
  };

  const totals = recipe
    ? recipePortionsByGroup(
        {
          id: recipe.id,
          profileId: recipe.profileId,
          mealId: recipe.mealId,
          items: recipe.items,
          updatedAt: recipe.updatedAt,
        },
        foodById,
      )
    : new Map<string, number>();
  const totalPortions = Array.from(totals.values()).reduce(
    (s, n) => s + n,
    0,
  );

  return (
    <Card
      variant="elevated"
      tone={recipe?.needsReview ? "warning" : "default"}
      className="p-4 sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold sm:text-lg">{mealLabel}</h3>
          {mealTime && (
            <p className="text-xs text-[var(--muted-foreground)]">{mealTime}</p>
          )}
        </div>
        {recipe && (
          <Badge tone={recipe.source === "ai" ? "info" : "neutral"}>
            {recipe.source === "ai" ? "IA" : "Manual"}
          </Badge>
        )}
      </div>

      {recipe?.needsReview && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          El plan cambió desde que se creó. Revísala.
        </div>
      )}

      {recipe ? (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-[var(--muted-foreground)] tabular-nums">
            {recipe.items.length} alimento
            {recipe.items.length === 1 ? "" : "s"} ·{" "}
            {totalPortions.toFixed(1).replace(/\.0$/, "")} porc. en total
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href={editHref}>
              <Button size="sm" variant="outline">
                <Pencil className="h-4 w-4" />
                Editar
              </Button>
            </Link>
            <Button
              size="sm"
              variant="ghost"
              className="text-[var(--danger)] hover:bg-[var(--danger-soft)]"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-4 w-4" />
              Eliminar
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={editHref}>
            <Button size="sm">
              <CalendarPlus className="h-4 w-4" />
              Crear manual
            </Button>
          </Link>
          <Button
            size="sm"
            variant="outline"
            disabled={ai.loading}
            onClick={() => void handleGenerateAI()}
          >
            <Sparkles className="h-4 w-4" />
            {ai.loading ? "Generando…" : "Generar con IA"}
          </Button>
        </div>
      )}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent
          title="Eliminar receta"
          description={`¿Eliminar la receta de ${mealLabel} del ${formatHumanDate(date)}?`}
        >
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (recipe) await deleteScheduledRecipe(recipe.id);
                setConfirmDelete(false);
              }}
            >
              <Trash2 className="h-4 w-4" />
              Eliminar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ─── Date helpers ─────────────────────────────────────────────────────────

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function formatHumanDate(iso: string): string {
  const d = parseISODate(iso);
  return d.toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// ChefHat is imported above purely to keep tree-shaking honest; remove if
// unused warnings appear.
void ChefHat;
