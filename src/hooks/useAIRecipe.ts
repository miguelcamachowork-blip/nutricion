"use client";

import { useState } from "react";
import { applyAIRecipe } from "@/lib/ai/applyResult";
import type { AIMealContext } from "@/lib/ai/buildContext";
import type { AIRecipe } from "@/lib/ai/schema";
import type { Food, FoodGroup, RecipeItem } from "@/lib/types";

export interface AISuggestionResult {
  items: RecipeItem[];
  title?: string;
  preparation?: string[];
  notes?: string;
  unresolved: ReturnType<typeof applyAIRecipe>["unresolved"];
  provider: "gemini" | "groq";
}

/**
 * Client hook that POSTs a meal context to `/api/ai/recipe` and resolves
 * the AI's response into concrete `RecipeItem`s using the local food
 * catalog. Surfaces loading/error state so callers can render UI cleanly.
 */
export function useAIRecipe() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function suggest(args: {
    context: AIMealContext;
    foods: Food[];
    groups: FoodGroup[];
  }): Promise<AISuggestionResult> {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: args.context }),
      });
      const data = (await res.json()) as
        | { recipe: AIRecipe; provider: "gemini" | "groq" }
        | { error: string };
      if (!res.ok) {
        const msg =
          "error" in data
            ? data.error
            : `Error HTTP ${res.status}`;
        throw new Error(msg);
      }
      if (!("recipe" in data)) throw new Error("Respuesta inválida");

      const groupNameById = new Map(args.groups.map((g) => [g.id, g.label]));
      const { items, unresolved } = applyAIRecipe(
        data.recipe,
        args.foods,
        groupNameById,
      );
      return {
        items,
        title: data.recipe.title,
        preparation: data.recipe.preparation,
        notes: data.recipe.notes,
        unresolved,
        provider: data.provider,
      };
    } catch (err) {
      const msg = (err as Error).message ?? "Error desconocido";
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  return { suggest, loading, error };
}
