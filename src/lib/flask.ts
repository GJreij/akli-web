const FLASK_URL = process.env.NEXT_PUBLIC_FLASK_URL ?? "https://aklilebapp-72376dbe3cc8.herokuapp.com";

// A dyno that's asleep, restarting, or has crashed can return a non-JSON
// body (an HTML error page, or nothing at all) on a non-2xx — or even a 2xx
// from a proxy in front of it. Calling res.json() directly in that case
// throws a raw SyntaxError before the caller's own `if (!res.ok)` handling
// ever runs, losing whatever specific error/suggestion fields it was meant
// to surface. Parse defensively instead and fall back to null.
async function safeJson(res: Response): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    return await res.json();
  } catch {
    return null;
  }
}

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

export interface PlanSummaryUsedRecipe {
  recipe_id: number;
  recipe_name: string | null;
  times_used: number;
}

export interface PlanSummaryUnusedRecipe {
  recipe_id: number;
  recipe_name: string | null;
}

// One per weekly_menu period the plan spans -- "what you'll eat / what
// you won't" is scoped to what was actually available in that window.
export interface PlanSummaryPeriod {
  start_date: string;
  end_date: string;
  used: PlanSummaryUsedRecipe[];
  not_used: PlanSummaryUnusedRecipe[];
}

export interface GenerateMealPlanResponse {
  user_id: string;
  start_date: string;
  end_date: string;
  daily_macro_target: { protein_g: number; carbs_g: number; fat_g: number; kcal: number };
  excluded_dates: string[];
  days: PlanDay[];
  plan_summary: PlanSummaryPeriod[];
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
    wallet_balance: number;
    wallet_max_applicable: number;
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
  delivery_address_id: number,
  wallet_amount_requested?: number,
  wallet_topup_amount?: number
): Promise<{ success: boolean; order_id?: number; error?: string }> {
  const res = await fetch(`${FLASK_URL}/confirm_order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id, meal_plan, checkout_summary, delivery_slot_id, payment_method, delivery_address_id,
      wallet_amount_requested: wallet_amount_requested ?? 0,
      wallet_topup_amount: wallet_topup_amount ?? 0,
    }),
  });
  if (!res.ok) throw new Error(`confirm_order error ${res.status}: ${await res.text()}`);
  return res.json();
}

// ─── /request_cancellation ──────────────────────────────────────────────────

export async function requestCancellation(
  user_id: string,
  meal_plan_id: number,
  meal_plan_day_ids?: number[]
): Promise<{ success: boolean; cancellation_request_id?: number; error?: string }> {
  const res = await fetch(`${FLASK_URL}/request_cancellation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id, meal_plan_id, meal_plan_day_ids: meal_plan_day_ids ?? null }),
  });
  const json = await safeJson(res);
  if (!res.ok) return { success: false, error: json?.error ?? `request_cancellation error ${res.status}` };
  if (!json) return { success: false, error: "Unexpected response from server" };
  return json;
}

export interface DiscountImpactPreview {
  amount: number;
  note: string;
}

