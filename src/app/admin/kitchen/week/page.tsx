import { Suspense } from "react";
import Link from "next/link";
import { PageHeader, Section, inputStyle, labelStyle, C } from "@/components/admin/ui";
import { getKitchenWeek } from "@/lib/flask";
import { beirutISODate } from "@/lib/dates";
import WeekBoard from "@/components/admin/kitchen/WeekBoard";
import AkliLoader from "@/components/AkliLoader";

async function WeekResults({ start }: { start: string }) {
  const week = await getKitchenWeek(start);
  return <WeekBoard week={week} />;
}

export default async function KitchenWeekPage({ searchParams }: { searchParams: Promise<{ start?: string }> }) {
  const { start } = await searchParams;
  const weekStart = start ?? beirutISODate(0);

  return (
    <div style={{ padding: "24px 20px 60px" }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <PageHeader title="Kitchen week" right={<Link href="/admin/kitchen" style={{ fontSize: 12.5, color: C.tealDark }}>← Kitchen Day</Link>} />
        <Section>
          <form style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ ...labelStyle, flex: "0 1 170px" }}>Week starting
              <input type="date" name="start" defaultValue={weekStart} style={inputStyle} />
            </label>
            <button type="submit" style={{ background: C.primary, color: C.white, border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              Show week
            </button>
          </form>
        </Section>
        <Suspense key={weekStart} fallback={<AkliLoader message="Laying out the week…" tone="dark" />}>
          <WeekResults start={weekStart} />
        </Suspense>
      </div>
    </div>
  );
}
