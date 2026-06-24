import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OrderFlow from "@/components/OrderFlow";
import type { Database } from "@/lib/supabase/types";
import { parsePref, type PrefRating } from "@/lib/preferences";

type RecipeRow = {
  id: number; name: string | null; photo: string | null;
  could_be_breakfast: boolean | null; could_be_lunch: boolean | null;
  could_be_dinner: boolean | null; could_be_snack: boolean | null;
};

export type OrderableWeek = {
  id: number;
  week_start_date: string;
  week_end_date: string;
  weekdays: string[];
  recipes: RecipeRow[];
};

// Orders must be placed 48h ahead of the day needed (delivery happens the
// evening before). Computed against Beirut local time, not server UTC —
// using toISOString() here would shift the cutoff by a day overnight for
// a UTC+3 server/client mismatch.
function beirutISODate(daysFromNow: number): string {
  const beirutNow = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Beirut" })
  );
  beirutNow.setDate(beirutNow.getDate() + daysFromNow);
  return `${beirutNow.getFullYear()}-${String(beirutNow.getMonth() + 1).padStart(2, "0")}-${String(beirutNow.getDate()).padStart(2, "0")}`;
}

export default async function OrderNewPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const today = beirutISODate(0);
  const minOrderable = beirutISODate(2); // 48h lead time — earliest day a new order can cover

  const [profileRes, macroRes, menusRes, slotsRes, prefsRes, addressesRes, orderedDaysRes, volumeRulesRes] = await Promise.all([
    supabase.from("user").select("*").eq("id", user.id).single(),
    supabase.from("daily_macro_target").select("*").eq("user_id", user.id)
      .order("created_at", { ascending: false }).limit(1).single(),
    supabase.from("weekly_menu")
      .select(`id, week_start_date, week_end_date,
        weekly_menu_recipe(recipe(id, name, photo, could_be_breakfast, could_be_lunch, could_be_dinner, could_be_snack))`)
      .gte("week_end_date", today)
      .eq("tenant_id", 1)
      .order("week_start_date", { ascending: true }),
    supabase.from("delivery_slots").select("*"),
    supabase.from("user_recipe_preferences")
      .select("recipe_id, like, dislike, dont_include")
      .eq("user_id", user.id),
    supabase.from("user_delivery_address").select("*")
      .eq("user_id", user.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("meal_plan_day")
      .select("date, meal_plan!inner(user_id)")
      .eq("meal_plan.user_id", user.id)
      .gte("date", today),
    supabase.from("automatic_discount_rules")
      .select("min_order_days,discount_type,discount_value,max_discount_amount,start_date,end_date")
      .eq("is_active", true)
      .order("min_order_days", { ascending: true }),
  ]);

  // Filter to rules whose date window covers today — done here rather than in
  // the query so a missing start/end date (always-on rule) is simple to express.
  type VolumeRuleRow = {
    min_order_days: number; discount_type: string; discount_value: number;
    max_discount_amount: number | null; start_date: string | null; end_date: string | null;
  };
  const activeVolumeRules: VolumeRuleRow[] = ((volumeRulesRes.data ?? []) as VolumeRuleRow[]).filter(
    r => (!r.start_date || today >= r.start_date) && (!r.end_date || today <= r.end_date)
  );

  const orderedDays = ((orderedDaysRes.data ?? []) as unknown as { date: string | null }[])
    .map(d => d.date)
    .filter((d): d is string => !!d);

  // Build orderable weeks — only future weekdays
  type RawWeek = { id: number; week_start_date: string | null; week_end_date: string | null; weekly_menu_recipe: { recipe: RecipeRow | null }[] };
  const weeks: OrderableWeek[] = ((menusRes.data ?? []) as unknown as RawWeek[]).map(w => {
    const weekdays: string[] = [];
    const start = new Date(w.week_start_date + "T12:00:00");
    const end   = new Date(w.week_end_date   + "T12:00:00");
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay();
      const iso = d.toISOString().split("T")[0];
      if (dow !== 0 && dow !== 6 && iso >= minOrderable) weekdays.push(iso);
    }

    const recipes: RecipeRow[] = [];
    const seen = new Set<number>();
    for (const wmr of (w.weekly_menu_recipe ?? []) as { recipe: RecipeRow | null }[]) {
      if (wmr.recipe && !seen.has(wmr.recipe.id)) {
        seen.add(wmr.recipe.id);
        recipes.push(wmr.recipe);
      }
    }

    return { id: w.id, week_start_date: w.week_start_date!, week_end_date: w.week_end_date!, weekdays, recipes };
  }).filter(w => w.weekdays.length > 0);

  const initialPrefs: Record<number, PrefRating> = {};
  type PrefRow = { recipe_id: number | null; like: boolean | null; dislike: boolean | null; dont_include: boolean | null };
  for (const p of (prefsRes.data ?? []) as unknown as PrefRow[]) {
    if (p.recipe_id) initialPrefs[p.recipe_id] = parsePref(p);
  }

  return (
    <OrderFlow
      userId={user.id}
      profile={profileRes.data as Database["public"]["Tables"]["user"]["Row"] | null}
      macroTarget={macroRes.data as Database["public"]["Tables"]["daily_macro_target"]["Row"] | null}
      orderableWeeks={weeks}
      deliverySlots={(slotsRes.data ?? []) as Database["public"]["Tables"]["delivery_slots"]["Row"][]}
      initialPrefs={initialPrefs}
      addresses={(addressesRes.data ?? []) as Database["public"]["Tables"]["user_delivery_address"]["Row"][]}
      orderedDays={orderedDays}
      volumeDiscountRules={activeVolumeRules}
    />
  );
}
