"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/requireAdmin";
import type { Database } from "@/lib/supabase/types";
import { requestCancellation } from "@/lib/flask";
import { approveAsWalletCredit, approveAsRealRefund, cancelWithNoRefund } from "@/app/admin/cancellations/actions";

export async function updateUserRoleStatus(userId: string, role: string, status: string) {
  const { supabase } = await requireAdmin();

  const update: Database["public"]["Tables"]["user"]["Update"] = { role, status };
  await (supabase.from("user") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .update(update)
    .eq("id", userId);
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
}

type CancelMode = "noRefund" | "wallet" | "refund";

// Collapses the normal client-requests / admin-reviews cancellation flow into
// one action — for an order the admin placed themselves, the admin is both
// parties, so there's no reason to make them click through a review queue
// for their own order. Reuses the exact same Flask-side finalize logic
// (slot release, day status, discount correction) as a real client
// cancellation via admin/cancellations/actions.ts.
export async function adminCancelOrder(input: {
  userId: string;
  mealPlanId: number;
  mode: CancelMode;
  amount?: number;
  note: string;
}) {
  // Captured once and threaded through to the calls below — they'd otherwise
  // each redo their own requireAdmin() (auth.getUser() + role lookup) even
  // though this request already proved the caller is an admin.
  const adminCtx = await requireAdmin();

  const reqRes = await requestCancellation(input.userId, input.mealPlanId);
  if (!reqRes.success || !reqRes.cancellation_request_id) {
    throw new Error(reqRes.error ?? "Could not start the cancellation.");
  }
  const cancellationRequestId = reqRes.cancellation_request_id;

  if (input.mode === "noRefund") {
    if (!input.note.trim()) throw new Error("A reason is required when cancelling with no refund.");
    await cancelWithNoRefund(cancellationRequestId, input.note, adminCtx);
  } else if (input.mode === "wallet") {
    if (!input.amount || input.amount <= 0) throw new Error("Enter a credit amount.");
    await approveAsWalletCredit(cancellationRequestId, input.userId, input.mealPlanId, input.amount, input.note, adminCtx);
  } else {
    if (!input.amount || input.amount <= 0) throw new Error("Enter a refund amount.");
    await approveAsRealRefund(cancellationRequestId, input.amount, input.note, adminCtx);
  }

  revalidatePath(`/admin/users/${input.userId}`);
}
