const FLASK_URL = process.env.NEXT_PUBLIC_FLASK_URL ?? "https://aklilebapp-72376dbe3cc8.herokuapp.com";

// ─── /generate_meal_plan ────────────────────────────────────────────────────
// The solver fetches recipes and macro targets itself from Supabase using
// user_id + dates. Only pass what's listed below.

export interface GenerateMealPlanRequest {
  user_id: string;
  start_date: string;              // "YYYY-MM-DD"
  end_date: string;                // "YYYY-MM-DD"
  include_weekends?: boolean;
  meals?: Record<string, string>;  // e.g. { breakfast: "breakfast", lunch: "lunch" }
  kitchen_id?: number;
  day_build_tries?: number;
}

export interface SubrecipeMacros {
  protein: number; carbs: number; fat: number; kcal: number;
}

export interface MealSubrecipe {
  subrecipe_id: number;
  name: string;
  servings: number;
  macros: SubrecipeMacros;
}

export interface Meal {
  meal_key: string;
  meal_type: "breakfast" | "lunch" | "dinner" | "snack";
  recipe_id: number;
  recipe_name: string;
  photo: string | null;
  macros: SubrecipeMacros;
  subrecipes: MealSubrecipe[];
}

export interface PlanDay {
  date: string;
  weekday: number;
  is_weekend: boolean;
  macro_error: number;
  totals: SubrecipeMacros;
  meals: Meal[];
}

export interface GenerateMealPlanResponse {
  user_id: string;
  start_date: string;
  end_date: string;
  daily_macro_target: { protein_g: number; carbs_g: number; fat_g: number; kcal: number };
  excluded_dates: string[];
  days: PlanDay[];
}

export async function generateMealPlan(
  req: GenerateMealPlanRequest
): Promise<GenerateMealPlanResponse> {
  const res = await fetch(`${FLASK_URL}/generate_meal_plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`generate_meal_plan error ${res.status}: ${await res.text()}`);
  return res.json();
}

// ─── /check_meal_plan_conflict ───────────────────────────────────────────────

export async function checkMealPlanConflict(
  user_id: string,
  start_date: string,
  end_date: string
): Promise<{ has_conflict: boolean; conflicts: unknown[] }> {
  const res = await fetch(`${FLASK_URL}/check_meal_plan_conflict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id, start_date, end_date }),
  });
  if (!res.ok) throw new Error(`check_conflict error ${res.status}`);
  return res.json();
}

// ─── /checkout_summary ───────────────────────────────────────────────────────

export interface CheckoutSummaryResponse {
  user_id: string;
  total_meals: number;
  macro_summary: { avg_kcal: number; avg_protein: number; avg_carbs: number; avg_fat: number };
  price_breakdown: {
    total_price_before_discount: number;
    discount_amount: number;
    final_price_before_delivery: number;
    delivery: {
      fee_per_day: number;
      minimum_per_day_for_free_delivery: number;
      delivery_days: number;
      delivery_fee: number;
      is_free_delivery: boolean;
    };
    final_price: number;
    promo_code_status: "valid" | "invalid" | "not_provided";
    promo_code_used: string | null;
    promo_message: string;
    promo_code_id: number | null;
    daily_breakdown: Array<{
      date: string;
      total_price: number;
      original_total_price: number;
      meals: number;
      delivery_applied: boolean;
      delivery_fee: number;
      total_price_with_delivery: number;
    }>;
  };
}

export async function getCheckoutSummary(
  user_id: string,
  final_plan: GenerateMealPlanResponse,
  promo_code?: string
): Promise<CheckoutSummaryResponse> {
  const res = await fetch(`${FLASK_URL}/checkout_summary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id, final_plan, promo_code: promo_code ?? null }),
  });
  if (!res.ok) throw new Error(`checkout_summary error ${res.status}: ${await res.text()}`);
  return res.json();
}

// ─── /confirm_order ──────────────────────────────────────────────────────────

export async function confirmOrder(
  user_id: string,
  meal_plan: GenerateMealPlanResponse,
  checkout_summary: CheckoutSummaryResponse,
  delivery_slot_id: number
): Promise<{ success: boolean; order_id?: number; error?: string }> {
  const res = await fetch(`${FLASK_URL}/confirm_order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id, meal_plan, checkout_summary, delivery_slot_id }),
  });
  if (!res.ok) throw new Error(`confirm_order error ${res.status}: ${await res.text()}`);
  return res.json();
}

// ─── /update_meal_plan ───────────────────────────────────────────────────────

export async function updateMealPlan(
  original_plan: GenerateMealPlanResponse,
  change_logs: unknown[]
): Promise<GenerateMealPlanResponse> {
  const res = await fetch(`${FLASK_URL}/update_meal_plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ original_plan, change_logs }),
  });
  if (!res.ok) throw new Error(`update_meal_plan error ${res.status}`);
  return res.json();
}
