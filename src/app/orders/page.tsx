import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OrderHistory from "@/components/OrderHistory";

type RawPlan     = { id: number; start_date: string | null; end_date: string | null; created_at: string };
type RawDay      = { id: number; meal_plan_id: number | null; date: string | null; status: string | null; delivery_id: number | null };
type RawPayment  = { id: number; meal_plan_day_id: number | null; amount: number | null; currency: string | null; status: string | null; provider: string | null; created_at: string };
type RawRecipe   = { id: number; meal_plan_day_id: number | null; meal_type: string | null; label: string | null; recipe: { id: number; name: string | null; photo: string | null } | null };
type RawDelivery = { id: number; meal_plan_day_id: number | null; delivery_date: string | null; status: string | null; delivery_address: string | null; delivery_slot_id: number | null };
type RawMacros   = { meal_plan_day_id: number | null; kcal_ordered: number | null; protein_ordered: number | null; carbs_ordered: number | null; fat_ordered: number | null };

export default async function OrdersPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

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

    return <OrderHistory plans={[]} userId={user.id} hasOlderOrders={(olderCount ?? 0) > 0} />;
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
    const plans = rawPlans.map(p => ({ ...p, meal_plan_day: [] }));
    return <OrderHistory plans={plans} userId={user.id} />;
  }

  // 3) Fetch payments, recipes, deliveries, solved macros in parallel by dayIds
  const [paymentsRes, recipesRes, deliveriesRes, macrosRes] = await Promise.all([
    supabase
      .from("payment")
      .select("id, meal_plan_day_id, amount, currency, status, provider, created_at")
      .in("meal_plan_day_id", dayIds),
    supabase
      .from("meal_plan_day_recipe")
      .select("id, meal_plan_day_id, meal_type, label, recipe:recipe_id ( id, name, photo )")
      .in("meal_plan_day_id", dayIds),
    supabase
      .from("deliveries")
      .select("id, meal_plan_day_id, delivery_date, status, delivery_address, delivery_slot_id")
      .in("meal_plan_day_id", dayIds),
    supabase
      .from("daily_macro_order")
      .select("meal_plan_day_id, kcal_ordered, protein_ordered, carbs_ordered, fat_ordered")
      .in("meal_plan_day_id", dayIds),
  ]);

  const payments   = (paymentsRes.data   ?? []) as RawPayment[];
  const dayRecipes = (recipesRes.data    ?? []) as RawRecipe[];
  const deliveries = (deliveriesRes.data ?? []) as RawDelivery[];
  const macros     = (macrosRes.data     ?? []) as RawMacros[];

  // 4) Assemble
  const plans = rawPlans.map(plan => ({
    ...plan,
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

  return <OrderHistory plans={plans} userId={user.id} />;
}
