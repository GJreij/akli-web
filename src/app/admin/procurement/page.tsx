import { Suspense } from "react";
import { PageHeader, Section, inputStyle, labelStyle, C } from "@/components/admin/ui";
import CopyListButton from "@/components/admin/CopyListButton";
import { getIngredientsToBuy } from "@/lib/flask";

function ListFallback() {
  return <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, height: 240 }} />;
}

async function IngredientList({ start, end }: { start: string; end: string }) {
  const ingredients = await getIngredientsToBuy(start, end);
  const text = ingredients.map(i => `${i.name}: ${i.total_quantity} ${i.unit ?? ""}`.trim()).join("\n");

  return (
    <Section title={`Shopping list (${ingredients.length})`} right={ingredients.length > 0 ? <CopyListButton text={text} /> : undefined}>
      {ingredients.length === 0 ? (
        <p style={{ fontSize: 13, color: C.light, margin: 0 }}>No ingredients needed for this range.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {ingredients.map(i => (
            <div key={i.ingredient_id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, padding: "6px 0", borderBottom: `1px solid ${C.offWhite}` }}>
              <span>{i.name}</span>
              <span style={{ color: C.muted, fontWeight: 600 }}>{i.total_quantity} {i.unit ?? ""}</span>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

export default async function ProcurementPage({ searchParams }: { searchParams: Promise<{ start?: string; end?: string }> }) {
  const { start, end } = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const rangeStart = start ?? today;
  const rangeEnd = end ?? today;

  return (
    <div style={{ padding: "24px 20px 60px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <PageHeader title="Procurement" />

        <Section>
          <form style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ ...labelStyle, flex: "0 1 160px" }}>Start date
              <input type="date" name="start" defaultValue={rangeStart} style={inputStyle} />
            </label>
            <label style={{ ...labelStyle, flex: "0 1 160px" }}>End date
              <input type="date" name="end" defaultValue={rangeEnd} style={inputStyle} />
            </label>
            <button type="submit" style={{ background: C.primary, color: C.white, border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              Apply
            </button>
          </form>
        </Section>

        <Suspense fallback={<ListFallback />} key={`${rangeStart}-${rangeEnd}`}>
          <IngredientList start={rangeStart} end={rangeEnd} />
        </Suspense>
      </div>
    </div>
  );
}
