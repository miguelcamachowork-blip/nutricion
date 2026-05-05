import { beforeEach, describe, expect, it } from "vitest";
import Dexie from "dexie";
import { _resetDBForTests, getDB } from "@/lib/db/database";
import {
  createProfile,
  exportAllData,
  importAllData,
  FULL_BACKUP_VERSION,
  assertFullBackup,
} from "@/lib/db/repos";

beforeEach(async () => {
  await Dexie.delete("nutricion-mcz");
  _resetDBForTests();
});

async function snapshotAllTables() {
  const db = getDB();
  const sortById = <T extends { id: string }>(arr: T[]) =>
    [...arr].sort((a, b) => a.id.localeCompare(b.id));
  return {
    profiles: sortById(await db.profiles.toArray()),
    groups: sortById(await db.groups.toArray()),
    foods: sortById(await db.foods.toArray()),
    meals: sortById(await db.meals.toArray()),
    planCells: sortById(await db.planCells.toArray()),
    recipes: sortById(await db.recipes.toArray()),
    unitTypes: sortById(await db.unitTypes.toArray()),
    quantityOptions: sortById(await db.quantityOptions.toArray()),
  };
}

describe("full backup round-trip", () => {
  it("export → wipe → import (replace) recreates identical state", async () => {
    const a = await createProfile("Miguel");
    const b = await createProfile("Andrea");
    expect(a.id).not.toBe(b.id);

    const before = await snapshotAllTables();
    expect(before.profiles).toHaveLength(2);
    expect(before.foods.length).toBeGreaterThan(0);

    const backup = await exportAllData();
    expect(backup.kind).toBe("nutricion-mcz/full");
    expect(backup.version).toBe(FULL_BACKUP_VERSION);

    // Wipe everything across the eight tables and confirm.
    const db = getDB();
    await Promise.all([
      db.profiles.clear(),
      db.groups.clear(),
      db.foods.clear(),
      db.meals.clear(),
      db.planCells.clear(),
      db.recipes.clear(),
      db.unitTypes.clear(),
      db.quantityOptions.clear(),
    ]);
    const wiped = await snapshotAllTables();
    for (const k of Object.keys(wiped) as (keyof typeof wiped)[]) {
      expect(wiped[k]).toEqual([]);
    }

    const counts = await importAllData(backup, { mode: "replace" });
    expect(counts.profiles).toBe(2);

    const after = await snapshotAllTables();
    expect(after).toEqual(before);
  });

  it("does NOT include historical snapshots", async () => {
    await createProfile("X");
    const backup = await exportAllData();
    expect(Object.keys(backup)).not.toContain("planSnapshots");
    expect(Object.keys(backup)).not.toContain("recipeSnapshots");
  });

  it("rejects payloads from a future schema version", () => {
    expect(() =>
      assertFullBackup({
        kind: "nutricion-mcz/full",
        version: 999,
        exportedAt: new Date().toISOString(),
        profiles: [],
        groups: [],
        foods: [],
        meals: [],
        planCells: [],
        recipes: [],
        unitTypes: [],
        quantityOptions: [],
      }),
    ).toThrow(/versión más reciente/);
  });

  it("rejects payloads with the wrong kind", () => {
    expect(() => assertFullBackup({ kind: "other", version: 1 })).toThrow();
  });

  it("merge mode upserts by id without wiping unrelated rows", async () => {
    const a = await createProfile("A");
    const backupA = await exportAllData();

    // Reset DB and create a different profile B.
    await Dexie.delete("nutricion-mcz");
    _resetDBForTests();
    const b = await createProfile("B");

    // Merge backup A on top of B → both profiles should be present.
    await importAllData(backupA, { mode: "merge" });
    const profiles = await getDB().profiles.toArray();
    const ids = profiles.map((p) => p.id).sort();
    expect(ids).toEqual([a.id, b.id].sort());
  });
});
