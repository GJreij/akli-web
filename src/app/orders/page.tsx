import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OrderHistory, { type ActivityItem } from "@/components/OrderHistory";

type RawPlan     = { id: number; start_date: string | null; end_date: string | null; created_at: string };
type RawDay      = { id: number; meal_plan_id: number | null; date: string | null; status: string | null; delivery_id: number | null };
type RawPayment  = { id: number; meal_plan_day_id: number | null; amount: number | null; currency: string | null; status: string | null; provider: string | null; created_at: string; wallet_amount_applied: number | null };
type RawRecipe   = { id: number; meal_plan_day_id: number | null; meal_type: string | null; label: string | null; is_swapped: boolean | null; recipe: { id: number; name: string | null; photo: string | null } | null };
type RawDelivery = { id: number; meal_plan_day_id: number | null; delivery_date: string | null; status: string | null; delivery_address: string | null; delivery_slot_id: number | null };
type RawMacros   = { meal_plan_day_id: number | null; kcal_ordered: number | null; protein_ordered: number | null; carbs_ordered: number | null; fat_ordered: number | null };

type RawSwapLog = { id: number; meal_plan_id: number | null; summary: string | null; price_delta: number | null; created_at: string };
type RawEditLog = { id: number; meal_plan_id: number | null; summary: string | null; price_delta: number | null; created_at: string };
type RawCancellation = { id: number; meal_plan_id: number | null; status: string | null; meal_plan_day_ids: number[] | null; decision_note: string | null; decided_at: string | null };
type RawWalletTx = { id: number; related_order_id: number | null; type: string | null; amount: number | null; note: string | null; created_at: string };

const CANCELLATION_STATUS_LABEL: Record<string, string> = {
  approved_wallet: "Cancelled — credited to wallet",
  approved_refund: "Cancelled — refunded",
  approved_no_refund: "Cancelled — no refund",
};