export async function previewCancellationDiscountImpact(
  user_id: string,
  meal_plan_id: number,
  meal_plan_day_ids: number[]
): Promise<{ discount_impact: DiscountImpactPreview | null; error?: string }> {
  const res = await fetch(`${FLASK_URL}/preview_cancellation_discount_impact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id, meal_plan_id, meal_plan_day_ids }),
  });
  const json = await safeJson(res);
  if (!res.ok) return { discount_impact: null, error: json?.error ?? `preview error ${res.status}` };
  if (!json) return { discount_impact: null, error: "Unexpected response from server" };
  return json;
}

// ─── /available_recipes_for_date ────────────────────────────────────────────

// Returns null specifically on failure (network error, non-2xx, unparseable
// body) — distinct from a successful call returning an empty array, which
// legitimately means "no weekly menu configured, don't filter." Collapsing
// both into `[]` (as this used to do) makes a genuine backend outage
// indistinguishable from "no restriction," silently showing every could-be-X
// recipe as available instead of surfacing that the check couldn't run.
export async function getAvailableRecipeIdsForDate(date: string): Promise<number[] | null> {
  try {
    const res = await fetch(`${FLASK_URL}/available_recipes_for_date`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await safeJson(res);
    return Array.isArray(json?.recipe_ids) ? json.recipe_ids : null;
  } catch {
    return null;
  }
}

// ─── /modify_meal/preview & /modify_meal/confirm ────────────────────────────

export interface MealSwapRequest {
  user_id: string;
  meal_plan_day_id: number;
  meal_plan_day_recipe_id: number;
  new_recipe_id: number;
}

export type MealSwapMode = "meal_only" | "rebalance_day";

export interface MealSwapConfirmRequest extends MealSwapRequest {
  mode: MealSwapMode;
}

export interface MealSwapMacros {
  protein: number;
  carbs: number;
  fat: number;
  kcal: number;
}

export interface MealSwapMealSnapshot {
  meal: { recipe_id: number; name: string | null; macros: MealSwapMacros };
  day_totals: MealSwapMacros & { price: number | null };
}

export interface MealSwapOtherMeal {
  meal_plan_day_recipe_id: number;
  meal_type: string;
  recipe_name: string | null;
  before_macros: MealSwapMacros;
  after_macros: MealSwapMacros;
}

export interface MealSwapWallet {
  balance_before: number;
  delta: number;
  balance_after: number;
  sufficient: boolean;
}

export interface MealSwapOption {
  eligible: boolean;
  reason: string | null;
  // Set only when eligible is false (reason "insufficient_wallet") — how
  // much more the client would need in their wallet for this exact option.
  required_topup: number | null;
  after: MealSwapMealSnapshot & { other_meals: MealSwapOtherMeal[] };
  price_delta: number;
  wallet: MealSwapWallet;
}

export interface MealSwapResponse {
  before: MealSwapMealSnapshot;
  options: {
    meal_only: MealSwapOption;
    // null only in the rare case where even the loosest bounded rebalance
    // can't find any solution at all — the client only sees "just this meal".
    rebalance_day: MealSwapOption | null;
  };
  swap_id: number | null;
  confirmed_mode?: MealSwapMode;
}

export interface MealSwapErrorResponse {
  error: string;
  suggestion?: string;
  reason?: string;
  required_topup?: number;
}

async function postMealSwap(
  path: "preview" | "confirm",
  req: MealSwapRequest | MealSwapConfirmRequest
): Promise<{ data?: MealSwapResponse; error?: MealSwapErrorResponse }> {
  const res = await fetch(`${FLASK_URL}/modify_meal/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  const json = await safeJson(res);
  if (!res.ok) return { error: (json as MealSwapErrorResponse) ?? { error: `modify_meal/${path} error ${res.status}` } };
  if (!json) return { error: { error: "Unexpected response from server" } };
  return { data: json as MealSwapResponse };
}

export function previewMealSwap(req: MealSwapRequest) {
  return postMealSwap("preview", req);
}

export function confirmMealSwap(req: MealSwapConfirmRequest) {
  return postMealSwap("confirm", req);
}

// ─── /edit_day/preview & /edit_day/confirm ──────────────────────────────────

export interface DayEditChange {
  action: "delete" | "replace" | "add";
  meal_plan_day_recipe_id?: number;
  new_recipe_id?: number;
  meal_type?: string;
}

export interface DayEditRequest {
  user_id: string;
  meal_plan_day_id: number;
  changes: DayEditChange[];
}

export interface DayEditMeal {
  meal_plan_day_recipe_id: number | null;
  meal_type: string;
  recipe_id: number;
  recipe_name: string | null;
  macros: MealSwapMacros;
}

export interface DayEditResponse {
  eligible: boolean;
  reason: string | null;
  required_topup: number | null;
  goal: MealSwapMacros;
  before: { day_totals: MealSwapMacros & { price: number } };
  after: { day_totals: MealSwapMacros & { price: number }; meals: DayEditMeal[] };
  price_delta: number;
  wallet: MealSwapWallet;
  edit_id: number | null;
}

async function postDayEdit(
  path: "preview" | "confirm",
  req: DayEditRequest
): Promise<{ data?: DayEditResponse; error?: MealSwapErrorResponse }> {
  const res = await fetch(`${FLASK_URL}/edit_day/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  const json = await safeJson(res);
  if (!res.ok) return { error: (json as MealSwapErrorResponse) ?? { error: `edit_day/${path} error ${res.status}` } };
  if (!json) return { error: { error: "Unexpected response from server" } };
  return { data: json as DayEditResponse };
}

export function previewDayEdit(req: DayEditRequest) {
  return postDayEdit("preview", req);
}

export function confirmDayEdit(req: DayEditRequest) {
  return postDayEdit("confirm", req);
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
  ingredients_needed: CookingIngredient[];
  subrecipes: CookingSubrecipe[];
  comments: CookingComment[];
  // True if this recipe was swapped in (via the client-facing "Modify"
  // feature) on any of the underlying days grouped into this card — a
  // pre-swap printed label may show the wrong macros.
  any_swapped?: boolean;
}

export interface CookingOverviewFilters {
  client_id?: string;
  delivery_slot_id?: string;
  recipe_id?: string;
  subrecipe_id?: string;
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
  meal_plan_day_recipe_id: number;
  recipe_name: string | null;
  meal_type: string | null;
  delivery_date: string | null;
  delivery_slot: { id: number; start_time: string; end_time: string } | null;
  client: { id: string; name: string | null; last_name: string | null } | null;
  servings_for_client: number | null;
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
  // True if this exact meal was swapped in (via the client-facing "Modify"
  // feature) — a pre-swap printed label may show the wrong macros.
  is_swapped: boolean;
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

// services/portioning_service.py returns this shape (not a plain string) when
// some but not all of the requested meal_plan_day_recipe_ids have a serving
// row for the subrecipe — a partial-batch mismatch.
export interface PortioningPartialError {
  error: string;
  missing: number[];
  extra_found: number[];
}

export async function getPortioningSummary(
  subrecipe_id: number,
  meal_plan_day_recipe_ids: number[]
): Promise<{ data?: PortioningSummary; error?: string | PortioningPartialError }> {
  const res = await fetch(`${FLASK_URL}/portioning/summary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subrecipe_id, meal_plan_day_recipe_ids }),
    cache: "no-store",
  });
  const json = await safeJson(res);
  if (!res.ok) return { error: json?.error ?? `portioning_summary error ${res.status}` };
  if (!json) return { error: "Unexpected response from server" };
  return { data: json };
}
