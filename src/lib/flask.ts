const FLASK_URL = process.env.NEXT_PUBLIC_FLASK_URL ?? "https://aklilebapp-72376dbe3cc8.herokuapp.com";

// ─── /simple_price_simulator ────────────────────────────────────────────────

export interface PriceSimulatorRequest {
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  meals_per_day: number;
  avg_subrecipes_per_meal: number;
  apply_kcal_discount?: boolean;
}

export interface PriceSimulatorResponse {
  avg_day_price: number;
  breakdown: {
    base_macro_cost: number;
    kcal_discount_pct: number;
    macro_cost_after_discount: number;
    day_packaging_cost: number;
    recipes_packaging_cost: number;
    subrecipes_packaging_cost: number;
  };
}

export async function simplePriceSimulator(
  req: PriceSimulatorRequest
): Promise<PriceSimulatorResponse> {
  const res = await fetch(`${FLASK_URL}/simple_price_simulator`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`price_simulator error ${res.status}: ${await res.text()}`);
  return res.json();
}

// ─── /generate_meal_plan ────────────────────────────────────────────────────
// The solver fetches recipes and macro targets itself from Supabase using
// user_id + dates. Only pass what's listed below.

export interface GenerateMealPlanRequest {
  user_id: string;
  start_date: string;              // "YYYY-MM-DD"
  end_date: string;                // "YYYY-MM-DD"
  include_weekends?: boolean;
  meals?: Record<string, string>;  // e.g. { breakfast: "breakfast", lunch: "lunch" }
  kcal_override?: number;          // when user is "eating out" for excluded meals, reduces daily target
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
      waived_by_promo: boolean;
    };
    final_price: number;
    volume_discount: {
      amount: number;
      rule_name: string | null;
      min_order_days: number | null;
    };
    promo_discount_amount: number;
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
  delivery_slot_id: number,
  payment_method: "cash" | "whish" | "neo",
  delivery_address_id: number
): Promise<{ success: boolean; order_id?: number; error?: string }> {
  const res = await fetch(`${FLASK_URL}/confirm_order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id, meal_plan, checkout_summary, delivery_slot_id, payment_method, delivery_address_id }),
  });
  if (!res.ok) throw new Error(`confirm_order error ${res.status}: ${await res.text()}`);
  return res.json();
}

// ─── /update_meal_plan ───────────────────────────────────────────────────────

export interface ChangeLog {
  date: string;
  created_at: string;    // ISO string
  meal_key?: string;     // omit for full-day delete
  Delete?: boolean;
  old_recipe_id?: number;
  new_recipe_id?: number;
  include_macros_in_rest?: boolean; // true = spread to other meals, false = eating out (reduce day kcal)
  meal_type?: "breakfast" | "lunch" | "dinner" | "snack"; // required when adding a brand-new meal (no old_recipe_id)
}

export async function updateMealPlan(
  original_plan: GenerateMealPlanResponse,
  change_logs: ChangeLog[]
): Promise<GenerateMealPlanResponse> {
  const res = await fetch(`${FLASK_URL}/update_meal_plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ original_plan, change_logs }),
  });
  if (!res.ok) throw new Error(`update_meal_plan error ${res.status}`);
  return res.json();
}

// ─── /ingredients-to-buy ─────────────────────────────────────────────────────

export interface IngredientToBuy {
  ingredient_id: number;
  name: string;
  unit: string | null;
  total_quantity: number;
}

