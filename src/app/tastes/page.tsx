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
      .select("recipe_id, like, dislike, dont_include, comment")
      .eq("user_id", user.id),
  ]);

  // Build week groups with deduped recipes
  type RawWeek = { id: number; week_start_date: string | null; week_end_date: string | null; weekly_menu_recipe: { recipe: RecipeRow | null }[] };
  const weeks = ((menusRes.data ?? []) as unknown as RawWeek[]).map(w => {
    const seen = new Set<number>();
    const recipes: RecipeRow[] = [];
    for (const wmr of (w.weekly_menu_recipe ?? [])) {
      if (wmr.recipe && !seen.has(wmr.recipe.id)) {
        seen.add(wmr.recipe.id);
        recipes.push(wmr.recipe);
      }
    }
    return { id: w.id, week_start_date: w.week_start_date!, week_end_date: w.week_end_date!, recipes };
  });

  // Build prefs + comments maps: recipe_id → rating / note
  const initialPrefs: Record<number, PrefRating> = {};
  const initialComments: Record<number, string> = {};
  type PrefRow = { recipe_id: number | null; like: boolean | null; dislike: boolean | null; dont_include: boolean | null; comment: string | null };
  for (const p of (prefsRes.data ?? []) as unknown as PrefRow[]) {
    if (!p.recipe_id) continue;
    initialPrefs[p.recipe_id] = parsePref(p);
    if (p.comment) initialComments[p.recipe_id] = p.comment;
  }

  return (
    <TastesManager
      userId={user.id}
      weeks={weeks}
      initialPrefs={initialPrefs}
      initialComments={initialComments}
    />
  );
}
