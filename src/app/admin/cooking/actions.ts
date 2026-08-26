"use server";

import { createClient } from "@/lib/supabase/server";

export async function savePortioning(rows: { meal_plan_day_recipe_serving_id: number; weight_after_cooking: number }[]) {
  if (rows.length === 0) {
    throw new Error("Nothing to save — no rows had a valid weight entered.");
  }

  const supabase = await createClient();

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
