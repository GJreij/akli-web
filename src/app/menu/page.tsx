import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MenuBrowser from "@/components/MenuBrowser";
import { emptyAllergenFlags, type AllergenFlags } from "@/lib/allergens";
import { collectMenuRecipes } from "@/lib/menuAvailability";
import { beirutISODate } from "@/lib/dates";

export default async function MenuPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const today = beirutISODate(0);

  const { data: weeks } = await supabase
    .from("weekly_menu")
    .select(`
      id, name, week_start_date, week_end_date,
      weekly_menu_recipe (
        available_dates,
        recipe ( id, name, description, photo, could_be_breakfast, could_be_lunch, could_be_dinner, could_be_snack )
      )
    `)
    .gte("week_end_date", today)
    .eq("tenant_id", 1)
    .order("week_start_date", { ascending: true });

  type RecipeRow = {
    id: number; name: string | null; description: string | null; photo: string | null;
    could_be_breakfast: boolean | null; could_be_lunch: boolean | null;
    could_be_dinner: boolean | null; could_be_snack: boolean | null;
    available_dates?: string[] | null;
  };

  type WeekMenu = {
    id: number;
    week_start_date: string;
    week_end_date: string;
    recipes: RecipeRow[];
  };

  type RawWeek = { id: number; week_start_date: string | null; week_end_date: string | null; weekly_menu_recipe: { available_dates: string[] | null; recipe: RecipeRow | null }[] };
  const menus: WeekMenu[] = ((weeks ?? []) as unknown as RawWeek[]).map((w) => {
    const recipes = collectMenuRecipes(w.weekly_menu_recipe);
    return { id: w.id, week_start_date: w.week_start_date!, week_end_date: w.week_end_date!, recipes };
  });

  const [userRes, allergenRows, closuresRes] = await Promise.all([
    supabase
      .from("user")
      .select("celery, cereals_containing_gluten, crustaceans, eggs, fish, lupin, milk, molluscs, sulphites, mustard, peanuts, sesame, soybeans, tree_nuts")
      .eq("id", user.id)
      .single(),
    (async () => {
      const recipeIds = Array.from(new Set(menus.flatMap(m => m.recipes.map(r => r.id))));
      if (recipeIds.length === 0) return [];
      const { data } = await supabase.from("recipe_allergen").select("*").in("recipe_id", recipeIds);
      return data ?? [];
    })(),
    supabase.from("kitchen_closure").select("closure_date").is("kitchen_id", null).gte("closure_date", today),
  ]);
  const closedDays = ((closuresRes.data ?? []) as { closure_date: string }[]).map(c => String(c.closure_date).slice(0, 10));
  const userAllergens: AllergenFlags = { ...emptyAllergenFlags(), ...(userRes.data ?? {}) };
  const recipeAllergens: Record<number, AllergenFlags> = {};
  for (const row of allergenRows) {
    const { recipe_id, ...flags } = row as { recipe_id: number } & AllergenFlags;
    recipeAllergens[recipe_id] = flags;
  }

  return <MenuBrowser menus={menus} userAllergens={userAllergens} recipeAllergens={recipeAllergens} today={today} closedDays={closedDays} />;
}
