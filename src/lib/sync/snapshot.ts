// Build & apply per-profile snapshots used by the cloud sync feature.
//
// A snapshot is autonomous: it carries the profile row, its per-profile
// data, and the global catalog rows so that another device can materialise
// the profile without depending on local state.

import { getDB } from "@/lib/db/database";
import {
  PROFILE_SNAPSHOT_KIND,
  PROFILE_SNAPSHOT_VERSION,
  type Food,
  type FoodGroup,
  type ForbiddenItem,
  type FreeUseFood,
  type ID,
  type Meal,
  type PlanCell,
  type Profile,
  type ProfileSnapshot,
  type QuantityOption,
  type Recipe,
  type RecipeDraft,
  type RecipeItem,
  type ScheduledRecipe,
  type UnitType,
} from "@/lib/types";

export type ApplyMode = "replace" | "merge";

/**
 * Builds a `ProfileSnapshot` for the given profile. Reads everything in a
 * single read transaction so the result is internally consistent.
 *
 * `snapshotVersion` is set to 0 here — the server assigns the real number
 * when the snapshot is published.
 */
export async function buildProfileSnapshot(
  profileId: ID,
): Promise<ProfileSnapshot> {
  const db = getDB();
  const profile = await db.profiles.get(profileId);
  if (!profile) {
    throw new Error(`Perfil no encontrado: ${profileId}`);
  }

  const [
    meals,
    planCells,
    recipes,
    scheduledRecipes,
    forbiddenItems,
    recipeDrafts,
    groups,
    foods,
    unitTypes,
    quantityOptions,
    freeUseFoods,
  ] = await Promise.all([
    db.meals.where({ profileId }).toArray(),
    db.planCells.where({ profileId }).toArray(),
    db.recipes.where({ profileId }).toArray(),
    db.scheduledRecipes.where({ profileId }).toArray(),
    db.forbiddenItems.where({ profileId }).toArray(),
    db.recipeDrafts.where({ profileId }).toArray(),
    db.groups.toArray(),
    db.foods.toArray(),
    db.unitTypes.toArray(),
    db.quantityOptions.toArray(),
    db.freeUseFoods.toArray(),
  ]);

  return {
    kind: PROFILE_SNAPSHOT_KIND,
    version: PROFILE_SNAPSHOT_VERSION,
    snapshotVersion: 0,
    publishedAt: new Date().toISOString(),
    profile,
    meals,
    planCells,
    recipes,
    scheduledRecipes,
    forbiddenItems,
    recipeDrafts,
    catalog: {
      groups,
      foods,
      unitTypes,
      quantityOptions,
      freeUseFoods,
    },
  };
}

/** Validates the shape of an unknown payload. Throws on mismatch. */
export function assertProfileSnapshot(
  value: unknown,
): asserts value is ProfileSnapshot {
  if (!value || typeof value !== "object") {
    throw new Error("El snapshot no es un objeto válido.");
  }
  const v = value as Partial<ProfileSnapshot>;
  if (v.kind !== PROFILE_SNAPSHOT_KIND) {
    throw new Error("El snapshot no pertenece a Nutrición MCZ.");
  }
  if (typeof v.version !== "number") {
    throw new Error("El snapshot no declara versión de esquema.");
  }
  if (v.version > PROFILE_SNAPSHOT_VERSION) {
    throw new Error(
      `El snapshot es de una versión más reciente (v${v.version}) que esta app (v${PROFILE_SNAPSHOT_VERSION}). Actualiza la app.`,
    );
  }
  if (!v.profile || typeof (v.profile as Profile).id !== "string") {
    throw new Error("El snapshot no contiene un perfil válido.");
  }
  const arrays: (keyof ProfileSnapshot)[] = [
    "meals",
    "planCells",
    "recipes",
    "scheduledRecipes",
    "forbiddenItems",
    "recipeDrafts",
  ];
  for (const k of arrays) {
    if (!Array.isArray(v[k])) {
      throw new Error(`El snapshot está incompleto: falta "${k}".`);
    }
  }
  const cat = v.catalog as ProfileSnapshot["catalog"] | undefined;
  if (!cat || typeof cat !== "object") {
    throw new Error("El snapshot no contiene catálogo.");
  }
  for (const k of [
    "groups",
    "foods",
    "unitTypes",
    "quantityOptions",
    "freeUseFoods",
  ] as const) {
    if (!Array.isArray(cat[k])) {
      throw new Error(`El catálogo del snapshot está incompleto: falta "${k}".`);
    }
  }
}

