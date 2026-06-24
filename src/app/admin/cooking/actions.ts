"use server";

import { createClient } from "@/lib/supabase/server";

export async function savePortioning(rows: { meal_plan_day_recipe_serving_id: number; weight_after_cooking: number }[]) {
  const supabase = await createClient();

  await Promise.all(
    rows.map(r =>
      (supabase.from("meal_plan_day_recipe_serving") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
        .update({ weight_after_cooking: r.weight_after_cooking, portioning_status: "done" })
        .eq("id", r.meal_plan_day_recipe_serving_id)
    )
  );
}

export async function markCooked(servingIds: number[], cooked: boolean) {
  const supabase = await createClient();

  await (supabase.from("meal_plan_day_recipe_serving") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .update({ cooking_status: cooked ? "completed" : "pending" })
    .in("id", servingIds);
}
