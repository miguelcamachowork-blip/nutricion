import type { Food, ID, Recipe } from "@/lib/types";
import { addPortion, toQuarter } from "./portions";

/** Amount-in-units → portions, given the food's "1 portion = N units" rate. */
export function amountToPortions(amount: number, food: Food): number {
  if (!food.quantity || food.quantity <= 0) return 0;
  return toQuarter(amount / food.quantity);
}

/** Aggregate the portions a recipe contributes per group. */
export function recipePortionsByGroup(
  recipe: Recipe,
  foods: Map<ID, Food>,
): Map<ID, number> {
  const out = new Map<ID, number>();
  for (const it of recipe.items) {
    const f = foods.get(it.foodId);
    if (!f) continue;
    const p = amountToPortions(it.amount, f);
    out.set(f.groupId, addPortion(out.get(f.groupId) ?? 0, p));
  }
  return out;
}
