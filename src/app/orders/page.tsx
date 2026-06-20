import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OrderHistory from "@/components/OrderHistory";

export default async function OrdersPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  // 1) Fetch meal plans
  const { data: rawPlans } = await supabase
    .from("meal_plan")
    .select("id, start_date, end_date, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);

  if (!rawPlans || rawPlans.length === 0) {
    return <OrderHistory plans={[]} userId={user.id} />;
  }

  const planIds = rawPlans.map(p => p.id);

  // 2) Fetch days (needed to get day IDs for subsequent queries)
  const { data: days = [] } = await supabase
    .from("meal_plan_day")
    .select("id, meal_plan_id, date, status")
    .in("meal_plan_id", planIds);

  const dayIds = (days ?? []).map(d => d.id);

  // 3) Fetch everything that depends on dayIds in parallel
  //    NOTE: deliveries ↔ meal_plan_day have a circular FK so we avoid nested selects.
  //    deliveries table has meal_plan_day_id as FK → use that directly.
  const [paymentsRes, recipesRes, deliveriesRes] = await Promise.all([
    dayIds.length > 0
      ? supabase
          .from("payment")
          .select("id, meal_plan_day_id, amount, currency, status, provider, created_at")
          .in("meal_plan_day_id", dayIds)
      : Promise.resolve({ data: [] as unknown[] }),
    dayIds.length > 0
      ? supabase
          .from("meal_plan_day_recipe")
          .select("id, meal_plan_day_id, meal_type, label, recipe:recipe_id ( id, name, photo )")
          .in("meal_plan_day_id", dayIds)
      : Promise.resolve({ data: [] as unknown[] }),
    dayIds.length > 0
      ? supabase
          .from("deliveries")
          .select("id, meal_plan_day_id, delivery_date, status, delivery_address")
          .in("meal_plan_day_id", dayIds)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  const payments   = (paymentsRes.data   ?? []) as Array<{ id: number; meal_plan_day_id: number | null; amount: number | null; currency: string | null; status: string | null; provider: string | null; created_at: string }>;
  const dayRecipes = (recipesRes.data    ?? []) as Array<{ id: number; meal_plan_day_id: number | null; meal_type: string | null; label: string | null; recipe: { id: number; name: string | null; photo: string | null } | null }>;
  const deliveries = (deliveriesRes.data ?? []) as Array<{ id: number; meal_plan_day_id: number | null; delivery_date: string | null; status: string | null; delivery_address: string | null }>;

  // 4) Assemble nested structure
  const plans = rawPlans.map(plan => ({
    ...plan,
    meal_plan_day: (days ?? [])
      .filter(d => d.meal_plan_id === plan.id)
      .map(day => ({
        ...day,
        payment:              payments.filter(p => p.meal_plan_day_id === day.id),
        deliveries:           deliveries.filter(d => d.meal_plan_day_id === day.id),
        meal_plan_day_recipe: dayRecipes.filter(r => r.meal_plan_day_id === day.id),
      })),
  }));

  return <OrderHistory plans={plans} userId={user.id} />;
}
