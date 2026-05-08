import { GoogleGenAI } from "@google/genai";
import Groq from "groq-sdk";
import { aiRecipeSchema, type AIRecipe } from "./schema";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompts";
import type { AIMealContext } from "./buildContext";

/**
 * Generates a recipe by trying Gemini 2.5 Flash first (free quota +
 * native JSON mode) and falling back to Groq Llama 3.3 70B if Gemini is
 * unavailable, errors, or returns invalid JSON. The result is validated
 * with Zod before being returned to the caller.
 */
export async function generateRecipe(ctx: AIMealContext): Promise<{
  recipe: AIRecipe;
  provider: "gemini" | "groq";
}> {
  const errors: string[] = [];

  if (process.env.GEMINI_API_KEY) {
    try {
      const recipe = await callGemini(ctx);
      return { recipe, provider: "gemini" };
    } catch (err) {
      errors.push(`gemini: ${(err as Error).message}`);
    }
  } else {
    errors.push("gemini: no GEMINI_API_KEY");
  }

  if (process.env.GROQ_API_KEY) {
    try {
      const recipe = await callGroq(ctx);
      return { recipe, provider: "groq" };
    } catch (err) {
      errors.push(`groq: ${(err as Error).message}`);
    }
  } else {
    errors.push("groq: no GROQ_API_KEY");
  }

  throw new Error(
    `No AI provider available. Tried: ${errors.join(" | ")}`,
  );
}

async function callGemini(ctx: AIMealContext): Promise<AIRecipe> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  // Try the main model with retries, then a lighter fallback model.
  // Gemini frequently returns 503 UNAVAILABLE during demand spikes;
  // a short backoff usually resolves it.
  const models = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
  const lastErrors: string[] = [];

  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await ai.models.generateContent({
          model,
          contents: buildUserPrompt(ctx),
          config: {
            systemInstruction: SYSTEM_PROMPT,
            responseMimeType: "application/json",
            temperature: 0.6,
          },
        });
        const text = result.text;
        if (!text) throw new Error("empty Gemini response");
        return parseAndValidate(text);
      } catch (err) {
        const msg = (err as Error).message ?? String(err);
        lastErrors.push(`${model} attempt ${attempt + 1}: ${msg}`);
        const retryable =
          /503|UNAVAILABLE|overload|high demand|rate limit|429/i.test(msg);
        if (!retryable) break; // non-retryable: try next model
        if (attempt < 2) {
          // Exponential backoff: 800ms, 1800ms (with small jitter)
          const delay = 800 * Math.pow(2, attempt) + Math.random() * 200;
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
  }

  throw new Error(lastErrors.join(" | "));
}

async function callGroq(ctx: AIMealContext): Promise<AIRecipe> {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    temperature: 0.6,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(ctx) },
    ],
  });
  const text = completion.choices[0]?.message?.content;
  if (!text) throw new Error("empty Groq response");
  return parseAndValidate(text);
}

function parseAndValidate(text: string): AIRecipe {
  // Strip accidental markdown fences if the model ignored instructions.
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch {
    throw new Error("invalid JSON from model");
  }
  const parsed = aiRecipeSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `schema validation failed: ${parsed.error.issues
        .map((i) => `${i.path.join(".")} ${i.message}`)
        .join("; ")}`,
    );
  }
  return parsed.data;
}
