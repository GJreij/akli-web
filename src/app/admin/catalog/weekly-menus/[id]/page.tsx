import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { PageHeader, Section, inputStyle, dangerButton, subtleButton, th, td, C } from "@/components/admin/ui";
import { deleteWeeklyMenu, addWeeklyMenuRecipe, removeWeeklyMenuRecipe } from "../actions";

type WeeklyMenu = Database["public"]["Tables"]["weekly_menu"]["Row"];
type WeeklyMenuRecipe = Database["public"]["Tables"]["weekly_menu_recipe"]["Row"];
type Recipe = Database["public"]["Tables"]["recipe"]["Row"];

export default async function WeeklyMenuDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const menuId = Number(id);
  const supabase = await createClient();

  const [menuRes, compositionRes, recipesRes] = await Promise.all([
    supabase.from("weekly_menu").select("*").eq("id", menuId).single(),
    supabase.from("weekly_menu_recipe").select("*").eq("weekly_menu_id", menuId),
    supabase.from("recipe").select("*").order("name"),
  ]);

  const menu = menuRes.data as WeeklyMenu | null;
  if (!menu) notFound();

  const composition = (compositionRes.data ?? []) as WeeklyMenuRecipe[];
  const allRecipes = (recipesRes.data ?? []) as Recipe[];
  const recipesById = new Map(allRecipes.map(r => [r.id, r]));

  const deleteAction = deleteWeeklyMenu.bind(null, menu.id);
  const addRecipeAction = addWeeklyMenuRecipe.bind(null, menu.id);

  return (
    <div style={{ padding: "16px 20px 60px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <Link href="/admin/catalog/weekly-menus" style={{ fontSize: 12.5, color: C.muted, textDecoration: "none" }}>← Back to weekly menus</Link>
        <PageHeader
          title={menu.name ?? `Week of ${menu.week_start_date}`}
          right={<span style={{ fontSize: 12, color: C.light }}>{menu.week_start_date} → {menu.week_end_date}</span>}
        />

        <Section title={`Recipes on menu (${composition.length})`}>
          {composition.length === 0 ? (
            <p style={{ fontSize: 13, color: C.light, margin: "0 0 12px" }}>No recipes added yet.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14 }}>
              <thead>
                <tr>
                  <th style={th}>Recipe</th>
                  <th style={th}>Available from</th>
                  <th style={th}>Available to</th>
                  <th style={th}>Always</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {composition.map(row => {
                  const recipe = row.recipe_id != null ? recipesById.get(row.recipe_id) : null;
                  const removeAction = removeWeeklyMenuRecipe.bind(null, menu.id, row.id);
                  return (
                    <tr key={row.id}>
                      <td style={td}>{recipe?.name ?? `#${row.recipe_id}`}</td>
                      <td style={{ ...td, color: C.muted }}>{row.always_available ? "—" : row.available_from ?? "—"}</td>
                      <td style={{ ...td, color: C.muted }}>{row.always_available ? "—" : row.available_to ?? "—"}</td>
                      <td style={{ ...td, color: C.muted }}>{row.always_available ? "Yes" : "No"}</td>
                      <td style={td}>
                        <form action={removeAction}>
                          <button type="submit" style={{ ...dangerButton, padding: "4px 10px", fontSize: 11.5 }}>Remove</button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <form action={addRecipeAction} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select name="recipe_id" required style={{ ...inputStyle, flex: "1 1 180px" }}>
              <option value="">Select recipe…</option>
              {allRecipes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <input name="available_from" type="date" style={{ ...inputStyle, flex: "0 1 150px" }} />
            <input name="available_to" type="date" style={{ ...inputStyle, flex: "0 1 150px" }} />
            <label style={{ fontSize: 12.5, color: C.muted, display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" name="always_available" /> Always available
            </label>
            <button type="submit" style={subtleButton}>Add recipe</button>
          </form>
        </Section>

        <div style={{ marginTop: 8 }}>
          <form action={deleteAction}>
            <button type="submit" style={dangerButton}>Delete weekly menu</button>
          </form>
        </div>
      </div>
    </div>
  );
}
