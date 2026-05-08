import { NextResponse } from "next/server";
import { z } from "zod";
import { generateRecipe } from "@/lib/ai/client";

// AI providers may take several seconds; keep the request alive long enough.
export const maxDuration = 30;
// We do not cache anything — every request is unique to the user's plan/foods.
export const dynamic = "force-dynamic";

/**
 * Inbound shape: a fully-built `AIMealContext`. We re-validate it server
 * side to avoid trusting the client; the schema mirrors `AIMealContext`
 * but with looser cardinality (e.g. allow empty `forbidden*` arrays).
 */
const requestSchema = z.object({
  context: z.object({
    meal: z.object({
      id: z.string().min(1),
      label: z.string().min(1),
      time: z.string().optional(),
    }),
    date: z.string().optional(),
    groupTargets: z
      .array(
        z.object({
          groupId: z.string().min(1),
          groupName: z.string().min(1),
          portions: z.number().nonnegative(),
          foods: z.array(
            z.object({
              id: z.string().min(1),
              name: z.string().min(1),
              portionAmount: z.number().positive(),
              unit: z.string(),
            }),
          ),
        }),
      )
      .min(1, "El plan no tiene porciones para este horario"),
    forbiddenFoodNames: z.array(z.string()).default([]),
    forbiddenGroupNames: z.array(z.string()).default([]),
  }),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid request",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  try {
    const { recipe, provider } = await generateRecipe(parsed.data.context);
    return NextResponse.json({ recipe, provider });
  } catch (err) {
    const message = (err as Error).message ?? "Unknown error";
    // Distinguish missing-keys (config error) from runtime failures.
    const isConfig = message.includes("No AI provider available");
    return NextResponse.json(
      { error: message },
      { status: isConfig ? 503 : 502 },
    );
  }
}