export interface ApplyCounts {
  meals: number;
  planCells: number;
  recipes: number;
  scheduledRecipes: number;
  forbiddenItems: number;
  recipeDrafts: number;
  groupsUpserted: number;
  foodsUpserted: number;
  unitTypesUpserted: number;
  quantityOptionsUpserted: number;
  freeUseFoodsUpserted: number;
}

/**
 * Applies a `ProfileSnapshot` to the local database.
 *
 *   - "replace" deletes the profile's per-profile rows and re-inserts the
 *     snapshot's rows. Catalog rows are upserted (never wiped) so other
 *     profiles on this device keep working.
 *   - "merge" upserts every row by id (snapshot wins on conflicts) without
 *     deleting anything local.
 *
 * Local-only history (planSnapshots, recipeSnapshots, autoBackups) is never
 * touched.
 */
export async function applyProfileSnapshot(
  snap: ProfileSnapshot,
  opts: { mode: ApplyMode } = { mode: "merge" },
): Promise<ApplyCounts> {
  assertProfileSnapshot(snap);
  // Remap any catalog ids that already exist locally under a different id
  // (e.g. seeded with different random UUIDs on each device). Without this
  // step, importing a profile from another device would duplicate every
  // catalog row whose natural key already exists locally.
  snap = await normaliseSnapshotForLocalCatalog(snap);
  const profileId = snap.profile.id;
  const db = getDB();

  await db.transaction(
    "rw",
    [
      db.profiles,
      db.meals,
      db.planCells,
      db.recipes,
      db.scheduledRecipes,
      db.forbiddenItems,
      db.recipeDrafts,
      db.groups,
      db.foods,
      db.unitTypes,
      db.quantityOptions,
      db.freeUseFoods,
    ],
    async () => {
      // Profile row + catalog: always upsert (catalog is global).
      await db.profiles.put(snap.profile);
      await db.groups.bulkPut(snap.catalog.groups as FoodGroup[]);
      await db.foods.bulkPut(snap.catalog.foods as Food[]);
      await db.unitTypes.bulkPut(snap.catalog.unitTypes as UnitType[]);
      await db.quantityOptions.bulkPut(
        snap.catalog.quantityOptions as QuantityOption[],
      );
      await db.freeUseFoods.bulkPut(snap.catalog.freeUseFoods as FreeUseFood[]);

      if (opts.mode === "replace") {
        await Promise.all([
          db.meals.where({ profileId }).delete(),
          db.planCells.where({ profileId }).delete(),
          db.recipes.where({ profileId }).delete(),
          db.scheduledRecipes.where({ profileId }).delete(),
          db.forbiddenItems.where({ profileId }).delete(),
          db.recipeDrafts.where({ profileId }).delete(),
        ]);
      }

      await db.meals.bulkPut(snap.meals as Meal[]);
      await db.planCells.bulkPut(snap.planCells as PlanCell[]);
      await db.recipes.bulkPut(snap.recipes as Recipe[]);
      await db.scheduledRecipes.bulkPut(
        snap.scheduledRecipes as ScheduledRecipe[],
      );
      await db.forbiddenItems.bulkPut(snap.forbiddenItems as ForbiddenItem[]);
      await db.recipeDrafts.bulkPut(snap.recipeDrafts as RecipeDraft[]);
    },
  );

  return {
    meals: snap.meals.length,
    planCells: snap.planCells.length,
    recipes: snap.recipes.length,
    scheduledRecipes: snap.scheduledRecipes.length,
    forbiddenItems: snap.forbiddenItems.length,
    recipeDrafts: snap.recipeDrafts.length,
    groupsUpserted: snap.catalog.groups.length,
    foodsUpserted: snap.catalog.foods.length,
    unitTypesUpserted: snap.catalog.unitTypes.length,
    quantityOptionsUpserted: snap.catalog.quantityOptions.length,
    freeUseFoodsUpserted: snap.catalog.freeUseFoods.length,
  };
}

/**
 * Remaps the snapshot's catalog ids onto pre-existing local rows that share
 * the same natural key, and rewrites every per-profile reference so the
 * snapshot can be applied without creating duplicate catalog entries.
 *
 * This is the fix for the "duplicates after pulling on another device" bug:
 * each device seeds its own catalog with locally-generated random UUIDs (for
 * `foods`), so the publisher's ids and the receiver's ids do not match even
 * though the rows describe the same item.
 */
