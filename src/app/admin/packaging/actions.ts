"use server";

import { createClient } from "@/lib/supabase/server";

export async function markPackaged(mealPlanDayRecipeId: number, packaged: boolean) {
  const supabase = await createClient();

  await (supabase.from("meal_plan_day_recipe") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .update({ packaging_status: packaged ? "completed" : "pending" })
    .eq("id", mealPlanDayRecipeId);
}
