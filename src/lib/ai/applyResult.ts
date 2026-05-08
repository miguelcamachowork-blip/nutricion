import type { Food, RecipeItem } from "@/lib/types";
import type { AIRecipe } from "./schema";

/**
 * Resolves AI-suggested items (which reference foods by name) into
 * concrete `RecipeItem` rows compatible with our recipe model.
 *
 * Matching is done case-insensitively and after stripping diacritics so
 * the LLM can be slightly off without us discarding the suggestion. Items
 * whose food cannot be matched are reported in `unresolved` rather than
 * silently dropped — the UI surfaces them so the user can correct them.
 */
export interface ApplyResult {
  items: RecipeItem[];
  unresolved: Array<{
    groupName: string;
    foodName: string;
    amount: number;
    reason: "unknown-food" | "wrong-group";
  }>;
}

export function applyAIRecipe(
  ai: AIRecipe,
  foods: Food[],
  groupNameById: Map<string, string>,
): ApplyResult {
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .trim();

  const foodByNorm = new Map<string, Food>();
  for (const f of foods) foodByNorm.set(norm(f.name), f);

  const items: RecipeItem[] = [];
  const unresolved: ApplyResult["unresolved"] = [];

  for (const it of ai.items) {
    const food = foodByNorm.get(norm(it.foodName));
    if (!food) {
      unresolved.push({
        groupName: it.groupName,
        foodName: it.foodName,
        amount: it.amount,
        reason: "unknown-food",
      });
      continue;
    }
    const expectedGroupName = groupNameById.get(food.groupId);
    if (
      expectedGroupName &&
      norm(expectedGroupName) !== norm(it.groupName)
    ) {
      // Food exists but in a different group than the AI claimed. Still
      // accept it (we trust the catalog) but mark for review.
      unresolved.push({
        groupName: it.groupName,
        foodName: it.foodName,
        amount: it.amount,
        reason: "wrong-group",
      });
    }
    items.push({ foodId: food.id, amount: it.amount });
  }

  return { items, unresolved };
}
