import { PageHeader, Section, inputStyle, labelStyle, C } from "@/components/admin/ui";
import { createClient } from "@/lib/supabase/server";
import { fetchClientsInRange } from "@/lib/labels";
import LabelsGeneratorForm from "@/components/admin/labels/LabelsGeneratorForm";

export default async function LabelsPage({ searchParams }: { searchParams: Promise<{ start?: string; end?: string }> }) {
  const { start, end } = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const rangeStart = start ?? today;
  const rangeEnd = end ?? today;

  const supabase = await createClient();
  const clients = await fetchClientsInRange(supabase, rangeStart, rangeEnd);

  return (
    <div style={{ padding: "24px 20px 60px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <PageHeader title="Labels" />

        <Section>
          <form style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ ...labelStyle, flex: "0 1 160px" }}>
              Start date
              <input type="date" name="start" defaultValue={rangeStart} style={inputStyle} />
            </label>
            <label style={{ ...labelStyle, flex: "0 1 160px" }}>
              End date
              <input type="date" name="end" defaultValue={rangeEnd} style={inputStyle} />
            </label>
            <button
              type="submit"
              style={{ background: C.primary, color: C.white, border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
            >
              Apply
            </button>
          </form>
        </Section>

        <LabelsGeneratorForm key={`${rangeStart}-${rangeEnd}`} start={rangeStart} end={rangeEnd} clients={clients} />
      </div>
    </div>
  );
}