export default async function OrdersPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  // Server-side SUM via get_wallet_balance() — a plain `.select("amount")`
  // here is capped at PostgREST's default row limit and silently truncates
  // the sum once a user's wallet_transactions history grows past it.
  const walletBalanceRes = await (supabase as any).rpc("get_wallet_balance", { p_user_id: user.id }); // eslint-disable-line @typescript-eslint/no-explicit-any
  const walletBalance = Number(walletBalanceRes.data ?? 0);

  // History is scoped to the last 3 months (matches the "last 3 months" copy
  // in OrderHistory) — the row limit below is just a safety cap for very
  // frequent orderers, the date filter is what actually bounds the window.
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  // 1) Fetch meal plans
  const plansRes = await supabase
    .from("meal_plan")
    .select("id, start_date, end_date, created_at")
    .eq("user_id", user.id)
    .gte("created_at", threeMonthsAgo.toISOString())
    .order("created_at", { ascending: false })
    .limit(50);

  const rawPlans = (plansRes.data ?? []) as RawPlan[];

  if (rawPlans.length === 0) {
    // Distinguish "you've never ordered" from "your orders are all older than
    // 3 months" — without this, both cases show the identical "No orders yet"
    // empty state, which reads as a bug to anyone who knows they've ordered before.
    const { count: olderCount } = await supabase
      .from("meal_plan")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .lt("created_at", threeMonthsAgo.toISOString());

    return <OrderHistory plans={[]} userId={user.id} hasOlderOrders={(olderCount ?? 0) > 0} walletBalance={walletBalance} />;
  }

  const planIds = rawPlans.map(p => p.id);

  // 2) Fetch days
  const daysRes = await supabase
    .from("meal_plan_day")
    .select("id, meal_plan_id, date, status, delivery_id")
    .in("meal_plan_id", planIds);

  const days   = (daysRes.data ?? []) as RawDay[];
  const dayIds = days.map(d => d.id);

  if (dayIds.length === 0) {
    const plans = rawPlans.map(p => ({ ...p, meal_plan_day: [], activity: [] as ActivityItem[] }));
    return <OrderHistory plans={plans} userId={user.id} walletBalance={walletBalance} />;
  }

  // 3) Fetch payments, recipes, deliveries, solved macros in parallel by dayIds
  //    — plus the post-checkout activity trail (swaps/edits/cancellations/
  //    wallet events) in parallel by planIds.
  const [paymentsRes, recipesRes, deliveriesRes, macrosRes, swapLogRes, editLogRes, cancellationRes, walletTxRes] = await Promise.all([
    supabase
      .from("payment")
      .select("id, meal_plan_day_id, amount, currency, status, provider, created_at, wallet_amount_applied")
      .in("meal_plan_day_id", dayIds),
    supabase
      .from("meal_plan_day_recipe")
      .select("id, meal_plan_day_id, meal_type, label, is_swapped, recipe:recipe_id ( id, name, photo )")
      .in("meal_plan_day_id", dayIds),
    supabase
      .from("deliveries")
      .select("id, meal_plan_day_id, delivery_date, status, delivery_address, delivery_slot_id")
      .in("meal_plan_day_id", dayIds),
    supabase
      .from("daily_macro_order")
      .select("meal_plan_day_id, kcal_ordered, protein_ordered, carbs_ordered, fat_ordered")
      .in("meal_plan_day_id", dayIds),
    supabase
      .from("meal_swap_log")
      .select("id, meal_plan_id, summary, price_delta, created_at")
      .in("meal_plan_id", planIds),
    supabase
      .from("day_edit_log")
      .select("id, meal_plan_id, summary, price_delta, created_at")
      .in("meal_plan_id", planIds),
    supabase
      .from("cancellation_request")
      .select("id, meal_plan_id, status, meal_plan_day_ids, decision_note, decided_at")
      .in("meal_plan_id", planIds)
      .neq("status", "pending"),
    // Only top-ups and discount corrections — swap/edit wallet deltas are
    // already covered above with better (recipe-name-aware) summaries, so
    // including them here too would duplicate every swap/edit as two rows.
    supabase
      .from("wallet_transactions")
      .select("id, related_order_id, type, amount, note, created_at")
      .in("related_order_id", planIds)
      .in("type", ["checkout_topup", "volume_discount_adjustment_debit", "volume_discount_adjustment_credit"]),
  ]);

  const payments   = (paymentsRes.data   ?? []) as RawPayment[];
  const dayRecipes = (recipesRes.data    ?? []) as RawRecipe[];
  const deliveries = (deliveriesRes.data ?? []) as RawDelivery[];
  const macros     = (macrosRes.data     ?? []) as RawMacros[];
  const swapLogs        = (swapLogRes.data ?? []) as RawSwapLog[];
  const editLogs        = (editLogRes.data ?? []) as RawEditLog[];
  const cancellations   = (cancellationRes.data ?? []) as RawCancellation[];
  const walletTxs       = (walletTxRes.data ?? []) as RawWalletTx[];

  function activityFor(planId: number): ActivityItem[] {
    const items: ActivityItem[] = [];
    for (const s of swapLogs) {
      if (s.meal_plan_id === planId) items.push({ kind: "swap", summary: s.summary ?? "Meal swapped", amount: s.price_delta, at: s.created_at });
    }
    for (const e of editLogs) {
      if (e.meal_plan_id === planId) items.push({ kind: "edit", summary: e.summary ?? "Day edited", amount: e.price_delta, at: e.created_at });
    }
    for (const c of cancellations) {
      if (c.meal_plan_id !== planId || c.status === "rejected") continue;
      const dayCount = (c.meal_plan_day_ids ?? []).length;
      const label = (c.status && CANCELLATION_STATUS_LABEL[c.status]) || "Cancelled";
      const summary = `${label} (${dayCount} day${dayCount === 1 ? "" : "s"})${c.decision_note ? ` — ${c.decision_note}` : ""}`;
      items.push({ kind: "cancellation", summary, amount: null, at: c.decided_at ?? "" });
    }
    for (const w of walletTxs) {
      if (w.related_order_id !== planId) continue;
      const summary = w.type === "checkout_topup"
        ? `Added $${(w.amount ?? 0).toFixed(2)} to wallet at checkout`
        : (w.note ?? "Wallet adjustment");
      items.push({ kind: "wallet", summary, amount: w.type === "checkout_topup" ? null : w.amount, at: w.created_at });
    }
    return items.sort((a, b) => b.at.localeCompare(a.at));
  }

  // 4) Assemble
  const plans = rawPlans.map(plan => ({
    ...plan,
    activity: activityFor(plan.id),
    meal_plan_day: days
      .filter(d => d.meal_plan_id === plan.id)
      .map(day => ({
        id:                   day.id,
        date:                 day.date,
        status:               day.status,
        delivery_id:          day.delivery_id ?? null,
        payment:              payments.filter(p => p.meal_plan_day_id === day.id),
        deliveries:           deliveries.filter(d => d.meal_plan_day_id === day.id),
        meal_plan_day_recipe: dayRecipes.filter(r => r.meal_plan_day_id === day.id),
        macros:               macros.find(m => m.meal_plan_day_id === day.id) ?? null,
      })),
  }));

  return <OrderHistory plans={plans} userId={user.id} walletBalance={walletBalance} />;
}
