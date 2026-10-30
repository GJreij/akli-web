// Server-only Claude calls for the kitchen (comment sorting + assistant).
import Anthropic from "@anthropic-ai/sdk";
import type { KitchenDay } from "@/lib/flask";

export const KITCHEN_MODEL = process.env.KITCHEN_AI_MODEL || "claude-opus-5-5";
// Server-side refusal fallback (same pattern as labelComments.ts).
export const KITCHEN_FALLBACK = /^claude-(sonnet|opus)/.test(KITCHEN_MODEL)
  ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
  : {};

export const anthropic = new Anthropic();

export interface CommentGroup {
  key: string;
  userId: string;
  clientName: string;
  recipeId: number | null;
  recipeName: string | null;
  comment: string;
  parts: { subrecipeId: number; name: string; ingredients: string[] }[];
}

// One group per (client, dish, comment) with every subrecipe of that dish on
// the day — a comment is left on a dish, but the kitchen handles it per part.
export function unsortedCommentGroups(day: KitchenDay): CommentGroup[] {
  const groups = new Map<string, CommentGroup & { unsorted: boolean }>();
  for (const s of day.subrecipes) {
    for (const c of s.comments) {
      const key = `${c.user_id}|${c.recipe_id ?? 0}|${c.comment}`;
      const g = groups.get(key) ?? {
        key, userId: c.user_id, clientName: c.name, recipeId: c.recipe_id, recipeName: c.recipe_name,
        comment: c.comment, parts: [], unsorted: false,
      };
      if (!g.parts.some(p => p.subrecipeId === s.subrecipe_id)) {
        g.parts.push({ subrecipeId: s.subrecipe_id, name: s.name, ingredients: s.ingredients_per_serving.map(i => i.name) });
      }
      if (c.handling == null) g.unsorted = true;
      groups.set(key, g);
    }
  }
  return [...groups.values()].filter(g => g.unsorted).map(({ unsorted: _u, ...g }) => g); // eslint-disable-line @typescript-eslint/no-unused-vars
}

const SORT_SYSTEM = `You sort client comments for the kitchen of Akli, a Lebanese meal-prep business. Each comment was left by a client on a dish. A dish is made of parts (subrecipes), each listed with its ingredients. For every part of the dish, decide how the comment affects that part:

- "assembly": handled while portioning or assembling this part for the client, without cooking anything differently. Use it when the item can simply be left out or added at the end (e.g. "no rocca" on a salad or sandwich filling, "no pickles", "extra lemon", "no mango" on a fresh topping).
- "separate_pot": this client's portion of this part has to be cooked apart from everyone else's, because the change is cooked into it (e.g. "no garlic" or "no onions" in a marinade, sauce, stew or rice that contains garlic/onions; "less salt" in something seasoned while cooking).
- "ignore": the comment doesn't concern this part (e.g. "no garlic" on a part without garlic, or a comment about another part of the dish).

Base the decision on the listed ingredients: if the ingredient the client wants removed isn't in a part, that part is "ignore". Give a short, practical instruction for the cook for "assembly" and "separate_pot" (under 12 words, e.g. "Cook without garlic", "Leave out the rocca"), and null for "ignore". Comments that aren't kitchen requests (thanks, delivery notes) are "ignore" for every part.`;

const SORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "parts"],
        properties: {
          key: { type: "string" },
          parts: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["subrecipe_id", "handling", "instruction"],
              properties: {
                subrecipe_id: { type: "integer" },
                handling: { type: "string", enum: ["assembly", "separate_pot", "ignore"] },
                instruction: { type: ["string", "null"] },
              },
            },
          },
        },
      },
    },
  },
} as const;

export interface SortDecision { key: string; subrecipeId: number; handling: "assembly" | "separate_pot" | "ignore"; instruction: string | null }

export async function sortComments(groups: CommentGroup[]): Promise<SortDecision[]> {
  if (groups.length === 0) return [];
  const payload = groups.map(g => ({
    key: g.key, dish: g.recipeName ?? "side salad", comment: g.comment,
    parts: g.parts.map(p => ({ subrecipe_id: p.subrecipeId, name: p.name, ingredients: p.ingredients })),
  }));
  const response = await anthropic.beta.messages.create({
    model: KITCHEN_MODEL,
    max_tokens: 16000,
    ...KITCHEN_FALLBACK,
    output_config: { effort: "low", format: { type: "json_schema", schema: SORT_SCHEMA as unknown as Record<string, unknown> } },
    system: SORT_SYSTEM,
    messages: [{ role: "user", content: JSON.stringify(payload) }],
  });
  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
    throw new Error(`Comment sorting stopped early (${response.stop_reason}).`);
  }
  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map(b => b.text)
    .join("");
  const parsed = JSON.parse(text) as { items: { key: string; parts: { subrecipe_id: number; handling: SortDecision["handling"]; instruction: string | null }[] }[] };
  const validParts = new Map(groups.map(g => [g.key, new Set(g.parts.map(p => p.subrecipeId))]));
  return parsed.items.flatMap(item => item.parts
    .filter(p => validParts.get(item.key)?.has(p.subrecipe_id))
    .map(p => ({ key: item.key, subrecipeId: p.subrecipe_id, handling: p.handling, instruction: p.instruction })));
}
