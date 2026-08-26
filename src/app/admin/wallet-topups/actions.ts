"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: actingProfile } = await supabase.from("user").select("role").eq("id", user.id).single();
  if ((actingProfile as { role: string | null } | null)?.role !== "admin") throw new Error("Not authorized");

  return { supabase, adminId: user.id };
}

export async function approveWalletTopup(requestId: number, userId: string, amount: number, note: string) {
  if (amount <= 0) throw new Error("Credit amount must be positive");
  const { supabase, adminId } = await requireAdmin();

  // Idempotency guard, same pattern as approveAsWalletCredit for
  // cancellations — a request row can only ever be approved once.
  const { data: existing, error: existingErr } = await (supabase as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .from("wallet_topup_request")
    .select("id")
    .eq("id", requestId)
    .eq("status", "pending")
    .limit(1);
  if (existingErr) throw new Error(existingErr.message);
  if (!existing || existing.length === 0) {
    throw new Error("This request was already decided.");
  }

  const { error: creditErr } = await (supabase as any).rpc("credit_wallet", { // eslint-disable-line @typescript-eslint/no-explicit-any
    p_user_id: userId,
    p_amount: amount,
    p_type: "wallet_topup",
    p_related_wallet_topup_request_id: requestId,
    p_note: note || null,
  });
  if (creditErr) throw new Error(creditErr.message);

  const { error: updateErr } = await (supabase as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .from("wallet_topup_request")
    .update({
      status: "approved",
      decided_by: adminId,
      decided_at: new Date().toISOString(),
      decision_note: note || null,
      credited_amount: amount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId);
  if (updateErr) throw new Error(updateErr.message);

  revalidatePath("/admin/wallet-topups");
}

export async function rejectWalletTopup(requestId: number, note: string) {
  if (!note.trim()) throw new Error("A reason is required to reject a request");
  const { supabase, adminId } = await requireAdmin();

  const { error } = await (supabase as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .from("wallet_topup_request")
    .update({
      status: "rejected",
      decided_by: adminId,
      decided_at: new Date().toISOString(),
      decision_note: note,
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("status", "pending");
  if (error) throw new Error(error.message);

  revalidatePath("/admin/wallet-topups");
}
