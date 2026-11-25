import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export type DeletionBlockers = {
  notClient: boolean;
  upcomingOrders: number;
  pendingTopups: number;
  // Signed: positive = credit we owe the customer, negative = they owe us.
  walletBalance: number;
};

export function hasBlockers(b: DeletionBlockers) {
  return b.notClient || b.upcomingOrders > 0 || b.pendingTopups > 0 || Math.abs(b.walletBalance) >= 0.01;
}

// Run with the signed-in user's own RLS-scoped client so it can only ever
// see that user's rows. `today` is the Beirut calendar date (YYYY-MM-DD).
export async function getDeletionBlockers(db: Db, userId: string, today: string): Promise<DeletionBlockers> {
  const [roleRes, daysRes, topupRes, balRes] = await Promise.all([
    db.from("user").select("role").eq("id", userId).single(),
    db.from("meal_plan_day")
      .select("id, meal_plan!inner(user_id)")
      .eq("meal_plan.user_id", userId)
      .gte("date", today)
      .not("status", "in", "(cancelled,completed)"),
    db.from("wallet_topup_request").select("id").eq("user_id", userId).eq("status", "pending"),
    db.rpc("get_wallet_balance", { p_user_id: userId }),
  ]);

  if (roleRes.error || daysRes.error || topupRes.error || balRes.error) {
    throw new Error("We couldn't check your account right now. Please try again.");
  }

  return {
    notClient: (roleRes.data as { role: string | null } | null)?.role !== "client",
    upcomingOrders: (daysRes.data ?? []).length,
    pendingTopups: (topupRes.data ?? []).length,
    walletBalance: Number(balRes.data ?? 0),
  };
}

// Personal data with no accounting value: removed outright.
const PERSONAL_TABLES = [
  "food_chat_log",
  "food_log_entry",
  "user_delivery_address",
  "daily_macro_target",
  "user_recipe_preferences",
  "user_delivery_preference",
  "user_side_salad_preference",
  "user_day_shape",
  "user_beta_feature",
  "delivery_location",
  "label_comment",
  "device_token",
  "push_notification_log",
] as const;

const ALLERGEN_COLUMNS = [
  "celery", "cereals_containing_gluten", "crustaceans", "eggs", "fish", "lupin", "milk",
  "molluscs", "mustard", "peanuts", "sesame", "soybeans", "sulphites", "tree_nuts",
] as const;

// Anonymize, never hard-delete: public.user.id cascades from auth.users, and
// meal_plan / deliveries / payment cascade from public.user, so deleting the
// auth user outright would wipe the customer's order and payment history.
// Order matters and every step is idempotent, so a failed run can simply be
// retried: personal data first, the public.user row next, login last.
// `admin` must be a service-role client.
export async function anonymizeAccount(admin: Db, userId: string) {
  const fail = (step: string, e: { message: string }): never => {
    throw new Error(`Account deletion failed at ${step}: ${e.message}`);
  };

  for (const table of PERSONAL_TABLES) {
    const { error } = await admin.from(table).delete().eq("user_id", userId);
    if (error) fail(table, error);
  }

  // Records we keep for accounting, minus the personal text they carry.
  const keepers = [
    admin.from("deliveries").update({ delivery_address: "Deleted" }).eq("user_id", userId),
    admin.from("wallet_topup_request").update({ payment_note: null }).eq("user_id", userId),
    admin.from("analytics_event").update({ user_id: null }).eq("user_id", userId),
  ];
  const names = ["deliveries", "wallet_topup_request", "analytics_event"];
  for (let i = 0; i < keepers.length; i++) {
    const { error } = await keepers[i];
    if (error) fail(names[i], error);
  }

  const blankAllergens = Object.fromEntries(ALLERGEN_COLUMNS.map(c => [c, false]));
  const { error: userErr } = await admin.from("user").update({
    name: "Deleted",
    last_name: "user",
    email: null,
    phone_number: null,
    DoB: null,
    status: "deleted",
    ...blankAllergens,
  }).eq("id", userId);
  if (userErr) fail("user", userErr);

  // Soft delete: clears the login's email/identities so it can't sign in
  // (and the email is free to register again) without removing the row.
  const { error: authErr } = await admin.auth.admin.deleteUser(userId, true);
  if (authErr) fail("login", authErr);
}
