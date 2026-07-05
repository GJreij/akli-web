"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: actingProfile } = await supabase.from("user").select("role").eq("id", user.id).single();
  if ((actingProfile as { role: string | null } | null)?.role !== "admin") throw new Error("Not authorized");

  return supabase;
}

export async function setPaymentStatus(paymentIds: number[], status: "paid" | "pending") {
  if (paymentIds.length === 0) return;
  const supabase = await requireAdmin();
  const { error } = await (supabase.from("payment") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .update({ status })
    .in("id", paymentIds);
  if (error) throw new Error(error.message);

  // Payment status is also shown on the per-client admin page — revalidate
  // the whole admin section (all routes share the one root admin layout).
  revalidatePath("/admin", "layout");
}
