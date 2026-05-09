import Dexie, { type Table } from "dexie";
import type {
  Food,
  FoodGroup,
  ForbiddenItem,
  FreeUseFood,
  Meal,
  PlanCell,
  PlanSnapshot,
  Profile,
  QuantityOption,
  Recipe,
  RecipeDraft,
  RecipeSnapshot,
  ScheduledRecipe,
  UnitType,
} from "@/lib/types";

/** A locally-stored automatic backup (rolling, max 7). */
export interface AutoBackupRow {
  id: string;
  createdAt: number;
  /** Stringified `FullBackup` JSON. */
  payload: string;
  /** Approximate size in bytes (length of `payload`). */
  size: number;
}

export class NutricionDB extends Dexie {
  profiles!: Table<Profile, string>;
  groups!: Table<FoodGroup, string>;
  foods!: Table<Food, string>;
  meals!: Table<Meal, string>;
  planCells!: Table<PlanCell, string>;
  recipes!: Table<Recipe, string>;
  unitTypes!: Table<UnitType, string>;
  quantityOptions!: Table<QuantityOption, string>;
  planSnapshots!: Table<PlanSnapshot, string>;
  recipeSnapshots!: Table<RecipeSnapshot, string>;
  backups!: Table<AutoBackupRow, string>;
  forbiddenItems!: Table<ForbiddenItem, string>;
  scheduledRecipes!: Table<ScheduledRecipe, string>;
  recipeDrafts!: Table<RecipeDraft, string>;
  freeUseFoods!: Table<FreeUseFood, string>;

