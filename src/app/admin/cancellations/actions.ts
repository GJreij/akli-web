"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/requireAdmin";

const FLASK_URL = process.env.NEXT_PUBLIC_FLASK_URL ?? "https://aklilebapp-72376dbe3cc8.herokuapp.com";
const INTERNAL_ADMIN_SECRET = process.env.INTERNAL_ADMIN_SECRET ?? "";

type Decision = "approved_wallet" | "approved_refund" | "approved_no_refund" | "rejected";

async function finalizeInFlask(cancellationRequestId: number, decision: Decision, decidedBy: string, note: string, refundAmount?: number) {
  const res = await fetch(`${FLASK_URL}/admin/decide_cancellation`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Admin-Secret": INTERNAL_ADMIN_SECRET,
    },
    body: JSON.stringify({
      cancellation_request_id: cancellationRequestId,
      decision,
      decided_by: decidedBy,
      note,
      refund_amount: refundAmount ?? null,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `decide_cancellation error ${res.status}`);
  return json;
}

type DiscountCorrection = { amount: number; note: string } | null;

// Callers that already hold a requireAdmin() result from earlier in the same
// request (e.g. adminCancelOrder) pass it through as `ctx` so this doesn't
// redo the auth.getUser() + role-lookup round trip a second time.
type AdminCtx = Awaited<ReturnType<typeof requireAdmin>>;

export async function approveAsWalletCredit(cancellationRequestId: number, userId: string, mealPlanId: number, amount: number, note: string, ctx?: AdminCtx): Promise<DiscountCorrection> {
  const { supabase, adminId } = ctx ?? await requireAdmin();
  if (amount <= 0) throw new Error("Credit amount must be positive");

  // Idempotency guard: if Flask's finalize call fails after the credit
  // already landed (e.g. a transient network error, or — as happened during
  // testing — a misconfigured shared secret), the admin sees an error and
  // naturally retries. Without this check, credit_wallet() is not itself
  // idempotent and a retry would credit the wallet a second time for the
  // same request. Check first; only credit if this request hasn't been
  // credited yet.
  const { data: existing, error: existingErr } = await (supabase as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .from("wallet_transactions")
    .select("id")
    .eq("related_cancellation_request_id", cancellationRequestId)
    .eq("type", "cancellation_credit")
    .limit(1);
  if (existingErr) throw new Error(existingErr.message);

  if (!existing || existing.length === 0) {
    // Credit via the admin's own session client — credit_wallet()'s
    // is_admin() check only resolves correctly when called this way, not
    // from Flask's service-role connection. Only after this succeeds do we
    // tell Flask to finalize the order (release slot, mark cancelled).
    const { error } = await (supabase as any).rpc("credit_wallet", { // eslint-disable-line @typescript-eslint/no-explicit-any
      p_user_id: userId,
      p_amount: amount,
      p_type: "cancellation_credit",
      p_related_order_id: mealPlanId,
      p_related_cancellation_request_id: cancellationRequestId,
      p_note: note || null,
    });
    if (error) throw new Error(error.message);
  }

  const result = await finalizeInFlask(cancellationRequestId, "approved_wallet", adminId, note);
  revalidatePath("/admin/cancellations");
  return (result?.discount_correction ?? null) as DiscountCorrection;
}

export async function approveAsRealRefund(cancellationRequestId: number, refundAmount: number, note: string, ctx?: AdminCtx): Promise<DiscountCorrection> {
  const { adminId } = ctx ?? await requireAdmin();
  if (refundAmount <= 0) throw new Error("Refund amount must be positive");

  const result = await finalizeInFlask(cancellationRequestId, "approved_refund", adminId, note, refundAmount);
  revalidatePath("/admin/cancellations");
  return (result?.discount_correction ?? null) as DiscountCorrection;
}

export async function cancelWithNoRefund(cancellationRequestId: number, note: string, ctx?: AdminCtx): Promise<DiscountCorrection> {
  const { adminId } = ctx ?? await requireAdmin();
  if (!note.trim()) throw new Error("A reason is required when cancelling with no refund");

  // Deliberately no wallet/refund call — the order finalizes as cancelled
  // (slot released, days marked cancelled) but no money moves in either
  // direction. Used when the client hadn't paid, or when the situation
  // doesn't warrant giving anything back.
  const result = await finalizeInFlask(cancellationRequestId, "approved_no_refund", adminId, note);
  revalidatePath("/admin/cancellations");
  return (result?.discount_correction ?? null) as DiscountCorrection;
}

export async function rejectCancellation(cancellationRequestId: number, note: string) {
  const { adminId } = await requireAdmin();
  if (!note.trim()) throw new Error("A reason is required when rejecting a cancellation request");

  await finalizeInFlask(cancellationRequestId, "rejected", adminId, note);
  revalidatePath("/admin/cancellations");
}
