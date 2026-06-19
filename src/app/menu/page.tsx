import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MenuBrowser from "@/components/MenuBrowser";

export default async function MenuPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const today = new Date().toISOString().split("T")[0];

  const { data: weeks } = await supabase
    .from("weekly_menu")
    .select(`
      id, name, week_start_date, week_end_date,
      weekly_menu_recipe (
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
  };

  type WeekMenu = {
    id: number;
    week_start_date: string;
    week_end_date: string;
    recipes: RecipeRow[];
  };

  const menus: WeekMenu[] = (weeks ?? []).map((w) => {
    const recipes: RecipeRow[] = [];
    const seen = new Set<number>();
    for (const wmr of (w.weekly_menu_recipe ?? []) as { recipe: RecipeRow | null }[]) {
      if (wmr.recipe && !seen.has(wmr.recipe.id)) {
        seen.add(wmr.recipe.id);
        recipes.push(wmr.recipe);
      }
    }
    return { id: w.id, week_start_date: w.week_start_date!, week_end_date: w.week_end_date!, recipes };
  });

  return <MenuBrowser menus={menus} />;
}
