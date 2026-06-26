import { Suspense } from "react";
import { PageHeader, Section, inputStyle, labelStyle, C } from "@/components/admin/ui";
import { getPackagingView } from "@/lib/flask";
import PackagingBoard from "@/components/admin/packaging/PackagingBoard";

function BoardFallback() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, height: 100 }} />
      ))}
    </div>
  );
}

async function PackagingResults({ start, end }: { start: string; end: string }) {
  const days = await getPackagingView(start, end);
  return <PackagingBoard days={days} />;
}

export default async function PackagingPage({ searchParams }: { searchParams: Promise<{ start?: string; end?: string }> }) {
  const { start, end } = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const rangeStart = start ?? today;
  const rangeEnd = end ?? today;

  return (
    <div style={{ padding: "24px 20px 60px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <PageHeader title="Packaging" />

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

        <Suspense fallback={<BoardFallback />} key={`${rangeStart}-${rangeEnd}`}>
          <PackagingResults start={rangeStart} end={rangeEnd} />
        </Suspense>
      </div>
    </div>
  );
}
