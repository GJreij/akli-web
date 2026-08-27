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
  const always_available = formData.get("always_available") === "on";
  const available_from = always_available ? null : (String(formData.get("available_from") ?? "") || null);
  const available_to = always_available ? null : (String(formData.get("available_to") ?? "") || null);
  await (supabase.from("weekly_menu_recipe") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .insert({ weekly_menu_id: weeklyMenuId, recipe_id, always_available, available_from, available_to });
  revalidatePath(`/admin/catalog/weekly-menus/${weeklyMenuId}`);
}

export async function removeWeeklyMenuRecipe(weeklyMenuId: number, rowId: number) {
  const { supabase } = await requireAdmin();
  await supabase.from("weekly_menu_recipe").delete().eq("id", rowId);
  revalidatePath(`/admin/catalog/weekly-menus/${weeklyMenuId}`);
}
