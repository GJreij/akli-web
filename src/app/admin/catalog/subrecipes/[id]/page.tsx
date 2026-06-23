import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { PageHeader, Section, inputStyle, labelStyle, primaryButton, dangerButton, subtleButton, th, td, C } from "@/components/admin/ui";
import {
  updateSubrecipe, deleteSubrecipe, addSubrecipeIngredient, removeSubrecipeIngredient,
} from "../actions";

type Subrecipe = Database["public"]["Tables"]["subrecipe"]["Row"];
type SubrecIngred = Database["public"]["Tables"]["subrec_ingred"]["Row"];
type Ingredient = Database["public"]["Tables"]["ingredient"]["Row"];

const MACROS: { key: keyof Subrecipe; label: string }[] = [
  { key: "kcal", label: "kcal" },
  { key: "protein", label: "Protein (g)" },
  { key: "carbs", label: "Carbs (g)" },
  { key: "fat", label: "Fat (g)" },
  { key: "saturated_fat", label: "Saturated fat (g)" },
  { key: "fiber", label: "Fiber (g)" },
  { key: "sugar", label: "Sugar (g)" },
];

export default async function SubrecipeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const subrecipeId = Number(id);
  const supabase = await createClient();

  const [subrecipeRes, compositionRes, ingredientsRes] = await Promise.all([
    supabase.from("subrecipe").select("*").eq("id", subrecipeId).single(),
    supabase.from("subrec_ingred").select("*").eq("subrecipe_id", subrecipeId),
    supabase.from("ingredient").select("*").order("name"),
  ]);

  const subrecipe = subrecipeRes.data as Subrecipe | null;
  if (!subrecipe) notFound();

  const composition = (compositionRes.data ?? []) as SubrecIngred[];
  const allIngredients = (ingredientsRes.data ?? []) as Ingredient[];
  const ingredientsById = new Map(allIngredients.map(i => [i.id, i]));

  const updateAction = updateSubrecipe.bind(null, subrecipe.id);
  const deleteAction = deleteSubrecipe.bind(null, subrecipe.id);
  const addIngredientAction = addSubrecipeIngredient.bind(null, subrecipe.id);

  return (
    <div style={{ padding: "16px 20px 60px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <Link href="/admin/catalog/subrecipes" style={{ fontSize: 12.5, color: C.muted, textDecoration: "none" }}>← Back to subrecipes</Link>
        <PageHeader title={subrecipe.name ?? "Subrecipe"} />

        <form action={updateAction}>
          <Section title="Basics">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <label style={labelStyle}>Name
                <input name="name" defaultValue={subrecipe.name ?? ""} required style={inputStyle} />
              </label>
              <label style={labelStyle}>Description
                <textarea name="description" defaultValue={subrecipe.description ?? ""} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
              </label>
              <label style={labelStyle}>Instructions
                <textarea name="instructions" defaultValue={subrecipe.instructions ?? ""} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
              </label>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <label style={{ ...labelStyle, flex: "0 1 140px" }}>Prep time
                  <input name="prep_time" defaultValue={subrecipe.prep_time ?? ""} style={inputStyle} />
                </label>
                <label style={{ ...labelStyle, flex: "0 1 140px" }}>Max serving
                  <input name="max_serving" type="number" defaultValue={subrecipe.max_serving ?? ""} style={inputStyle} />
                </label>
                <label style={{ fontSize: 12.5, color: C.muted, display: "flex", alignItems: "center", gap: 6, alignSelf: "flex-end", marginBottom: 8 }}>
                  <input type="checkbox" name="freezable" defaultChecked={Boolean(subrecipe.freezable)} />
                  Freezable
                </label>
              </div>
            </div>
          </Section>

          <Section title="Macros">
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {MACROS.map(m => (
                <label key={m.key} style={{ ...labelStyle, flex: "0 1 130px" }}>
                  {m.label}
                  <input name={m.key} type="number" step="any" defaultValue={(subrecipe[m.key] as number | null) ?? ""} style={inputStyle} />
                </label>
              ))}
            </div>
          </Section>

          <button type="submit" style={primaryButton}>Save changes</button>
        </form>

        <Section title={`Ingredients (${composition.length})`}>
          {composition.length === 0 ? (
            <p style={{ fontSize: 13, color: C.light, margin: "0 0 12px" }}>No ingredients added yet.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14 }}>
              <thead>
                <tr>
                  <th style={th}>Ingredient</th>
                  <th style={th}>Quantity</th>
                  <th style={th}>Optional</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {composition.map(row => {
                  const ing = row.ingredient_id != null ? ingredientsById.get(row.ingredient_id) : null;
                  const removeAction = removeSubrecipeIngredient.bind(null, subrecipe.id, row.id);
                  return (
                    <tr key={row.id}>
                      <td style={td}>{ing?.name ?? `#${row.ingredient_id}`}</td>
                      <td style={{ ...td, color: C.muted }}>{row.quantity ?? "—"} {ing?.unit ?? ""}</td>
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

          <form action={addIngredientAction} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select name="ingredient_id" required style={{ ...inputStyle, flex: "1 1 200px" }}>
              <option value="">Select ingredient…</option>
              {allIngredients.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
            <input name="quantity" type="number" step="any" placeholder="Quantity" style={{ ...inputStyle, flex: "0 1 110px" }} />
            <label style={{ fontSize: 12.5, color: C.muted, display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" name="optional" /> Optional
            </label>
            <button type="submit" style={subtleButton}>Add ingredient</button>
          </form>
        </Section>

        <div style={{ marginTop: 8 }}>
          <form action={deleteAction}>
            <button type="submit" style={dangerButton}>Delete subrecipe</button>
          </form>
        </div>
      </div>
    </div>
  );
}
