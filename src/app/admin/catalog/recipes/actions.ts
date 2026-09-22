"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/requireAdmin";
import { validateMainAssignment, type MainRow } from "./main-validation";

function num(formData: FormData, key: string) {
  const v = formData.get(key);
  return v === null || v === "" ? null : Number(v);
}

function parseRecipeForm(formData: FormData) {
  // photo is intentionally not handled here — it has its own dedicated
  // upload/delete actions below, so saving the basics form never overwrites it.
  return {
    name: String(formData.get("name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || null,
    instructions: String(formData.get("instructions") ?? "").trim() || null,
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
  const { supabase } = await requireAdmin();
  const payload = parseRecipeForm(formData);
  const { data } = await (supabase.from("recipe") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .insert(payload).select("id").single();
  revalidatePath("/admin/catalog/recipes");
  redirect(`/admin/catalog/recipes/${data.id}`);
}

export async function updateRecipe(id: number, formData: FormData) {
  const { supabase } = await requireAdmin();
  const payload = parseRecipeForm(formData);
  await (supabase.from("recipe") as any).update(payload).eq("id", id); // eslint-disable-line @typescript-eslint/no-explicit-any
  revalidatePath("/admin/catalog/recipes");
  revalidatePath(`/admin/catalog/recipes/${id}`);
}

// =============================================================================
// PHOTO (Supabase Storage — recipePicturesBucket)
// =============================================================================

const RECIPE_PHOTO_BUCKET = "recipePicturesBucket";

// Existing photo URLs point at the render/image transform endpoint, e.g.
// ".../storage/v1/render/image/public/recipePicturesBucket/recipe_picture/<name>?width=800…" —
// pull the object path back out of that so a replace/delete can clean up the old file.
function recipePhotoStoragePath(url: string | null): string | null {
  if (!url) return null;
  const marker = `/${RECIPE_PHOTO_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length).split("?")[0] || null;
}

function recipePhotoPublicUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/render/image/public/${RECIPE_PHOTO_BUCKET}/${path}?width=800&quality=80&format=webp`;
}

export async function uploadRecipePhoto(id: number, formData: FormData) {
  const { supabase } = await requireAdmin();
  const file = formData.get("photo_file");
  if (!(file instanceof File) || file.size === 0) throw new Error("No file selected.");
  if (!file.type.startsWith("image/")) throw new Error("Please upload an image file.");

  const { data: current } = await supabase.from("recipe").select("photo").eq("id", id).single();
  const oldPath = recipePhotoStoragePath((current as { photo: string | null } | null)?.photo ?? null);

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `recipe_picture/${id}-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(RECIPE_PHOTO_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) throw new Error(uploadError.message);

  const { error: dbError } = await (supabase.from("recipe") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .update({ photo: recipePhotoPublicUrl(path) }).eq("id", id);
  if (dbError) throw new Error(dbError.message);

  if (oldPath) await supabase.storage.from(RECIPE_PHOTO_BUCKET).remove([oldPath]);

  revalidatePath("/admin/catalog/recipes");
  revalidatePath(`/admin/catalog/recipes/${id}`);
}

export async function deleteRecipePhoto(id: number) {
  const { supabase } = await requireAdmin();
  const { data: current } = await supabase.from("recipe").select("photo").eq("id", id).single();
  const oldPath = recipePhotoStoragePath((current as { photo: string | null } | null)?.photo ?? null);

  await (supabase.from("recipe") as any).update({ photo: null }).eq("id", id); // eslint-disable-line @typescript-eslint/no-explicit-any
  if (oldPath) await supabase.storage.from(RECIPE_PHOTO_BUCKET).remove([oldPath]);

  revalidatePath("/admin/catalog/recipes");
  revalidatePath(`/admin/catalog/recipes/${id}`);
}

export async function deleteRecipe(id: number) {
  const { supabase } = await requireAdmin();
  await supabase.from("recipe").delete().eq("id", id);
  revalidatePath("/admin/catalog/recipes");
  redirect("/admin/catalog/recipes");
}

export async function addRecipeSubrecipe(recipeId: number, formData: FormData) {
  const { supabase } = await requireAdmin();
  const subrecipe_id = Number(formData.get("subrecipe_id"));
  const subrecipe_label = String(formData.get("subrecipe_label") ?? "").trim() || null;
  const optional = formData.get("optional") === "on";
  const is_main = formData.get("is_main") === "on";
  const max_serving = num(formData, "max_serving");
  await (supabase.from("recipe_subrecipe") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .insert({ recipe_id: recipeId, subrecipe_id, subrecipe_label, optional, is_main, max_serving });
  revalidatePath(`/admin/catalog/recipes/${recipeId}`);
}

export async function removeRecipeSubrecipe(recipeId: number, rowId: number) {
  const { supabase } = await requireAdmin();
  await supabase.from("recipe_subrecipe").delete().eq("id", rowId);
  revalidatePath(`/admin/catalog/recipes/${recipeId}`);
}

// =============================================================================
// COMPOSITION ROW SETTINGS (main flag + per-recipe max_serving override)
// =============================================================================

export async function updateRecipeSubrecipeSettings(recipeId: number, formData: FormData) {
  const { supabase } = await requireAdmin();
  const { data: composition } = await supabase
    .from("recipe_subrecipe")
    .select("id")
    .eq("recipe_id", recipeId);

  const rows = ((composition ?? []) as { id: number }[]).map(row => ({
    id: row.id,
    is_main: formData.get(`is_main_${row.id}`) === "on",
    max_serving: num(formData, `max_serving_${row.id}`),
  }));

  const check = validateMainAssignment(rows as MainRow[]);
  if (!check.ok) {
    redirect(`/admin/catalog/recipes/${recipeId}?mainError=${encodeURIComponent(check.error)}`);
  }

  await Promise.all(
    rows.map(row =>
      (supabase.from("recipe_subrecipe") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
        .update({ is_main: row.is_main, max_serving: row.max_serving })
        .eq("id", row.id),
    ),
  );
  revalidatePath(`/admin/catalog/recipes/${recipeId}`);
}
