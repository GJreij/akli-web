"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function num(formData: FormData, key: string) {
  const v = formData.get(key);
  return v === null || v === "" ? null : Number(v);
}

function parseRecipeForm(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || null,
    instructions: String(formData.get("instructions") ?? "").trim() || null,
    photo: String(formData.get("photo") ?? "").trim() || null,
    prep_time: num(formData, "prep_time"),
    cook_time: num(formData, "cook_time"),
    could_be_breakfast: formData.get("could_be_breakfast") === "on",
    could_be_lunch: formData.get("could_be_lunch") === "on",
    could_be_dinner: formData.get("could_be_dinner") === "on",
    could_be_snack: formData.get("could_be_snack") === "on",
    always_available: formData.get("always_available") === "on",
    tenant_id: 1,
  };
}

export async function createRecipe(formData: FormData) {
  const supabase = await createClient();
  const payload = parseRecipeForm(formData);
  const { data } = await (supabase.from("recipe") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .insert(payload).select("id").single();
  revalidatePath("/admin/catalog/recipes");
  redirect(`/admin/catalog/recipes/${data.id}`);
}

export async function updateRecipe(id: number, formData: FormData) {
  const supabase = await createClient();
  const payload = parseRecipeForm(formData);
  await (supabase.from("recipe") as any).update(payload).eq("id", id); // eslint-disable-line @typescript-eslint/no-explicit-any
  revalidatePath("/admin/catalog/recipes");
  revalidatePath(`/admin/catalog/recipes/${id}`);
}

export async function deleteRecipe(id: number) {
  const supabase = await createClient();
  await supabase.from("recipe").delete().eq("id", id);
  revalidatePath("/admin/catalog/recipes");
  redirect("/admin/catalog/recipes");
}

export async function addRecipeSubrecipe(recipeId: number, formData: FormData) {
  const supabase = await createClient();
  const subrecipe_id = Number(formData.get("subrecipe_id"));
  const subrecipe_label = String(formData.get("subrecipe_label") ?? "").trim() || null;
  const optional = formData.get("optional") === "on";
  const max_serving = num(formData, "max_serving");
  await (supabase.from("recipe_subrecipe") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .insert({ recipe_id: recipeId, subrecipe_id, subrecipe_label, optional, max_serving });
  revalidatePath(`/admin/catalog/recipes/${recipeId}`);
}

export async function removeRecipeSubrecipe(recipeId: number, rowId: number) {
  const supabase = await createClient();
  await supabase.from("recipe_subrecipe").delete().eq("id", rowId);
  revalidatePath(`/admin/catalog/recipes/${recipeId}`);
}
