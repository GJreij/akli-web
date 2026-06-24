import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type MealPlanDay = Pick<Database["public"]["Tables"]["meal_plan_day"]["Row"], "id">;
type MealPlanDayRecipe = Pick<Database["public"]["Tables"]["meal_plan_day_recipe"]["Row"], "cooking_status">;
type Delivery = Pick<Database["public"]["Tables"]["deliveries"]["Row"], "status">;
type EventRow = Pick<Database["public"]["Tables"]["analytics_event"]["Row"], "anon_id">;

const C = {
  primary: "#063330", teal: "#67b1b0", tealDark: "#437b7b",
  offWhite: "#eee9e6", muted: "#5c5c5c", light: "#9a9a9a",
  border: "#e0dbd5", white: "#ffffff",
};

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px", flex: "1 1 180px" }}>
      <p style={{ margin: "0 0 6px", fontSize: 11, color: C.light, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</p>
      <p style={{ margin: 0, fontFamily: "'Playfair Display', serif", fontSize: 30, fontWeight: 500, color: C.primary }}>{value}</p>
      {sub && <p style={{ margin: "4px 0 0", fontSize: 12, color: C.light }}>{sub}</p>}
    </div>
  );
}

const SECTIONS = [
  { href: "/admin/operations", label: "Operations", desc: "Today's deliveries, cooking & packaging status, payments" },
  { href: "/admin/users", label: "Users", desc: "Browse and manage all customer accounts" },
  { href: "/admin/catalog", label: "Catalog", desc: "Ingredients, recipes, subrecipes & weekly menus" },
  { href: "/admin/commerce", label: "Commerce", desc: "Pricing, promos & orders" },
  { href: "/admin/analytics", label: "Analytics", desc: "Traffic, funnel & landing page performance" },
];

function QuickAccessGrid() {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 4 }}>
      {SECTIONS.map(s => (
        <Link
          key={s.href}
          href={s.href}
          style={{
            flex: "1 1 220px", textDecoration: "none", background: C.primary, borderRadius: 14,
            padding: "16px 18px", color: C.white, display: "block", transition: "transform 0.1s",
          }}
        >
          <p style={{ margin: "0 0 4px", fontFamily: "'Playfair Display', serif", fontSize: 17, fontWeight: 500, color: C.white }}>
            {s.label}
          </p>
          <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.7)", lineHeight: 1.4 }}>{s.desc}</p>
        </Link>
      ))}
    </div>
  );
}

function StatsFallback() {
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px", flex: "1 1 180px", height: 78 }} />
      ))}
    </div>
  );
}

async function DashboardStats() {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [mealPlanDaysRes, deliveriesRes, signupsRes, eventsRes] = await Promise.all([
    supabase.from("meal_plan_day").select("id").eq("date", today),
    supabase.from("deliveries").select("status").eq("delivery_date", today),
    supabase.from("user").select("id", { count: "exact", head: true }).gte("created_at", since24h),
    supabase.from("analytics_event").select("anon_id").eq("event_name", "page_view").gte("created_at", since24h),
  ]);

  const mealPlanDays = (mealPlanDaysRes.data ?? []) as MealPlanDay[];
  const mpdIds = mealPlanDays.map(d => d.id);

  const recipesRes = mpdIds.length
    ? await supabase.from("meal_plan_day_recipe").select("cooking_status").in("meal_plan_day_id", mpdIds)
    : { data: [] as MealPlanDayRecipe[] };
  const recipes = (recipesRes.data ?? []) as MealPlanDayRecipe[];
  const mealsToCook = recipes.length;
  const mealsDone = recipes.filter(r => r.cooking_status === "completed").length;

  const deliveries = (deliveriesRes.data ?? []) as Delivery[];
  const deliveriesPending = deliveries.filter(d => d.status === "pending").length;

  const newSignups = signupsRes.count ?? 0;

  const events = (eventsRes.data ?? []) as EventRow[];
  const uniqueVisitors = new Set(events.map(e => e.anon_id).filter(Boolean)).size;

  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
      <StatCard label="Meals to cook" value={String(mealsToCook)} sub={mealsToCook ? `${mealsDone} done` : "today"} />
      <StatCard label="Deliveries today" value={String(deliveries.length)} sub={deliveriesPending ? `${deliveriesPending} pending` : "none pending"} />
      <StatCard label="New signups" value={String(newSignups)} sub="last 24h" />
      <StatCard label="Site visits" value={String(uniqueVisitors)} sub="unique, last 24h" />
    </div>
  );
}

export default function AdminDashboardPage() {
  const today = new Date();

  return (
    <div style={{ padding: "24px 20px 60px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 18 }}>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 500, color: C.primary, margin: 0 }}>
            Dashboard
          </h1>
          <span style={{ fontSize: 12, color: C.light }}>
            {today.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long" })}
          </span>
        </div>

        <Suspense fallback={<StatsFallback />}>
          <DashboardStats />
        </Suspense>

        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 17, fontWeight: 500, color: C.primary, margin: "8px 0 10px" }}>
          Quick access
        </h2>
        <QuickAccessGrid />
      </div>
    </div>
  );
}
