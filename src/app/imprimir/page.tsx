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

// Print-safe pastel palette. Same hash as `getGroupColor` so colors stay
// consistent with the on-screen UI — but uses fixed hex tones that print
// reliably (no CSS variables, no dark theme dependency).
const PRINT_PALETTE: { bg: string; border: string; ink: string }[] = [
  { bg: "#fef3c7", border: "#f59e0b", ink: "#78350f" }, // amber
  { bg: "#dbeafe", border: "#3b82f6", ink: "#1e3a8a" }, // blue
  { bg: "#dcfce7", border: "#22c55e", ink: "#14532d" }, // green
  { bg: "#fce7f3", border: "#ec4899", ink: "#831843" }, // pink
  { bg: "#ede9fe", border: "#8b5cf6", ink: "#4c1d95" }, // violet
  { bg: "#ffedd5", border: "#f97316", ink: "#7c2d12" }, // orange
  { bg: "#cffafe", border: "#06b6d4", ink: "#164e63" }, // cyan
  { bg: "#fee2e2", border: "#ef4444", ink: "#7f1d1d" }, // red
  { bg: "#e0e7ff", border: "#6366f1", ink: "#312e81" }, // indigo
  { bg: "#ecfccb", border: "#84cc16", ink: "#365314" }, // lime
];

function hashStr(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (h * 33) ^ str.charCodeAt(i);
  }
  return h >>> 0;
}

