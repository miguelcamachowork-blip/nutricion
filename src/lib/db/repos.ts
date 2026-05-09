import { getDB } from "./database";
import { uid, todayISO } from "@/lib/utils";
import {
  SEED_FOODS,
  SEED_FREE_USE_FOODS,
  SEED_GROUPS,
  SEED_QUANTITIES,
  SEED_UNITS,
  makeMealsSeedFor,
} from "@/lib/seed";
import type {
  Food,
  FoodGroup,
  ForbiddenItem,
  FreeUseFood,
  ID,
  Meal,
  PlanCell,
  PlanSnapshot,
  Profile,
  QuantityOption,
  Recipe,
  RecipeDraft,
  RecipeItem,
  RecipeSnapshot,
  ScheduledRecipe,
  UnitType,
} from "@/lib/types";

// ─── Profiles ─────────────────────────────────────────────────────────────

export async function listProfiles(): Promise<Profile[]> {
  return getDB().profiles.orderBy("createdAt").toArray();
}

/**
 * Idempotent: ensures the global catalog tables (groups, foods, units,
 * quantities, freeUseFoods) have at least the seed contents. Safe to call
 * on every app boot — it only adds missing rows, never overwrites user data.
 */
export async function ensureGlobalCatalog(): Promise<void> {
  const db = getDB();
  const [groupCount, unitCount, qtyCount, foodCount, freeCount] = await Promise.all([
    db.groups.count(),
    db.unitTypes.count(),
    db.quantityOptions.count(),
    db.foods.count(),
    db.freeUseFoods.count(),
  ]);

  if (groupCount === 0) {
    const groups: FoodGroup[] = SEED_GROUPS.map((g, i) => ({
      id: `g:${g.key}`,
      key: g.key,
      label: g.label,
      order: i,
      removable: g.removable,
    }));
    await db.groups.bulkAdd(groups);
  }
  if (unitCount === 0) {
    const units: UnitType[] = SEED_UNITS.map((label, i) => ({
      id: `u:${i}`,
      label,
      order: i,
    }));
    await db.unitTypes.bulkAdd(units);
  }
  if (qtyCount === 0) {
    const qtys: QuantityOption[] = SEED_QUANTITIES.map((value, i) => ({
      id: `q:${i}`,
      value,
      order: i,
    }));
    await db.quantityOptions.bulkAdd(qtys);
  }
  if (foodCount === 0) {
    const groups = await db.groups.toArray();
    const groupByKey = new Map(groups.map((g) => [g.key, g]));
    const units = await db.unitTypes.toArray();
    const unitByLabel = new Map(units.map((u) => [u.label, u]));
    const piezas = unitByLabel.get("Piezas");
    const foods: Food[] = [];
    for (const g of SEED_GROUPS) {
      const targetGroup = groupByKey.get(g.key);
      if (!targetGroup) continue;
      const list = SEED_FOODS[g.key as keyof typeof SEED_FOODS] ?? [];
      for (const f of list) {
        foods.push({
          id: uid(),
          groupId: targetGroup.id,
          name: f.name,
          unitId: unitByLabel.get(f.unit)?.id ?? piezas?.id ?? "u:0",
          quantity: f.quantity,
        });
      }
    }
    if (foods.length > 0) await db.foods.bulkAdd(foods);
  }
  if (freeCount === 0) {
    const now = Date.now();
    const free: FreeUseFood[] = SEED_FREE_USE_FOODS.map((name, i) => ({
      id: `free:${i}`,
      name,
      createdAt: now + i,
    }));
    if (free.length > 0) await db.freeUseFoods.bulkAdd(free);
  }
}

export async function createProfile(name: string): Promise<Profile> {
  const db = getDB();
  await ensureGlobalCatalog();
  const profile: Profile = {
    id: uid(),
    name: name.trim() || "Perfil",
    createdAt: Date.now(),
  };
  const meals = makeMealsSeedFor(profile.id);
  await db.transaction(
    "rw",
    [db.profiles, db.meals],
    async () => {
      await db.profiles.add(profile);
      await db.meals.bulkAdd(meals);
    },
  );
  return profile;
}

export async function deleteProfile(profileId: ID): Promise<void> {
  const db = getDB();
  await db.transaction(
    "rw",
    [
      db.profiles,
      db.meals,
      db.planCells,
      db.recipes,
      db.planSnapshots,
      db.recipeSnapshots,
      db.forbiddenItems,
      db.scheduledRecipes,
      db.recipeDrafts,
    ],
    async () => {
      await db.profiles.delete(profileId);
      await db.meals.where({ profileId }).delete();
      await db.planCells.where({ profileId }).delete();
      await db.recipes.where({ profileId }).delete();
      await db.planSnapshots.where({ profileId }).delete();
      await db.recipeSnapshots.where({ profileId }).delete();
      await db.forbiddenItems.where({ profileId }).delete();
      await db.scheduledRecipes.where({ profileId }).delete();
      await db.recipeDrafts.where({ profileId }).delete();
    },
  );
}

export async function renameProfile(id: ID, name: string): Promise<void> {
  await getDB().profiles.update(id, { name });
}

// ─── Groups (global) ──────────────────────────────────────────────────────

export async function listGroups(): Promise<FoodGroup[]> {
  const all = await getDB().groups.toArray();
  return all.sort((a, b) => a.order - b.order);
}

