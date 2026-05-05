import { getDB } from "./database";
import { uid, todayISO } from "@/lib/utils";
import { SEED_FOODS, makeSeedFor } from "@/lib/seed";
import type {
  Food,
  FoodGroup,
  ID,
  Meal,
  PlanCell,
  PlanSnapshot,
  Profile,
  QuantityOption,
  Recipe,
  RecipeItem,
  RecipeSnapshot,
  UnitType,
} from "@/lib/types";

// ─── Profiles ─────────────────────────────────────────────────────────────

export async function listProfiles(): Promise<Profile[]> {
  return getDB().profiles.orderBy("createdAt").toArray();
}

export async function createProfile(name: string): Promise<Profile> {
  const db = getDB();
  const profile: Profile = {
    id: uid(),
    name: name.trim() || "Perfil",
    createdAt: Date.now(),
  };
  const seed = makeSeedFor(profile.id);
  const unitIdByLabel = new Map(seed.units.map((u) => [u.label, u.id]));
  const piezasId = unitIdByLabel.get("Piezas")!;
  const foods: Food[] = [];
  for (const g of seed.groups) {
    const list = SEED_FOODS[g.key as keyof typeof SEED_FOODS] ?? [];
    for (const f of list) {
      foods.push({
        id: uid(),
        profileId: profile.id,
        groupId: g.id,
        name: f.name,
        unitId: unitIdByLabel.get(f.unit) ?? piezasId,
        quantity: f.quantity,
      });
    }
  }
  await db.transaction(
    "rw",
    [
      db.profiles,
      db.groups,
      db.meals,
      db.foods,
      db.unitTypes,
      db.quantityOptions,
    ],
    async () => {
      await db.profiles.add(profile);
      await db.groups.bulkAdd(seed.groups);
      await db.meals.bulkAdd(seed.meals);
      await db.unitTypes.bulkAdd(seed.units);
      await db.quantityOptions.bulkAdd(seed.quantities);
      if (foods.length) await db.foods.bulkAdd(foods);
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
      db.groups,
      db.meals,
      db.foods,
      db.planCells,
      db.recipes,
      db.unitTypes,
      db.quantityOptions,
      db.planSnapshots,
      db.recipeSnapshots,
    ],
    async () => {
      await db.profiles.delete(profileId);
      await db.groups.where({ profileId }).delete();
      await db.meals.where({ profileId }).delete();
      await db.foods.where({ profileId }).delete();
      await db.planCells.where({ profileId }).delete();
      await db.recipes.where({ profileId }).delete();
      await db.unitTypes.where({ profileId }).delete();
      await db.quantityOptions.where({ profileId }).delete();
      await db.planSnapshots.where({ profileId }).delete();
      await db.recipeSnapshots.where({ profileId }).delete();
    },
  );
}

export async function renameProfile(id: ID, name: string): Promise<void> {
  await getDB().profiles.update(id, { name });
}

// ─── Groups ───────────────────────────────────────────────────────────────

export async function listGroups(profileId: ID): Promise<FoodGroup[]> {
  const all = await getDB().groups.where("profileId").equals(profileId).toArray();
  return all.sort((a, b) => a.order - b.order);
}

export async function renameGroup(id: ID, label: string): Promise<void> {
  await getDB().groups.update(id, { label });
}

