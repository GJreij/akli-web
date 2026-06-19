import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
    />
  );
}