export async function getIngredientsToBuy(
  start_date: string,
  end_date: string,
  opts?: { recipe?: string; client?: string; delivery_slot?: string }
): Promise<IngredientToBuy[]> {
  const params = new URLSearchParams({ start_date, end_date });
  if (opts?.recipe) params.set("recipe", opts.recipe);
  if (opts?.client) params.set("client", opts.client);
  if (opts?.delivery_slot) params.set("delivery_slot", opts.delivery_slot);

  const res = await fetch(`${FLASK_URL}/ingredients-to-buy?${params.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`ingredients_to_buy error ${res.status}: ${await res.text()}`);
  return res.json();
}

// ─── /cooking/overview ───────────────────────────────────────────────────────

export interface CookingIngredient {
  ingredient_id: number;
  name: string;
  unit: string | null;
  total_quantity?: number;
  quantity?: number;
}

export interface CookingComment {
  user_id: string;
  name: string;
  comment: string | null;
  updated_at: string | null;
  created_at: string | null;
}

export interface CookingSubrecipe {
  subrecipe_id: number;
  name: string;
  description: string | null;
  instructions: string | null;
  status: "completed" | "in_progress" | "pending";
  progress: number;
  total_servings: number;
  selected_meal_plan_day_recipe_serving_id: number[];
  ingredients_needed: CookingIngredient[];
}

export interface CookingRecipe {
  recipe_id: number;
  name: string;
  description: string | null;
  instructions: string | null;
  meal_plan_day_recipe_ids: number[];
  earliest_date: string;
  cooking_status: string | null;
  progress: number;
  ingredients_needed: CookingIngredient[];
  subrecipes: CookingSubrecipe[];
  comments: CookingComment[];
}

export interface CookingOverviewFilters {
  client_id?: string;
  delivery_slot_id?: string;
  recipe_id?: string;
  subrecipe_id?: string;
  cooking_status?: string;
}

export async function getCookingOverview(
  start_date: string,
  end_date: string,
  filters?: CookingOverviewFilters
): Promise<CookingRecipe[]> {
  const res = await fetch(`${FLASK_URL}/cooking/overview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ start_date, end_date, ...filters }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`cooking_overview error ${res.status}: ${await res.text()}`);
  return res.json();
}

// ─── /portioning/summary ─────────────────────────────────────────────────────

export interface PortioningClient {
  meal_plan_day_recipe_serving_id: number;
  delivery_date: string | null;
  delivery_slot: { id: number; start_time: string; end_time: string } | null;
  client: { id: string; name: string | null; last_name: string | null } | null;
  servings_for_client: number | null;
  cooking_status: string | null;
  portioning_status: string | null;
  weight_after_cooking: number;
  has_weight_after_cooking: boolean;
}

export interface PortioningSummary {
  subrecipe: { id: number; name: string | null };
  summary: {
    total_subrecipe_servings_for_batch: number;
    ingredients: {
      ingredient_id: number;
      name: string;
      unit: string | null;
      quantity_per_subrecipe: number;
      serving_per_unit: number;
      total_units_for_batch: number;
      total_servings_equivalent: number;
      optional: boolean | null;
    }[];
  };
  clients: PortioningClient[];
}

// ─── /packaging ───────────────────────────────────────────────────────────

export interface PackagingSubrecipe {
  subrecipe_id: number;
  subrecipe_name: string | null;
  serving_size: number | null;
}

export interface PackagingRecipe {
  meal_plan_day_recipe_id: number;
  meal_type: string | null;
  recipe_name: string | null;
  packaging_status: string;
  subrecipes: PackagingSubrecipe[];
}

export interface PackagingClient {
  name: string | null;
  last_name: string | null;
  recipes: PackagingRecipe[];
}

export interface PackagingSlot {
  slot_id: number | null;
  start_time: string | null;
  end_time: string | null;
  clients: PackagingClient[];
}

export interface PackagingDay {
  delivery_date: string;
  slots: PackagingSlot[];
}

export async function getPackagingView(
  start_date: string,
  end_date: string
): Promise<PackagingDay[]> {
  const res = await fetch(`${FLASK_URL}/packaging`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ start_date, end_date }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`packaging error ${res.status}: ${await res.text()}`);
  return res.json();
}

// ─── /deliveries/overview ───────────────────────────────────────────────────

export interface DeliveryPayment {
  amount: number | null;
  currency: string | null;
  provider: string | null;
  status: string | null;
  collect_cash: boolean;
}

export interface DeliveryRow {
  id: number;
  delivery_date: string | null;
  status: string | null;
  delivery_slot: { id: number; start_time: string | null; end_time: string | null } | null;
  client: { id: string | null; name: string | null; last_name: string | null; phone_number: string | null } | null;
  address: string | null;
  maps_link: string | null;
  payment: DeliveryPayment | null;
}

export async function getDeliveriesOverview(
  start_date: string,
  end_date: string
): Promise<DeliveryRow[]> {
  const res = await fetch(`${FLASK_URL}/deliveries/overview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ start_date, end_date }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`deliveries_overview error ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function getPortioningSummary(
  subrecipe_id: number,
  meal_plan_day_recipe_ids: number[],
  cooking_status: string = "completed"
): Promise<{ data?: PortioningSummary; error?: string }> {
  const res = await fetch(`${FLASK_URL}/portioning/summary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subrecipe_id, meal_plan_day_recipe_ids, cooking_status }),
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok) return { error: json.error ?? `portioning_summary error ${res.status}` };
  return { data: json };
}
