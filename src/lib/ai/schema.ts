import { z } from "zod";

/**
 * Schema the LLM must adhere to. We deliberately keep it small:
 *  - `items` references foods by exact display name from the catalog we
 *    sent in the prompt (the server later resolves them to `foodId`).
 *  - `amount` is in the same unit the food's `quantity` is defined with;
 *    the server converts to portions.
 *  - `freeUse: true` marks an item that is not part of the catalog
 *    (water, ice, spices...) — `amount` may be 0 and the resolver does
 *    NOT try to map it to a real `Food`. Such items are surfaced only as
 *    notes in `preparation`.
 *  - `title` and `preparation` are optional human-friendly metadata.
 *
 * Anything not validated by this schema is rejected and the caller can
 * choose to retry with the alternate provider.
 */
export const aiRecipeItemSchema = z.object({
  groupName: z.string().min(1),
  foodName: z.string().min(1),
  amount: z.number().nonnegative().finite(),
  freeUse: z.boolean().optional(),
});

export const aiRecipeSchema = z.object({
  title: z.string().optional(),
  items: z.array(aiRecipeItemSchema).min(1),
  preparation: z.array(z.string().min(1)).max(20).optional(),
  notes: z.string().optional(),
});

export type AIRecipeItem = z.infer<typeof aiRecipeItemSchema>;
export type AIRecipe = z.infer<typeof aiRecipeSchema>;
