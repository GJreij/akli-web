import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { PageHeader, Section, inputStyle, labelStyle, primaryButton, dangerButton, C } from "@/components/admin/ui";
import { updateIngredient, deleteIngredient } from "../actions";

type Ingredient = Database["public"]["Tables"]["ingredient"]["Row"];

const MACROS: { key: keyof Ingredient; label: string }[] = [
  { key: "kcal", label: "kcal" },
  { key: "protein", label: "Protein (g)" },
  { key: "carbs", label: "Carbs (g)" },
  { key: "fat", label: "Fat (g)" },
  { key: "saturated_fat", label: "Saturated fat (g)" },
  { key: "fiber", label: "Fiber (g)" },
  { key: "sugar", label: "Sugar (g)" },
];

const ALLERGENS: { key: keyof Ingredient; label: string }[] = [
  { key: "celery", label: "Celery" },
  { key: "cereals_containing_gluten", label: "Gluten" },
  { key: "crustaceans", label: "Crustaceans" },
  { key: "eggs", label: "Eggs" },
  { key: "fish", label: "Fish" },
  { key: "lupin", label: "Lupin" },
  { key: "milk", label: "Milk" },
  { key: "molluscs", label: "Molluscs" },
  { key: "sulphites", label: "Sulphites" },
  { key: "mustard", label: "Mustard" },
  { key: "peanuts", label: "Peanuts" },
  { key: "sesame", label: "Sesame" },
  { key: "soybeans", label: "Soybeans" },
  { key: "tree_nuts", label: "Tree nuts" },
];

export default async function IngredientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("ingredient").select("*").eq("id", Number(id)).single();
  const ingredient = data as Ingredient | null;
  if (!ingredient) notFound();

  const updateAction = updateIngredient.bind(null, ingredient.id);
  const deleteAction = deleteIngredient.bind(null, ingredient.id);

  return (
    <div style={{ padding: "16px 20px 60px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <Link href="/admin/catalog/ingredients" style={{ fontSize: 12.5, color: C.muted, textDecoration: "none" }}>← Back to ingredients</Link>
        <PageHeader title={ingredient.name ?? "Ingredient"} />

        <form action={updateAction}>
          <Section title="Basics">
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <label style={{ ...labelStyle, flex: "1 1 200px" }}>Name
                <input name="name" defaultValue={ingredient.name ?? ""} required style={inputStyle} />
              </label>
              <label style={{ ...labelStyle, flex: "0 1 120px" }}>Unit
                <input name="unit" defaultValue={ingredient.unit ?? ""} style={inputStyle} />
              </label>
              <label style={{ ...labelStyle, flex: "0 1 160px" }}>Serving per unit
                <input name="serving_per_unit" type="number" step="any" defaultValue={ingredient.serving_per_unit ?? ""} style={inputStyle} />
              </label>
            </div>
          </Section>

          <Section title="Macros (per 100g)">
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {MACROS.map(m => (
                <label key={m.key} style={{ ...labelStyle, flex: "0 1 130px" }}>
                  {m.label}
                  <input name={m.key} type="number" step="any" defaultValue={(ingredient[m.key] as number | null) ?? ""} style={inputStyle} />
                </label>
              ))}
            </div>
          </Section>

          <Section title="Allergens">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              {ALLERGENS.map(a => (
                <label key={a.key} style={{ fontSize: 12.5, color: C.muted, display: "flex", alignItems: "center", gap: 6 }}>
                  <input type="checkbox" name={a.key} defaultChecked={Boolean(ingredient[a.key])} />
                  {a.label}
                </label>
              ))}
            </div>
          </Section>

          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <button type="submit" style={primaryButton}>Save changes</button>
          </div>
        </form>

        <div style={{ marginTop: 24, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
          <form action={deleteAction}>
            <button type="submit" style={dangerButton}>Delete ingredient</button>
          </form>
        </div>
      </div>
    </div>
  );
}
