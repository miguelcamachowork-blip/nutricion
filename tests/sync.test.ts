import { beforeEach, describe, expect, it } from "vitest";
import Dexie from "dexie";
import { _resetDBForTests, getDB } from "@/lib/db/database";
import {
  createProfile,
  upsertRecipe,
  setPlanCell,
  listMeals,
  listGroups,
  listFoods,
  addForbiddenCustom,
} from "@/lib/db/repos";
import {
  applyProfileSnapshot,
  buildProfileSnapshot,
} from "@/lib/sync/snapshot";

beforeEach(async () => {
  await Dexie.delete("nutricion-mcz");
  _resetDBForTests();
});

describe("ProfileSnapshot build/apply", () => {
  it("build → apply (merge) on a wiped DB recreates the profile", async () => {
    const p = await createProfile("Don Miguel");
    const meals = await listMeals(p.id);
    const groups = await listGroups();
    const foods = await listFoods();
    const meal = meals[0]!;
    const group = groups[0]!;
    const food = foods.find((f) => f.groupId === group.id)!;
    await setPlanCell(p.id, meal.id, group.id, 2);
    await upsertRecipe(p.id, meal.id, [{ foodId: food.id, amount: 1 }], {
      title: "Receta de prueba",
    });
    await addForbiddenCustom(p.id, "canela");

    const snap = await buildProfileSnapshot(p.id);
    expect(snap.profile.id).toBe(p.id);
    expect(snap.meals.length).toBe(meals.length);
    expect(snap.recipes.length).toBe(1);
    expect(snap.forbiddenItems.length).toBe(1);
    expect(snap.catalog.groups.length).toBe(groups.length);
    expect(snap.catalog.foods.length).toBe(foods.length);

    // Wipe per-profile tables (catalog stays so the test is realistic).
    const db = getDB();
    await Promise.all([
      db.profiles.clear(),
      db.meals.clear(),
      db.planCells.clear(),
      db.recipes.clear(),
      db.forbiddenItems.clear(),
      db.scheduledRecipes.clear(),
      db.recipeDrafts.clear(),
    ]);

    snap.snapshotVersion = 1;
    const counts = await applyProfileSnapshot(snap, { mode: "merge" });
    expect(counts.recipes).toBe(1);

    const restoredProfile = await db.profiles.get(p.id);
    expect(restoredProfile?.name).toBe("Don Miguel");
    const restoredMeals = await db.meals.where({ profileId: p.id }).toArray();
    expect(restoredMeals.length).toBe(meals.length);
    const restoredRecipe = await db.recipes
      .where("[profileId+mealId]")
      .equals([p.id, meal.id])
      .first();
    expect(restoredRecipe?.title).toBe("Receta de prueba");
    const restoredForbidden = await db.forbiddenItems
      .where({ profileId: p.id })
      .toArray();
    expect(restoredForbidden.length).toBe(1);
  });

  it("merge does not delete data of OTHER profiles", async () => {
    const a = await createProfile("Don Miguel");
    const b = await createProfile("Doña Angela");
    const mealsB = await listMeals(b.id);
    const groups = await listGroups();
    await setPlanCell(b.id, mealsB[0]!.id, groups[0]!.id, 3);

    // Snapshot of A — apply on the same DB; B's data must remain untouched.
    const snap = await buildProfileSnapshot(a.id);
    snap.snapshotVersion = 1;
    await applyProfileSnapshot(snap, { mode: "merge" });

    const cellsB = await getDB().planCells.where({ profileId: b.id }).toArray();
    expect(cellsB.length).toBe(1);
    expect(cellsB[0]!.portions).toBe(3);
  });

  it("replace only deletes the snapshot's profile per-profile rows", async () => {
    const a = await createProfile("Don Miguel");
    const b = await createProfile("Doña Angela");
    const groups = await listGroups();
    const mealsA = await listMeals(a.id);
    const mealsB = await listMeals(b.id);

    await setPlanCell(a.id, mealsA[0]!.id, groups[0]!.id, 2);
    await setPlanCell(b.id, mealsB[0]!.id, groups[0]!.id, 4);

    // Build snapshot of A, then change A locally before applying it back.
    const snap = await buildProfileSnapshot(a.id);
    await setPlanCell(a.id, mealsA[1]!.id, groups[0]!.id, 9);
    snap.snapshotVersion = 1;
    await applyProfileSnapshot(snap, { mode: "replace" });

    const cellsA = await getDB().planCells.where({ profileId: a.id }).toArray();
    // The "9" cell created after the snapshot must be gone in replace mode.
    expect(cellsA.find((c) => c.portions === 9)).toBeUndefined();
    // B's data is untouched.
    const cellsB = await getDB().planCells.where({ profileId: b.id }).toArray();
    expect(cellsB[0]!.portions).toBe(4);
  });
});
