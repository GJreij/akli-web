import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TastesManager from "@/components/TastesManager";
import { type SideSalad } from "@/components/SideSaladsSection";
import { parsePref, type PrefRating, type SaladRating } from "@/lib/preferences";
import { emptyAllergenFlags, type AllergenFlags } from "@/lib/allergens";

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

  const [menusRes, prefsRes, userRes, saladsRes, saladPrefsRes] = await Promise.all([
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
    supabase
      .from("user")
      .select("celery, cereals_containing_gluten, crustaceans, eggs, fish, lupin, milk, molluscs, sulphites, mustard, peanuts, sesame, soybeans, tree_nuts, no_side_salad")
      .eq("id", user.id)
      .single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.from("subrecipe") as any)
      .select("id, name, recipe_subrecipe(recipe_id), subrec_ingred(quantity, ingredient(name))")
      .eq("is_side_salad", true)
      .order("name"),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.from("user_side_salad_preference" as any) as any)
      .select("subrecipe_id, like, dislike, comment")
      .eq("user_id", user.id),
  ]);
  const { no_side_salad: noSideSalad, ...allergenRow } = (userRes.data ?? {}) as Partial<AllergenFlags> & { no_side_salad?: boolean | null };
  const userAllergens: AllergenFlags = { ...emptyAllergenFlags(), ...allergenRow };

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

  // One allergen-rollup lookup for every recipe on offer — cheap even at
  // full catalog size, and lets My Tastes warn on a dish the same way the
  // menu browser, order review, and kitchen panel do (single source of
  // truth: the recipe_allergen view).
  const recipeIds = Array.from(new Set(weeks.flatMap(w => w.recipes.map(r => r.id))));
  const recipeAllergens: Record<number, AllergenFlags> = {};
  if (recipeIds.length > 0) {
    const { data: allergenRows } = await supabase
      .from("recipe_allergen")
      .select("*")
      .in("recipe_id", recipeIds);
    for (const row of allergenRows ?? []) {
      const { recipe_id, ...flags } = row as { recipe_id: number } & AllergenFlags;
      recipeAllergens[recipe_id] = flags;
    }
  }

  // Build prefs + comments maps: recipe_id → rating / note
  const initialPrefs: Record<number, PrefRating> = {};
  const initialComments: Record<number, string> = {};
  type PrefRow = { recipe_id: number | null; like: boolean | null; dislike: boolean | null; dont_include: boolean | null; comment: string | null };
  for (const p of (prefsRes.data ?? []) as unknown as PrefRow[]) {
    if (!p.recipe_id) continue;
    initialPrefs[p.recipe_id] = parsePref(p);
    if (p.comment) initialComments[p.recipe_id] = p.comment;
  }

  // Side salads: only the ones some upcoming dish actually comes with, plus
  // the house salad (the fallback for a disliked salad) — the same "what's
  // coming up" scope as the recipe list. Prefs for a salad that's off the
  // menu stay saved and apply again when it comes back.
  const HOUSE_SALAD_NAME = "Akli House Salad";
  const SKIP_INGREDIENTS = new Set(["salt", "olive oil", "black pepper", "white pepper"]);
  type SaladRow = {
    id: number; name: string;
    recipe_subrecipe: { recipe_id: number }[];
    subrec_ingred: { quantity: number | null; ingredient: { name: string } | null }[];
  };
  const upcomingRecipeIds = new Set(recipeIds);
  const sideSalads: SideSalad[] = ((saladsRes.data ?? []) as SaladRow[])
    .filter(s => s.name === HOUSE_SALAD_NAME || s.recipe_subrecipe.some(rs => upcomingRecipeIds.has(rs.recipe_id)))
    .map(s => ({
      id: s.id,
      name: s.name,
      isHouse: s.name === HOUSE_SALAD_NAME,
      ingredients: [...s.subrec_ingred]
        .filter(si => si.ingredient && !SKIP_INGREDIENTS.has(si.ingredient.name.toLowerCase()))
        .sort((a, b) => (b.quantity ?? 0) - (a.quantity ?? 0))
        .slice(0, 6)
        .map(si => si.ingredient!.name.toLowerCase())
        .join(", "),
    }))
    .sort((a, b) => Number(b.isHouse) - Number(a.isHouse));

  const initialSaladRatings: Record<number, SaladRating> = {};
  const initialSaladNotes: Record<number, string> = {};
  type SaladPrefRow = { subrecipe_id: number; like: boolean; dislike: boolean; comment: string | null };
  for (const p of (saladPrefsRes.data ?? []) as SaladPrefRow[]) {
    initialSaladRatings[p.subrecipe_id] = p.dislike ? "dislike" : p.like ? "like" : null;
    if (p.comment) initialSaladNotes[p.subrecipe_id] = p.comment;
  }

  return (
    <TastesManager
      userId={user.id}
      weeks={weeks}
      initialPrefs={initialPrefs}
      initialComments={initialComments}
      userAllergens={userAllergens}
      recipeAllergens={recipeAllergens}
      sideSalads={sideSalads}
      initialSaladRatings={initialSaladRatings}
      initialSaladNotes={initialSaladNotes}
      initialNoSideSalad={!!noSideSalad}
    />
  );
}
