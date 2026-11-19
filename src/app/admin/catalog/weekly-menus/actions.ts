"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/requireAdmin";

export async function createWeeklyMenu(formData: FormData) {
  const { supabase } = await requireAdmin();
  const payload = {
    name: String(formData.get("name") ?? "").trim() || null,
    week_start_date: String(formData.get("week_start_date") ?? ""),
    week_end_date: String(formData.get("week_end_date") ?? ""),
    tenant_id: 1,
  };
  const { data } = await (supabase.from("weekly_menu") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .insert(payload).select("id").single();
  revalidatePath("/admin/catalog/weekly-menus");
  redirect(`/admin/catalog/weekly-menus/${data.id}`);
}

export async function deleteWeeklyMenu(id: number) {
  const { supabase } = await requireAdmin();
  await supabase.from("weekly_menu").delete().eq("id", id);
  revalidatePath("/admin/catalog/weekly-menus");
  redirect("/admin/catalog/weekly-menus");
}

export async function addWeeklyMenuRecipe(weeklyMenuId: number, formData: FormData) {
  const { supabase } = await requireAdmin();
  const recipe_id = Number(formData.get("recipe_id"));
  // New dishes start available every day (available_dates NULL); limit
  // them with the day chips afterwards.
  await (supabase.from("weekly_menu_recipe") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .insert({ weekly_menu_id: weeklyMenuId, recipe_id });
  revalidatePath(`/admin/catalog/weekly-menus/${weeklyMenuId}`);
}

/** Limit a dish to specific dates of its menu; [] = every day. */
export async function setWeeklyMenuRecipeDates(weeklyMenuId: number, rowId: number, dates: string[]): Promise<{ error?: string }> {
  const { supabase } = await requireAdmin();
  const { data: menu } = await (supabase.from("weekly_menu") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .select("week_start_date, week_end_date").eq("id", weeklyMenuId).single();
  if (!menu) return { error: "Menu not found" };
  const clean = [...new Set(dates.map(d => String(d).slice(0, 10)))].sort();
  if (clean.some(d => !/^\d{4}-\d{2}-\d{2}$/.test(d) || d < menu.week_start_date || d > menu.week_end_date)) {
    return { error: "Dates must be inside this menu's week" };
  }
  const { error } = await (supabase.from("weekly_menu_recipe") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .update({ available_dates: clean.length ? clean : null })
    .eq("id", rowId).eq("weekly_menu_id", weeklyMenuId);
  if (error) return { error: "Couldn't save. Try again." };
  revalidatePath(`/admin/catalog/weekly-menus/${weeklyMenuId}`);
  return {};
}

export async function removeWeeklyMenuRecipe(weeklyMenuId: number, rowId: number) {
  const { supabase } = await requireAdmin();
  await supabase.from("weekly_menu_recipe").delete().eq("id", rowId);
  revalidatePath(`/admin/catalog/weekly-menus/${weeklyMenuId}`);
}
