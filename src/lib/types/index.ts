// Domain types for Nutrición MCZ.
// Portions are stored in steps of 0.25 (quarters). "Amounts" inside recipes are
// in real units of the food (e.g. 2 piezas, 30 gramos, 1 taza).

export type ID = string;

/** Built-in food group keys. The plan/recipes reference groups by ID, but the
 *  user can rename their `label` and add/remove groups (Otros 1/2/3 + extras). */
export type GroupKey =
  | "VERDURAS"
  | "FRUTAS"
  | "CEREALES"
  | "LEGUMINOSAS"
  | "LECHES"
  | "AOA"
  | "AZUCARES"
  | "ACEITE_A"
  | "ACEITE_B"
  | "OTROS_1"
  | "OTROS_2"
  | "OTROS_3"
  | string;

export interface FoodGroup {
  id: ID;
  profileId: ID;
  key: GroupKey;
  label: string;
  order: number;
  removable: boolean;
  /** Optional note shown under the group title and as a footnote in recipes. */
  note?: string;
}

export interface Food {
  id: ID;
  profileId: ID;
  groupId: ID;
  name: string;
  /** Reference to a UnitType (e.g. Piezas, Gramos). */
  unitId: ID;
  /** Quantity (in the configured unit) equivalent to 1 portion. Steps of 0.25. */
  quantity: number;
  /** When true, the row is locked from editing/deletion in the UI. */
  locked?: boolean;
}

export interface UnitType {
  id: ID;
  profileId: ID;
  label: string;
  order: number;
}

export interface QuantityOption {
  id: ID;
  profileId: ID;
  value: number;
  order: number;
}

export type ForbiddenKind = "food" | "group" | "custom";

/**
 * A "forbidden" item for a profile. Three kinds:
 *   - "food":    `ref` is a Food ID.
 *   - "group":   `ref` is a FoodGroup ID.
 *   - "custom":  free-text label not in the catalog (e.g. "canela").
 */
export interface ForbiddenItem {
  id: ID;
  profileId: ID;
  kind: ForbiddenKind;
  /** Food or Group ID when applicable. Undefined for "custom". */
  ref?: ID;
  /** Free text for "custom"; optional override for food/group display. */
  label?: string;
  createdAt: number;
}

export interface Meal {
  id: ID;
  profileId: ID;
  key: string;
  label: string;
  order: number;
  time?: string;
}

/** A single cell of the planner: portions recommended for a (meal, group). */
export interface PlanCell {
  id: ID;
  profileId: ID;
  mealId: ID;
  groupId: ID;
  portions: number;
}

/** An item in a recipe: a food with the amount in its real units (not portions). */
export interface RecipeItem {
  foodId: ID;
  /** Amount in the food's unit (e.g. 2 piezas, 30 gramos). */
  amount: number;
}

/** A recipe is the *plan to follow* for a given meal. One per (profile, meal). */
export interface Recipe {
  id: ID;
  profileId: ID;
  mealId: ID;
  items: RecipeItem[];
  updatedAt: number;
}

export interface Profile {
  id: ID;
  name: string;
  createdAt: number;
}

// ─── Snapshots (historical baselines) ─────────────────────────────────────
//
// A snapshot is created the first time the user changes the plan or the
// recipes on a given day. If another change happens the same day, the
// existing snapshot is updated in place (deduplication). The "active"
// version on any date is the snapshot with the largest effectiveFrom ≤ date.

export interface PlanSnapshot {
  /** `${profileId}:${effectiveFrom}` */
  id: ID;
  profileId: ID;
  /** ISO date YYYY-MM-DD. */
  effectiveFrom: string;
  cells: Pick<PlanCell, "mealId" | "groupId" | "portions">[];
  createdAt: number;
}

export interface RecipeSnapshot {
  /** `${profileId}:${effectiveFrom}` */
  id: ID;
  profileId: ID;
  effectiveFrom: string;
  recipes: Pick<Recipe, "mealId" | "items">[];
  createdAt: number;
}
