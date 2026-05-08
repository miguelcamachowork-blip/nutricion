"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  getPlanAt,
  getRecipeForMeal,
  getScheduledRecipe,
  listFoods,
  listForbidden,
  listGroups,
  listMeals,
  listQuantities,
  listUnits,
  markScheduledRecipeReviewed,
  partitionForbidden,
  upsertRecipe,
  upsertScheduledRecipe,
} from "@/lib/db/repos";
import { useRecipeDraft } from "@/hooks/useRecipeDraft";
import { useAIRecipe, type AISuggestionResult } from "@/hooks/useAIRecipe";
import { buildMealContext } from "@/lib/ai/buildContext";
import { Badge, Button, Card, Select } from "@/components/ui/primitives";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "sonner";
import { getGroupColor } from "@/lib/ui/groupColor";
import {
  amountToPortions,
  formatPortion,
  recipePortionsByGroup,
} from "@/lib/balance";
import {
  ArrowLeft,
  AlertTriangle,
  Ban,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import type {
  Food,
  FoodGroup,
  ForbiddenItem,
  RecipeItem,
  UnitType,
} from "@/lib/types";

/**
 * Identifies what the editor is editing:
 *  - `template`: the per-meal default recipe (today / general). Saved into
 *    the `recipes` table; draft key uses `date = null`; plan source is the
 *    live plan.
 *  - `scheduled`: a recipe scheduled for a specific calendar date. Saved
 *    into `scheduledRecipes`; draft key uses that ISO date; plan source is
 *    `getPlanAt(date)` (the most-recent snapshot ≤ date, falling back to
 *    the current live plan when the date is today or future).
 */
export type RecipeEditorTarget =
  | { kind: "template"; mealId: string }
  | { kind: "scheduled"; mealId: string; date: string };

/**
 * Shared recipe editor used by both the per-meal template editor (`/dia/editar/[mealId]`)
 * and the calendarised editor (`/recetas/calendario/[date]/[mealId]`).
 *
 * Loads everything reactively from Dexie, integrates the autosave-draft
 * hook, and routes save/cancel through `target.kind`.
 */
export function RecipeEditor({
  profileId,
  target,
  onSaved,
  backHref,
}: {
  profileId: string;
  target: RecipeEditorTarget;
  /** Called after a successful save. Receiver typically navigates away. */
  onSaved: () => void;
  /** Where the back arrow links to. */
  backHref: string;
}) {
  const router = useRouter();
  const { mealId } = target;

  const mealsRaw = useLiveQuery(() => listMeals(profileId), [profileId]);
  const groups = useLiveQuery(() => listGroups(profileId), [profileId]) ?? [];
  const foods = useLiveQuery(() => listFoods(profileId), [profileId]) ?? [];
  const units = useLiveQuery(() => listUnits(profileId), [profileId]) ?? [];
  const quantities =
    useLiveQuery(() => listQuantities(profileId), [profileId]) ?? [];
  const forbidden =
    useLiveQuery(() => listForbidden(profileId), [profileId]) ?? [];

  // Plan source depends on target kind. For scheduled recipes we look up the
  // plan that was in effect on that date (so the editor reflects what the
  // nutritionist had in place), falling back to the live plan if no snapshot
  // covers the date yet (typical case for "today" or "tomorrow").
  const plan = useLiveQuery(async () => {
    if (target.kind === "template") {
      // Live plan is needed when editing the template.
      const cells = await import("@/lib/db/repos").then((m) =>
        m.listPlan(profileId),
      );
      return cells.map((c) => ({
        mealId: c.mealId,
        groupId: c.groupId,
        portions: c.portions,
      }));
    }
    return getPlanAt(profileId, target.date);
  }, [profileId, target.kind, target.kind === "scheduled" ? target.date : null]);

  // Existing record loaded once for the baseline; updates from useLiveQuery
  // also propagate so external changes are picked up.
  const existing = useLiveQuery(
    async () => {
      if (target.kind === "template") {
        return (await getRecipeForMeal(profileId, mealId)) ?? null;
      }
      return (
        (await getScheduledRecipe(profileId, mealId, target.date)) ?? null
      );
    },
    [profileId, mealId, target.kind, target.kind === "scheduled" ? target.date : null],
  );

  const loading =
    mealsRaw === undefined || existing === undefined || plan === undefined;

  const meal = mealsRaw?.find((m) => m.id === mealId);
  const fallbackMeal = useMemo(() => {
    if (meal || !mealsRaw) return undefined;
    const parts = mealId.split(":m:");
    const key = parts.length === 2 ? parts[1] : mealId;
    return (
      mealsRaw.find((m) => m.key === key) ??
      mealsRaw.find((m) => m.id.endsWith(`:m:${key}`))
    );
  }, [meal, mealsRaw, mealId]);

  useEffect(() => {
    if (!loading && !meal && fallbackMeal) {
      const newPath =
        target.kind === "template"
          ? `/dia/editar/${encodeURIComponent(fallbackMeal.id)}`
          : `/recetas/calendario/${target.date}/${encodeURIComponent(fallbackMeal.id)}`;
      router.replace(newPath);
    }
  }, [loading, meal, fallbackMeal, router, target]);

  if (loading || (!meal && fallbackMeal)) {
    return (
      <div className="p-6 text-sm text-[var(--muted-foreground)]">
        Cargando…
      </div>
    );
  }

  if (!meal) {
    const parts = mealId.split(":m:");
    const key = parts.length === 2 ? parts[1] : mealId;
    return (
      <div className="mx-auto max-w-md p-6 text-center space-y-4">
        <p className="text-sm text-[var(--muted-foreground)]">
          Este horario (<code>{key}</code>) no existe en el perfil activo.
        </p>
        <button
          onClick={() => router.push(backHref)}
          className="text-sm text-[var(--primary)] underline"
        >
          Volver
        </button>
      </div>
    );
  }

  return (
    <EditorBody
      profileId={profileId}
      target={target}
      mealLabel={meal.label}
      mealTime={meal.time}
      groups={groups}
      foods={foods}
      units={units}
      quantities={quantities}
      plan={plan!}
      forbidden={forbidden}
      initialItems={existing ? existing.items : []}
      initialNeedsReview={
        target.kind === "scheduled" && existing
          ? Boolean(
              (existing as { needsReview?: boolean }).needsReview,
            )
          : false
      }
      existingId={existing && "id" in existing ? existing.id : undefined}
      onSaved={onSaved}
      backHref={backHref}
    />
  );
}

function EditorBody({
  profileId,
  target,
  mealLabel,
  mealTime,
  groups,
  foods,
  units,
  quantities,
  plan,
  forbidden,
  initialItems,
  initialNeedsReview,
  existingId,
  onSaved,
  backHref,
}: {
  profileId: string;
  target: RecipeEditorTarget;
  mealLabel: string;
  mealTime?: string;
  groups: FoodGroup[];
  foods: Food[];
  units: UnitType[];
  quantities: { id: string; value: number }[];
  plan: { mealId: string; groupId: string; portions: number }[];
  forbidden: ForbiddenItem[];
  initialItems: RecipeItem[];
  initialNeedsReview: boolean;
  existingId: string | undefined;
  onSaved: () => void;
  backHref: string;
}) {
  const { mealId } = target;
  const draftDate = target.kind === "scheduled" ? target.date : null;

  const {
    items,
    setItems,
    ready: draftReady,
    loadedFromDraft,
    draftUpdatedAt,
    discardDraft,
    clearAfterSave,
  } = useRecipeDraft({
    profileId,
    mealId,
    date: draftDate,
    baselineItems: initialItems,
  });
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);

  const foodById = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);
  const { groupIds: forbiddenGroupIds, foodIds: forbiddenFoodIds } = useMemo(
    () => partitionForbidden(forbidden),
    [forbidden],
  );
  const planByGroup = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of plan) {
      if (c.mealId === mealId) m.set(c.groupId, c.portions);
    }
    return m;
  }, [plan, mealId]);

  const aported = useMemo(() => {
    return recipePortionsByGroup(
      { id: "draft", profileId, mealId, items, updatedAt: 0 },
      foodById,
    );
  }, [items, foodById, profileId, mealId]);

  const visibleGroups = groups.filter(
    (g) =>
      !forbiddenGroupIds.has(g.id) &&
      ((planByGroup.get(g.id) ?? 0) > 0 ||
        hasItemInGroup(items, g.id, foodById)),
  );

  const incompleteGroups = useMemo(
    () =>
      visibleGroups
        .map((g) => ({
          group: g,
          planned: planByGroup.get(g.id) ?? 0,
          aported: aported.get(g.id) ?? 0,
        }))
        .filter((x) => x.planned > 0 && x.aported < x.planned - 0.01),
    [visibleGroups, planByGroup, aported],
  );

  const doSave = async () => {
    if (target.kind === "template") {
      await upsertRecipe(profileId, mealId, items);
    } else {
      await upsertScheduledRecipe({
        profileId,
        mealId,
        date: target.date,
        items,
        source: "manual",
        markReviewed: true,
      });
    }
    await clearAfterSave();
    onSaved();
  };

  const handleSaveClick = () => {
    if (incompleteGroups.length > 0) {
      setSaveConfirmOpen(true);
    } else {
      void doSave();
    }
  };

  const handleMarkReviewed = async () => {
    if (existingId) await markScheduledRecipeReviewed(existingId);
  };

  // ─── AI suggestion ────────────────────────────────────────────────────
  const ai = useAIRecipe();
  const [aiPreview, setAiPreview] = useState<AISuggestionResult | null>(null);
  const handleSuggestAI = async () => {
    try {
      const context = buildMealContext({
        meal: { id: mealId, label: mealLabel, time: mealTime },
        groups,
        foods,
        units,
        plan,
        forbidden,
        date: target.kind === "scheduled" ? target.date : undefined,
      });
      if (context.groupTargets.length === 0) {
        toast.error("No hay porciones planeadas para este horario");
        return;
      }
      const result = await ai.suggest({ context, foods, groups });
      setAiPreview(result);
    } catch (err) {
      toast.error("No se pudo generar la receta", {
        description: (err as Error).message,
      });
    }
  };
  const applyAIPreview = () => {
    if (!aiPreview) return;
    setItems(aiPreview.items);
    setAiPreview(null);
    toast.success("Sugerencia aplicada", {
      description: "Se guardó como borrador. Revísala antes de guardar.",
    });
  };

  const headerSubtitle =
    target.kind === "scheduled"
      ? `Programada · ${formatHumanDate(target.date)}${mealTime ? ` · ${mealTime}` : ""}`
      : `Editor de receta${mealTime ? ` · ${mealTime}` : ""}`;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-5 sm:px-6 sm:py-6">
      <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2 backdrop-blur-md bg-[var(--background)]/80 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <Link href={backHref}>
            <Button size="icon" variant="ghost" aria-label="Volver">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="truncate text-lg sm:text-xl font-semibold tracking-tight">
              {mealLabel}
            </h1>
            <p className="text-xs text-[var(--muted-foreground)]">
              {headerSubtitle}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => void handleSuggestAI()}
            disabled={ai.loading}
            title="Sugerir receta con IA"
          >
            <Sparkles className="h-4 w-4" />
            <span className="hidden sm:inline">
              {ai.loading ? "Pensando…" : "Sugerir con IA"}
            </span>
          </Button>
          <Button onClick={handleSaveClick}>Guardar</Button>
        </div>
      </div>

      {initialNeedsReview && (
        <Card
          variant="flat"
          tone="warning"
          className="flex items-start gap-3 px-4 py-3 text-sm"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warning)]" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              El plan cambió desde que se creó esta receta.
            </p>
            <p className="text-xs text-[var(--muted-foreground)]">
              Revisa que las porciones por grupo sigan siendo correctas.
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void handleMarkReviewed()}
          >
            Marcar revisada
          </Button>
        </Card>
      )}

      {loadedFromDraft && draftReady && (
        <Card
          variant="flat"
          tone="warning"
          className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs sm:text-sm"
        >
          <span className="text-[var(--foreground-soft)]">
            Borrador sin guardar
            {draftUpdatedAt
              ? ` · última edición ${formatDraftTime(draftUpdatedAt)}`
              : ""}
            .
          </span>
          <Button size="sm" variant="ghost" onClick={() => void discardDraft()}>
            Descartar
          </Button>
        </Card>
      )}

      {visibleGroups.length === 0 && (
        <Card className="p-4 text-sm text-[var(--muted-foreground)]">
          No hay porciones planeadas para este horario. Ve a{" "}
          <Link
            href="/plan"
            className="text-[var(--primary)] underline underline-offset-2"
          >
            Plan
          </Link>{" "}
          para añadir porciones por grupo.
        </Card>
      )}

      <div className="space-y-4">
        {visibleGroups.map((g) => (
          <GroupEditor
            key={g.id}
            group={g}
            planned={planByGroup.get(g.id) ?? 0}
            aported={aported.get(g.id) ?? 0}
            foods={foods.filter((f) => f.groupId === g.id)}
            forbiddenFoodIds={forbiddenFoodIds}
            units={units}
            quantities={quantities}
            items={items.filter(
              (it) => foodById.get(it.foodId)?.groupId === g.id,
            )}
            onAdd={(item) => setItems((cur) => [...cur, item])}
            onRemove={(idx) => {
              const all = items;
              const itemsInGroup = all
                .map((it, i) => ({ it, i }))
                .filter(
                  ({ it }) => foodById.get(it.foodId)?.groupId === g.id,
                );
              const target = itemsInGroup[idx];
              if (!target) return;
              setItems(all.filter((_, i) => i !== target.i));
            }}
          />
        ))}
      </div>

      <Dialog open={saveConfirmOpen} onOpenChange={setSaveConfirmOpen}>
        <DialogContent
          title="Porciones incompletas"
          description="Los siguientes grupos no alcanzan la porción planeada:"
        >
          <ul className="space-y-1 text-sm">
            {incompleteGroups.map(({ group, planned, aported }) => (
              <li
                key={group.id}
                className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--card-2)] px-3 py-2"
              >
                <span className="font-medium">{group.label}</span>
                <span className="tabular-nums text-[var(--muted-foreground)]">
                  {formatPortion(aported)} / {formatPortion(planned)} porc.
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setSaveConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                setSaveConfirmOpen(false);
                await doSave();
              }}
            >
              Guardar de todos modos
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AISuggestionDialog
        preview={aiPreview}
        onClose={() => setAiPreview(null)}
        onApply={applyAIPreview}
        foods={foods}
        units={units}
        groups={groups}
        plan={plan}
        mealId={mealId}
      />
    </div>
  );
}