export async function renameGroup(id: ID, label: string): Promise<void> {
  await getDB().groups.update(id, { label });
}

export async function updateGroupNote(id: ID, note: string): Promise<void> {
  const trimmed = note.trim();
  await getDB().groups.update(id, { note: trimmed === "" ? undefined : trimmed });
}

export async function addGroup(label: string): Promise<FoodGroup> {
  const groups = await listGroups();
  const order = (groups[groups.length - 1]?.order ?? -1) + 1;
  const g: FoodGroup = {
    id: uid(),
    key: `CUSTOM_${order}`,
    label,
    order,
    removable: true,
  };
  await getDB().groups.add(g);
  return g;
}

export async function deleteGroup(id: ID): Promise<void> {
  const db = getDB();
  await db.transaction("rw", [db.groups, db.foods, db.planCells], async () => {
    await db.groups.delete(id);
    await db.foods.where({ groupId: id }).delete();
    await db.planCells.where({ groupId: id }).delete();
  });
}

/** Persist a new ordering for the given group ids (in the desired order). */
export async function reorderGroups(orderedIds: ID[]): Promise<void> {
  const db = getDB();
  await db.transaction("rw", db.groups, async () => {
    await Promise.all(
      orderedIds.map((id, idx) => db.groups.update(id, { order: idx })),
    );
  });
}

// ─── Foods (global) ───────────────────────────────────────────────────────

export async function listFoods(): Promise<Food[]> {
  return getDB().foods.toArray();
}

export async function listFoodsByGroup(groupId: ID): Promise<Food[]> {
  return getDB().foods.where("groupId").equals(groupId).toArray();
}

export async function addFood(
  groupId: ID,
  name: string,
  unitId: ID,
  quantity: number,
): Promise<Food> {
  const f: Food = { id: uid(), groupId, name, unitId, quantity };
  await getDB().foods.add(f);
  return f;
}

export async function updateFood(
  id: ID,
  patch: Partial<Pick<Food, "name" | "unitId" | "quantity" | "groupId" | "locked">>,
): Promise<void> {
  await getDB().foods.update(id, patch);
}

export async function deleteFood(id: ID): Promise<void> {
  await getDB().foods.delete(id);
}

// ─── Units & Quantities (global) ──────────────────────────────────────────

export async function listUnits(): Promise<UnitType[]> {
  const all = await getDB().unitTypes.toArray();
  return all.sort((a, b) => a.order - b.order);
}

export async function addUnit(label: string): Promise<UnitType> {
  const existing = await listUnits();
  const order = (existing[existing.length - 1]?.order ?? -1) + 1;
  const u: UnitType = { id: uid(), label: label.trim(), order };
  await getDB().unitTypes.add(u);
  return u;
}

export async function renameUnit(id: ID, label: string): Promise<void> {
  await getDB().unitTypes.update(id, { label: label.trim() });
}

export async function deleteUnit(id: ID): Promise<void> {
  const db = getDB();
  const u = await db.unitTypes.get(id);
  if (!u) return;
  const inUse = await db.foods.filter((f) => f.unitId === id).count();
  if (inUse > 0) {
    throw new Error(`No se puede eliminar: ${inUse} alimento(s) usan esta unidad.`);
  }
  await db.unitTypes.delete(id);
}

export async function listQuantities(): Promise<QuantityOption[]> {
  const all = await getDB().quantityOptions.toArray();
  return all.sort((a, b) => a.value - b.value);
}

export async function addQuantity(value: number): Promise<QuantityOption> {
  const existing = await listQuantities();
  const dup = existing.find((q) => q.value === value);
  if (dup) return dup;
  const order = (existing[existing.length - 1]?.order ?? -1) + 1;
  const q: QuantityOption = { id: uid(), value, order };
  await getDB().quantityOptions.add(q);
  return q;
}

export async function deleteQuantity(id: ID): Promise<void> {
  const db = getDB();
  const q = await db.quantityOptions.get(id);
  if (!q) return;
  const candidates = await db.foods.toArray();
  const inUse = candidates.filter((f) => f.quantity === q.value).length;
  if (inUse > 0) {
    throw new Error(
      `No se puede eliminar: ${inUse} alimento(s) usan esta cantidad.`,
    );
  }
  await db.quantityOptions.delete(id);
}

// ─── Free-use foods (global) ──────────────────────────────────────────────

export async function listFreeUseFoods(): Promise<FreeUseFood[]> {
  const all = await getDB().freeUseFoods.toArray();
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function addFreeUseFood(
  name: string,
  notes?: string,
): Promise<FreeUseFood | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const existing = await listFreeUseFoods();
  const lower = trimmed.toLowerCase();
  if (existing.some((f) => f.name.toLowerCase() === lower)) return null;
  const f: FreeUseFood = {
    id: uid(),
    name: trimmed,
    notes: notes?.trim() || undefined,
    createdAt: Date.now(),
  };
  await getDB().freeUseFoods.add(f);
  return f;
}

export async function updateFreeUseFood(
  id: ID,
  patch: Partial<Pick<FreeUseFood, "name" | "notes">>,
): Promise<void> {
  const clean: Partial<FreeUseFood> = { ...patch };
  if (typeof clean.name === "string") clean.name = clean.name.trim();
  if (typeof clean.notes === "string") {
    clean.notes = clean.notes.trim() || undefined;
  }
  await getDB().freeUseFoods.update(id, clean);
}