async function normaliseSnapshotForLocalCatalog(
  snap: ProfileSnapshot,
): Promise<ProfileSnapshot> {
  const db = getDB();
  const [localGroups, localFoods, localUnits, localQtys, localFree] =
    await Promise.all([
      db.groups.toArray(),
      db.foods.toArray(),
      db.unitTypes.toArray(),
      db.quantityOptions.toArray(),
      db.freeUseFoods.toArray(),
    ]);

  const norm = (s: string) => s.trim().toLowerCase();

  // Build local indexes by natural key.
  const groupByKey = new Map<string, ID>();
  for (const g of localGroups) groupByKey.set(g.key, g.id);
  const unitByLabel = new Map<string, ID>();
  for (const u of localUnits) unitByLabel.set(norm(u.label), u.id);
  const qtyByValue = new Map<number, ID>();
  for (const q of localQtys) qtyByValue.set(q.value, q.id);
  const freeByName = new Map<string, ID>();
  for (const f of localFree) freeByName.set(norm(f.name), f.id);

  // Remap maps: snapshotId -> localId (only when different).
  const groupRemap = new Map<ID, ID>();
  for (const g of snap.catalog.groups) {
    const localId = groupByKey.get(g.key);
    if (localId && localId !== g.id) groupRemap.set(g.id, localId);
  }
  const unitRemap = new Map<ID, ID>();
  for (const u of snap.catalog.unitTypes) {
    const localId = unitByLabel.get(norm(u.label));
    if (localId && localId !== u.id) unitRemap.set(u.id, localId);
  }
  const qtyRemap = new Map<ID, ID>();
  for (const q of snap.catalog.quantityOptions) {
    const localId = qtyByValue.get(q.value);
    if (localId && localId !== q.id) qtyRemap.set(q.id, localId);
  }
  const freeRemap = new Map<ID, ID>();
  for (const f of snap.catalog.freeUseFoods) {
    const localId = freeByName.get(norm(f.name));
    if (localId && localId !== f.id) freeRemap.set(f.id, localId);
  }

  // Foods are keyed by (group-after-remap, normalised name).
  const remap = (m: Map<ID, ID>, id: ID) => m.get(id) ?? id;
  const foodKey = (groupId: ID, name: string) =>
    `${remap(groupRemap, groupId)}::${norm(name)}`;
  const foodByKey = new Map<string, ID>();
  for (const f of localFoods) foodByKey.set(foodKey(f.groupId, f.name), f.id);

  const foodRemap = new Map<ID, ID>();
  for (const f of snap.catalog.foods) {
    const localId = foodByKey.get(foodKey(f.groupId, f.name));
    if (localId && localId !== f.id) foodRemap.set(f.id, localId);
  }

  if (
    groupRemap.size === 0 &&
    unitRemap.size === 0 &&
    qtyRemap.size === 0 &&
    freeRemap.size === 0 &&
    foodRemap.size === 0
  ) {
    return snap;
  }

  const remapItems = <T extends { items: RecipeItem[] }>(arr: T[]): T[] =>
    arr.map((r) => ({
      ...r,
      items: r.items.map((it) => ({
        ...it,
        foodId: remap(foodRemap, it.foodId),
      })),
    }));

  return {
    ...snap,
    catalog: {
      groups: snap.catalog.groups.map((g) => ({
        ...g,
        id: remap(groupRemap, g.id),
      })),
      foods: snap.catalog.foods.map((f) => ({
        ...f,
        id: remap(foodRemap, f.id),
        groupId: remap(groupRemap, f.groupId),
        unitId: remap(unitRemap, f.unitId),
      })),
      unitTypes: snap.catalog.unitTypes.map((u) => ({
        ...u,
        id: remap(unitRemap, u.id),
      })),
      quantityOptions: snap.catalog.quantityOptions.map((q) => ({
        ...q,
        id: remap(qtyRemap, q.id),
      })),
      freeUseFoods: snap.catalog.freeUseFoods.map((f) => ({
        ...f,
        id: remap(freeRemap, f.id),
      })),
    },
    planCells: snap.planCells.map((c) => ({
      ...c,
      groupId: remap(groupRemap, c.groupId),
    })),
    recipes: remapItems(snap.recipes),
    scheduledRecipes: remapItems(snap.scheduledRecipes),
    recipeDrafts: remapItems(snap.recipeDrafts),
    forbiddenItems: snap.forbiddenItems.map((item) => {
      if (item.kind === "food" && item.ref) {
        return { ...item, ref: remap(foodRemap, item.ref) };
      }
      if (item.kind === "group" && item.ref) {
        return { ...item, ref: remap(groupRemap, item.ref) };
      }
      return item;
    }),
  };
}
