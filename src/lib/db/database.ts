import Dexie, { type Table } from "dexie";
import type {
  Food,
  FoodGroup,
  Meal,
  PlanCell,
  PlanSnapshot,
  Profile,
  QuantityOption,
  Recipe,
  RecipeSnapshot,
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
        const profilesTable = tx.table<Profile>("profiles");
        const unitsTable = tx.table<UnitType>("unitTypes");
        const qtyTable = tx.table<QuantityOption>("quantityOptions");
        const foodsTable = tx.table<Food & { unitLabel?: string }>("foods");

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
            });
          }
          for (let i = 0; i < defaultQuantities.length; i++) {
            await qtyTable.put({
              id: `${p.id}:q:${i}`,
              profileId: p.id,
              value: defaultQuantities[i],
              order: i,
            });
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
