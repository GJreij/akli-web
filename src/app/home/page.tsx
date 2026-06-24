import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import HomeDashboard from "@/components/HomeDashboard";

export default async function HomePage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const today = new Date().toISOString().split("T")[0];

  const [profileRes, macroRes, menuRes] = await Promise.all([
    supabase.from("user").select("*").eq("id", user.id).single(),
    supabase
      .from("daily_macro_target")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single(),
    // Current week's menu with recipe details
    supabase
      .from("weekly_menu")
      .select(`
        id, name, week_start_date, week_end_date,
        weekly_menu_recipe (
          recipe_id,
          recipe ( id, name, description, photo, could_be_breakfast, could_be_lunch, could_be_dinner, could_be_snack )
        )
      `)
      .lte("week_start_date", today)
      .gte("week_end_date", today)
      .eq("tenant_id", 1)
      .limit(1)
      .single(),
  ]);

  const profile = profileRes.data as Database["public"]["Tables"]["user"]["Row"] | null;
  if (profile?.role === "admin") redirect("/admin");

  // Affiliate/ambassador/athlete badge, if this user is an active member of the program.
  const affiliateRowRes = await supabase
    .from("affiliates")
    .select("id,tier")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  const affiliateRow = affiliateRowRes.data as { id: number; tier: string } | null;

  let affiliateInfo: {
    tier: string;
    codes: { code: string; discount_value: number; start_date: string | null; end_date: string | null }[];
  } | null = null;
  if (affiliateRow) {
    // All of this affiliate's active codes (audience + personal), not just
    // one — an affiliate can have more than one code over time.
    const codesRes = await supabase
      .from("promo_codes")
      .select("code,discount_value,start_date,end_date")
      .eq("affiliate_id", affiliateRow.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    type CodeRow = { code: string | null; discount_value: number | null; start_date: string | null; end_date: string | null };
    const codes = (codesRes.data ?? []) as CodeRow[];
    affiliateInfo = {
      tier: affiliateRow.tier,
      codes: codes
        // Expired codes are dead weight on the badge — hide them entirely.
        // Scheduled (future start_date) codes still show, just with a
        // "starts on" label instead of being presented as usable today.
        .filter((c): c is CodeRow & { code: string } => !!c.code && (!c.end_date || c.end_date >= today))
        .map(c => ({ code: c.code, discount_value: c.discount_value ?? 0, start_date: c.start_date, end_date: c.end_date })),
    };
  }

  // Flatten recipes from the join, deduplicate, then shuffle so home shows a random 5
  type RecipeRow = {
    id: number;
    name: string | null;
    description: string | null;
    photo: string | null;
    could_be_breakfast: boolean | null;
    could_be_lunch: boolean | null;
    could_be_dinner: boolean | null;
    could_be_snack: boolean | null;
  };

  const menuRecipes: RecipeRow[] = [];
  const seen = new Set<number>();
  const menuData = menuRes.data as { weekly_menu_recipe: { recipe: RecipeRow | null }[] } | null;
  if (menuData?.weekly_menu_recipe) {
    for (const wmr of menuData.weekly_menu_recipe) {
      if (wmr.recipe && !seen.has(wmr.recipe.id)) {
        seen.add(wmr.recipe.id);
        menuRecipes.push(wmr.recipe);
      }
    }
  }

  // Fisher-Yates shuffle
  for (let i = menuRecipes.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [menuRecipes[i], menuRecipes[j]] = [menuRecipes[j], menuRecipes[i]];
  }

  return (
    <HomeDashboard
      profile={profileRes.data}
      macroTarget={macroRes.data}
      menuRecipes={menuRecipes}
      affiliateInfo={affiliateInfo}
    />
  );
}
