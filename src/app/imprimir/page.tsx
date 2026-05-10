"use client";

/**
 * Standalone, paper-friendly view used by the Print dialog. Lives outside
 * the (app) route group so it inherits only the root layout — no AppShell,
 * no nav, no badges. Reads selection from the query string and triggers
 * `window.print()` once the data has hydrated.
 */

import { Suspense, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  listFoods,
  listGroups,
  listMeals,
  listPlan,
  listProfiles,
  listRecipes,
  listScheduledRecipes,
  listUnits,
} from "@/lib/db/repos";
import {
  amountToPortions,
  formatPortion,
} from "@/lib/balance";
import { compareNames } from "@/lib/utils";
import type {
  Food,
  FoodGroup,
  Meal,
  PlanCell,
  Profile,
  Recipe,
  ScheduledRecipe,
  UnitType,
} from "@/lib/types";

const SECTION_KEYS = ["plan", "recetas", "dia", "alimentos"] as const;
type Section = (typeof SECTION_KEYS)[number];

function isSection(v: string): v is Section {
  return (SECTION_KEYS as readonly string[]).includes(v);
}

function formatDateLong(iso: string): string {
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("es-MX", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function ImprimirPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm">Cargando…</div>}>
      <PrintShell />
    </Suspense>
  );
}

function PrintShell() {
  const router = useRouter();
  const params = useSearchParams();
  const profileId = params.get("pid") ?? "";
  const sectionsParam = params.get("sections") ?? "";
  const sections = useMemo(
    () =>
      sectionsParam
        .split(",")
        .map((s) => s.trim())
        .filter(isSection),
    [sectionsParam],
  );
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const day = params.get("day") ?? "";

  const profiles = useLiveQuery(() => listProfiles(), []);
  const profile = profiles?.find((p) => p.id === profileId);

  const groups = useLiveQuery(() => listGroups(), []);
  const foods = useLiveQuery(() => listFoods(), []);
  const units = useLiveQuery(() => listUnits(), []);
  const meals = useLiveQuery(
    () => (profileId ? listMeals(profileId) : Promise.resolve([])),
    [profileId],
  );
  const plan = useLiveQuery(
    () => (profileId ? listPlan(profileId) : Promise.resolve([])),
    [profileId],
  );
  const recipes = useLiveQuery(
    () => (profileId ? listRecipes(profileId) : Promise.resolve([])),
    [profileId],
  );
  const scheduled = useLiveQuery(
    () =>
      profileId && (sections.includes("recetas") || sections.includes("dia"))
        ? listScheduledRecipes(
            profileId,
            sections.includes("recetas") ? from || day : day,
            sections.includes("recetas") ? to || day : day,
          )
        : Promise.resolve([]),
    [profileId, sections.join(","), from, to, day],
  );

  const ready =
    !!profile &&
    !!groups &&
    !!foods &&
    !!units &&
    !!meals &&
    !!plan &&
    !!recipes &&
    !!scheduled;

  // Trigger the native print dialog once everything is on screen.
  useEffect(() => {
    if (!ready) return;
    const t = window.setTimeout(() => {
      window.print();
    }, 300);
    return () => window.clearTimeout(t);
  }, [ready]);

  if (!profileId || sections.length === 0) {
    return (
      <main className="mx-auto max-w-2xl p-6 text-sm">
        <p>Faltan parámetros para la impresión.</p>
        <button
          type="button"
          onClick={() => router.back()}
          className="mt-4 text-[var(--primary)] underline"
        >
          Volver
        </button>
      </main>
    );
  }

  if (!ready) {
    return (
      <main className="mx-auto max-w-2xl p-6 text-sm">Cargando datos…</main>
    );
  }

  return (
    <main className="print-doc mx-auto max-w-[210mm] bg-white px-6 py-6 text-[12px] leading-snug text-black">
      <PrintToolbar />
      <header className="mb-4 border-b border-black/40 pb-3">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-xl font-bold">Nutrición MCZ</h1>
          <div className="text-xs">
            Generado: {new Date().toLocaleString("es-MX")}
          </div>
        </div>
        <p className="mt-1 text-sm">
          Perfil: <b>{profile.name}</b>
        </p>
      </header>

      {sections.includes("plan") && (
        <PlanSection
          meals={meals!}
          groups={groups!}
          plan={plan!}
        />
      )}

      {sections.includes("dia") && day && (
        <DiaSection
          date={day}
          meals={meals!}
          groups={groups!}
          foods={foods!}
          units={units!}
          plan={plan!}
          recipes={recipes!}
          scheduled={scheduled!}
        />
      )}

      {sections.includes("recetas") && (
        <RecetasSection
          from={from}
          to={to}
          meals={meals!}
          groups={groups!}
          foods={foods!}
          units={units!}
          scheduled={scheduled!.filter(
            (r) => (!from || r.date >= from) && (!to || r.date <= to),
          )}
        />
      )}

      {sections.includes("alimentos") && (
        <AlimentosSection
          groups={groups!}
          foods={foods!}
          units={units!}
        />
      )}
    </main>
  );
}

