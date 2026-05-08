"use client";

import { use, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useActiveProfileStore } from "@/hooks/useActiveProfile";
import { RecipeEditor } from "@/components/app/RecipeEditor";

/**
 * Editor for a recipe scheduled on a specific calendar date. Saves into the
 * `scheduledRecipes` table (independent from the per-meal template `recipes`).
 */
export default function CalendarioRecetaPage({
  params,
}: {
  params: Promise<{ date: string; mealId: string }>;
}) {
  const { date: rawDate, mealId: rawMealId } = use(params);
  const date = useMemo(() => decodeURIComponent(rawDate), [rawDate]);
  const mealId = useMemo(() => {
    try {
      return decodeURIComponent(rawMealId);
    } catch {
      return rawMealId;
    }
  }, [rawMealId]);
  const router = useRouter();
  const profileId = useActiveProfileStore((s) => s.activeProfileId)!;

  // Basic guard: the date must be a YYYY-MM-DD string.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return (
      <div className="p-6 text-sm text-[var(--muted-foreground)]">
        Fecha inválida.
      </div>
    );
  }

  return (
    <RecipeEditor
      profileId={profileId}
      target={{ kind: "scheduled", mealId, date }}
      backHref={`/recetas?date=${date}`}
      onSaved={() => router.push(`/recetas?date=${date}`)}
    />
  );
}
