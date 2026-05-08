import type {
  Food,
  FoodGroup,
  ForbiddenItem,
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
}

export function buildMealContext(input: {
  meal: Pick<Meal, "id" | "label" | "time">;
  groups: FoodGroup[];
  foods: Food[];
  units: UnitType[];
  plan: Pick<PlanCell, "mealId" | "groupId" | "portions">[];
  forbidden: ForbiddenItem[];
  date?: string;
}): AIMealContext {
  const { meal, groups, foods, units, plan, forbidden, date } = input;
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

  return {
    meal: { id: meal.id, label: meal.label, time: meal.time },
    date,
    groupTargets,
    forbiddenFoodNames,
    forbiddenGroupNames,
  };
}
