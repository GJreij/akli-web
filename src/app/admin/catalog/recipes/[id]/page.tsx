import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { PageHeader, Section, inputStyle, labelStyle, primaryButton, dangerButton, subtleButton, th, td, C } from "@/components/admin/ui";
import {
  updateRecipe, deleteRecipe, addRecipeSubrecipe, removeRecipeSubrecipe,
} from "../actions";

type Recipe = Database["public"]["Tables"]["recipe"]["Row"];
type RecipeSubrecipe = Database["public"]["Tables"]["recipe_subrecipe"]["Row"];
type Subrecipe = Database["public"]["Tables"]["subrecipe"]["Row"];

export default async function RecipeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recipeId = Number(id);
  const supabase = await createClient();

  const [recipeRes, compositionRes, subrecipesRes] = await Promise.all([
    supabase.from("recipe").select("*").eq("id", recipeId).single(),
    supabase.from("recipe_subrecipe").select("*").eq("recipe_id", recipeId),
    supabase.from("subrecipe").select("*").order("name"),
  ]);

  const recipe = recipeRes.data as Recipe | null;
  if (!recipe) notFound();

  const composition = (compositionRes.data ?? []) as RecipeSubrecipe[];
  const allSubrecipes = (subrecipesRes.data ?? []) as Subrecipe[];
  const subrecipesById = new Map(allSubrecipes.map(s => [s.id, s]));

  const updateAction = updateRecipe.bind(null, recipe.id);
  const deleteAction = deleteRecipe.bind(null, recipe.id);
  const addSubrecipeAction = addRecipeSubrecipe.bind(null, recipe.id);

  return (
    <div style={{ padding: "16px 20px 60px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <Link href="/admin/catalog/recipes" style={{ fontSize: 12.5, color: C.muted, textDecoration: "none" }}>← Back to recipes</Link>
        <PageHeader title={recipe.name ?? "Recipe"} />

        <form action={updateAction}>
          <Section title="Basics">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <label style={labelStyle}>Name
                <input name="name" defaultValue={recipe.name ?? ""} required style={inputStyle} />
              </label>
              <label style={labelStyle}>Description
                <textarea name="description" defaultValue={recipe.description ?? ""} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
              </label>
              <label style={labelStyle}>Instructions
                <textarea name="instructions" defaultValue={recipe.instructions ?? ""} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
              </label>
              <label style={labelStyle}>Photo URL
                <input name="photo" defaultValue={recipe.photo ?? ""} style={inputStyle} />
              </label>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <label style={{ ...labelStyle, flex: "0 1 120px" }}>Prep time (min)
                  <input name="prep_time" type="number" step="any" defaultValue={recipe.prep_time ?? ""} style={inputStyle} />
                </label>
                <label style={{ ...labelStyle, flex: "0 1 120px" }}>Cook time (min)
                  <input name="cook_time" type="number" step="any" defaultValue={recipe.cook_time ?? ""} style={inputStyle} />
                </label>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
                {[
                  { key: "could_be_breakfast", label: "Breakfast" },
                  { key: "could_be_lunch", label: "Lunch" },
                  { key: "could_be_dinner", label: "Dinner" },
                  { key: "could_be_snack", label: "Snack" },
                  { key: "always_available", label: "Always available" },
                ].map(f => (
                  <label key={f.key} style={{ fontSize: 12.5, color: C.muted, display: "flex", alignItems: "center", gap: 6 }}>
                    <input type="checkbox" name={f.key} defaultChecked={Boolean(recipe[f.key as keyof Recipe])} />
                    {f.label}
                  </label>
                ))}
              </div>
            </div>
          </Section>

          <button type="submit" style={primaryButton}>Save changes</button>
        </form>

        <Section title={`Subrecipes (${composition.length})`}>
          {composition.length === 0 ? (
            <p style={{ fontSize: 13, color: C.light, margin: "0 0 12px" }}>No subrecipes added yet.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14 }}>
              <thead>
                <tr>
                  <th style={th}>Subrecipe</th>
                  <th style={th}>Label</th>
                  <th style={th}>Max serving</th>
                  <th style={th}>Optional</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {composition.map(row => {
                  const sub = row.subrecipe_id != null ? subrecipesById.get(row.subrecipe_id) : null;
                  const removeAction = removeRecipeSubrecipe.bind(null, recipe.id, row.id);
                  return (
                    <tr key={row.id}>
                      <td style={td}>{sub?.name ?? `#${row.subrecipe_id}`}</td>
                      <td style={{ ...td, color: C.muted }}>{row.subrecipe_label ?? "—"}</td>
                      <td style={{ ...td, color: C.muted }}>{row.max_serving ?? "—"}</td>
                      <td style={{ ...td, color: C.muted }}>{row.optional ? "Yes" : "No"}</td>
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

          <form action={addSubrecipeAction} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select name="subrecipe_id" required style={{ ...inputStyle, flex: "1 1 180px" }}>
              <option value="">Select subrecipe…</option>
              {allSubrecipes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input name="subrecipe_label" placeholder="Label (optional)" style={{ ...inputStyle, flex: "0 1 140px" }} />
            <input name="max_serving" type="number" placeholder="Max serving" style={{ ...inputStyle, flex: "0 1 110px" }} />
            <label style={{ fontSize: 12.5, color: C.muted, display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" name="optional" /> Optional
            </label>
            <button type="submit" style={subtleButton}>Add subrecipe</button>
          </form>
        </Section>

        <div style={{ marginTop: 8 }}>
          <form action={deleteAction}>
            <button type="submit" style={dangerButton}>Delete recipe</button>
          </form>
        </div>
      </div>
    </div>
  );
}