export async function addGroup(
  profileId: ID,
  label: string,
): Promise<FoodGroup> {
  const groups = await listGroups(profileId);
  const order = (groups[groups.length - 1]?.order ?? -1) + 1;
  const g: FoodGroup = {
    id: uid(),
    profileId,
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
export async function reorderGroups(
  profileId: ID,
  orderedIds: ID[],
): Promise<void> {
  const db = getDB();
  await db.transaction("rw", db.groups, async () => {
    await Promise.all(
      orderedIds.map((id, idx) =>
        db.groups.update(id, { order: idx, profileId }),
      ),
    );
  });
}

// ─── Foods ────────────────────────────────────────────────────────────────

export async function listFoods(profileId: ID): Promise<Food[]> {
  return getDB().foods.where("profileId").equals(profileId).toArray();
}

export async function listFoodsByGroup(
  profileId: ID,
  groupId: ID,
): Promise<Food[]> {
  return getDB()
    .foods.where("[profileId+groupId]")
    .equals([profileId, groupId])
    .toArray();
}

export async function addFood(
  profileId: ID,
  groupId: ID,
  name: string,
  unitId: ID,
  quantity: number,
): Promise<Food> {
  const f: Food = { id: uid(), profileId, groupId, name, unitId, quantity };
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

// ─── Units & Quantities ───────────────────────────────────────────────────

export async function listUnits(profileId: ID): Promise<UnitType[]> {
  const all = await getDB()
    .unitTypes.where("profileId")
    .equals(profileId)
    .toArray();
  return all.sort((a, b) => a.order - b.order);
}

export async function addUnit(
  profileId: ID,
  label: string,
): Promise<UnitType> {
  const existing = await listUnits(profileId);
  const order = (existing[existing.length - 1]?.order ?? -1) + 1;
  const u: UnitType = { id: uid(), profileId, label: label.trim(), order };
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
  const inUse = await db.foods
    .where("profileId")
    .equals(u.profileId)
    .filter((f) => f.unitId === id)
    .count();
  if (inUse > 0) {
    throw new Error(`No se puede eliminar: ${inUse} alimento(s) usan esta unidad.`);
  }
  await db.unitTypes.delete(id);
}

export async function listQuantities(
  profileId: ID,
): Promise<QuantityOption[]> {
  const all = await getDB()
    .quantityOptions.where("profileId")
    .equals(profileId)
    .toArray();
  return all.sort((a, b) => a.value - b.value);
}

export async function addQuantity(
  profileId: ID,
  value: number,
): Promise<QuantityOption> {
  const existing = await listQuantities(profileId);
  const dup = existing.find((q) => q.value === value);
  if (dup) return dup;
  const order = (existing[existing.length - 1]?.order ?? -1) + 1;
  const q: QuantityOption = { id: uid(), profileId, value, order };
  await getDB().quantityOptions.add(q);
  return q;
}

export async function deleteQuantity(id: ID): Promise<void> {
  const db = getDB();
  const q = await db.quantityOptions.get(id);
  if (!q) return;
  const candidates = await db.foods
    .where("profileId")
    .equals(q.profileId)
    .toArray();
  const inUse = candidates.filter((f) => f.quantity === q.value).length;
  if (inUse > 0) {
    throw new Error(
      `No se puede eliminar: ${inUse} alimento(s) usan esta cantidad.`,
    );
  }
  await db.quantityOptions.delete(id);
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

// ─── Plan ─────────────────────────────────────────────────────────────────

export async function listPlan(profileId: ID): Promise<PlanCell[]> {
  return getDB().planCells.where("profileId").equals(profileId).toArray();
}

export async function setPlanCell(
  profileId: ID,
  mealId: ID,
  groupId: ID,
  portions: number,
): Promise<void> {
  const db = getDB();
  await db.transaction("rw", [db.planCells, db.planSnapshots], async () => {
    const existing = await db.planCells
      .where("[profileId+mealId+groupId]")
      .equals([profileId, mealId, groupId])
      .first();
    if (existing) {
      if (portions === 0) await db.planCells.delete(existing.id);
      else if (existing.portions !== portions)
        await db.planCells.update(existing.id, { portions });
      else return; // no-op, no snapshot
    } else {
      if (portions === 0) return;
      await db.planCells.add({
        id: uid(),
        profileId,
        mealId,
        groupId,
        portions,
      });
    }
    await snapshotPlanWithinTx(profileId);
  });
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
): Promise<Recipe> {
  const db = getDB();
  let saved: Recipe;
  await db.transaction("rw", [db.recipes, db.recipeSnapshots], async () => {
    const existing = await db.recipes
      .where("[profileId+mealId]")
      .equals([profileId, mealId])
      .first();
    const sameAsBefore =
      existing && JSON.stringify(existing.items) === JSON.stringify(items);
    if (existing) {
      saved = { ...existing, items, updatedAt: Date.now() };
      await db.recipes.put(saved);
    } else {
      saved = {
        id: uid(),
        profileId,
        mealId,
        items,
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

// ─── Partial export / import (per profile) ────────────────────────────────

export interface CatalogExport {
  kind: "catalog";
  version: 1;
  groups: FoodGroup[];
  foods: Food[];
  units: UnitType[];
  quantities: QuantityOption[];
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

export async function exportCatalog(profileId: ID): Promise<CatalogExport> {
  return {
    kind: "catalog",
    version: 1,
    groups: await listGroups(profileId),
    foods: await listFoods(profileId),
    units: await listUnits(profileId),
    quantities: await listQuantities(profileId),
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

/** Imports a catalog by REPLACING the current catalog of `profileId`. */
export async function importCatalog(
  profileId: ID,
  data: CatalogExport,
): Promise<void> {
  if (data?.kind !== "catalog") throw new Error("Archivo no es un catálogo válido.");
  const db = getDB();
  await db.transaction(
    "rw",
    [db.groups, db.foods, db.unitTypes, db.quantityOptions],
    async () => {
      await db.groups.where({ profileId }).delete();
      await db.foods.where({ profileId }).delete();
      await db.unitTypes.where({ profileId }).delete();
      await db.quantityOptions.where({ profileId }).delete();
      await db.groups.bulkAdd(
        data.groups.map((g) => ({ ...g, profileId })),
      );
      await db.foods.bulkAdd(data.foods.map((f) => ({ ...f, profileId })));
      await db.unitTypes.bulkAdd(
        data.units.map((u) => ({ ...u, profileId })),
      );
      await db.quantityOptions.bulkAdd(
        data.quantities.map((q) => ({ ...q, profileId })),
      );
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
// The "full backup" is the user's portable data: every profile and its
// catalog/plan/recipes. It deliberately excludes `planSnapshots` and
// `recipeSnapshots`, which are *device-local history*. Restoring a backup
// on a different device must not pollute that device's history.

export const FULL_BACKUP_VERSION = 1 as const;

export interface FullBackup {
  kind: "nutricion-mcz/full";
  version: typeof FULL_BACKUP_VERSION;
  exportedAt: string;
  profiles: Profile[];
  groups: FoodGroup[];
  foods: Food[];
  meals: Meal[];
  planCells: PlanCell[];
  recipes: Recipe[];
  unitTypes: UnitType[];
  quantityOptions: QuantityOption[];
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
  };
}

/** Snapshot of every user-editable table across all profiles. */
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
  ] = await Promise.all([
    db.profiles.toArray(),
    db.groups.toArray(),
    db.foods.toArray(),
    db.meals.toArray(),
    db.planCells.toArray(),
    db.recipes.toArray(),
    db.unitTypes.toArray(),
    db.quantityOptions.toArray(),
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
 * Restores a full backup.
 *   - "replace" wipes the eight user-editable tables across ALL profiles
 *     before bulk-inserting the backup. Device-local snapshots are NOT
 *     touched.
 *   - "merge" performs an upsert by id (last-wins) and adds new rows.
 */
export async function importAllData(
  data: FullBackup,
  opts: { mode: ImportMode } = { mode: "replace" },
): Promise<BackupCounts> {
  assertFullBackup(data);
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
    ],
    async () => {
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
        ]);
        await db.profiles.bulkAdd(data.profiles);
        await db.groups.bulkAdd(data.groups);
        await db.foods.bulkAdd(data.foods);
        await db.meals.bulkAdd(data.meals);
        await db.planCells.bulkAdd(data.planCells);
        await db.recipes.bulkAdd(data.recipes);
        await db.unitTypes.bulkAdd(data.unitTypes);
        await db.quantityOptions.bulkAdd(data.quantityOptions);
      } else {
        await db.profiles.bulkPut(data.profiles);
        await db.groups.bulkPut(data.groups);
        await db.foods.bulkPut(data.foods);
        await db.meals.bulkPut(data.meals);
        await db.planCells.bulkPut(data.planCells);
        await db.recipes.bulkPut(data.recipes);
        await db.unitTypes.bulkPut(data.unitTypes);
        await db.quantityOptions.bulkPut(data.quantityOptions);
      }
    },
  );
  return backupCounts(data);
}