function printColor(id: string) {
  return PRINT_PALETTE[hashStr(id) % PRINT_PALETTE.length];
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
  const includePrep = params.get("prep") !== "0";
  const landscape = params.get("orient") === "h";

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
    <main
      className={`print-doc mx-auto w-full ${landscape ? "max-w-[279mm]" : "max-w-[216mm]"} bg-white px-8 py-6 text-[11.5px] leading-snug text-slate-900`}
    >
      {/* Override @page to honor user-chosen orientation. */}
      <style>{`@page { size: letter ${landscape ? "landscape" : "portrait"}; margin: ${landscape ? "10mm 12mm" : "12mm 14mm"}; }`}</style>
      <PrintToolbar />
      <header className="mb-5 overflow-hidden rounded-lg" style={{ background: "linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)" }}>
        <div className="flex items-center justify-between gap-3 px-5 py-3 text-white">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Nutrición MCZ</h1>
            <p className="mt-0.5 text-[12px] opacity-95">
              Perfil: <span className="font-semibold">{profile.name}</span>
            </p>
          </div>
          <div className="text-right text-[10px] uppercase tracking-wide opacity-90">
            <div>Generado</div>
            <div className="text-[11px] font-medium normal-case tracking-normal">
              {new Date().toLocaleString("es-MX")}
            </div>
          </div>
        </div>
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
          includePreparation={includePrep}
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
          includePreparation={includePrep}
        />
      )}

      {sections.includes("alimentos") && (
        <AlimentosSection
          groups={groups!}
          foods={foods!}
          units={units!}
          landscape={landscape}
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
      <SectionTitle accent="#2563eb">Plan · porciones por comida</SectionTitle>
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr>
            <th className="border border-slate-300 px-2 py-1.5 text-left text-white" style={{ backgroundColor: "#1e3a8a" }}>
              Grupo
            </th>
            {sortedMeals.map((m) => (
              <th
                key={m.id}
                className="border border-slate-300 px-2 py-1.5 text-center text-white"
                style={{ backgroundColor: "#2563eb" }}
              >
                <div>{m.label}</div>
                {m.time && (
                  <div className="text-[10px] font-normal opacity-90">
                    {m.time}
                  </div>
                )}
              </th>
            ))}
            <th
              className="border border-slate-300 px-2 py-1.5 text-center text-white"
              style={{ backgroundColor: "#1e3a8a" }}
            >
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedGroups.map((g, rowIdx) => {
            const c = printColor(g.id);
            const rowTotal = sortedMeals.reduce(
              (sum, m) => sum + (cell.get(`${m.id}::${g.id}`) ?? 0),
              0,
            );
            return (
              <tr key={g.id} style={{ backgroundColor: rowIdx % 2 === 0 ? "#ffffff" : "#f8fafc" }}>
                <td className="border border-slate-300 px-2 py-1 font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: c.border }}
                    />
                    {g.label}
                  </span>
                </td>
                {sortedMeals.map((m) => {
                  const v = cell.get(`${m.id}::${g.id}`) ?? 0;
                  return (
                    <td
                      key={m.id}
                      className="border border-slate-300 px-2 py-1 text-center tabular-nums"
                      style={v ? { backgroundColor: c.bg, color: c.ink, fontWeight: 600 } : undefined}
                    >
                      {v ? formatPortion(v) : <span className="text-slate-400">—</span>}
                    </td>
                  );
                })}
                <td
                  className="border border-slate-300 px-2 py-1 text-center font-bold tabular-nums"
                  style={rowTotal ? { backgroundColor: c.border, color: "#ffffff" } : undefined}
                >
                  {rowTotal ? formatPortion(rowTotal) : <span className="text-slate-400">—</span>}
                </td>
              </tr>
            );
          })}
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
  includePreparation,
}: {
  date: string;
  meals: Meal[];
  groups: FoodGroup[];
  foods: Food[];
  units: UnitType[];
  plan: PlanCell[];
  recipes: Recipe[];
  scheduled: ScheduledRecipe[];
  includePreparation: boolean;
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
      <SectionTitle accent="#16a34a">
        Plan del día
        <span className="ml-2 text-[12px] font-normal text-slate-500">
          · {formatDateLong(date)}
        </span>
      </SectionTitle>
      <div className="space-y-2.5">
        {sortedMeals.map((m) => {
          const r = schedByMeal.get(m.id) ?? tplByMeal.get(m.id);
          const source = schedByMeal.get(m.id) ? "calendario" : "plantilla";
          const accent = printColor(m.id);
          return (
            <div
              key={m.id}
              className="break-inside-avoid overflow-hidden rounded-md border border-slate-300"
              style={{ borderLeft: `4px solid ${accent.border}` }}
            >
              <div
                className="flex items-baseline justify-between gap-2 px-3 py-1.5"
                style={{ backgroundColor: accent.bg, color: accent.ink }}
              >
                <h3 className="text-[13px] font-semibold">
                  {m.label}
                  {m.time && (
                    <span className="ml-2 text-[11px] font-normal opacity-80">
                      {m.time}
                    </span>
                  )}
                  {r?.title && (
                    <span className="ml-2 text-[11px] font-normal italic opacity-90">
                      · {r.title}
                    </span>
                  )}
                </h3>
                {r && (
                  <span className="rounded-sm bg-white/70 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide">
                    {source}
                  </span>
                )}
              </div>
              <div className="px-3 py-2">
                {!r ? (
                  <p className="text-[11px] italic text-slate-500">
                    Sin receta para esta comida.
                  </p>
                ) : (
                  <RecipeItemsTable
                    items={r.items}
                    foodById={foodById}
                    unitById={unitById}
                    groupById={groupById}
                  />
                )}
                {includePreparation &&
                  r &&
                  "preparation" in r &&
                  r.preparation &&
                  r.preparation.length > 0 && (
                    <div className="mt-2 rounded-sm border border-slate-200 bg-slate-50 px-2.5 py-1.5">
                      <div className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                        Preparación
                      </div>
                      <ol className="ml-4 list-decimal space-y-0.5 text-[10.5px] text-slate-700">
                        {r.preparation.map((step, i) => (
                          <li key={i}>{step}</li>
                        ))}
                      </ol>
                    </div>
                  )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4">
        <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
          Porciones recomendadas del día
        </h3>
        <table className="w-full border-collapse text-[10.5px]">
          <thead>
            <tr>
              <th className="border border-slate-300 px-2 py-1 text-left text-white" style={{ backgroundColor: "#166534" }}>
                Grupo
              </th>
              {sortedMeals.map((m) => (
                <th
                  key={m.id}
                  className="border border-slate-300 px-2 py-1 text-center text-white"
                  style={{ backgroundColor: "#16a34a" }}
                >
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...groups]
              .sort((a, b) => a.order - b.order)
              .map((g, rowIdx) => {
                const c = printColor(g.id);
                return (
                  <tr key={g.id} style={{ backgroundColor: rowIdx % 2 === 0 ? "#ffffff" : "#f8fafc" }}>
                    <td className="border border-slate-300 px-2 py-1 font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: c.border }} />
                        {g.label}
                      </span>
                    </td>
                    {sortedMeals.map((m) => {
                      const v = planByCell.get(`${m.id}::${g.id}`) ?? 0;
                      return (
                        <td
                          key={m.id}
                          className="border border-slate-300 px-2 py-1 text-center tabular-nums"
                          style={v ? { backgroundColor: c.bg, color: c.ink, fontWeight: 600 } : undefined}
                        >
                          {v ? formatPortion(v) : <span className="text-slate-400">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
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
  includePreparation,
}: {
  from: string;
  to: string;
  meals: Meal[];
  groups: FoodGroup[];
  foods: Food[];
  units: UnitType[];
  scheduled: ScheduledRecipe[];
  includePreparation: boolean;
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
      <SectionTitle accent="#db2777">
        Recetas calendarizadas
        <span className="ml-2 text-[12px] font-normal text-slate-500">
          · {from || "—"} a {to || "—"}
        </span>
      </SectionTitle>
      {dates.length === 0 ? (
        <p className="text-[11px] italic text-slate-500">
          No hay recetas calendarizadas en este rango.
        </p>
      ) : (
        <div className="space-y-3">
          {dates.map((d) => (
            <div key={d} className="break-inside-avoid">
              <h3
                className="mb-1.5 rounded-sm px-2 py-1 text-[12px] font-semibold text-white"
                style={{ backgroundColor: "#db2777" }}
              >
                {formatDateLong(d)}
              </h3>
              <div className="space-y-2">
                {byDate.get(d)!.map((r) => {
                  const meal = mealById.get(r.mealId);
                  const accent = printColor(r.mealId);
                  return (
                    <div
                      key={r.id}
                      className="break-inside-avoid overflow-hidden rounded-md border border-slate-300"
                      style={{ borderLeft: `4px solid ${accent.border}` }}
                    >
                      <div
                        className="flex items-baseline justify-between gap-2 px-3 py-1.5"
                        style={{ backgroundColor: accent.bg, color: accent.ink }}
                      >
                        <div className="text-[12px] font-semibold">
                          {meal?.label ?? "—"}
                          {meal?.time && (
                            <span className="ml-2 text-[10.5px] font-normal opacity-80">
                              {meal.time}
                            </span>
                          )}
                          {r.title && (
                            <span className="ml-2 text-[10.5px] font-normal italic opacity-90">
                              · {r.title}
                            </span>
                          )}
                        </div>
                        <span className="rounded-sm bg-white/70 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide">
                          {r.source}
                        </span>
                      </div>
                      <div className="px-3 py-2">
                        <RecipeItemsTable
                          items={r.items}
                          foodById={foodById}
                          unitById={unitById}
                          groupById={groupById}
                        />
                        {includePreparation &&
                          r.preparation &&
                          r.preparation.length > 0 && (
                            <div className="mt-2 rounded-sm border border-slate-200 bg-slate-50 px-2.5 py-1.5">
                              <div className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                                Preparación
                              </div>
                              <ol className="ml-4 list-decimal space-y-0.5 text-[10.5px] text-slate-700">
                                {r.preparation.map((step, i) => (
                                  <li key={i}>{step}</li>
                                ))}
                              </ol>
                            </div>
                          )}
                        {r.notes && (
                          <p className="mt-1.5 text-[10.5px] italic text-slate-600">
                            Nota: {r.notes}
                          </p>
                        )}
                      </div>
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
    return <p className="text-[10.5px] italic text-slate-500">Sin ingredientes.</p>;
  return (
    <table className="w-full border-collapse text-[10.5px]">
      <thead>
        <tr className="text-white" style={{ backgroundColor: "#475569" }}>
          <th className="border border-slate-300 px-1.5 py-1 text-left font-medium">Grupo</th>
          <th className="border border-slate-300 px-1.5 py-1 text-left font-medium">Alimento</th>
          <th className="border border-slate-300 px-1.5 py-1 text-right font-medium">Cant.</th>
          <th className="border border-slate-300 px-1.5 py-1 text-left font-medium">Unidad</th>
          <th className="border border-slate-300 px-1.5 py-1 text-right font-medium">Porc.</th>
        </tr>
      </thead>
      <tbody>
        {items.map((it, i) => {
          const f = foodById.get(it.foodId);
          const u = f ? unitById.get(f.unitId) : undefined;
          const g = f ? groupById.get(f.groupId) : undefined;
          const porciones = f ? amountToPortions(it.amount, f) : 0;
          const c = g ? printColor(g.id) : null;
          return (
            <tr key={i} style={{ backgroundColor: i % 2 === 0 ? "#ffffff" : "#f8fafc" }}>
              <td className="border border-slate-200 px-1.5 py-0.5">
                {c ? (
                  <span
                    className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[9.5px] font-medium"
                    style={{ backgroundColor: c.bg, color: c.ink }}
                  >
                    <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c.border }} />
                    {g?.label ?? "—"}
                  </span>
                ) : (
                  <span className="text-slate-500">—</span>
                )}
              </td>
              <td className="border border-slate-200 px-1.5 py-0.5 font-medium">{f?.name ?? "—"}</td>
              <td className="border border-slate-200 px-1.5 py-0.5 text-right tabular-nums">{formatPortion(it.amount)}</td>
              <td className="border border-slate-200 px-1.5 py-0.5 text-slate-600">{u?.label ?? ""}</td>
              <td className="border border-slate-200 px-1.5 py-0.5 text-right tabular-nums font-semibold text-slate-700">{formatPortion(porciones)}</td>
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
  landscape,
}: {
  groups: FoodGroup[];
  foods: Food[];
  units: UnitType[];
  landscape: boolean;
}) {
  const unitById = new Map(units.map((u) => [u.id, u]));
  const sortedGroups = [...groups].sort((a, b) => a.order - b.order);
  return (
    <section className="print-section">
      <SectionTitle accent="#7c3aed">Tabla de alimentos</SectionTitle>
      <div className={`grid gap-3 ${landscape ? "grid-cols-3" : "grid-cols-2"}`}>
        {sortedGroups.map((g) => {
          const inGroup = foods
            .filter((f) => f.groupId === g.id)
            .slice()
            .sort((a, b) => compareNames(a.name, b.name));
          if (inGroup.length === 0) return null;
          const c = printColor(g.id);
          return (
            <div
              key={g.id}
              className="break-inside-avoid overflow-hidden rounded-md border border-slate-300"
              style={{ borderTop: `3px solid ${c.border}` }}
            >
              <div className="px-2 py-1" style={{ backgroundColor: c.bg, color: c.ink }}>
                <h3 className="text-[12px] font-semibold">{g.label}</h3>
                {g.note && (
                  <p className="text-[9.5px] italic opacity-80">{g.note}</p>
                )}
              </div>
              <table className="w-full border-collapse text-[10.5px]">
                <thead>
                  <tr className="text-slate-600" style={{ backgroundColor: "#f1f5f9" }}>
                    <th className="border-b border-slate-300 px-1.5 py-0.5 text-left font-medium">Alimento</th>
                    <th className="border-b border-slate-300 px-1.5 py-0.5 text-right font-medium">1 porción</th>
                    <th className="border-b border-slate-300 px-1.5 py-0.5 text-left font-medium">Unidad</th>
                  </tr>
                </thead>
                <tbody>
                  {inGroup.map((f, i) => (
                    <tr key={f.id} style={{ backgroundColor: i % 2 === 0 ? "#ffffff" : "#f8fafc" }}>
                      <td className="border-b border-slate-100 px-1.5 py-0.5">{f.name}</td>
                      <td className="border-b border-slate-100 px-1.5 py-0.5 text-right tabular-nums">{formatPortion(f.quantity)}</td>
                      <td className="border-b border-slate-100 px-1.5 py-0.5 text-slate-600">{unitById.get(f.unitId)?.label ?? ""}</td>
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

// ─── Shared section title ────────────────────────────────────────────────

function SectionTitle({
  accent,
  children,
}: {
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <h2
      className="mb-2.5 flex items-center gap-2 pl-2.5 text-[15px] font-bold text-slate-800"
      style={{ borderLeft: `4px solid ${accent}` }}
    >
      {children}
    </h2>
  );
}
