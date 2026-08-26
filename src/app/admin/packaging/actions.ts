"use server";

import { createClient } from "@/lib/supabase/server";

export async function markPackaged(mealPlanDayRecipeId: number, packaged: boolean) {
  const supabase = await createClient();

  const { data, error } = await (supabase.from("meal_plan_day_recipe") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .update({ packaging_status: packaged ? "completed" : "pending" })
    .eq("id", mealPlanDayRecipeId)
    .select("id");

  if (error) throw new Error(`Failed to update packaging status: ${error.message} (code ${error.code})`);
  if (!data || data.length === 0) throw new Error(`Failed to update packaging status: no recipe found with id ${mealPlanDayRecipeId}`);
}