export async function deleteFreeUseFood(id: ID): Promise<void> {
  await getDB().freeUseFoods.delete(id);
}

// ─── Forbidden items ──────────────────────────────────────────────────────

export async function listForbidden(profileId: ID): Promise<ForbiddenItem[]> {
  const all = await getDB()
    .forbiddenItems.where("profileId")
    .equals(profileId)
    .toArray();
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function addForbiddenFood(
  profileId: ID,
  foodId: ID,
): Promise<ForbiddenItem | null> {
  const existing = await listForbidden(profileId);
  if (existing.some((it) => it.kind === "food" && it.ref === foodId))
    return null;
  const item: ForbiddenItem = {
    id: uid(),
    profileId,
    kind: "food",
    ref: foodId,
    createdAt: Date.now(),
  };
  await getDB().forbiddenItems.add(item);
  return item;
}

export async function addForbiddenGroup(
  profileId: ID,
  groupId: ID,
): Promise<ForbiddenItem | null> {
  const existing = await listForbidden(profileId);
  if (existing.some((it) => it.kind === "group" && it.ref === groupId))
    return null;
  const item: ForbiddenItem = {
    id: uid(),
    profileId,
    kind: "group",
    ref: groupId,
    createdAt: Date.now(),
  };
  await getDB().forbiddenItems.add(item);
  return item;
}

export async function addForbiddenCustom(
  profileId: ID,
  label: string,
): Promise<ForbiddenItem | null> {
  const trimmed = label.trim();
  if (!trimmed) return null;
  const existing = await listForbidden(profileId);
  const lower = trimmed.toLowerCase();
  if (
    existing.some(
      (it) => it.kind === "custom" && (it.label ?? "").toLowerCase() === lower,
    )
  ) {
    return null;
  }
  const item: ForbiddenItem = {
    id: uid(),
    profileId,
    kind: "custom",
    label: trimmed,
    createdAt: Date.now(),
  };
  await getDB().forbiddenItems.add(item);
  return item;
}

export async function deleteForbidden(id: ID): Promise<void> {
  await getDB().forbiddenItems.delete(id);
}

/** Sets of vetoed group/food IDs, plus the list of free-text custom labels. */
export function partitionForbidden(items: ForbiddenItem[]): {
  groupIds: Set<string>;
  foodIds: Set<string>;
  customs: ForbiddenItem[];
} {
  const groupIds = new Set<string>();
  const foodIds = new Set<string>();
  const customs: ForbiddenItem[] = [];
  for (const it of items) {
    if (it.kind === "group" && it.ref) groupIds.add(it.ref);
    else if (it.kind === "food" && it.ref) foodIds.add(it.ref);
    else if (it.kind === "custom") customs.push(it);
  }
  return { groupIds, foodIds, customs };
}

// ─── Meals ────────────────────────────────────────────────────────────────

export async function listMeals(profileId: ID): Promise<Meal[]> {
  const all = await getDB()
    .meals.where("profileId")
    .equals(profileId)
    .toArray();
  return all.sort((a, b) => a.order - b.order);
}

export async function updateMeal(
  id: ID,
  patch: Partial<Omit<Meal, "id" | "profileId">>,
): Promise<void> {
  await getDB().meals.update(id, patch);
}

export async function addMeal(profileId: ID, label: string): Promise<Meal> {
  const meals = await listMeals(profileId);
  const order = (meals[meals.length - 1]?.order ?? -1) + 1;
  const m: Meal = {
    id: uid(),
    profileId,
    key: `CUSTOM_${order}`,
    label,
    order,
  };
  await getDB().meals.add(m);
  return m;
}

export async function deleteMeal(id: ID): Promise<void> {
  const db = getDB();
  await db.transaction(
    "rw",
    [db.meals, db.planCells, db.recipes],
    async () => {
      await db.meals.delete(id);
      await db.planCells.where({ mealId: id }).delete();
      await db.recipes.where({ mealId: id }).delete();
    },
  );
}

/** Persist a new ordering for the given meal ids (in the desired order). */
export async function reorderMeals(
  profileId: ID,
  orderedIds: ID[],
): Promise<void> {
  const db = getDB();
  await db.transaction("rw", db.meals, async () => {
    await Promise.all(
      orderedIds.map((id, idx) =>
        db.meals.update(id, { order: idx, profileId }),
      ),
    );
  });
}

// ─── Plan ─────────────────────────────────────────────────────────────────

export async function listPlan(profileId: ID): Promise<PlanCell[]> {
  return getDB().planCells.where("profileId").equals(profileId).toArray();
}

export async function setPlanCell(
  profileId: ID,
  mealId: ID,
  groupId: ID,
  portions: number,
): Promise<{ affectedScheduled: number }> {
  const db = getDB();
  let changed = false;
  await db.transaction(
    "rw",
    [db.planCells, db.planSnapshots, db.scheduledRecipes],
    async () => {
      const existing = await db.planCells
        .where("[profileId+mealId+groupId]")
        .equals([profileId, mealId, groupId])
        .first();
      if (existing) {
        if (portions === 0) {
          await db.planCells.delete(existing.id);
          changed = true;
        } else if (existing.portions !== portions) {
          await db.planCells.update(existing.id, { portions });
          changed = true;
        } else {
          return; // no-op, no snapshot
        }
      } else {
        if (portions === 0) return;
        await db.planCells.add({
          id: uid(),
          profileId,
          mealId,
          groupId,
          portions,
        });
        changed = true;
      }
      await snapshotPlanWithinTx(profileId);
    },
  );
  if (!changed) return { affectedScheduled: 0 };
  // Flag future scheduled recipes for review (in a separate tx; the user
  // doesn't need this to block the plan write).
  const today = todayISO();
  const affectedScheduled = await markScheduledRecipesNeedingReview(
    profileId,
    today,
  );
  return { affectedScheduled };
}

// ─── Recipes (one per profile+meal, "plan to follow") ─────────────────────

export async function listRecipes(profileId: ID): Promise<Recipe[]> {
  return getDB().recipes.where("profileId").equals(profileId).toArray();
}

export async function getRecipeForMeal(
  profileId: ID,
  mealId: ID,
): Promise<Recipe | undefined> {
  return getDB()
    .recipes.where("[profileId+mealId]")
    .equals([profileId, mealId])
    .first();
}

/** Create or replace the recipe for a (profile, meal). Records a snapshot. */
export async function upsertRecipe(
  profileId: ID,
  mealId: ID,
  items: RecipeItem[],
  meta?: { title?: string; preparation?: string[] },
): Promise<Recipe> {
  const db = getDB();
  let saved: Recipe;
  await db.transaction("rw", [db.recipes, db.recipeSnapshots], async () => {
    const existing = await db.recipes
      .where("[profileId+mealId]")
      .equals([profileId, mealId])
      .first();
    const newTitle = meta?.title;
    const newPrep = meta?.preparation;
    const sameAsBefore =
      existing &&
      JSON.stringify(existing.items) === JSON.stringify(items) &&
      (existing.title ?? null) === (newTitle ?? null) &&
      JSON.stringify(existing.preparation ?? null) ===
        JSON.stringify(newPrep ?? null);
    if (existing) {
      saved = {
        ...existing,
        items,
        title: newTitle,
        preparation: newPrep,
        updatedAt: Date.now(),
      };
      await db.recipes.put(saved);
    } else {
      saved = {
        id: uid(),
        profileId,
        mealId,
        items,
        title: newTitle,
        preparation: newPrep,
        updatedAt: Date.now(),
      };
      await db.recipes.add(saved);
    }
    if (!sameAsBefore) await snapshotRecipesWithinTx(profileId);
  });
  return saved!;
}

export async function deleteRecipe(profileId: ID, mealId: ID): Promise<void> {
  const db = getDB();
  await db.transaction("rw", [db.recipes, db.recipeSnapshots], async () => {
    const existing = await db.recipes
      .where("[profileId+mealId]")
      .equals([profileId, mealId])
      .first();
    if (!existing) return;
    await db.recipes.delete(existing.id);
    await snapshotRecipesWithinTx(profileId);
  });
}

// ─── Snapshots (historical baselines) ─────────────────────────────────────

async function snapshotPlanWithinTx(profileId: ID): Promise<void> {
  const db = getDB();
  const today = todayISO();
  const cells = await db.planCells.where({ profileId }).toArray();
  const snap: PlanSnapshot = {
    id: `${profileId}:${today}`,
    profileId,
    effectiveFrom: today,
    cells: cells.map((c) => ({
      mealId: c.mealId,
      groupId: c.groupId,
      portions: c.portions,
    })),
    createdAt: Date.now(),
  };
  await db.planSnapshots.put(snap);
}

async function snapshotRecipesWithinTx(profileId: ID): Promise<void> {
  const db = getDB();
  const today = todayISO();
  const recipes = await db.recipes.where({ profileId }).toArray();
  const snap: RecipeSnapshot = {
    id: `${profileId}:${today}`,
    profileId,
    effectiveFrom: today,
    recipes: recipes.map((r) => ({ mealId: r.mealId, items: r.items })),
    createdAt: Date.now(),
  };
  await db.recipeSnapshots.put(snap);
}

export async function listPlanSnapshotDates(profileId: ID): Promise<string[]> {
  const all = await getDB().planSnapshots.where({ profileId }).toArray();
  return all.map((s) => s.effectiveFrom).sort();
}

export async function listRecipeSnapshotDates(
  profileId: ID,
): Promise<string[]> {
  const all = await getDB().recipeSnapshots.where({ profileId }).toArray();
  return all.map((s) => s.effectiveFrom).sort();
}

/** Plan effective on `date` = newest snapshot with effectiveFrom ≤ date.
 *  Falls back to the current `planCells` if no snapshot is found. */
export async function getPlanAt(
  profileId: ID,
  date: string,
): Promise<PlanSnapshot["cells"]> {
  const all = await getDB().planSnapshots.where({ profileId }).toArray();
  const candidates = all
    .filter((s) => s.effectiveFrom <= date)
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));
  if (candidates[0]) return candidates[0].cells;
  const cells = await getDB().planCells.where({ profileId }).toArray();
  return cells.map((c) => ({
    mealId: c.mealId,
    groupId: c.groupId,
    portions: c.portions,
  }));
}

