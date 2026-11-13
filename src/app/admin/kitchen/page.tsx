import { Suspense } from "react";
import Link from "next/link";
import { PageHeader, C } from "@/components/admin/ui";
import { getKitchenSimple } from "@/lib/flask";
import { beirutISODate } from "@/lib/dates";
import { buildRows } from "@/lib/kitchenSimple";
import { loadPlan } from "./simple-actions";
import KitchenSimple from "@/components/admin/kitchen-simple/KitchenSimple";
import AkliLoader from "@/components/AkliLoader";

async function KitchenResults({ date, tab }: { date: string; tab: "plan" | "today" | "wrap" }) {
  const [data, plan] = await Promise.all([getKitchenSimple(date), loadPlan(date)]);
  const rows = buildRows(data, plan.previous);
  return (
    <KitchenSimple
      cookDate={date} dates={data.dates} rows={rows} items={plan.items} steps={plan.steps}
      equipment={plan.equipment} people={plan.people} initialTab={tab}
    />
  );
}

export default async function KitchenPage({ searchParams }: { searchParams: Promise<{ date?: string; tab?: string }> }) {
  const { date, tab } = await searchParams;
  const cookDate = date ?? beirutISODate(0);

  return (
    <div style={{ padding: "20px 16px 60px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <PageHeader title="Kitchen" right={<Link href="/admin/kitchen/old" style={{ fontSize: 12, color: C.light }}>old screen</Link>} />
        <Suspense key={cookDate} fallback={<AkliLoader message="Checking the fridge…" tone="dark" />}>
          <KitchenResults date={cookDate} tab={tab === "today" || tab === "wrap" ? tab : "plan"} />
        </Suspense>
      </div>
    </div>
  );
}
