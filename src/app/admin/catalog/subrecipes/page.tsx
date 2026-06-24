import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { PageHeader, Section, inputStyle, th, td, C } from "@/components/admin/ui";
import { createSubrecipe } from "./actions";

type Subrecipe = Pick<Database["public"]["Tables"]["subrecipe"]["Row"], "id" | "name" | "prep_time" | "kcal" | "freezable" | "max_serving">;

export default async function SubrecipesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const supabase = await createClient();

  let query = supabase.from("subrecipe").select("id,name,prep_time,kcal,freezable,max_serving").order("name");
  if (q) query = query.ilike("name", `%${q}%`);
  const { data } = await query;
  const subrecipes = (data ?? []) as Subrecipe[];

  return (
    <div style={{ padding: "16px 20px 60px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <PageHeader title="Subrecipes" right={<span style={{ fontSize: 12, color: C.light }}>{subrecipes.length} total</span>} />

        <form style={{ marginBottom: 12 }}>
          <input name="q" defaultValue={q ?? ""} placeholder="Search by name…" style={inputStyle} />
        </form>

        <Section title="Add subrecipe">
          <form action={createSubrecipe} style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <input name="name" placeholder="Name" required style={{ ...inputStyle, flex: "1 1 200px" }} />
            <input name="prep_time" placeholder="Prep time" style={{ ...inputStyle, flex: "0 1 120px" }} />
            <button type="submit" style={{ background: C.primary, color: C.white, border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              Create & open
            </button>
          </form>
          <p style={{ margin: "8px 0 0", fontSize: 11.5, color: C.light }}>Opens the new subrecipe so you can add ingredients and macros.</p>
        </Section>

        <Section>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Name</th>
                  <th style={th}>Prep time</th>
                  <th style={th}>kcal</th>
                  <th style={th}>Freezable</th>
                  <th style={th}>Max serving</th>
                </tr>
              </thead>
              <tbody>
                {subrecipes.length === 0 ? (
                  <tr><td style={td} colSpan={5}>No subrecipes found.</td></tr>
                ) : subrecipes.map(s => (
                  <tr key={s.id}>
                    <td style={td}>
                      <Link href={`/admin/catalog/subrecipes/${s.id}`} style={{ color: C.primary, fontWeight: 600, textDecoration: "none" }}>
                        {s.name}
                      </Link>
                    </td>
                    <td style={{ ...td, color: C.muted }}>{s.prep_time ?? "—"}</td>
                    <td style={{ ...td, color: C.muted }}>{s.kcal ?? "—"}</td>
                    <td style={{ ...td, color: C.muted }}>{s.freezable ? "Yes" : "No"}</td>
                    <td style={{ ...td, color: C.muted }}>{s.max_serving ?? "—"}</td>
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