export async function getRecipesAt(
  profileId: ID,
  date: string,
): Promise<RecipeSnapshot["recipes"]> {
  const all = await getDB().recipeSnapshots.where({ profileId }).toArray();
  const candidates = all
    .filter((s) => s.effectiveFrom <= date)
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));
  if (candidates[0]) return candidates[0].recipes;
  const recipes = await getDB().recipes.where({ profileId }).toArray();
  return recipes.map((r) => ({ mealId: r.mealId, items: r.items }));
}

// ─── Partial export / import ──────────────────────────────────────────────
//
// The "catalog" export is GLOBAL since v7 (foods, groups, units, quantities
// are shared across all profiles). `forbidden` remains per-profile.

export interface CatalogExport {
  kind: "catalog";
  version: 2;
  groups: FoodGroup[];
  foods: Food[];
  units: UnitType[];
  quantities: QuantityOption[];
  freeUseFoods?: FreeUseFood[];
}

export interface PlanExport {
  kind: "plan";
  version: 1;
  meals: Meal[];
  cells: PlanCell[];
}

export interface RecipesExport {
  kind: "recipes";
  version: 1;
  recipes: Recipe[];
}

export async function exportCatalog(): Promise<CatalogExport> {
  return {
    kind: "catalog",
    version: 2,
    groups: await listGroups(),
    foods: await listFoods(),
    units: await listUnits(),
    quantities: await listQuantities(),
    freeUseFoods: await listFreeUseFoods(),
  };
}

