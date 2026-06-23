"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function num(formData: FormData, key: string) {
  const v = formData.get(key);
  return v === null || v === "" ? null : Number(v);
}

function parseSubrecipeForm(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || null,
    instructions: String(formData.get("instructions") ?? "").trim() || null,
    prep_time: String(formData.get("prep_time") ?? "").trim() || null,
    freezable: formData.get("freezable") === "on",
    max_serving: num(formData, "max_serving"),
    kcal: num(formData, "kcal"),
    protein: num(formData, "protein"),
    carbs: num(formData, "carbs"),
    fat: num(formData, "fat"),
    saturated_fat: num(formData, "saturated_fat"),
    fiber: num(formData, "fiber"),
    sugar: num(formData, "sugar"),
    tenant_id: 1,
  };
}

export async function createSubrecipe(formData: FormData) {
  const supabase = await createClient();
  const payload = parseSubrecipeForm(formData);
  const { data } = await (supabase.from("subrecipe") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .insert(payload).select("id").single();
  revalidatePath("/admin/catalog/subrecipes");
  redirect(`/admin/catalog/subrecipes/${data.id}`);
}

export async function updateSubrecipe(id: number, formData: FormData) {
  const supabase = await createClient();
  const payload = parseSubrecipeForm(formData);
  await (supabase.from("subrecipe") as any).update(payload).eq("id", id); // eslint-disable-line @typescript-eslint/no-explicit-any
  revalidatePath("/admin/catalog/subrecipes");
  revalidatePath(`/admin/catalog/subrecipes/${id}`);
}

export async function deleteSubrecipe(id: number) {
  const supabase = await createClient();
  await supabase.from("subrecipe").delete().eq("id", id);
  revalidatePath("/admin/catalog/subrecipes");
  redirect("/admin/catalog/subrecipes");
}

export async function addSubrecipeIngredient(subrecipeId: number, formData: FormData) {
  const supabase = await createClient();
  const ingredient_id = Number(formData.get("ingredient_id"));
  const quantity = num(formData, "quantity");
  const optional = formData.get("optional") === "on";
  await (supabase.from("subrec_ingred") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .insert({ subrecipe_id: subrecipeId, ingredient_id, quantity, optional });
  revalidatePath(`/admin/catalog/subrecipes/${subrecipeId}`);
}

export async function removeSubrecipeIngredient(subrecipeId: number, rowId: number) {
  const supabase = await createClient();
  await supabase.from("subrec_ingred").delete().eq("id", rowId);
  revalidatePath(`/admin/catalog/subrecipes/${subrecipeId}`);
}
