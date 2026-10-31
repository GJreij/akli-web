"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/requireAdmin";

function num(formData: FormData, key: string) {
  const v = formData.get(key);
  return v === null || v === "" ? null : Number(v);
}

const PREP_TYPES = ["cook", "assemble", "slice", "ready"];
const EQUIPMENT = ["stove", "oven", "grill", "none"];

// Kitchen Day fields — on the edit page (marked by a hidden kitchen_fields
// input); the create form only sets the type. freezable is derived from
// freezer_days, keeping the two in sync.
function parseKitchenFields(formData: FormData) {
  if (!formData.has("kitchen_fields")) {
    const t = String(formData.get("prep_type") ?? "");
    return PREP_TYPES.includes(t) ? { prep_type: t } : {};
  }
  const pick = (key: string, allowed: string[]) => {
    const v = String(formData.get(key) ?? "");
    return allowed.includes(v) ? v : null;
  };
  const freezer_days = num(formData, "freezer_days");
  return {
    prep_type: pick("prep_type", PREP_TYPES) ?? "cook",
    equipment: pick("equipment", EQUIPMENT),
    fridge_days: num(formData, "fridge_days"),
    freezer_days,
    freezable: freezer_days != null,
    active_minutes: num(formData, "active_minutes"),
    total_minutes: num(formData, "total_minutes"),
    prep_ahead: String(formData.get("prep_ahead") ?? "").trim() || null,
  };
}

function parseSubrecipeForm(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || null,
    instructions: String(formData.get("instructions") ?? "").trim() || null,
    prep_time: String(formData.get("prep_time") ?? "").trim() || null,
    freezable: formData.get("freezable") === "on",
    is_side_salad: formData.get("is_side_salad") === "on",
    max_serving: num(formData, "max_serving"),
    kcal: num(formData, "kcal"),
    protein: num(formData, "protein"),
    carbs: num(formData, "carbs"),
    fat: num(formData, "fat"),
    saturated_fat: num(formData, "saturated_fat"),
    fiber: num(formData, "fiber"),
    sugar: num(formData, "sugar"),
    tenant_id: 1,
    ...parseKitchenFields(formData),
  };
}

export async function createSubrecipe(formData: FormData) {
  const { supabase } = await requireAdmin();
  const payload = parseSubrecipeForm(formData);
  const { data } = await (supabase.from("subrecipe") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .insert(payload).select("id").single();
  revalidatePath("/admin/catalog/subrecipes");
  redirect(`/admin/catalog/subrecipes/${data.id}`);
}

export async function updateSubrecipe(id: number, formData: FormData) {
  const { supabase } = await requireAdmin();
  const payload = parseSubrecipeForm(formData);
  await (supabase.from("subrecipe") as any).update(payload).eq("id", id); // eslint-disable-line @typescript-eslint/no-explicit-any
  revalidatePath("/admin/catalog/subrecipes");
  revalidatePath(`/admin/catalog/subrecipes/${id}`);
}

export async function deleteSubrecipe(id: number) {
  const { supabase } = await requireAdmin();
  await supabase.from("subrecipe").delete().eq("id", id);
  revalidatePath("/admin/catalog/subrecipes");
  redirect("/admin/catalog/subrecipes");
}

export async function addSubrecipeIngredient(subrecipeId: number, formData: FormData) {
  const { supabase } = await requireAdmin();
  const ingredient_id = Number(formData.get("ingredient_id"));
  const quantity = num(formData, "quantity");
  const optional = formData.get("optional") === "on";
  await (supabase.from("subrec_ingred") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .insert({ subrecipe_id: subrecipeId, ingredient_id, quantity, optional });
  await (supabase.rpc as any)("update_subrecipe_macros", { p_subrecipe_id: subrecipeId }); // eslint-disable-line @typescript-eslint/no-explicit-any
  revalidatePath(`/admin/catalog/subrecipes/${subrecipeId}`);
}

export async function removeSubrecipeIngredient(subrecipeId: number, rowId: number) {
  const { supabase } = await requireAdmin();
  await supabase.from("subrec_ingred").delete().eq("id", rowId);
  await (supabase.rpc as any)("update_subrecipe_macros", { p_subrecipe_id: subrecipeId }); // eslint-disable-line @typescript-eslint/no-explicit-any
  revalidatePath(`/admin/catalog/subrecipes/${subrecipeId}`);
}
