"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  getRecipeForMeal,
  listFoods,
  listForbidden,
  listGroups,
  listMeals,
  listPlan,
  listQuantities,
  listUnits,
  partitionForbidden,
  upsertRecipe,
} from "@/lib/db/repos";
import { useActiveProfileStore } from "@/hooks/useActiveProfile";
import { Badge, Button, Card, Select } from "@/components/ui/primitives";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { getGroupColor } from "@/lib/ui/groupColor";
import {
  amountToPortions,
  formatPortion,
  recipePortionsByGroup,
} from "@/lib/balance";
import { ArrowLeft, Ban, Plus, Trash2 } from "lucide-react";
import type { Food, FoodGroup, ForbiddenItem, RecipeItem, UnitType } from "@/lib/types";

export default function EditarRecetaPage({
  params,
}: {
  params: Promise<{ mealId: string }>;
}) {
  const { mealId: rawMealId } = use(params);
  const mealId = useMemo(() => {
    try {
      return decodeURIComponent(rawMealId);
    } catch {
      return rawMealId;
    }
  }, [rawMealId]);
  const router = useRouter();
  const profileId = useActiveProfileStore((s) => s.activeProfileId)!;
  const mealsRaw = useLiveQuery(() => listMeals(profileId), [profileId]);
  const groups = useLiveQuery(() => listGroups(profileId), [profileId]) ?? [];
  const foods = useLiveQuery(() => listFoods(profileId), [profileId]) ?? [];
  const units = useLiveQuery(() => listUnits(profileId), [profileId]) ?? [];
  const quantities =
    useLiveQuery(() => listQuantities(profileId), [profileId]) ?? [];
  const plan = useLiveQuery(() => listPlan(profileId), [profileId]) ?? [];
  const forbidden =
    useLiveQuery(() => listForbidden(profileId), [profileId]) ?? [];
  const existing = useLiveQuery(
    async () => (await getRecipeForMeal(profileId, mealId)) ?? null,
    [profileId, mealId],
  );

  const loading = mealsRaw === undefined || existing === undefined;
  const meal = mealsRaw?.find((m) => m.id === mealId);

  // Si el mealId viene con un profileId distinto (URL antigua o cambio de perfil),
  // intenta encontrar el mismo "key" (ej. DESAYUNO) en el perfil activo.
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
      router.replace(`/dia/editar/${encodeURIComponent(fallbackMeal.id)}`);
    }
  }, [loading, meal, fallbackMeal, router]);

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
        {mealsRaw && mealsRaw.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-[var(--muted-foreground)]">
              Elige un horario disponible:
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {mealsRaw.map((m) => (
                <button
                  key={m.id}
                  onClick={() =>
                    router.replace(
                      `/dia/editar/${encodeURIComponent(m.id)}`,
                    )
                  }
                  className="rounded-full border border-[var(--border)] px-3 py-1 text-xs hover:bg-[var(--muted)]"
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-[var(--muted-foreground)]">
            El perfil activo no tiene horarios. Crea o restaura uno desde
            Ajustes.
          </p>
        )}
        <button
          onClick={() => router.push("/dia")}
          className="text-sm text-[var(--primary)] underline"
        >
          Volver al plan del día
        </button>
      </div>
    );
  }

  return (
    <EditorBody
      profileId={profileId}
      mealId={mealId}
      mealLabel={meal.label}
      groups={groups}
      foods={foods}
      units={units}
      quantities={quantities}
      plan={plan}
      forbidden={forbidden}
      initialItems={existing ? existing.items : []}
      onSaved={() => router.push("/dia")}
    />
  );
}

function EditorBody({
  profileId,
  mealId,
  mealLabel,
  groups,
  foods,
  units,
  quantities,
  plan,
  forbidden,
  initialItems,
  onSaved,
}: {
  profileId: string;
  mealId: string;
  mealLabel: string;
  groups: FoodGroup[];
  foods: Food[];
  units: UnitType[];
  quantities: { id: string; value: number }[];
  plan: { mealId: string; groupId: string; portions: number }[];
  forbidden: ForbiddenItem[];
  initialItems: RecipeItem[];
  onSaved: () => void;
}) {
  const [items, setItems] = useState<RecipeItem[]>(() => [...initialItems]);
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
      ((planByGroup.get(g.id) ?? 0) > 0 || hasItemInGroup(items, g.id, foodById)),
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
    await upsertRecipe(profileId, mealId, items);
    onSaved();
  };

  const handleSaveClick = () => {
    if (incompleteGroups.length > 0) {
      setSaveConfirmOpen(true);
    } else {
      void doSave();
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-5 sm:px-6 sm:py-6">
      <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2 backdrop-blur-md bg-[var(--background)]/80 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <Link href="/dia">
            <Button size="icon" variant="ghost" aria-label="Volver">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="truncate text-lg sm:text-xl font-semibold tracking-tight">
              {mealLabel}
            </h1>
            <p className="text-xs text-[var(--muted-foreground)]">
              Editor de receta
            </p>
          </div>
          <Button
            onClick={handleSaveClick}
          >
            Guardar
          </Button>
        </div>
      </div>

      {visibleGroups.length === 0 && (
        <Card className="p-4 text-sm text-[var(--muted-foreground)]">
          No hay porciones planeadas para este horario. Ve a{" "}
          <Link href="/plan" className="text-[var(--primary)] underline underline-offset-2">
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
            items={items.filter((it) => foodById.get(it.foodId)?.groupId === g.id)}
            onAdd={(item) => setItems((cur) => [...cur, item])}
            onRemove={(idx) => {
              const all = items;
              const itemsInGroup = all
                .map((it, i) => ({ it, i }))
                .filter(({ it }) => foodById.get(it.foodId)?.groupId === g.id);
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
            <Button
              variant="ghost"
              onClick={() => setSaveConfirmOpen(false)}
            >
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
    </div>
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
    <Card variant="elevated" className="overflow-hidden border-l-4" style={{ borderLeftColor: color }}>
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
              <Link href="/alimentos" className="text-[var(--primary)] underline underline-offset-2">
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
                <th className="px-3 pb-1 font-medium">Máx. recom.</th>
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
                  <div className="h-10 flex items-center rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)]/40 px-3 text-sm tabular-nums text-[var(--muted-foreground)]">
                    {formatPortion(planned)} porc.
                  </div>
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
              Máx. recom.
              <div className="mt-1 h-10 flex items-center rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)]/40 px-3 text-sm normal-case tabular-nums text-[var(--muted-foreground)]">
                {formatPortion(planned)} porc.
              </div>
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
