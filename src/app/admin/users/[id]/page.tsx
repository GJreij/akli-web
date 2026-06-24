import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import AdminUserEditForm from "@/components/AdminUserEditForm";

type UserRow = Pick<Database["public"]["Tables"]["user"]["Row"], "id" | "name" | "last_name" | "email" | "phone_number" | "created_at" | "onboarding" | "role" | "status">;
type Address = Pick<Database["public"]["Tables"]["user_delivery_address"]["Row"], "id" | "label" | "is_default" | "address_text">;
type MealPlan = Pick<Database["public"]["Tables"]["meal_plan"]["Row"], "id" | "start_date" | "end_date">;
type MealPlanDay = Pick<Database["public"]["Tables"]["meal_plan_day"]["Row"], "id" | "meal_plan_id">;
type Payment = Pick<Database["public"]["Tables"]["payment"]["Row"], "id" | "amount" | "currency" | "provider" | "status" | "created_at">;

const C = {
  primary: "#063330", teal: "#67b1b0", tealDark: "#437b7b",
  offWhite: "#eee9e6", muted: "#5c5c5c", light: "#9a9a9a",
  border: "#e0dbd5", white: "#ffffff", warn: "#b8860b",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px", marginBottom: 16 }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600, color: C.primary }}>{title}</h3>
      {children}
    </div>
  );
}

function StatusPill({ status }: { status: string | null }) {
  const s = status ?? "unknown";
  const color = s === "completed" || s === "paid" ? C.tealDark : s === "pending" ? C.warn : C.muted;
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 600, color, background: `${color}1a`,
      borderRadius: 6, padding: "2px 7px", textTransform: "uppercase", letterSpacing: "0.03em",
    }}>
      {s}
    </span>
  );
}

function DetailFallback() {
  return (
    <>
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, height: 140, marginBottom: 16 }} />
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, height: 100, marginBottom: 16 }} />
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, height: 100, marginBottom: 16 }} />
    </>
  );
}

async function UserDetail({ id }: { id: string }) {
  const supabase = await createClient();

  const { data: userData } = await supabase
    .from("user")
    .select("id,name,last_name,email,phone_number,created_at,onboarding,role,status")
    .eq("id", id)
    .single();
  const user = userData as UserRow | null;
  if (!user) notFound();

  const [addressesRes, mealPlansRes] = await Promise.all([
    supabase.from("user_delivery_address").select("id,label,is_default,address_text").eq("user_id", id),
    supabase.from("meal_plan").select("id,start_date,end_date").eq("user_id", id).order("start_date", { ascending: false }),
  ]);

  const addresses = (addressesRes.data ?? []) as Address[];
  const mealPlans = (mealPlansRes.data ?? []) as MealPlan[];
  const mealPlanIds = mealPlans.map(m => m.id);

  const mealPlanDaysRes = mealPlanIds.length
    ? await supabase.from("meal_plan_day").select("id,meal_plan_id").in("meal_plan_id", mealPlanIds)
    : { data: [] as MealPlanDay[] };
  const mealPlanDays = (mealPlanDaysRes.data ?? []) as MealPlanDay[];
  const mpdIds = mealPlanDays.map(d => d.id);

  const paymentsRes = mpdIds.length
    ? await supabase.from("payment").select("id,amount,currency,provider,status,created_at").in("meal_plan_day_id", mpdIds).order("created_at", { ascending: false })
    : { data: [] as Payment[] };
  const payments = (paymentsRes.data ?? []) as Payment[];

  const mealPlanDaysByPlan = new Map<number, MealPlanDay[]>();
  for (const d of mealPlanDays) {
    if (d.meal_plan_id == null) continue;
    mealPlanDaysByPlan.set(d.meal_plan_id, [...(mealPlanDaysByPlan.get(d.meal_plan_id) ?? []), d]);
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "10px 0 18px" }}>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 500, color: C.primary, margin: 0 }}>
          {`${user.name ?? ""} ${user.last_name ?? ""}`.trim() || "Unnamed user"}
        </h1>
      </div>

      <Section title="Profile">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 16, fontSize: 13 }}>
          <div><span style={{ color: C.light }}>Email</span><br /><strong>{user.email ?? "—"}</strong></div>
          <div><span style={{ color: C.light }}>Phone</span><br /><strong>{user.phone_number ?? "—"}</strong></div>
          <div><span style={{ color: C.light }}>Joined</span><br /><strong>{new Date(user.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</strong></div>
          <div><span style={{ color: C.light }}>Onboarded</span><br /><strong>{user.onboarding ? "Yes" : "No"}</strong></div>
        </div>
        <AdminUserEditForm userId={user.id} initialRole={user.role} initialStatus={user.status} />
      </Section>

      <Section title={`Delivery addresses (${addresses.length})`}>
        {addresses.length === 0 ? (
          <p style={{ fontSize: 13, color: C.light, margin: 0 }}>No saved addresses.</p>
        ) : (
          addresses.map(a => (
            <div key={a.id} style={{ fontSize: 13, marginBottom: 8 }}>
              <strong>{a.label ?? "Address"}</strong>{a.is_default ? " (default)" : ""}
              <br /><span style={{ color: C.muted }}>{a.address_text}</span>
            </div>
          ))
        )}
      </Section>

      <Section title={`Meal plans (${mealPlans.length})`}>
        {mealPlans.length === 0 ? (
          <p style={{ fontSize: 13, color: C.light, margin: 0 }}>No meal plans yet.</p>
        ) : (
          mealPlans.map(mp => {
            const days = mealPlanDaysByPlan.get(mp.id) ?? [];
            return (
              <div key={mp.id} style={{ padding: "10px 0", borderBottom: `1px solid ${C.offWhite}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <strong>{mp.start_date} → {mp.end_date}</strong>
                  <span style={{ color: C.light }}>{days.length} day{days.length === 1 ? "" : "s"}</span>
                </div>
              </div>
            );
          })
        )}
      </Section>

      <Section title={`Payments (${payments.length})`}>
        {payments.length === 0 ? (
          <p style={{ fontSize: 13, color: C.light, margin: 0 }}>No payments on record.</p>
        ) : (
          <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", color: C.light, borderBottom: `1px solid ${C.border}` }}>
                <th style={{ padding: "4px 6px" }}>Date</th>
                <th style={{ padding: "4px 6px" }}>Amount</th>
                <th style={{ padding: "4px 6px" }}>Provider</th>
                <th style={{ padding: "4px 6px" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {payments.map(p => (
                <tr key={p.id} style={{ borderBottom: `1px solid ${C.offWhite}` }}>
                  <td style={{ padding: "6px 6px", color: C.muted, whiteSpace: "nowrap" }}>
                    {new Date(p.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                  </td>
                  <td style={{ padding: "6px 6px", fontWeight: 600 }}>
                    {p.amount != null ? `${p.currency ?? "$"}${p.amount.toFixed(2)}` : "—"}
                  </td>
                  <td style={{ padding: "6px 6px", color: C.muted }}>{p.provider ?? "—"}</td>
                  <td style={{ padding: "6px 6px" }}><StatusPill status={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </>
  );
}

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <div style={{ padding: "24px 20px 60px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <Link href="/admin/users" style={{ fontSize: 12.5, color: C.muted, textDecoration: "none" }}>
          ← Back to users
        </Link>

        <Suspense fallback={<DetailFallback />}>
          <UserDetail id={id} />
        </Suspense>
      </div>
    </div>
  );
}
