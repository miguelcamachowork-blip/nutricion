import { describe, expect, it } from "vitest";
import {
  amountToPortions,
  formatPortion,
  portionOptions,
  recipePortionsByGroup,
  toQuarter,
} from "@/lib/balance";
import type { Food, ID, Recipe } from "@/lib/types";

describe("portions", () => {
  it("snaps to quarters", () => {
    expect(toQuarter(0.13)).toBe(0.25);
    expect(toQuarter(0.7)).toBe(0.75);
  });

  it("formats with unicode fractions", () => {
    expect(formatPortion(0)).toBe("0");
    expect(formatPortion(0.25)).toBe("¼");
    expect(formatPortion(0.5)).toBe("½");
    expect(formatPortion(1)).toBe("1");
    expect(formatPortion(1.25)).toBe("1¼");
    expect(formatPortion(2.5)).toBe("2½");
  });

  it("portionOptions covers 0..max in quarters", () => {
    const opts = portionOptions(2);
    expect(opts).toEqual([0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]);
  });
});

describe("amountToPortions", () => {
  const food: Food = {
    id: "f1",
    groupId: "g",
    name: "Tortilla",
    unitId: "u",
    quantity: 2, // 2 piezas = 1 porción
  };

  it("converts amount-in-units to portions", () => {
    expect(amountToPortions(2, food)).toBe(1);
    expect(amountToPortions(1, food)).toBe(0.5);
    expect(amountToPortions(3, food)).toBe(1.5);
  });

  it("returns 0 if food.quantity is 0 or missing", () => {
    expect(amountToPortions(2, { ...food, quantity: 0 })).toBe(0);
  });
});

describe("recipePortionsByGroup", () => {
  const G_CER: ID = "g_cer";
  const G_FRU: ID = "g_fru";

  const foods = new Map<ID, Food>([
    [
      "f_tort",
      {
        id: "f_tort",
        groupId: G_CER,
        name: "Tortilla",
        unitId: "u",
        quantity: 2,
      },
    ],
    [
      "f_man",
      {
        id: "f_man",
        groupId: G_FRU,
        name: "Manzana",
        unitId: "u",
        quantity: 1,
      },
    ],
  ]);

  it("aggregates per group", () => {
    const recipe: Recipe = {
      id: "r",
      profileId: "p",
      mealId: "m",
      items: [
        { foodId: "f_tort", amount: 2 }, // 1 porción cereal
        { foodId: "f_tort", amount: 1 }, // 0.5 porción cereal
        { foodId: "f_man", amount: 1 }, // 1 porción fruta
      ],
      updatedAt: 0,
    };
    const out = recipePortionsByGroup(recipe, foods);
    expect(out.get(G_CER)).toBe(1.5);
    expect(out.get(G_FRU)).toBe(1);
  });

  it("ignores items whose food is missing", () => {
    const recipe: Recipe = {
      id: "r",
      profileId: "p",
      mealId: "m",
      items: [
        { foodId: "missing", amount: 999 },
        { foodId: "f_man", amount: 0.5 },
      ],
      updatedAt: 0,
    };
    const out = recipePortionsByGroup(recipe, foods);
    expect(out.get(G_FRU)).toBe(0.5);
    expect(out.size).toBe(1);
  });
});
