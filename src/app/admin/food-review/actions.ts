"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/requireAdmin";

export async function verifyFoodItem(id: number) {
  const { supabase, adminId } = await requireAdmin();

  const { error } = await (supabase.from("food_catalog_item") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .update({ status: "verified", verified_by: adminId, verified_at: new Date().toISOString(), rejection_note: null })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/food-review");
}

export async function rejectFoodItem(id: number, note: string) {
  const { supabase } = await requireAdmin();
  if (!note.trim()) throw new Error("A reason is required when rejecting a submission");

  const { error } = await (supabase.from("food_catalog_item") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .update({ status: "rejected", rejection_note: note })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/food-review");
}