// ─── Toolbar (only visible on screen) ────────────────────────────────────

function PrintToolbar() {
  return (
    <div className="no-print mb-4 flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700"
      >
        Imprimir ahora
      </button>
      <button
        type="button"
        onClick={() => window.history.back()}
        className="rounded-md border border-black/20 px-3 py-2 text-xs font-medium hover:bg-black/5"
      >
        Volver
      </button>
    </div>
  );
}

// ─── Plan matrix ─────────────────────────────────────────────────────────

function PlanSection({
  meals,
  groups,
  plan,
}: {
  meals: Meal[];
  groups: FoodGroup[];
  plan: PlanCell[];
}) {
  const cell = new Map(
    plan.map((c) => [`${c.mealId}::${c.groupId}`, c.portions]),
  );
  const sortedGroups = [...groups].sort((a, b) => a.order - b.order);
  const sortedMeals = [...meals].sort((a, b) => a.order - b.order);
  return (
    <section className="print-section">
      <h2 className="mb-2 text-base font-bold">Plan (porciones por comida)</h2>
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr>
            <th className="border border-black/40 bg-black/5 px-2 py-1 text-left">
              Grupo
            </th>
            {sortedMeals.map((m) => (
              <th
                key={m.id}
                className="border border-black/40 bg-black/5 px-2 py-1 text-center"
              >
                {m.label}
                {m.time && (
                  <div className="text-[10px] font-normal opacity-70">
                    {m.time}
                  </div>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedGroups.map((g) => (
            <tr key={g.id}>
              <td className="border border-black/40 px-2 py-1">{g.label}</td>
              {sortedMeals.map((m) => {
                const v = cell.get(`${m.id}::${g.id}`) ?? 0;
                return (
                  <td
                    key={m.id}
                    className="border border-black/40 px-2 py-1 text-center tabular-nums"
                  >
                    {v ? formatPortion(v) : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ─── Plan del día ────────────────────────────────────────────────────────

function DiaSection({
  date,
  meals,
  groups,
  foods,
  units,
  plan,
  recipes,
  scheduled,
}: {
  date: string;
  meals: Meal[];
  groups: FoodGroup[];
  foods: Food[];
  units: UnitType[];
  plan: PlanCell[];
  recipes: Recipe[];
  scheduled: ScheduledRecipe[];
}) {
  const foodById = new Map(foods.map((f) => [f.id, f]));
  const unitById = new Map(units.map((u) => [u.id, u]));
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const planByCell = new Map(
    plan.map((c) => [`${c.mealId}::${c.groupId}`, c.portions]),
  );
  const tplByMeal = new Map(recipes.map((r) => [r.mealId, r]));
  const schedByMeal = new Map(
    scheduled.filter((s) => s.date === date).map((s) => [s.mealId, s]),
  );
  const sortedMeals = [...meals].sort((a, b) => a.order - b.order);
  return (
    <section className="print-section">
      <h2 className="mb-2 text-base font-bold">Plan del día</h2>
      <p className="mb-3 text-xs">
        Fecha: <b>{formatDateLong(date)}</b>
      </p>
      <div className="space-y-3">
        {sortedMeals.map((m) => {
          const r = schedByMeal.get(m.id) ?? tplByMeal.get(m.id);
          const source = schedByMeal.get(m.id) ? "calendario" : "plantilla";
          return (
            <div
              key={m.id}
              className="break-inside-avoid border border-black/40 p-2"
            >
              <div className="mb-1 flex items-baseline justify-between">
                <h3 className="text-sm font-semibold">
                  {m.label}
                  {m.time && (
                    <span className="ml-2 text-[11px] font-normal opacity-70">
                      {m.time}
                    </span>
                  )}
                </h3>
                {r && (
                  <span className="text-[10px] uppercase opacity-70">
                    {source}
                  </span>
                )}
              </div>
              {r?.title && (
                <p className="mb-1 text-xs italic">{r.title}</p>
              )}
              {!r ? (
                <p className="text-xs opacity-70">Sin receta para esta comida.</p>
              ) : (
                <RecipeItemsTable
                  items={r.items}
                  foodById={foodById}
                  unitById={unitById}
                  groupById={groupById}
                />
              )}
              {r && "preparation" in r && r.preparation && r.preparation.length > 0 && (
                <ol className="ml-5 mt-2 list-decimal space-y-0.5 text-[11px]">
                  {r.preparation.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3">
        <h3 className="mb-1 text-xs font-semibold uppercase">
          Porciones recomendadas del día
        </h3>
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr>
              <th className="border border-black/40 bg-black/5 px-2 py-1 text-left">
                Grupo
              </th>
              {sortedMeals.map((m) => (
                <th
                  key={m.id}
                  className="border border-black/40 bg-black/5 px-2 py-1 text-center"
                >
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...groups]
              .sort((a, b) => a.order - b.order)
              .map((g) => (
                <tr key={g.id}>
                  <td className="border border-black/40 px-2 py-1">
                    {g.label}
                  </td>
                  {sortedMeals.map((m) => {
                    const v = planByCell.get(`${m.id}::${g.id}`) ?? 0;
                    return (
                      <td
                        key={m.id}
                        className="border border-black/40 px-2 py-1 text-center tabular-nums"
                      >
                        {v ? formatPortion(v) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─── Recetas calendarizadas ──────────────────────────────────────────────

function RecetasSection({
  from,
  to,
  meals,
  groups,
  foods,
  units,
  scheduled,
}: {
  from: string;
  to: string;
  meals: Meal[];
  groups: FoodGroup[];
  foods: Food[];
  units: UnitType[];
  scheduled: ScheduledRecipe[];
}) {
  const foodById = new Map(foods.map((f) => [f.id, f]));
  const unitById = new Map(units.map((u) => [u.id, u]));
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const mealById = new Map(meals.map((m) => [m.id, m]));

  // Group by date.
  const byDate = new Map<string, ScheduledRecipe[]>();
  for (const r of scheduled) {
    const arr = byDate.get(r.date) ?? [];
    arr.push(r);
    byDate.set(r.date, arr);
  }
  const dates = [...byDate.keys()].sort();
  for (const d of dates) {
    byDate.get(d)!.sort((a, b) => {
      const oa = mealById.get(a.mealId)?.order ?? 0;
      const ob = mealById.get(b.mealId)?.order ?? 0;
      return oa - ob;
    });
  }

  return (
    <section className="print-section">
      <h2 className="mb-2 text-base font-bold">Recetas calendarizadas</h2>
      <p className="mb-3 text-xs">
        Rango: <b>{from || "—"}</b> a <b>{to || "—"}</b>
      </p>
      {dates.length === 0 ? (
        <p className="text-xs opacity-70">
          No hay recetas calendarizadas en este rango.
        </p>
      ) : (
        <div className="space-y-3">
          {dates.map((d) => (
            <div key={d} className="break-inside-avoid">
              <h3 className="border-b border-black/40 pb-0.5 text-sm font-semibold">
                {formatDateLong(d)}
              </h3>
              <div className="mt-2 space-y-2">
                {byDate.get(d)!.map((r) => {
                  const meal = mealById.get(r.mealId);
                  return (
                    <div
                      key={r.id}
                      className="break-inside-avoid border border-black/30 p-2"
                    >
                      <div className="mb-1 flex items-baseline justify-between gap-2">
                        <div className="text-sm font-medium">
                          {meal?.label ?? "—"}
                          {meal?.time && (
                            <span className="ml-2 text-[11px] font-normal opacity-70">
                              {meal.time}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] uppercase opacity-70">
                          {r.source}
                        </div>
                      </div>
                      {r.title && (
                        <p className="mb-1 text-xs italic">{r.title}</p>
                      )}
                      <RecipeItemsTable
                        items={r.items}
                        foodById={foodById}
                        unitById={unitById}
                        groupById={groupById}
                      />
                      {r.preparation && r.preparation.length > 0 && (
                        <ol className="ml-5 mt-2 list-decimal space-y-0.5 text-[11px]">
                          {r.preparation.map((step, i) => (
                            <li key={i}>{step}</li>
                          ))}
                        </ol>
                      )}
                      {r.notes && (
                        <p className="mt-1 text-[11px] italic opacity-80">
                          Nota: {r.notes}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function RecipeItemsTable({
  items,
  foodById,
  unitById,
  groupById,
}: {
  items: { foodId: string; amount: number }[];
  foodById: Map<string, Food>;
  unitById: Map<string, UnitType>;
  groupById: Map<string, FoodGroup>;
}) {
  if (items.length === 0)
    return <p className="text-[11px] opacity-70">Sin ingredientes.</p>;
  return (
    <table className="w-full border-collapse text-[11px]">
      <thead>
        <tr>
          <th className="border border-black/30 bg-black/5 px-1.5 py-0.5 text-left">
            Grupo
          </th>
          <th className="border border-black/30 bg-black/5 px-1.5 py-0.5 text-left">
            Alimento
          </th>
          <th className="border border-black/30 bg-black/5 px-1.5 py-0.5 text-right">
            Cant.
          </th>
          <th className="border border-black/30 bg-black/5 px-1.5 py-0.5 text-left">
            Unidad
          </th>
          <th className="border border-black/30 bg-black/5 px-1.5 py-0.5 text-right">
            Porc.
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map((it, i) => {
          const f = foodById.get(it.foodId);
          const u = f ? unitById.get(f.unitId) : undefined;
          const g = f ? groupById.get(f.groupId) : undefined;
          const porciones = f ? amountToPortions(it.amount, f) : 0;
          return (
            <tr key={i}>
              <td className="border border-black/30 px-1.5 py-0.5">
                {g?.label ?? "—"}
              </td>
              <td className="border border-black/30 px-1.5 py-0.5">
                {f?.name ?? "—"}
              </td>
              <td className="border border-black/30 px-1.5 py-0.5 text-right tabular-nums">
                {formatPortion(it.amount)}
              </td>
              <td className="border border-black/30 px-1.5 py-0.5">
                {u?.label ?? ""}
              </td>
              <td className="border border-black/30 px-1.5 py-0.5 text-right tabular-nums">
                {formatPortion(porciones)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── Tabla de alimentos ──────────────────────────────────────────────────

function AlimentosSection({
  groups,
  foods,
  units,
}: {
  groups: FoodGroup[];
  foods: Food[];
  units: UnitType[];
}) {
  const unitById = new Map(units.map((u) => [u.id, u]));
  const sortedGroups = [...groups].sort((a, b) => a.order - b.order);
  return (
    <section className="print-section">
      <h2 className="mb-2 text-base font-bold">Tabla de alimentos</h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {sortedGroups.map((g) => {
          const inGroup = foods
            .filter((f) => f.groupId === g.id)
            .slice()
            .sort((a, b) => compareNames(a.name, b.name));
          if (inGroup.length === 0) return null;
          return (
            <div key={g.id} className="break-inside-avoid">
              <h3 className="border-b border-black/40 pb-0.5 text-sm font-semibold">
                {g.label}
              </h3>
              {g.note && (
                <p className="mb-1 text-[10px] italic opacity-80">{g.note}</p>
              )}
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr>
                    <th className="border border-black/30 bg-black/5 px-1.5 py-0.5 text-left">
                      Alimento
                    </th>
                    <th className="border border-black/30 bg-black/5 px-1.5 py-0.5 text-right">
                      1 porción
                    </th>
                    <th className="border border-black/30 bg-black/5 px-1.5 py-0.5 text-left">
                      Unidad
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {inGroup.map((f) => (
                    <tr key={f.id}>
                      <td className="border border-black/30 px-1.5 py-0.5">
                        {f.name}
                      </td>
                      <td className="border border-black/30 px-1.5 py-0.5 text-right tabular-nums">
                        {formatPortion(f.quantity)}
                      </td>
                      <td className="border border-black/30 px-1.5 py-0.5">
                        {unitById.get(f.unitId)?.label ?? ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </section>
  );
}
