import type {
  Food,
  FoodGroup,
  ForbiddenItem,
  FreeUseFood,
  Meal,
  PlanCell,
  UnitType,
} from "@/lib/types";
import { partitionForbidden } from "@/lib/db/repos";

/**
 * Compact, deterministic snapshot of everything the LLM needs to suggest a
 * recipe for a single meal: the per-group portion targets, the catalog of
 * usable foods (with units), and an explicit list of forbidden items.
 *
 * We *do not* send the user's existing recipe items here — the editor
 * applies AI output as a fresh suggestion the user can review.
 */
export interface AIMealContext {
  meal: { id: string; label: string; time?: string };
  date?: string;
  groupTargets: Array<{
    groupId: string;
    groupName: string;
    portions: number;
    foods: Array<{
      id: string;
      name: string;
      /** quantity in `unit` that equals 1 portion */
      portionAmount: number;
      unit: string;
    }>;
  }>;
  forbiddenFoodNames: string[];
  forbiddenGroupNames: string[];
  /** Foods the user wants the recipe to include (must come from groupTargets). */
  forcedFoods: Array<{ groupName: string; foodName: string }>;
  /** Optional condiments/flavorings the AI may use without counting portions. */
  freeUseFoods: string[];
}

export function buildMealContext(input: {
  meal: Pick<Meal, "id" | "label" | "time">;
  groups: FoodGroup[];
  foods: Food[];
  units: UnitType[];
  plan: Pick<PlanCell, "mealId" | "groupId" | "portions">[];
  forbidden: ForbiddenItem[];
  date?: string;
  forcedFoodIds?: string[];
  freeUseFoods?: FreeUseFood[];
}): AIMealContext {
  const {
    meal,
    groups,
    foods,
    units,
    plan,
    forbidden,
    date,
    forcedFoodIds,
    freeUseFoods,
  } = input;
  const { groupIds: forbiddenGroupIds, foodIds: forbiddenFoodIds } =
    partitionForbidden(forbidden);

  const unitById = new Map(units.map((u) => [u.id, u]));
  const planByGroup = new Map<string, number>();
  for (const c of plan) {
    if (c.mealId === meal.id) planByGroup.set(c.groupId, c.portions);
  }

  const groupTargets = groups
    .filter(
      (g) => !forbiddenGroupIds.has(g.id) && (planByGroup.get(g.id) ?? 0) > 0,
    )
    .map((g) => ({
      groupId: g.id,
      groupName: g.label,
      portions: planByGroup.get(g.id) ?? 0,
      foods: foods
        .filter((f) => f.groupId === g.id && !forbiddenFoodIds.has(f.id))
        .map((f) => ({
          id: f.id,
          name: f.name,
          portionAmount: f.quantity,
          unit: unitById.get(f.unitId)?.label ?? "",
        })),
    }))
    .filter((g) => g.foods.length > 0);

  const forbiddenFoodNames = foods
    .filter((f) => forbiddenFoodIds.has(f.id))
    .map((f) => f.name);
  const forbiddenGroupNames = groups
    .filter((g) => forbiddenGroupIds.has(g.id))
    .map((g) => g.label);

  // Resolve forced foods: must exist in groupTargets (i.e. catalog,
  // planned for this meal, not forbidden). Silently drop ineligible ones.
  const groupNameById = new Map(groups.map((g) => [g.id, g.label]));
  const eligibleFoodIds = new Set(
    groupTargets.flatMap((g) => g.foods.map((f) => f.id)),
  );
  const forcedFoods: AIMealContext["forcedFoods"] = [];
  for (const fid of forcedFoodIds ?? []) {
    if (!eligibleFoodIds.has(fid)) continue;
    const food = foods.find((f) => f.id === fid);
    if (!food) continue;
    const groupName = groupNameById.get(food.groupId);
    if (!groupName) continue;
    forcedFoods.push({ groupName, foodName: food.name });
  }

  const forbiddenSet = new Set(
    forbiddenFoodNames.map((n) => n.toLowerCase().trim()),
  );
  const freeUseList = (freeUseFoods ?? [])
    .map((f) => f.name)
    .filter((n) => !forbiddenSet.has(n.toLowerCase().trim()));

  return {
    meal: { id: meal.id, label: meal.label, time: meal.time },
    date,
    groupTargets,
    forbiddenFoodNames,
    forbiddenGroupNames,
    forcedFoods,
    freeUseFoods: freeUseList,
  };
}