function AISuggestionDialog({
  preview,
  onClose,
  onApply,
  foods,
  units,
  groups,
  plan,
  mealId,
}: {
  preview: AISuggestionResult | null;
  onClose: () => void;
  onApply: () => void;
  foods: Food[];
  units: UnitType[];
  groups: FoodGroup[];
  plan: { mealId: string; groupId: string; portions: number }[];
  mealId: string;
}) {
  const open = preview !== null;
  const foodById = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);
  const unitById = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const groupById = useMemo(
    () => new Map(groups.map((g) => [g.id, g])),
    [groups],
  );
  const planByGroup = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of plan) {
      if (c.mealId === mealId) m.set(c.groupId, c.portions);
    }
    return m;
  }, [plan, mealId]);

  const totalsByGroup = useMemo(() => {
    if (!preview) return new Map<string, number>();
    const m = new Map<string, number>();
    for (const it of preview.items) {
      const f = foodById.get(it.foodId);
      if (!f) continue;
      m.set(f.groupId, (m.get(f.groupId) ?? 0) + amountToPortions(it.amount, f));
    }
    return m;
  }, [preview, foodById]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={preview?.title ?? "Sugerencia de IA"}
        description={
          preview
            ? `Generado con ${preview.provider === "gemini" ? "Gemini" : "Groq"}. Revisa antes de aplicar.`
            : undefined
        }
      >
        {preview && (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {preview.unresolved.length > 0 && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                <p className="font-medium text-amber-700 dark:text-amber-400">
                  Algunos alimentos no se pudieron resolver:
                </p>
                <ul className="mt-1 list-disc pl-4 space-y-0.5">
                  {preview.unresolved.map((u, i) => (
                    <li key={i}>
                      {u.foodName} ({u.groupName}) — {u.reason === "unknown-food" ? "no existe en tu catálogo" : "está en otro grupo"}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-2">
              {Array.from(totalsByGroup.entries()).map(([gid, total]) => {
                const g = groupById.get(gid);
                const planned = planByGroup.get(gid) ?? 0;
                if (!g) return null;
                return (
                  <div
                    key={gid}
                    className="flex items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--card-2)] px-3 py-2 text-sm"
                  >
                    <span className="font-medium">{g.label}</span>
                    <span className="tabular-nums text-[var(--muted-foreground)]">
                      {formatPortion(total)} / {formatPortion(planned)} porc.
                    </span>
                  </div>
                );
              })}
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)] mb-1">
                Alimentos
              </p>
              <ul className="space-y-1 text-sm">
                {preview.items.map((it, i) => {
                  const f = foodById.get(it.foodId);
                  const u = f && unitById.get(f.unitId);
                  return (
                    <li
                      key={i}
                      className="flex items-center justify-between gap-2 rounded border border-[var(--border)] px-2.5 py-1.5"
                    >
                      <span>{f?.name ?? "—"}</span>
                      <span className="tabular-nums text-[var(--muted-foreground)]">
                        {formatPortion(it.amount)} {u?.label ?? ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

            {preview.preparation && preview.preparation.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)] mb-1">
                  Preparación
                </p>
                <ol className="list-decimal pl-5 space-y-1 text-sm">
                  {preview.preparation.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </div>
            )}

            {preview.notes && (
              <p className="text-xs italic text-[var(--muted-foreground)]">
                {preview.notes}
              </p>
            )}
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={onApply} disabled={!preview || preview.items.length === 0}>
            Aplicar como borrador
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function hasItemInGroup(
  items: RecipeItem[],
  groupId: string,
  foodById: Map<string, Food>,
): boolean {
  return items.some((it) => foodById.get(it.foodId)?.groupId === groupId);
}

function GroupEditor({
  group,
  planned,
  aported,
  foods,
  forbiddenFoodIds,
  units,
  quantities,
  items,
  onAdd,
  onRemove,
}: {
  group: FoodGroup;
  planned: number;
  aported: number;
  foods: Food[];
  forbiddenFoodIds: Set<string>;
  units: UnitType[];
  quantities: { id: string; value: number }[];
  items: RecipeItem[];
  onAdd: (item: RecipeItem) => void;
  onRemove: (indexInGroup: number) => void;
}) {
  const [foodId, setFoodId] = useState<string>("");
  const [amountStr, setAmountStr] = useState<string>("");
  const [pendingAdd, setPendingAdd] = useState<{
    item: RecipeItem;
    addPortions: number;
    nextAported: number;
    foodName: string;
  } | null>(null);

  const selectableFoods = foods.filter((f) => !forbiddenFoodIds.has(f.id));
  const selectedFoodId = foodId || selectableFoods[0]?.id || "";
  const food = foods.find((f) => f.id === selectedFoodId);
  const unit = food && units.find((u) => u.id === food.unitId);
  const tone =
    Math.abs(planned - aported) < 0.01
      ? "ok"
      : aported < planned
        ? "warn"
        : "danger";

  const color = getGroupColor(group.id);
  const pct = planned
    ? Math.min(100, (aported / planned) * 100)
    : aported > 0
      ? 100
      : 0;

  const tryAdd = () => {
    const amount = Number(amountStr);
    if (!selectedFoodId || !food || !Number.isFinite(amount) || amount <= 0)
      return;
    const addPortions = amountToPortions(amount, food);
    const nextAported = aported + addPortions;
    const item: RecipeItem = { foodId: selectedFoodId, amount };
    if (planned > 0 && nextAported > planned + 0.01) {
      setPendingAdd({ item, addPortions, nextAported, foodName: food.name });
      return;
    }
    onAdd(item);
    setAmountStr("");
  };

  const confirmAdd = () => {
    if (!pendingAdd) return;
    onAdd(pendingAdd.item);
    setPendingAdd(null);
    setAmountStr("");
  };

  return (
    <Card
      variant="elevated"
      className="overflow-hidden border-l-4"
      style={{ borderLeftColor: color }}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2 min-w-0">
          <span
            aria-hidden
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
          />
          <h3 className="truncate text-base font-semibold sm:text-lg">
            {group.label}
          </h3>
        </div>
        <Badge tone={tone} className="tabular-nums">
          {formatPortion(aported)} / {formatPortion(planned)}
        </Badge>
      </div>
      <div className="mx-4 sm:mx-5 mb-3 h-1.5 overflow-hidden rounded-full bg-[var(--muted)]">
        <div
          className="h-full transition-all duration-300"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>

      {items.length > 0 && (
        <ul className="px-4 sm:px-5 space-y-1.5">
          {items.map((it, i) => {
            const f = foods.find((x) => x.id === it.foodId);
            const u = f && units.find((x) => x.id === f.unitId);
            const p = f ? amountToPortions(it.amount, f) : 0;
            const isForbidden = forbiddenFoodIds.has(it.foodId);
            return (
              <li
                key={i}
                className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--card-2)] px-3 py-2 text-sm"
              >
                <div className="min-w-0 flex items-center gap-2">
                  {isForbidden && (
                    <span
                      title="Este alimento ahora está vetado. Elimínalo de la receta."
                      className="inline-flex items-center gap-1 rounded-full bg-[var(--danger-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--danger-soft-fg)]"
                    >
                      <Ban className="h-3 w-3" />
                      Prohibido
                    </span>
                  )}
                  <span className="font-medium">{f?.name ?? "—"}</span>
                  <span className="text-[var(--muted-foreground)]">
                    {" · "}
                    {formatPortion(it.amount)} {u?.label ?? ""}
                    {" · "}
                    {formatPortion(p)} porciones
                  </span>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Quitar"
                  className="text-[var(--danger)] hover:bg-[var(--danger-soft)]"
                  onClick={() => onRemove(i)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {selectableFoods.length === 0 ? (
        <div className="px-4 sm:px-5 py-3 text-sm text-[var(--muted-foreground)]">
          {foods.length === 0 ? (
            <>
              No hay alimentos en este grupo.{" "}
              <Link
                href="/alimentos"
                className="text-[var(--primary)] underline underline-offset-2"
              >
                Añade uno
              </Link>
              .
            </>
          ) : (
            <>
              Todos los alimentos de este grupo están vetados. Revisa la
              sección{" "}
              <Link
                href="/prohibidos"
                className="text-[var(--primary)] underline underline-offset-2"
              >
                Prohibidos
              </Link>
              .
            </>
          )}
        </div>
      ) : (
        <div className="mt-3 px-4 sm:px-5 pb-4">
          {/* Desktop: tabla con columnas alineadas */}
          <table className="hidden sm:table w-full table-fixed border-separate border-spacing-x-2 border-spacing-y-0">
            <colgroup>
              <col style={{ width: "26%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "20%" }} />
            </colgroup>
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
                <th className="px-3 pb-1 font-medium">Alimento</th>
                <th className="px-3 pb-1 font-medium">Porción</th>
                <th className="px-3 pb-1 font-medium">Estado</th>
                <th className="px-3 pb-1 font-medium">Cantidad</th>
                <th className="px-3 pb-1 font-medium">Unidad</th>
                <th className="pb-1 sr-only">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <Select
                    value={selectedFoodId}
                    onChange={(e) => setFoodId(e.target.value)}
                  >
                    {selectableFoods.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </Select>
                </td>
                <td>
                  <div className="h-10 flex items-center rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)]/40 px-3 text-sm tabular-nums text-[var(--muted-foreground)]">
                    {food
                      ? `${formatPortion(food.quantity)} ${unit?.label ?? ""}`
                      : "—"}
                  </div>
                </td>
                <td>
                  <RemainingPortionsBadge
                    planned={planned}
                    aported={aported}
                  />
                </td>
                <td>
                  <Select
                    value={amountStr}
                    onChange={(e) => setAmountStr(e.target.value)}
                  >
                    <option value="">Cantidad…</option>
                    {quantities.map((q) => (
                      <option key={q.id} value={String(q.value)}>
                        {formatPortion(q.value)}
                      </option>
                    ))}
                  </Select>
                </td>
                <td>
                  <div className="h-10 flex items-center rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)]/40 px-3 text-sm text-[var(--muted-foreground)]">
                    {unit?.label ?? "—"}
                  </div>
                </td>
                <td>
                  <Button
                    disabled={!selectedFoodId || !amountStr}
                    onClick={tryAdd}
                  >
                    <Plus className="h-4 w-4" />
                    Añadir
                  </Button>
                </td>
              </tr>
            </tbody>
          </table>

          {/* Móvil: apilado */}
          <div className="sm:hidden grid grid-cols-2 gap-2">
            <label className="col-span-2 text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
              Alimento
              <Select
                className="mt-1"
                value={selectedFoodId}
                onChange={(e) => setFoodId(e.target.value)}
              >
                {selectableFoods.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
              Porción
              <div className="mt-1 h-10 flex items-center rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)]/40 px-3 text-sm normal-case tabular-nums text-[var(--muted-foreground)]">
                {food
                  ? `${formatPortion(food.quantity)} ${unit?.label ?? ""}`
                  : "—"}
              </div>
            </label>
            <label className="text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
              Estado
              <RemainingPortionsBadge
                className="mt-1"
                planned={planned}
                aported={aported}
              />
            </label>
            <label className="text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
              Cantidad
              <Select
                className="mt-1"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
              >
                <option value="">Cantidad…</option>
                {quantities.map((q) => (
                  <option key={q.id} value={String(q.value)}>
                    {formatPortion(q.value)}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
              Unidad
              <div className="mt-1 h-10 flex items-center rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)]/40 px-3 text-sm normal-case text-[var(--muted-foreground)]">
                {unit?.label ?? "—"}
              </div>
            </label>
            <Button
              className="col-span-2"
              disabled={!selectedFoodId || !amountStr}
              onClick={tryAdd}
            >
              <Plus className="h-4 w-4" />
              Añadir
            </Button>
          </div>
        </div>
      )}

      <Dialog
        open={pendingAdd !== null}
        onOpenChange={(open) => {
          if (!open) setPendingAdd(null);
        }}
      >
        <DialogContent
          title="Excede la porción recomendada"
          description={
            pendingAdd
              ? `Vas a añadir ${formatPortion(pendingAdd.addPortions)} porc. de ${pendingAdd.foodName}. El total quedaría en ${formatPortion(pendingAdd.nextAported)} de ${formatPortion(planned)} planeadas para ${group.label}.`
              : undefined
          }
        >
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPendingAdd(null)}>
              Cancelar
            </Button>
            <Button onClick={confirmAdd}>Añadir de todos modos</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatDraftTime(ts: number): string {
  const sec = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (sec < 60) return `hace ${sec} s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `hace ${min} min`;
  const hr = Math.round(min / 60);
  return `hace ${hr} h`;
}

function formatHumanDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function RemainingPortionsBadge({
  planned,
  aported,
  className,
}: {
  planned: number;
  aported: number;
  className?: string;
}) {
  const base =
    "h-10 flex items-center rounded-[var(--radius)] border px-3 text-sm tabular-nums";
  if (planned <= 0) {
    return (
      <div
        className={[
          base,
          "border-[var(--border)] bg-[var(--muted)]/40 text-[var(--muted-foreground)]",
          className ?? "",
        ].join(" ")}
      >
        Sin meta
      </div>
    );
  }
  const remaining = planned - aported;
  if (Math.abs(remaining) < 0.01) {
    return (
      <div
        className={[
          base,
          "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
          className ?? "",
        ].join(" ")}
      >
        Completo ✓
      </div>
    );
  }
  if (remaining > 0) {
    return (
      <div
        className={[
          base,
          "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
          className ?? "",
        ].join(" ")}
      >
        Falta agregar {formatPortion(remaining)} porc.
      </div>
    );
  }
  return (
    <div
      className={[
        base,
        "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400",
        className ?? "",
      ].join(" ")}
    >
      Excede en {formatPortion(-remaining)} porc.
    </div>
  );
}
