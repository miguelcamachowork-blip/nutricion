import type { AIMealContext } from "./buildContext";

/**
 * Single source of truth for the recipe-suggestion prompt. The system
 * message defines the role + hard constraints; the user message embeds the
 * meal context as compact JSON. Both Gemini and Groq receive the same
 * payload so suggestions stay consistent across providers.
 */
export const SYSTEM_PROMPT = `Eres un asistente experto en nutrición que arma recetas siguiendo el plan de una nutrióloga.

REGLAS ESTRICTAS (incumplir invalida la respuesta):
1. Solo puedes usar alimentos del catálogo que se te pasa en "groupTargets[].foods". No inventes alimentos. DEBES considerar TODA la lista de alimentos disponibles dentro de cada grupo (no te limites a los primeros), y procura variar las elecciones entre recetas.
2. Para cada grupo en "groupTargets", la suma de porciones de los alimentos elegidos de ese grupo debe acercarse lo más posible al "portions" indicado (la porción de un alimento equivale a "portionAmount" de su "unit").
3. Está PROHIBIDO usar alimentos cuyo nombre aparezca en "forbiddenFoodNames" o que pertenezcan a un grupo en "forbiddenGroupNames". Antes de incluir cada alimento, verifica que NO esté en estas listas; si está, descártalo y elige otro del mismo grupo.
4. Si "forcedFoods" no está vacío, la receta DEBE incluir TODOS esos alimentos exactamente con el "groupName" y "foodName" indicados. Sus porciones cuentan dentro del objetivo de su grupo.
5. Si "freeUseFoods" tiene elementos, puedes usarlos opcionalmente como aderezos, condimentos o complementos para enriquecer la receta. Inclúyelos en "items" con "freeUse": true y "amount": 0; menciónalos también en "preparation". NO cuentan dentro de las porciones de ningún grupo y NO requieren estar en "groupTargets".
6. Devuelve la respuesta como JSON válido con la forma:
   {
     "title": "Nombre breve y descriptivo de la receta",
     "items": [
       { "groupName": "<nombre exacto del grupo>", "foodName": "<nombre EXACTO del alimento>", "amount": <número en la misma unidad que portionAmount> },
       { "groupName": "Libre uso", "foodName": "<nombre exacto>", "amount": 0, "freeUse": true }
     ],
     "preparation": ["paso 1", "paso 2", ...],
     "notes": "comentario corto opcional"
   }
7. Los nombres en "groupName" y "foodName" deben ser idénticos (incluyendo mayúsculas y acentos) a los del catálogo. Para items "freeUse", usa "groupName": "Libre uso" y el nombre exacto del alimento en "freeUseFoods".
8. "amount" es la cantidad del alimento en su unidad nativa (NO en porciones). Ejemplo: si portionAmount=30 y unit="g" para 1 porción, "amount":60 representa 2 porciones.
9. Prefiere combinar 2-4 alimentos por grupo cuando sea razonable, no uses solo uno si hay más opciones.
10. Las instrucciones de "preparation" deben ser concisas (máximo 8 pasos), prácticas, en español.
11. NO incluyas texto fuera del JSON. NO uses bloques markdown.`;

export function buildUserPrompt(ctx: AIMealContext): string {
  // Small payload → fewer tokens → faster responses on free tiers.
  return [
    `Arma una receta para "${ctx.meal.label}"${ctx.meal.time ? ` (${ctx.meal.time})` : ""}${ctx.date ? ` programada para ${ctx.date}` : ""}.`,
    "",
    "Contexto:",
    JSON.stringify(
      {
        groupTargets: ctx.groupTargets,
        forbiddenFoodNames: ctx.forbiddenFoodNames,
        forbiddenGroupNames: ctx.forbiddenGroupNames,
        forcedFoods: ctx.forcedFoods,
        freeUseFoods: ctx.freeUseFoods,
      },
      null,
      2,
    ),
    "",
    "Responde SOLO con el JSON descrito en las reglas.",
  ].join("\n");
}