  constructor() {
    super("nutricion-mcz");

    // v1 — original schema (kept verbatim so existing devices can still upgrade).
    this.version(1).stores({
      profiles: "id, name, createdAt",
      groups: "id, profileId, [profileId+order], [profileId+key]",
      foods: "id, profileId, groupId, [profileId+groupId]",
      meals: "id, profileId, [profileId+order]",
      planCells: "id, profileId, mealId, groupId, [profileId+mealId+groupId]",
      recipes:
        "id, profileId, date, mealId, [profileId+date], [profileId+date+mealId]",
      adjustments:
        "id, profileId, date, recipeId, [profileId+date], [profileId+date+groupId]",
      history: "id, profileId, date, [profileId+date]",
    });

    // v2 — added unit/quantity catalogs.
    this.version(2)
      .stores({
        profiles: "id, name, createdAt",
        groups: "id, profileId, [profileId+order], [profileId+key]",
        foods: "id, profileId, groupId, [profileId+groupId]",
        meals: "id, profileId, [profileId+order]",
        planCells: "id, profileId, mealId, groupId, [profileId+mealId+groupId]",
        recipes:
          "id, profileId, date, mealId, [profileId+date], [profileId+date+mealId]",
        adjustments:
          "id, profileId, date, recipeId, [profileId+date], [profileId+date+groupId]",
        history: "id, profileId, date, [profileId+date]",
        unitTypes: "id, profileId, [profileId+order]",
        quantityOptions: "id, profileId, [profileId+order]",
      })
      .upgrade(async (tx) => {
        type LegacyUnit = UnitType & { profileId: string };
        type LegacyQty = QuantityOption & { profileId: string };
        type LegacyFood = Food & { profileId: string; unitLabel?: string };
        const profilesTable = tx.table<Profile>("profiles");
        const unitsTable = tx.table<LegacyUnit>("unitTypes");
        const qtyTable = tx.table<LegacyQty>("quantityOptions");
        const foodsTable = tx.table<LegacyFood>("foods");

        const profiles = await profilesTable.toArray();
        const piezasIdByProfile = new Map<string, string>();
        const defaultUnits = ["Piezas", "Gramos", "Tazas"];
        const defaultQuantities = [0.25, 0.5, 0.75, 1, 1.5, 2, 3];

        for (const p of profiles) {
          const piezasId = `${p.id}:u:0`;
          piezasIdByProfile.set(p.id, piezasId);
          for (let i = 0; i < defaultUnits.length; i++) {
            await unitsTable.put({
              id: `${p.id}:u:${i}`,
              profileId: p.id,
              label: defaultUnits[i],
              order: i,
            } as LegacyUnit);
          }
          for (let i = 0; i < defaultQuantities.length; i++) {
            await qtyTable.put({
              id: `${p.id}:q:${i}`,
              profileId: p.id,
              value: defaultQuantities[i],
              order: i,
            } as LegacyQty);
          }
        }

        await foodsTable.toCollection().modify((f) => {
          const unitId = piezasIdByProfile.get(f.profileId);
          if (unitId) f.unitId = unitId;
          f.quantity = 1;
          delete f.unitLabel;
        });
      });

    // v3 — Simplification:
    //   * Drop `adjustments` and `history` (compliance/transfer features removed).
    //   * Drop `frozen` from meals.
    //   * Recipes are now one-per-(profile, meal) and use amount-in-units instead of portions.
    //   * Add `planSnapshots` and `recipeSnapshots` for historical baselines.
    this.version(3)
      .stores({
        profiles: "id, name, createdAt",
        groups: "id, profileId, [profileId+order], [profileId+key]",
        foods: "id, profileId, groupId, [profileId+groupId]",
        meals: "id, profileId, [profileId+order]",
        planCells: "id, profileId, mealId, groupId, [profileId+mealId+groupId]",
        recipes: "id, profileId, mealId, [profileId+mealId]",
        unitTypes: "id, profileId, [profileId+order]",
        quantityOptions: "id, profileId, [profileId+order]",
        planSnapshots: "id, profileId, effectiveFrom, [profileId+effectiveFrom]",
        recipeSnapshots:
          "id, profileId, effectiveFrom, [profileId+effectiveFrom]",
        adjustments: null,
        history: null,
      })
      .upgrade(async (tx) => {
        // Drop `frozen` from meals.
        const mealsTable = tx.table<Meal & { frozen?: boolean }>("meals");
        await mealsTable.toCollection().modify((m) => {
          delete m.frozen;
        });

        // Convert legacy recipes (one per date) into the new "one per meal"
        // model. We keep the most recent recipe per (profileId, mealId).
        type LegacyRecipe = {
          id: string;
          profileId: string;
          mealId: string;
          date: string;
          items: { foodId: string; groupId: string; portions: number }[];
          createdAt: number;
        };
        const recipesTable = tx.table<LegacyRecipe | Recipe>("recipes");
        const legacy = (await recipesTable.toArray()) as LegacyRecipe[];

        // Pick most recent recipe per (profile, meal).
        const latest = new Map<string, LegacyRecipe>();
        for (const r of legacy) {
          const k = `${r.profileId}::${r.mealId}`;
          const prev = latest.get(k);
          if (!prev || (r.date ?? "") > (prev.date ?? "")) latest.set(k, r);
        }

        await recipesTable.clear();
        for (const r of latest.values()) {
          // Convert items: legacy `portions` was being used as the
          // amount-in-units in the old UI, so we keep it as `amount`.
          const items = r.items.map((it) => ({
            foodId: it.foodId,
            amount: it.portions,
          }));
          await recipesTable.put({
            id: r.id,
            profileId: r.profileId,
            mealId: r.mealId,
            items,
            updatedAt: r.createdAt ?? Date.now(),
          });
        }
      });

    // v4 — Adds the `backups` table for in-app rolling auto-backups.
    this.version(4).stores({
      profiles: "id, name, createdAt",
      groups: "id, profileId, [profileId+order], [profileId+key]",
      foods: "id, profileId, groupId, [profileId+groupId]",
      meals: "id, profileId, [profileId+order]",
      planCells: "id, profileId, mealId, groupId, [profileId+mealId+groupId]",
      recipes: "id, profileId, mealId, [profileId+mealId]",
      unitTypes: "id, profileId, [profileId+order]",
      quantityOptions: "id, profileId, [profileId+order]",
      planSnapshots: "id, profileId, effectiveFrom, [profileId+effectiveFrom]",
      recipeSnapshots:
        "id, profileId, effectiveFrom, [profileId+effectiveFrom]",
      backups: "id, createdAt",
    });

    // v5 — Adds the `forbiddenItems` table (per-profile vetoed foods/groups/custom).
    this.version(5).stores({
      profiles: "id, name, createdAt",
      groups: "id, profileId, [profileId+order], [profileId+key]",
      foods: "id, profileId, groupId, [profileId+groupId]",
      meals: "id, profileId, [profileId+order]",
      planCells: "id, profileId, mealId, groupId, [profileId+mealId+groupId]",
      recipes: "id, profileId, mealId, [profileId+mealId]",
      unitTypes: "id, profileId, [profileId+order]",
      quantityOptions: "id, profileId, [profileId+order]",
      planSnapshots: "id, profileId, effectiveFrom, [profileId+effectiveFrom]",
      recipeSnapshots:
        "id, profileId, effectiveFrom, [profileId+effectiveFrom]",
      backups: "id, createdAt",
      forbiddenItems: "id, profileId, kind, [profileId+kind]",
    });

    // v6 — Adds:
    //   * `scheduledRecipes`: recipes calendarised for a specific date,
    //     independent from the per-meal template `recipes`. Created
    //     manually or by the AI assistant. Carries optional preparation
    //     steps and a `needsReview` flag toggled when the plan changes.
    //   * `recipeDrafts`: auto-saved in-progress edits, keyed by
    //     destination `${profileId}:${mealId}:${date ?? "template"}`.
    this.version(6).stores({
      profiles: "id, name, createdAt",
      groups: "id, profileId, [profileId+order], [profileId+key]",
      foods: "id, profileId, groupId, [profileId+groupId]",
      meals: "id, profileId, [profileId+order]",
      planCells: "id, profileId, mealId, groupId, [profileId+mealId+groupId]",
      recipes: "id, profileId, mealId, [profileId+mealId]",
      unitTypes: "id, profileId, [profileId+order]",
      quantityOptions: "id, profileId, [profileId+order]",
      planSnapshots: "id, profileId, effectiveFrom, [profileId+effectiveFrom]",
      recipeSnapshots:
        "id, profileId, effectiveFrom, [profileId+effectiveFrom]",
      backups: "id, createdAt",
      forbiddenItems: "id, profileId, kind, [profileId+kind]",
      scheduledRecipes:
        "id, profileId, date, mealId, [profileId+date], [profileId+date+mealId]",
      recipeDrafts: "id, profileId, mealId, date, [profileId+mealId+date]",
    });

    // v7 — Globalize the catalog tables (foods, groups, unitTypes,
    //      quantityOptions). They no longer carry `profileId`. The
    //      base profile (active in localStorage, falling back to oldest)
    //      is used as the seed; rows from other profiles are dropped and
    //      their references (planCells, recipes, scheduledRecipes,
    //      recipeDrafts, forbiddenItems) are remapped by group key /
    //      food name. Also adds the global `freeUseFoods` table.
    this.version(7)
      .stores({
        profiles: "id, name, createdAt",
        groups: "id, key, order",
        foods: "id, groupId, name",
        meals: "id, profileId, [profileId+order]",
        planCells:
          "id, profileId, mealId, groupId, [profileId+mealId+groupId]",
        recipes: "id, profileId, mealId, [profileId+mealId]",
        unitTypes: "id, order",
        quantityOptions: "id, value, order",
        planSnapshots:
          "id, profileId, effectiveFrom, [profileId+effectiveFrom]",
        recipeSnapshots:
          "id, profileId, effectiveFrom, [profileId+effectiveFrom]",
        backups: "id, createdAt",
        forbiddenItems: "id, profileId, kind, [profileId+kind]",
        scheduledRecipes:
          "id, profileId, date, mealId, [profileId+date], [profileId+date+mealId]",
        recipeDrafts: "id, profileId, mealId, date, [profileId+mealId+date]",
        freeUseFoods: "id, name, createdAt",
      })
      .upgrade(async (tx) => {
        const norm = (s: string) =>
          s
            .normalize("NFD")
            .replace(/\p{Diacritic}/gu, "")
            .toLowerCase()
            .trim();

        type LegacyGroup = FoodGroup & { profileId: string };
        type LegacyFood = Food & { profileId: string };
        type LegacyUnit = UnitType & { profileId: string };
        type LegacyQty = QuantityOption & { profileId: string };
        type LegacyForbidden = ForbiddenItem;

        const profilesTable = tx.table<Profile>("profiles");
        const groupsTable = tx.table<LegacyGroup>("groups");
        const foodsTable = tx.table<LegacyFood>("foods");
        const unitsTable = tx.table<LegacyUnit>("unitTypes");
        const qtysTable = tx.table<LegacyQty>("quantityOptions");
        const planCellsTable = tx.table<PlanCell>("planCells");
        const recipesTable = tx.table<Recipe>("recipes");
        const schedTable = tx.table<ScheduledRecipe>("scheduledRecipes");
        const draftsTable = tx.table<RecipeDraft>("recipeDrafts");
        const forbTable = tx.table<LegacyForbidden>("forbiddenItems");

        const profiles = await profilesTable.toArray();
        if (profiles.length === 0) {
          // Fresh DB — nothing to migrate. Global catalog will be seeded
          // on bootstrap by `ensureGlobalCatalog()`.
          return;
        }

        // Pick base profile: active id from localStorage, fallback to oldest.
        let baseProfileId: string | null = null;
        try {
          if (typeof localStorage !== "undefined") {
            baseProfileId = localStorage.getItem(
              "nutricion-mcz:activeProfileId",
            );
          }
        } catch {
          /* SSR or denied */
        }
        if (!baseProfileId || !profiles.find((p) => p.id === baseProfileId)) {
          baseProfileId = profiles
            .slice()
            .sort((a, b) => a.createdAt - b.createdAt)[0]!.id;
        }

        const allGroups = await groupsTable.toArray();
        const allFoods = await foodsTable.toArray();
        const allUnits = await unitsTable.toArray();
        const allQtys = await qtysTable.toArray();

        const baseGroups = allGroups.filter((g) => g.profileId === baseProfileId);
        const baseFoods = allFoods.filter((f) => f.profileId === baseProfileId);
        const baseUnits = allUnits.filter((u) => u.profileId === baseProfileId);
        const baseQtys = allQtys.filter((q) => q.profileId === baseProfileId);

        // Build look-up maps for re-mapping references.
        const baseGroupByKey = new Map<string, FoodGroup>();
        for (const g of baseGroups) {
          baseGroupByKey.set(g.key, stripProfile(g));
        }
        const baseFoodByGroupAndName = new Map<string, Food>();
        for (const f of baseFoods) {
          const g = baseGroups.find((bg) => bg.id === f.groupId);
          if (!g) continue;
          baseFoodByGroupAndName.set(`${g.key}::${norm(f.name)}`, stripProfile(f));
        }
        const baseFoodByName = new Map<string, Food>();
        for (const f of baseFoods) {
          baseFoodByName.set(norm(f.name), stripProfile(f));
        }

        // Map each legacy (per-profile) groupId/foodId to the base equivalent.
        const groupIdMap = new Map<string, string>();
        for (const g of allGroups) {
          if (g.profileId === baseProfileId) {
            groupIdMap.set(g.id, g.id);
          } else {
            const base = baseGroupByKey.get(g.key);
            if (base) groupIdMap.set(g.id, base.id);
          }
        }
        const foodIdMap = new Map<string, string>();
        for (const f of allFoods) {
          if (f.profileId === baseProfileId) {
            foodIdMap.set(f.id, f.id);
            continue;
          }
          // Prefer same group + same name; fall back to name-only.
          const legacyGroup = allGroups.find((g) => g.id === f.groupId);
          const byGroup = legacyGroup
            ? baseFoodByGroupAndName.get(`${legacyGroup.key}::${norm(f.name)}`)
            : undefined;
          const match = byGroup ?? baseFoodByName.get(norm(f.name));
          if (match) foodIdMap.set(f.id, match.id);
        }

        // Wipe all tables and rewrite globally.
        await groupsTable.clear();
        await foodsTable.clear();
        await unitsTable.clear();
        await qtysTable.clear();
        await groupsTable.bulkAdd(baseGroups.map(stripProfile) as unknown as LegacyGroup[]);
        await foodsTable.bulkAdd(baseFoods.map(stripProfile) as unknown as LegacyFood[]);
        await unitsTable.bulkAdd(baseUnits.map(stripProfile) as unknown as LegacyUnit[]);
        await qtysTable.bulkAdd(baseQtys.map(stripProfile) as unknown as LegacyQty[]);

        // Re-map references in per-profile tables.
        await planCellsTable.toCollection().modify((c) => {
          const next = groupIdMap.get(c.groupId);
          if (next) c.groupId = next;
        });
        // Drop plan cells whose group could not be remapped.
        const orphanCells = await planCellsTable
          .filter((c) => !groupIdMap.has(c.groupId) && !baseGroups.some((g) => g.id === c.groupId))
          .toArray();
        if (orphanCells.length > 0) {
          await planCellsTable.bulkDelete(orphanCells.map((c) => c.id));
        }

        const remapItems = <T extends { items: { foodId: string; amount: number }[] }>(row: T): void => {
          row.items = row.items
            .map((it) => {
              const next = foodIdMap.get(it.foodId);
              return next ? { foodId: next, amount: it.amount } : null;
            })
            .filter((x): x is { foodId: string; amount: number } => x !== null);
        };

        await recipesTable.toCollection().modify(remapItems);
        await schedTable.toCollection().modify(remapItems);
        await draftsTable.toCollection().modify(remapItems);

        // Re-map forbidden items by ref (food/group). Drop unmatched.
        const allForb = await forbTable.toArray();
        const toDelete: string[] = [];
        for (const it of allForb) {
          if (!it.ref) continue;
          if (it.kind === "group") {
            const next = groupIdMap.get(it.ref);
            if (next) {
              if (next !== it.ref) await forbTable.update(it.id, { ref: next });
            } else {
              toDelete.push(it.id);
            }
          } else if (it.kind === "food") {
            const next = foodIdMap.get(it.ref);
            if (next) {
              if (next !== it.ref) await forbTable.update(it.id, { ref: next });
            } else {
              toDelete.push(it.id);
            }
          }
        }
        if (toDelete.length > 0) await forbTable.bulkDelete(toDelete);

        // Deduplicate forbiddenItems by (profileId, kind, ref) after remap.
        const seen = new Set<string>();
        const dedupDelete: string[] = [];
        for (const it of await forbTable.toArray()) {
          const key = `${it.profileId}::${it.kind}::${it.ref ?? it.label ?? ""}`;
          if (seen.has(key)) dedupDelete.push(it.id);
          else seen.add(key);
        }
        if (dedupDelete.length > 0) await forbTable.bulkDelete(dedupDelete);

        function stripProfile<T extends { profileId?: string }>(row: T): Omit<T, "profileId"> {
          const copy = { ...row } as T & { profileId?: string };
          delete copy.profileId;
          return copy;
        }
      });
  }
}

let _db: NutricionDB | null = null;

export function getDB(): NutricionDB {
  if (!_db) _db = new NutricionDB();
  return _db;
}

/** Test helper: rebuild a fresh in-memory DB. */
export function _resetDBForTests(): NutricionDB {
  if (_db) _db.close();
  _db = new NutricionDB();
  return _db;
}
