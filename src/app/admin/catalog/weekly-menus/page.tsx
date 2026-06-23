import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { PageHeader, Section, inputStyle, labelStyle, th, td, C } from "@/components/admin/ui";
import { createWeeklyMenu } from "./actions";

type WeeklyMenu = Database["public"]["Tables"]["weekly_menu"]["Row"];

export default async function WeeklyMenusPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("weekly_menu").select("*").order("week_start_date", { ascending: false });
  const menus = (data ?? []) as WeeklyMenu[];

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div style={{ padding: "16px 20px 60px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <PageHeader title="Weekly menus" right={<span style={{ fontSize: 12, color: C.light }}>{menus.length} total</span>} />

        <Section title="Create weekly menu">
          <form action={createWeeklyMenu} style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <label style={{ ...labelStyle, flex: "1 1 160px" }}>Name (optional)
              <input name="name" style={inputStyle} />
            </label>
            <label style={{ ...labelStyle, flex: "0 1 150px" }}>Week start
              <input name="week_start_date" type="date" required style={inputStyle} />
            </label>
            <label style={{ ...labelStyle, flex: "0 1 150px" }}>Week end
              <input name="week_end_date" type="date" required style={inputStyle} />
            </label>
            <button type="submit" style={{ background: C.primary, color: C.white, border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", alignSelf: "flex-end" }}>
              Create & open
            </button>
          </form>
        </Section>

        <Section>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Name</th>
                  <th style={th}>Week start</th>
                  <th style={th}>Week end</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {menus.length === 0 ? (
                  <tr><td style={td} colSpan={4}>No weekly menus yet.</td></tr>
                ) : menus.map(m => {
                  const isCurrent = m.week_start_date && m.week_end_date && m.week_start_date <= today && m.week_end_date >= today;
                  return (
                    <tr key={m.id}>
                      <td style={td}>
                        <Link href={`/admin/catalog/weekly-menus/${m.id}`} style={{ color: C.primary, fontWeight: 600, textDecoration: "none" }}>
                          {m.name ?? `Week of ${m.week_start_date}`}
                        </Link>
                        {isCurrent && (
                          <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: C.tealDark, background: `${C.teal}30`, borderRadius: 6, padding: "2px 6px" }}>
                            CURRENT
                          </span>
                        )}
                      </td>
                      <td style={{ ...td, color: C.muted }}>{m.week_start_date ?? "—"}</td>
                      <td style={{ ...td, color: C.muted }}>{m.week_end_date ?? "—"}</td>
                      <td style={td} />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </div>
  );
}