export async function exportPlan(profileId: ID): Promise<PlanExport> {
  return {
    kind: "plan",
    version: 1,
    meals: await listMeals(profileId),
    cells: await listPlan(profileId),
  };
}

export async function exportRecipes(profileId: ID): Promise<RecipesExport> {
  return {
    kind: "recipes",
    version: 1,
    recipes: await listRecipes(profileId),
  };
}

/** Imports a catalog by REPLACING the global catalog. */
export async function importCatalog(data: CatalogExport): Promise<void> {
  if (data?.kind !== "catalog") throw new Error("Archivo no es un catálogo válido.");
  const db = getDB();
  // Strip any legacy `profileId` field for backwards compat with v1 exports.
  const stripPid = <T extends object>(rows: T[]): T[] =>
    rows.map((r) => {
      const copy = { ...r } as T & { profileId?: string };
      delete copy.profileId;
      return copy as T;
    });
  await db.transaction(
    "rw",
    [db.groups, db.foods, db.unitTypes, db.quantityOptions, db.freeUseFoods],
    async () => {
      await db.groups.clear();
      await db.foods.clear();
      await db.unitTypes.clear();
      await db.quantityOptions.clear();
      await db.groups.bulkAdd(stripPid(data.groups));
      await db.foods.bulkAdd(stripPid(data.foods));
      await db.unitTypes.bulkAdd(stripPid(data.units));
      await db.quantityOptions.bulkAdd(
        stripPid(data.quantities),
      );
      if (Array.isArray(data.freeUseFoods)) {
        await db.freeUseFoods.clear();
        if (data.freeUseFoods.length > 0) {
          await db.freeUseFoods.bulkAdd(data.freeUseFoods);
        }
      }
    },
  );
}

export async function importPlan(
  profileId: ID,
  data: PlanExport,
): Promise<void> {
  if (data?.kind !== "plan") throw new Error("Archivo no es un plan válido.");
  const db = getDB();
  await db.transaction(
    "rw",
    [db.meals, db.planCells, db.planSnapshots],
    async () => {
      await db.meals.where({ profileId }).delete();
      await db.planCells.where({ profileId }).delete();
      await db.meals.bulkAdd(data.meals.map((m) => ({ ...m, profileId })));
      await db.planCells.bulkAdd(
        data.cells.map((c) => ({ ...c, profileId })),
      );
      await snapshotPlanWithinTx(profileId);
    },
  );
}

export async function importRecipes(
  profileId: ID,
  data: RecipesExport,
): Promise<void> {
  if (data?.kind !== "recipes")
    throw new Error("Archivo no es un set de recetas válido.");
  const db = getDB();
  await db.transaction("rw", [db.recipes, db.recipeSnapshots], async () => {
    await db.recipes.where({ profileId }).delete();
    await db.recipes.bulkAdd(
      data.recipes.map((r) => ({ ...r, profileId, updatedAt: Date.now() })),
    );
    await snapshotRecipesWithinTx(profileId);
  });
}

// ─── Full backup (all profiles, no historical snapshots) ──────────────────
//
// The "full backup" is the user's portable data: every profile and the
// global catalog. It deliberately excludes `planSnapshots` and
// `recipeSnapshots`, which are *device-local history*. Restoring a backup
// on a different device must not pollute that device's history.
//
// v1 backups: per-profile catalog (foods/groups/units/quantities had
//             profileId). The first profile's catalog is used as the base
//             when restoring; references in plan/recipes/forbidden of
//             other profiles are remapped by group key / food name.
// v2 backups: global catalog + global freeUseFoods. Plan/recipes/
//             forbidden/scheduled/drafts remain per-profile.

export const FULL_BACKUP_VERSION = 2 as const;

export interface FullBackup {
  kind: "nutricion-mcz/full";
  version: 1 | typeof FULL_BACKUP_VERSION;
  exportedAt: string;
  profiles: Profile[];
  /** Global since v2 (legacy v1 had per-profile rows with `profileId`). */
  groups: (FoodGroup & { profileId?: string })[];
  foods: (Food & { profileId?: string })[];
  meals: Meal[];
  planCells: PlanCell[];
  recipes: Recipe[];
  unitTypes: (UnitType & { profileId?: string })[];
  quantityOptions: (QuantityOption & { profileId?: string })[];
  /** Optional for backwards compat with older backups. */
  forbiddenItems?: ForbiddenItem[];
  /** Optional for backwards compat with v1 backups. */
  scheduledRecipes?: ScheduledRecipe[];
  recipeDrafts?: RecipeDraft[];
  /** v2+ global free-use foods. */
  freeUseFoods?: FreeUseFood[];
}

