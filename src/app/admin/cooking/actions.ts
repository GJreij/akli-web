"use server";

import { requireAdmin } from "@/lib/supabase/requireAdmin";

export async function savePortioning(rows: { meal_plan_day_recipe_serving_id: number; weight_after_cooking: number }[]) {
  if (rows.length === 0) {
    throw new Error("Nothing to save — no rows had a valid weight entered.");
  }

  const { supabase } = await requireAdmin();

  const results = await Promise.all(
    rows.map(r =>
      (supabase.from("meal_plan_day_recipe_serving") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
        .update({ weight_after_cooking: r.weight_after_cooking, portioning_status: "done" })
        .eq("id", r.meal_plan_day_recipe_serving_id)
        .select("id")
    )
  );

  const failed = results
    .map((res, i) => ({ res, id: rows[i].meal_plan_day_recipe_serving_id }))
    .filter(({ res }) => res.error || !res.data || res.data.length === 0);

  if (failed.length > 0) {
    const firstError = failed.find(f => f.res.error)?.res.error;
    const detail = firstError
      ? `${firstError.message} (code ${firstError.code})`
      : "no matching row";
    throw new Error(`Failed to save ${failed.length}/${rows.length} portion(s), e.g. serving ${failed[0].id}: ${detail}`);
  }
}

// Hide (cooked/done) or restore a recipe card on the Cooking board. Marks the
// specific meals that made up the card, so a meal ordered AFTER the card was
// hidden isn't marked and brings the card back. Display-only: nothing else
// reads cooking_hidden_at.
export async function setCookingHidden(mealPlanDayRecipeIds: number[], hidden: boolean) {
  const ids = [...new Set(mealPlanDayRecipeIds)].filter(Number.isInteger);
  if (ids.length === 0) throw new Error("No meals to update.");

  const { supabase } = await requireAdmin();

  // Batched: "Restore all" over a wide date range can be thousands of ids,
  // too many for one request URL.
  const stamp = hidden ? new Date().toISOString() : null;
  const batches: number[][] = [];
  for (let i = 0; i < ids.length; i += 300) batches.push(ids.slice(i, i + 300));
  const results = await Promise.all(batches.map(batch =>
    (supabase.from("meal_plan_day_recipe") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      .update({ cooking_hidden_at: stamp })
      .in("id", batch)
      .select("id")
  ));

  const failed = results.find(r => r.error);
  if (failed) throw new Error(`Failed to ${hidden ? "hide" : "restore"} meal: ${failed.error.message} (code ${failed.error.code})`);
  if (results.every(r => !r.data || r.data.length === 0)) throw new Error(`Failed to ${hidden ? "hide" : "restore"} meal: no matching rows.`);
}
