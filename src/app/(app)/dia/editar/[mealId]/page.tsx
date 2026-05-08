"use client";

import { use, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useActiveProfileStore } from "@/hooks/useActiveProfile";
import { RecipeEditor } from "@/components/app/RecipeEditor";

/**
 * Per-meal template recipe editor (the "default" recipe for a meal slot,
 * not tied to any calendar date). For calendarised recipes, see
 * `/recetas/calendario/[date]/[mealId]`.
 */
export default function EditarRecetaPage({
  params,
}: {
  params: Promise<{ mealId: string }>;
}) {
  const { mealId: rawMealId } = use(params);
  const mealId = useMemo(() => {
    try {
      return decodeURIComponent(rawMealId);
    } catch {
      return rawMealId;
    }
  }, [rawMealId]);
  const router = useRouter();
  const profileId = useActiveProfileStore((s) => s.activeProfileId)!;

  return (
    <RecipeEditor
      profileId={profileId}
      target={{ kind: "template", mealId }}
      backHref="/dia"
      onSaved={() => router.push("/dia")}
    />
  );
}
