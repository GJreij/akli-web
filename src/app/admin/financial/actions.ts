"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/requireAdmin";

export async function setPaymentStatus(paymentIds: number[], status: "paid" | "pending", mealPlanId?: number | null) {
  if (paymentIds.length === 0) return;
  const { supabase } = await requireAdmin();
  const { error } = await (supabase.from("payment") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .update({ status })
    .in("id", paymentIds);
  if (error) throw new Error(error.message);

  // A wallet top-up added at checkout only gets credited once the whole
  // order's payment is actually confirmed — not at order placement, since
  // payment starts "pending" for cash/Whish/Neo and crediting before that
  // would create wallet money that doesn't exist yet.
  if (status === "paid" && mealPlanId != null) {
    await creditCheckoutTopupIfFullyPaid(supabase, mealPlanId);
  }

  // Payment status is also shown on the per-client admin page — revalidate
  // the whole admin section (all routes share the one root admin layout).
  revalidatePath("/admin", "layout");
}

async function creditCheckoutTopupIfFullyPaid(supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"], mealPlanId: number) {
  const { data: topups } = await (supabase as any)
    .from("wallet_checkout_topup")
    .select("id, user_id, amount")
    .eq("meal_plan_id", mealPlanId)
    .eq("credited", false);
  if (!topups || topups.length === 0) return;

  const { data: days } = await (supabase as any)
    .from("meal_plan_day")
    .select("id")
    .eq("meal_plan_id", mealPlanId);
  const dayIds = (days ?? []).map((d: { id: number }) => d.id);
  if (dayIds.length === 0) return;

  const { data: payments } = await (supabase as any)
    .from("payment")
    .select("status")
    .in("meal_plan_day_id", dayIds);
  const allPaid = (payments ?? []).length > 0 && (payments ?? []).every((p: { status: string | null }) => p.status === "paid");
  if (!allPaid) return;

  for (const topup of topups as { id: number; user_id: string; amount: number }[]) {
    const { error: creditErr } = await (supabase as any).rpc("credit_wallet", {
      p_user_id: topup.user_id,
      p_amount: topup.amount,
      p_type: "checkout_topup",
      p_related_order_id: mealPlanId,
      p_note: "Wallet top-up added at checkout",
    });
    if (creditErr) throw new Error(creditErr.message);

    const { error: markErr } = await (supabase as any)
      .from("wallet_checkout_topup")
      .update({ credited: true, credited_at: new Date().toISOString() })
      .eq("id", topup.id);
    if (markErr) throw new Error(markErr.message);
  }
}