export interface BackupCounts {
  profiles: number;
  groups: number;
  foods: number;
  meals: number;
  planCells: number;
  recipes: number;
  unitTypes: number;
  quantityOptions: number;
  forbiddenItems: number;
  freeUseFoods: number;
}

export function backupCounts(b: FullBackup): BackupCounts {
  return {
    profiles: b.profiles.length,
    groups: b.groups.length,
    foods: b.foods.length,
    meals: b.meals.length,
    planCells: b.planCells.length,
    recipes: b.recipes.length,
    unitTypes: b.unitTypes.length,
    quantityOptions: b.quantityOptions.length,
    forbiddenItems: b.forbiddenItems?.length ?? 0,
    freeUseFoods: b.freeUseFoods?.length ?? 0,
  };
}

/** Snapshot of every user-editable table across all profiles + global catalog. */
export async function exportAllData(): Promise<FullBackup> {
  const db = getDB();
  const [
    profiles,
    groups,
    foods,
    meals,
    planCells,
    recipes,
    unitTypes,
    quantityOptions,
    forbiddenItems,
    scheduledRecipes,
    recipeDrafts,
    freeUseFoods,
  ] = await Promise.all([
    db.profiles.toArray(),
    db.groups.toArray(),
    db.foods.toArray(),
    db.meals.toArray(),
    db.planCells.toArray(),
    db.recipes.toArray(),
    db.unitTypes.toArray(),
    db.quantityOptions.toArray(),
    db.forbiddenItems.toArray(),
    db.scheduledRecipes.toArray(),
    db.recipeDrafts.toArray(),
    db.freeUseFoods.toArray(),
  ]);
  return {
    kind: "nutricion-mcz/full",
    version: FULL_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    profiles,
    groups,
    foods,
    meals,
    planCells,
    recipes,
    unitTypes,
    quantityOptions,
    forbiddenItems,
    scheduledRecipes,
    recipeDrafts,
    freeUseFoods,
  };
}

/** Validates the shape of a parsed JSON object. Throws on mismatch. */
export function assertFullBackup(value: unknown): asserts value is FullBackup {
  if (!value || typeof value !== "object") {
    throw new Error("El archivo no es un respaldo válido.");
  }
  const v = value as Partial<FullBackup>;
  if (v.kind !== "nutricion-mcz/full") {
    throw new Error("El archivo no es un respaldo de Nutrición MCZ.");
  }
  if (typeof v.version !== "number") {
    throw new Error("El respaldo no declara versión.");
  }
  if (v.version > FULL_BACKUP_VERSION) {
    throw new Error(
      `El respaldo es de una versión más reciente (v${v.version}) que esta app (v${FULL_BACKUP_VERSION}). Actualiza la app para abrirlo.`,
    );
  }
  const tables: (keyof FullBackup)[] = [
    "profiles",
    "groups",
    "foods",
    "meals",
    "planCells",
    "recipes",
    "unitTypes",
    "quantityOptions",
  ];
  for (const t of tables) {
    if (!Array.isArray(v[t])) {
      throw new Error(`El respaldo está incompleto: falta "${t}".`);
    }
  }
}

export type ImportMode = "replace" | "merge";

/**
 * Migrates a v1 backup payload (per-profile catalog) into the v2 shape
 * (global catalog). Picks the first profile by createdAt as the base,
 * drops other profiles' catalog rows, and remaps references in plan /
 * recipes / forbidden / scheduled / drafts by group key + food name.
 */
