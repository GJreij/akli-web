"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const ALLERGENS = [
  "celery", "cereals_containing_gluten", "crustaceans", "eggs", "fish", "lupin",
  "milk", "molluscs", "sulphites", "mustard", "peanuts", "sesame", "soybeans", "tree_nuts",
] as const;

function parseIngredientForm(formData: FormData) {
  const num = (key: string) => {
    const v = formData.get(key);
    return v === null || v === "" ? null : Number(v);
  };
  const base = {
    name: String(formData.get("name") ?? "").trim(),
    unit: String(formData.get("unit") ?? "").trim() || null,
    serving_per_unit: num("serving_per_unit"),
    kcal: num("kcal"),
    protein: num("protein"),
    carbs: num("carbs"),
    fat: num("fat"),
    saturated_fat: num("saturated_fat"),
    fiber: num("fiber"),
    sugar: num("sugar"),
    tenant_id: 1,
  };
  const allergens = Object.fromEntries(ALLERGENS.map(a => [a, formData.get(a) === "on"]));
  return { ...base, ...allergens };
}

export async function createIngredient(formData: FormData) {
  const supabase = await createClient();
  const payload = parseIngredientForm(formData);
  await (supabase.from("ingredient") as any).insert(payload); // eslint-disable-line @typescript-eslint/no-explicit-any
  revalidatePath("/admin/catalog/ingredients");
  redirect("/admin/catalog/ingredients");
}

export async function updateIngredient(id: number, formData: FormData) {
  const supabase = await createClient();
  const payload = parseIngredientForm(formData);
  await (supabase.from("ingredient") as any).update(payload).eq("id", id); // eslint-disable-line @typescript-eslint/no-explicit-any
  revalidatePath("/admin/catalog/ingredients");
  revalidatePath(`/admin/catalog/ingredients/${id}`);
}

export async function deleteIngredient(id: number) {
  const supabase = await createClient();
  await supabase.from("ingredient").delete().eq("id", id);
  revalidatePath("/admin/catalog/ingredients");
  redirect("/admin/catalog/ingredients");
}
