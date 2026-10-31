import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { PageHeader, Section, inputStyle, labelStyle, primaryButton, dangerButton, subtleButton, th, td, C } from "@/components/admin/ui";
import SubmitButton from "@/components/admin/SubmitButton";
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
  // Kitchen Day columns aren't in the generated types yet.
  const kitchen = subrecipe as Subrecipe & {
    prep_type?: string | null; skill?: string | null; equipment?: string | null;
    fridge_days?: number | null; freezer_days?: number | null;
    active_minutes?: number | null; total_minutes?: number | null; prep_ahead?: string | null;
  };

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
                  <input type="checkbox" name="is_side_salad" defaultChecked={Boolean((subrecipe as { is_side_salad?: boolean | null }).is_side_salad)} />
                  Side salad
                </label>
              </div>
              <p style={{ fontSize: 11.5, color: C.light, margin: 0 }}>
                Side salads show in clients&apos; My Tastes (like / don&apos;t like / note) and can be removed per meal while ordering. A recipe should have at most one.
              </p>
            </div>
          </Section>

          <Section title="Kitchen">
            <input type="hidden" name="kitchen_fields" value="1" />
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <label style={{ ...labelStyle, flex: "1 1 150px" }}>Type
                <select name="prep_type" defaultValue={kitchen.prep_type ?? "cook"} style={inputStyle}>
<option value="cook">Cook: with heat (stove, oven, grill)</option>
                  <option value="assemble">Make, no heat: sauces, spreads, dressings, salads</option>
                  <option value="slice">Slice &amp; portion: one ingredient (cold cuts, cheese, fruit, veg)</option>
                  <option value="ready">Bought: just portion (bread, yogurt, hummus)</option>
                </select>
              </label>
              <label style={{ ...labelStyle, flex: "1 1 130px" }}>Equipment
                <select name="equipment" defaultValue={kitchen.equipment ?? ""} style={inputStyle}>
                  <option value="">—</option>
                  <option value="stove">Stove</option>
                  <option value="oven">Oven</option>
                  <option value="grill">Grill</option>
                  <option value="none">No heat</option>
                </select>
              </label>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
              <label style={{ ...labelStyle, flex: "0 1 130px" }}>Fridge days
                <input name="fridge_days" type="number" min="0" defaultValue={kitchen.fridge_days ?? ""} style={inputStyle} />
              </label>
              <label style={{ ...labelStyle, flex: "0 1 130px" }}>Freezer days
                <input name="freezer_days" type="number" min="0" placeholder="Doesn't freeze" defaultValue={kitchen.freezer_days ?? ""} style={inputStyle} />
              </label>
              <label style={{ ...labelStyle, flex: "0 1 130px" }}>Hands-on min
                <input name="active_minutes" type="number" min="0" defaultValue={kitchen.active_minutes ?? ""} style={inputStyle} />
              </label>
              <label style={{ ...labelStyle, flex: "0 1 130px" }}>Total min
                <input name="total_minutes" type="number" min="0" defaultValue={kitchen.total_minutes ?? ""} style={inputStyle} />
              </label>
            </div>
            <label style={{ ...labelStyle, marginTop: 10 }}>Day before (optional)
              <input name="prep_ahead" placeholder="e.g. Marinate overnight, soak chickpeas" defaultValue={kitchen.prep_ahead ?? ""} style={inputStyle} />
            </label>
            <p style={{ fontSize: 11.5, color: C.light, margin: "8px 0 0" }}>
              Type decides where it shows in Kitchen Day: Cook and Make get an amount to decide (with cook-ahead) and a recipe task; Slice &amp; portion and Bought become one portioning task each, with the grams per portion from the ingredients below. Fridge days count the cook day as 0 (2 = cook Sunday, serve through Tuesday). Leave freezer days empty if it doesn&apos;t freeze.
            </p>
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

          <SubmitButton style={primaryButton} pendingText="Saving…">Save changes</SubmitButton>
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
                          <SubmitButton style={{ ...dangerButton, padding: "4px 10px", fontSize: 11.5 }} pendingText="…">Remove</SubmitButton>
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
            <SubmitButton style={subtleButton} pendingText="Adding…">Add ingredient</SubmitButton>
          </form>
        </Section>

        <div style={{ marginTop: 8 }}>
          <form action={deleteAction}>
            <SubmitButton style={dangerButton} pendingText="Deleting…">Delete subrecipe</SubmitButton>
          </form>
        </div>
      </div>
    </div>
  );
}