function migrateV1BackupToV2(b: FullBackup): FullBackup {
  if (b.version !== 1) return b;
  const norm = (s: string) =>
    s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

  if (b.profiles.length === 0) {
    return { ...b, version: FULL_BACKUP_VERSION, freeUseFoods: [] };
  }
  const baseProfileId = b.profiles
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt)[0]!.id;

  const baseGroups = b.groups.filter((g) => g.profileId === baseProfileId);
  const baseFoods = b.foods.filter((f) => f.profileId === baseProfileId);
  const baseUnits = b.unitTypes.filter((u) => u.profileId === baseProfileId);
  const baseQtys = b.quantityOptions.filter(
    (q) => q.profileId === baseProfileId,
  );

  const groupByIdAll = new Map(b.groups.map((g) => [g.id, g]));
  const baseGroupByKey = new Map(baseGroups.map((g) => [g.key, g]));
  const baseFoodByGroupAndName = new Map<string, Food>();
  for (const f of baseFoods) {
    const g = groupByIdAll.get(f.groupId);
    if (!g) continue;
    baseFoodByGroupAndName.set(`${g.key}::${norm(f.name)}`, f);
  }
  const baseFoodByName = new Map(baseFoods.map((f) => [norm(f.name), f]));

  const groupIdMap = new Map<string, string>();
  for (const g of b.groups) {
    if (g.profileId === baseProfileId) groupIdMap.set(g.id, g.id);
    else {
      const base = baseGroupByKey.get(g.key);
      if (base) groupIdMap.set(g.id, base.id);
    }
  }
  const foodIdMap = new Map<string, string>();
  for (const f of b.foods) {
    if (f.profileId === baseProfileId) {
      foodIdMap.set(f.id, f.id);
      continue;
    }
    const legacyGroup = groupByIdAll.get(f.groupId);
    const byGroup = legacyGroup
      ? baseFoodByGroupAndName.get(`${legacyGroup.key}::${norm(f.name)}`)
      : undefined;
    const match = byGroup ?? baseFoodByName.get(norm(f.name));
    if (match) foodIdMap.set(f.id, match.id);
  }

  const remapItems = <T extends { items: { foodId: string; amount: number }[] }>(
    rows: T[],
  ): T[] =>
    rows.map((r) => ({
      ...r,
      items: r.items
        .map((it) => {
          const next = foodIdMap.get(it.foodId);
          return next ? { foodId: next, amount: it.amount } : null;
        })
        .filter((x): x is { foodId: string; amount: number } => x !== null),
    }));

  const planCells = b.planCells
    .map((c) => ({ ...c, groupId: groupIdMap.get(c.groupId) ?? "" }))
    .filter((c) => c.groupId !== "");

  const forbiddenItems = (b.forbiddenItems ?? []).flatMap<ForbiddenItem>((it) => {
    if (!it.ref) return [it];
    if (it.kind === "group") {
      const next = groupIdMap.get(it.ref);
      return next ? [{ ...it, ref: next }] : [];
    }
    if (it.kind === "food") {
      const next = foodIdMap.get(it.ref);
      return next ? [{ ...it, ref: next }] : [];
    }
    return [it];
  });

  const stripPid = <T extends object>(rows: T[]): T[] =>
    rows.map((r) => {
      const copy = { ...r } as T & { profileId?: string };
      delete copy.profileId;
      return copy as T;
    });

  return {
    ...b,
    version: FULL_BACKUP_VERSION,
    groups: stripPid(baseGroups) as FoodGroup[],
    foods: stripPid(baseFoods) as Food[],
    unitTypes: stripPid(baseUnits) as UnitType[],
    quantityOptions: stripPid(baseQtys) as QuantityOption[],
    planCells,
    recipes: remapItems(b.recipes),
    scheduledRecipes: remapItems(b.scheduledRecipes ?? []),
    recipeDrafts: remapItems(b.recipeDrafts ?? []),
    forbiddenItems,
    freeUseFoods: [],
  };
}

/**
 * Restores a full backup.
 *   - "replace" wipes the user-editable tables before bulk-inserting the
 *     backup. Device-local snapshots are NOT touched.
 *   - "merge" performs an upsert by id (last-wins) and adds new rows.
 *     Per-profile tables of profiles NOT present in the backup are kept.
 */
export async function importAllData(
  data: FullBackup,
  opts: { mode: ImportMode } = { mode: "replace" },
): Promise<BackupCounts> {
  assertFullBackup(data);
  const migrated = migrateV1BackupToV2(data);
  const db = getDB();
  await db.transaction(
    "rw",
    [
      db.profiles,
      db.groups,
      db.foods,
      db.meals,
      db.planCells,
      db.recipes,
      db.unitTypes,
      db.quantityOptions,
      db.forbiddenItems,
      db.scheduledRecipes,
      db.recipeDrafts,
      db.freeUseFoods,
    ],
    async () => {
      const forbidden = migrated.forbiddenItems ?? [];
      const scheduled = migrated.scheduledRecipes ?? [];
      const drafts = migrated.recipeDrafts ?? [];
      const free = migrated.freeUseFoods ?? [];
      if (opts.mode === "replace") {
        await Promise.all([
          db.profiles.clear(),
          db.groups.clear(),
          db.foods.clear(),
          db.meals.clear(),
          db.planCells.clear(),
          db.recipes.clear(),
          db.unitTypes.clear(),
          db.quantityOptions.clear(),
          db.forbiddenItems.clear(),
          db.scheduledRecipes.clear(),
          db.recipeDrafts.clear(),
          db.freeUseFoods.clear(),
        ]);
        await db.profiles.bulkAdd(migrated.profiles);
        await db.groups.bulkAdd(migrated.groups as FoodGroup[]);
        await db.foods.bulkAdd(migrated.foods as Food[]);
        await db.meals.bulkAdd(migrated.meals);
        await db.planCells.bulkAdd(migrated.planCells);
        await db.recipes.bulkAdd(migrated.recipes);
        await db.unitTypes.bulkAdd(migrated.unitTypes as UnitType[]);
        await db.quantityOptions.bulkAdd(
          migrated.quantityOptions as QuantityOption[],
        );
        if (forbidden.length > 0) await db.forbiddenItems.bulkAdd(forbidden);
        if (scheduled.length > 0) await db.scheduledRecipes.bulkAdd(scheduled);
        if (drafts.length > 0) await db.recipeDrafts.bulkAdd(drafts);
        if (free.length > 0) await db.freeUseFoods.bulkAdd(free);
      } else {
        await db.profiles.bulkPut(migrated.profiles);
        await db.groups.bulkPut(migrated.groups as FoodGroup[]);
        await db.foods.bulkPut(migrated.foods as Food[]);
        await db.meals.bulkPut(migrated.meals);
        await db.planCells.bulkPut(migrated.planCells);
        await db.recipes.bulkPut(migrated.recipes);
        await db.unitTypes.bulkPut(migrated.unitTypes as UnitType[]);
        await db.quantityOptions.bulkPut(
          migrated.quantityOptions as QuantityOption[],
        );
        if (forbidden.length > 0) await db.forbiddenItems.bulkPut(forbidden);
        if (scheduled.length > 0) await db.scheduledRecipes.bulkPut(scheduled);
        if (drafts.length > 0) await db.recipeDrafts.bulkPut(drafts);
        if (free.length > 0) await db.freeUseFoods.bulkPut(free);
      }
    },
  );
  return backupCounts(migrated);
}

