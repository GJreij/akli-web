import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { PageHeader, Section, inputStyle, th, td, C } from "@/components/admin/ui";
import { createRecipe } from "./actions";

type Recipe = Pick<Database["public"]["Tables"]["recipe"]["Row"], "id" | "name" | "could_be_breakfast" | "could_be_lunch" | "could_be_dinner" | "could_be_snack" | "prep_time" | "cook_time" | "always_available">;

function mealLabel(r: Recipe): string {
  const labels = [];
  if (r.could_be_breakfast) labels.push("B");
  if (r.could_be_lunch) labels.push("L");
  if (r.could_be_dinner) labels.push("D");
  if (r.could_be_snack) labels.push("S");
  return labels.join("/") || "—";
}

export default async function RecipesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const supabase = await createClient();

  let query = supabase.from("recipe").select("id,name,could_be_breakfast,could_be_lunch,could_be_dinner,could_be_snack,prep_time,cook_time,always_available").order("name");
  if (q) query = query.ilike("name", `%${q}%`);
  const { data } = await query;
  const recipes = (data ?? []) as Recipe[];

  return (
    <div style={{ padding: "16px 20px 60px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <PageHeader title="Recipes" right={<span style={{ fontSize: 12, color: C.light }}>{recipes.length} total</span>} />

        <form style={{ marginBottom: 12 }}>
          <input name="q" defaultValue={q ?? ""} placeholder="Search by name…" style={inputStyle} />
        </form>

        <Section title="Add recipe">
          <form action={createRecipe} style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <input name="name" placeholder="Name" required style={{ ...inputStyle, flex: "1 1 200px" }} />
            <button type="submit" style={{ background: C.primary, color: C.white, border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              Create & open
            </button>
          </form>
          <p style={{ margin: "8px 0 0", fontSize: 11.5, color: C.light }}>Opens the new recipe so you can add subrecipes and details.</p>
        </Section>

        <Section>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Name</th>
                  <th style={th}>Meal</th>
                  <th style={th}>Prep</th>
                  <th style={th}>Cook</th>
                  <th style={th}>Always avail.</th>
                </tr>
              </thead>
              <tbody>
                {recipes.length === 0 ? (
                  <tr><td style={td} colSpan={5}>No recipes found.</td></tr>
                ) : recipes.map(r => (
                  <tr key={r.id}>
                    <td style={td}>
                      <Link href={`/admin/catalog/recipes/${r.id}`} style={{ color: C.primary, fontWeight: 600, textDecoration: "none" }}>
                        {r.name}
                      </Link>
                    </td>
                    <td style={{ ...td, color: C.muted }}>{mealLabel(r)}</td>
                    <td style={{ ...td, color: C.muted }}>{r.prep_time ?? "—"}</td>
                    <td style={{ ...td, color: C.muted }}>{r.cook_time ?? "—"}</td>
                    <td style={{ ...td, color: C.muted }}>{r.always_available ? "Yes" : "No"}</td>
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
