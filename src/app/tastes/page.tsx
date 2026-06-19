import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TastesManager from "@/components/TastesManager";
import { parsePref, type PrefRating } from "@/lib/preferences";

type RecipeRow = {
  id: number; name: string | null; photo: string | null;
  could_be_breakfast: boolean | null; could_be_lunch: boolean | null;
  could_be_dinner: boolean | null; could_be_snack: boolean | null;
};

export default async function TastesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const today = new Date().toISOString().split("T")[0];

  const [menusRes, prefsRes] = await Promise.all([
    supabase
      .from("weekly_menu")
      .select(`id, week_start_date, week_end_date,
        weekly_menu_recipe(recipe(id, name, photo, could_be_breakfast, could_be_lunch, could_be_dinner, could_be_snack))`)
      .gte("week_end_date", today)
      .eq("tenant_id", 1)
      .order("week_start_date", { ascending: true }),
    supabase
      .from("user_recipe_preferences")
      .select("recipe_id, like, dislike, dont_include")
      .eq("user_id", user.id),
  ]);

  // Build week groups with deduped recipes
  const weeks = (menusRes.data ?? []).map(w => {
    const seen = new Set<number>();
    const recipes: RecipeRow[] = [];
    for (const wmr of (w.weekly_menu_recipe ?? []) as { recipe: RecipeRow | null }[]) {
      if (wmr.recipe && !seen.has(wmr.recipe.id)) {
        seen.add(wmr.recipe.id);
        recipes.push(wmr.recipe);
      }
    }
    return { id: w.id, week_start_date: w.week_start_date!, week_end_date: w.week_end_date!, recipes };
  });

  // Build prefs map: recipe_id → rating
  const initialPrefs: Record<number, PrefRating> = {};
  for (const p of prefsRes.data ?? []) {
    if (p.recipe_id) initialPrefs[p.recipe_id] = parsePref(p as { like: boolean | null; dislike: boolean | null; dont_include: boolean | null });
  }

  return (
    <TastesManager
      userId={user.id}
      weeks={weeks}
      initialPrefs={initialPrefs}
    />
  );
}