// ─── Scheduled recipes (calendarised) ─────────────────────────────────────

/** List scheduled recipes for a profile in [from, to?] (ISO YYYY-MM-DD). */
export async function listScheduledRecipes(
  profileId: ID,
  from?: string,
  to?: string,
): Promise<ScheduledRecipe[]> {
  const all = await getDB()
    .scheduledRecipes.where("profileId")
    .equals(profileId)
    .toArray();
  return all
    .filter((r) => (!from || r.date >= from) && (!to || r.date <= to))
    .sort((a, b) =>
      a.date === b.date ? a.mealId.localeCompare(b.mealId) : a.date.localeCompare(b.date),
    );
}

export async function getScheduledRecipe(
  profileId: ID,
  mealId: ID,
  date: string,
): Promise<ScheduledRecipe | undefined> {
  return getDB()
    .scheduledRecipes.where("[profileId+date+mealId]")
    .equals([profileId, date, mealId])
    .first();
}

export async function upsertScheduledRecipe(
  input: {
    profileId: ID;
    mealId: ID;
    date: string;
    items: RecipeItem[];
    title?: string;
    preparation?: string[];
    notes?: string;
    source: "manual" | "ai";
    /** When true, clears the `needsReview` flag. */
    markReviewed?: boolean;
  },
): Promise<ScheduledRecipe> {
  const db = getDB();
  const existing = await getScheduledRecipe(
    input.profileId,
    input.mealId,
    input.date,
  );
  const now = Date.now();
  const saved: ScheduledRecipe = existing
    ? {
        ...existing,
        items: input.items,
        title: input.title ?? existing.title,
        preparation: input.preparation ?? existing.preparation,
        notes: input.notes ?? existing.notes,
        source: input.source,
        needsReview: input.markReviewed ? false : existing.needsReview,
        updatedAt: now,
      }
    : {
        id: uid(),
        profileId: input.profileId,
        mealId: input.mealId,
        date: input.date,
        items: input.items,
        title: input.title,
        preparation: input.preparation,
        notes: input.notes,
        source: input.source,
        needsReview: false,
        createdAt: now,
        updatedAt: now,
      };
  await db.scheduledRecipes.put(saved);
  return saved;
}

export async function markScheduledRecipeReviewed(id: ID): Promise<void> {
  await getDB().scheduledRecipes.update(id, { needsReview: false });
}

export async function deleteScheduledRecipe(id: ID): Promise<void> {
  await getDB().scheduledRecipes.delete(id);
}

/** Sets `needsReview = true` on every scheduled recipe with `date >= fromDate`
 *  for the given profile. Returns the number of recipes flagged. */
export async function markScheduledRecipesNeedingReview(
  profileId: ID,
  fromDate: string,
): Promise<number> {
  const db = getDB();
  let count = 0;
  await db.transaction("rw", db.scheduledRecipes, async () => {
    const all = await db.scheduledRecipes
      .where("profileId")
      .equals(profileId)
      .toArray();
    const toFlag = all.filter((r) => r.date >= fromDate && !r.needsReview);
    for (const r of toFlag) {
      await db.scheduledRecipes.update(r.id, { needsReview: true });
    }
    count = toFlag.length;
  });
  return count;
}

/** Count of scheduled recipes pending user review (date >= today). */
export async function countNeedsReview(profileId: ID): Promise<number> {
  const today = todayISO();
  const all = await getDB()
    .scheduledRecipes.where("profileId")
    .equals(profileId)
    .toArray();
  return all.filter((r) => r.needsReview === true && r.date >= today).length;
}

// ─── Recipe drafts (autosave) ─────────────────────────────────────────────
//
// Drafts are keyed by destination so there is at most one draft per
// (profile, meal, date). Use `date = null` for the per-meal template editor
// (no calendarised target).

function draftId(profileId: ID, mealId: ID, date: string | null): ID {
  return `${profileId}:${mealId}:${date ?? "template"}`;
}

export async function getRecipeDraft(
  profileId: ID,
  mealId: ID,
  date: string | null,
): Promise<RecipeDraft | undefined> {
  return getDB().recipeDrafts.get(draftId(profileId, mealId, date));
}

export async function saveRecipeDraft(input: {
  profileId: ID;
  mealId: ID;
  date: string | null;
  items: RecipeItem[];
  title?: string;
  preparation?: string[];
}): Promise<void> {
  const id = draftId(input.profileId, input.mealId, input.date);
  const draft: RecipeDraft = {
    id,
    profileId: input.profileId,
    mealId: input.mealId,
    date: input.date,
    items: input.items,
    title: input.title,
    preparation: input.preparation,
    updatedAt: Date.now(),
  };
  await getDB().recipeDrafts.put(draft);
}

export async function clearRecipeDraft(
  profileId: ID,
  mealId: ID,
  date: string | null,
): Promise<void> {
  await getDB().recipeDrafts.delete(draftId(profileId, mealId, date));
}
