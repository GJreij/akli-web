import { Suspense } from "react";
import { PageHeader, Section, inputStyle, labelStyle, C } from "@/components/admin/ui";
import { getKitchenDay } from "@/lib/flask";
import { beirutISODate } from "@/lib/dates";
import KitchenDayBoard from "@/components/admin/kitchen/KitchenDayBoard";
import AkliLoader from "@/components/AkliLoader";

async function KitchenResults({ date }: { date: string }) {
  const day = await getKitchenDay(date);
  return <KitchenDayBoard day={day} />;
}

export default async function KitchenPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  const cookDate = date ?? beirutISODate(0);

  return (
    <div style={{ padding: "24px 20px 60px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <PageHeader title="Kitchen Day" />

        <Section>
          <form style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ ...labelStyle, flex: "0 1 170px" }}>Cook date
              <input type="date" name="date" defaultValue={cookDate} style={inputStyle} />
            </label>
            <button type="submit" style={{ background: C.primary, color: C.white, border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              Open day
            </button>
          </form>
        </Section>

        <Suspense key={cookDate} fallback={<AkliLoader message="Checking the fridge…" tone="dark" />}>
          <KitchenResults date={cookDate} />
        </Suspense>
      </div>
    </div>
  );
}
