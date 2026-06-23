import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { PageHeader, Section, th, td, C } from "@/components/admin/ui";
import { createIngredient } from "./actions";

type Ingredient = Database["public"]["Tables"]["ingredient"]["Row"];

export default async function IngredientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const supabase = await createClient();

  let query = supabase.from("ingredient").select("*").order("name");
  if (q) query = query.ilike("name", `%${q}%`);
  const { data } = await query;
  const ingredients = (data ?? []) as Ingredient[];

  return (
    <div style={{ padding: "16px 20px 60px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <PageHeader title="Ingredients" right={<span style={{ fontSize: 12, color: C.light }}>{ingredients.length} total</span>} />

        <form style={{ marginBottom: 12 }}>
          <input name="q" defaultValue={q ?? ""} placeholder="Search by name…" style={{
            width: "100%", padding: "9px 12px", borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 13.5,
          }} />
        </form>

        <Section title="Add ingredient">
          <form action={createIngredient} style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <input name="name" placeholder="Name" required style={{ flex: "1 1 160px", padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13 }} />
            <input name="unit" placeholder="Unit (g, ml…)" style={{ flex: "0 1 100px", padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13 }} />
            <input name="kcal" type="number" step="any" placeholder="kcal/100g" style={{ flex: "0 1 100px", padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13 }} />
            <input name="protein" type="number" step="any" placeholder="Protein g" style={{ flex: "0 1 90px", padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13 }} />
            <input name="carbs" type="number" step="any" placeholder="Carbs g" style={{ flex: "0 1 90px", padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13 }} />
            <input name="fat" type="number" step="any" placeholder="Fat g" style={{ flex: "0 1 90px", padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13 }} />
            <button type="submit" style={{ background: C.primary, color: C.white, border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              Add
            </button>
          </form>
          <p style={{ margin: "8px 0 0", fontSize: 11.5, color: C.light }}>Allergens and remaining macros can be set after creating — open the row to edit.</p>
        </Section>

        <Section>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Name</th>
                  <th style={th}>Unit</th>
                  <th style={th}>kcal</th>
                  <th style={th}>P</th>
                  <th style={th}>C</th>
                  <th style={th}>F</th>
                </tr>
              </thead>
              <tbody>
                {ingredients.length === 0 ? (
                  <tr><td style={td} colSpan={6}>No ingredients found.</td></tr>
                ) : ingredients.map(i => (
                  <tr key={i.id}>
                    <td style={td}>
                      <Link href={`/admin/catalog/ingredients/${i.id}`} style={{ color: C.primary, fontWeight: 600, textDecoration: "none" }}>
                        {i.name}
                      </Link>
                    </td>
                    <td style={{ ...td, color: C.muted }}>{i.unit ?? "—"}</td>
                    <td style={{ ...td, color: C.muted }}>{i.kcal ?? "—"}</td>
                    <td style={{ ...td, color: C.muted }}>{i.protein ?? "—"}</td>
                    <td style={{ ...td, color: C.muted }}>{i.carbs ?? "—"}</td>
                    <td style={{ ...td, color: C.muted }}>{i.fat ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </div>
  );
}
