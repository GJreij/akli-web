import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/supabase/requireAdmin";
import OrderFlow from "@/components/OrderFlow";
import type { Database } from "@/lib/supabase/types";
import { parsePref, type PrefRating } from "@/lib/preferences";
import { beirutISODate } from "@/lib/dates";
import type { AllergenFlags } from "@/lib/allergens";

// Same shape order/new/page.tsx builds for the client-facing flow — kept in
// sync manually since OrderFlow imports its own copy of this type too.
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

const C = {
  primary: "#063330", teal: "#67b1b0", tealDark: "#437b7b",
  offWhite: "#eee9e6", muted: "#5c5c5c", light: "#9a9a9a", border: "#e0dbd5", white: "#ffffff",
};

export default async function AdminOrderForUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: targetUserId } = await params;
  const { supabase } = await requireAdmin();

  const today = beirutISODate(0);
  const minOrderable = beirutISODate(2);

  const [profileRes, macroRes, menusRes, slotsRes, prefsRes, addressesRes, orderedDaysRes, volumeRulesRes, closuresRes] = await Promise.all([
    supabase.from("user").select("*").eq("id", targetUserId).single(),
    supabase.from("daily_macro_target").select("*").eq("user_id", targetUserId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("weekly_menu")
      .select(`id, week_start_date, week_end_date,
        weekly_menu_recipe(recipe(id, name, photo, could_be_breakfast, could_be_lunch, could_be_dinner, could_be_snack))`)
      .gte("week_end_date", today)
      .eq("tenant_id", 1)
      .order("week_start_date", { ascending: true }),
    supabase.from("delivery_slots").select("*"),
    supabase.from("user_recipe_preferences")
      .select("recipe_id, like, dislike, dont_include")
      .eq("user_id", targetUserId),
    supabase.from("user_delivery_address").select("*")
      .eq("user_id", targetUserId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("meal_plan_day")
      .select("date, status, meal_plan!inner(user_id)")
      .eq("meal_plan.user_id", targetUserId)
      .gte("date", today),
    supabase.from("automatic_discount_rules")
      .select("min_order_days,discount_type,discount_value,max_discount_amount,start_date,end_date")
      .eq("is_active", true)
      .order("min_order_days", { ascending: true }),
    supabase.from("kitchen_closure")
      .select("closure_date, reason")
      .gte("closure_date", today)
      .order("closure_date", { ascending: true }),
  ]);

  const profile = profileRes.data as Database["public"]["Tables"]["user"]["Row"] | null;
  if (!profile) notFound();

  const macroTarget = macroRes.data as Database["public"]["Tables"]["daily_macro_target"]["Row"] | null;

  const clientName = `${profile.name ?? ""} ${profile.last_name ?? ""}`.trim() || "this client";

  if (!macroTarget) {
    return (
      <div style={{ padding: "24px 20px 60px" }}>
        <div style={{ maxWidth: 480, margin: "60px auto 0" }}>
          <Link href={`/admin/users/${targetUserId}`} style={{ fontSize: 12.5, color: C.muted, textDecoration: "none" }}>
            ← Back to {clientName}
          </Link>
          <div style={{
            background: C.white, border: `1px solid ${C.border}`, borderRadius: 14,
            padding: 24, marginTop: 16, textAlign: "center",
          }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: C.primary, margin: "0 0 8px" }}>
              No macro targets set yet
            </p>
            <p style={{ fontSize: 13, color: C.muted, margin: "0 0 18px", lineHeight: 1.5 }}>
              {clientName} needs daily macro targets before a meal plan can be generated for them.
              Set them from the client&apos;s profile, then come back here.
            </p>
            <Link
              href={`/admin/users/${targetUserId}`}
              style={{
                display: "inline-block", background: C.primary, color: C.white,
                borderRadius: 8, padding: "10px 18px", fontSize: 13, fontWeight: 600, textDecoration: "none",
              }}
            >
              Set macro targets
            </Link>
          </div>
        </div>
      </div>
    );
  }

  type VolumeRuleRow = {
    min_order_days: number; discount_type: string; discount_value: number;
    max_discount_amount: number | null; start_date: string | null; end_date: string | null;
  };
  const activeVolumeRules: VolumeRuleRow[] = ((volumeRulesRes.data ?? []) as VolumeRuleRow[]).filter(
    r => (!r.start_date || today >= r.start_date) && (!r.end_date || today <= r.end_date)
  );

  const orderedDaysRaw = (orderedDaysRes.data ?? []) as unknown as { date: string | null; status: string | null }[];
  const orderedDays = orderedDaysRaw
    .filter(d => d.status !== "cancelled")
    .map(d => d.date)
    .filter((d): d is string => !!d);
  const cancellationPendingDays = orderedDaysRaw
    .filter(d => d.status === "cancellation_pending")
    .map(d => d.date)
    .filter((d): d is string => !!d);

  type ClosureRow = { closure_date: string; reason: string | null };
  const closureDays = ((closuresRes.data ?? []) as unknown as ClosureRow[])
    .map(c => ({ date: c.closure_date, reason: c.reason }));

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

  const allRecipeIds = Array.from(new Set(weeks.flatMap(w => w.recipes.map(r => r.id))));
  const recipeAllergens: Record<number, AllergenFlags> = {};
  if (allRecipeIds.length > 0) {
    const { data: allergenRows } = await supabase.from("recipe_allergen").select("*").in("recipe_id", allRecipeIds);
    for (const row of allergenRows ?? []) {
      const { recipe_id, ...flags } = row as { recipe_id: number } & AllergenFlags;
      recipeAllergens[recipe_id] = flags;
    }
  }

  return (
    <div>
      <div style={{ padding: "12px 20px 0", maxWidth: 480, margin: "0 auto" }}>
        <Link href={`/admin/users/${targetUserId}`} style={{ fontSize: 12.5, color: C.muted, textDecoration: "none" }}>
          ← Back to {clientName}
        </Link>
        <p style={{ fontSize: 12, color: C.tealDark, fontWeight: 600, margin: "6px 0 0" }}>
          Ordering as {clientName}
        </p>
      </div>
      <OrderFlow
        userId={targetUserId}
        profile={profile}
        macroTarget={macroTarget}
        orderableWeeks={weeks}
        recipeAllergens={recipeAllergens}
        deliverySlots={(slotsRes.data ?? []) as Database["public"]["Tables"]["delivery_slots"]["Row"][]}
        initialPrefs={initialPrefs}
        addresses={(addressesRes.data ?? []) as Database["public"]["Tables"]["user_delivery_address"]["Row"][]}
        orderedDays={orderedDays}
        cancellationPendingDays={cancellationPendingDays}
        closureDays={closureDays}
        volumeDiscountRules={activeVolumeRules}
      />
    </div>
  );
}
