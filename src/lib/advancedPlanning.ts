import type { SupabaseClient } from "@supabase/supabase-js";

// Advanced planning (beta): after the automatic plan, the client can re-portion
// "flexible" subrecipes (subrecipe.is_flexible — rice, chicken, ...) by hand.
// Gated per user by user_beta_feature 'advanced_planning'; Flask enforces the
// same gate and the serving rules (/advanced_planning/apply, /confirm_order).

export const ADVANCED_PLANNING = {
  step: 0.25,
  min: 0.25,
  max: 10,
  // A day's kcal this far from its target gets a warning (never blocked).
  warnPct: 0.15,
} as const;

export interface AdvancedPlanningAccess {
  enabled: boolean;
  flexibleSubrecipeIds: number[];
  // "recipeId:subrecipeId" of every recipe's main (recipe_subrecipe.is_main) —
  // a recipe's main is always adjustable, flexible flag or not.
  mainPairs: string[];
}

export function isAdjustable(
  access: { flexibleIds: Set<number>; mainPairs: Set<string> },
  recipeId: number,
  sub: { subrecipe_id: number; is_side_salad?: boolean }
): boolean {
  if (sub.is_side_salad) return false;
  return access.flexibleIds.has(sub.subrecipe_id) || access.mainPairs.has(`${recipeId}:${sub.subrecipe_id}`);
}

export async function getAdvancedPlanningAccess(
  supabase: unknown, // any app Supabase client (server or browser)
  userId: string
): Promise<AdvancedPlanningAccess> {
  // user_beta_feature / subrecipe.is_flexible aren't in the generated types yet.
  const sb = supabase as SupabaseClient;
  const { data: flag } = await sb
    .from("user_beta_feature")
    .select("feature")
    .eq("user_id", userId)
    .eq("feature", "advanced_planning")
    .maybeSingle();
  if (!flag) return { enabled: false, flexibleSubrecipeIds: [], mainPairs: [] };
  const [{ data: subs }, { data: mains }] = await Promise.all([
    sb.from("subrecipe").select("id").eq("is_flexible", true),
    sb.from("recipe_subrecipe").select("recipe_id, subrecipe_id").eq("is_main", true),
  ]);
  return {
    enabled: true,
    flexibleSubrecipeIds: (subs ?? []).map((s: { id: number }) => s.id),
    mainPairs: (mains ?? []).map((m: { recipe_id: number; subrecipe_id: number }) => `${m.recipe_id}:${m.subrecipe_id}`),
  };
}

// Snap a typed or stepped value onto the allowed grid.
export function clampServings(v: number): number {
  if (!Number.isFinite(v)) return ADVANCED_PLANNING.min;
  const snapped = Math.round(v / ADVANCED_PLANNING.step) * ADVANCED_PLANNING.step;
  return Math.min(ADVANCED_PLANNING.max, Math.max(ADVANCED_PLANNING.min, snapped));
}
