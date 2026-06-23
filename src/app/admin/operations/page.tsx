import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type Delivery = Database["public"]["Tables"]["deliveries"]["Row"];
type DeliverySlot = Database["public"]["Tables"]["delivery_slots"]["Row"];
type UserRow = Database["public"]["Tables"]["user"]["Row"];
type KitchenClosure = Database["public"]["Tables"]["kitchen_closure"]["Row"];
type MealPlanDay = Database["public"]["Tables"]["meal_plan_day"]["Row"];
type MealPlanDayRecipe = Database["public"]["Tables"]["meal_plan_day_recipe"]["Row"];
type Payment = Database["public"]["Tables"]["payment"]["Row"];

const C = {
  primary: "#063330", teal: "#67b1b0", tealDark: "#437b7b",
  offWhite: "#eee9e6", muted: "#5c5c5c", light: "#9a9a9a",
  border: "#e0dbd5", white: "#ffffff", error: "#c0392b", warn: "#b8860b",
};

function Card({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", flex: "1 1 140px" }}>
      <p style={{ margin: "0 0 4px", fontSize: 11, color: C.light, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</p>
      <p style={{ margin: 0, fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 500, color: accent ?? C.primary }}>{value}</p>
      {sub && <p style={{ margin: "2px 0 0", fontSize: 11.5, color: C.light }}>{sub}</p>}
    </div>
  );
}

function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px", marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: C.primary }}>{title}</h3>
        {right}
      </div>
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

export default async function AdminOperationsPage() {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [
    deliveriesRes,
    slotsRes,
    closuresRes,
    mealPlanDaysRes,
  ] = await Promise.all([
    supabase.from("deliveries").select("*").eq("delivery_date", today),
    supabase.from("delivery_slots").select("*"),
    supabase.from("kitchen_closure").select("*").eq("closure_date", today),
    supabase.from("meal_plan_day").select("*").eq("date", today),
  ]);

  const deliveries = (deliveriesRes.data ?? []) as Delivery[];
  const slots = (slotsRes.data ?? []) as DeliverySlot[];
  const closures = (closuresRes.data ?? []) as KitchenClosure[];
  const mealPlanDays = (mealPlanDaysRes.data ?? []) as MealPlanDay[];

  const userIds = [...new Set(deliveries.map(d => d.user_id).filter((id): id is string => !!id))];
  const mpdIds = mealPlanDays.map(d => d.id);

  const [usersRes, recipesRes, paymentsRes] = await Promise.all([
    userIds.length
      ? supabase.from("user").select("*").in("id", userIds)
      : Promise.resolve({ data: [] as UserRow[] }),
    mpdIds.length
      ? supabase.from("meal_plan_day_recipe").select("*").in("meal_plan_day_id", mpdIds)
      : Promise.resolve({ data: [] as MealPlanDayRecipe[] }),
    mpdIds.length
      ? supabase.from("payment").select("*").in("meal_plan_day_id", mpdIds)
      : Promise.resolve({ data: [] as Payment[] }),
  ]);

  const users = (usersRes.data ?? []) as UserRow[];
  const recipes = (recipesRes.data ?? []) as MealPlanDayRecipe[];
  const payments = (paymentsRes.data ?? []) as Payment[];

  const usersById = new Map(users.map(u => [u.id, u]));
  const slotsById = new Map(slots.map(s => [s.id, s]));

  function fmtSlot(slotId: number | null) {
    const slot = slotId != null ? slotsById.get(slotId) : null;
    if (!slot) return "—";
    return `${slot.start_time?.slice(0, 5) ?? "?"}–${slot.end_time?.slice(0, 5) ?? "?"}`;
  }

  const deliveriesPending = deliveries.filter(d => d.status === "pending").length;
  const deliveriesDone = deliveries.filter(d => d.status === "completed").length;

  const cookingDone = recipes.filter(r => r.cooking_status === "completed").length;
  const packagingDone = recipes.filter(r => r.packaging_status === "completed").length;

  const paidAmount = payments.filter(p => p.status === "paid").reduce((sum, p) => sum + (p.amount ?? 0), 0);
  const pendingAmount = payments.filter(p => p.status !== "paid").reduce((sum, p) => sum + (p.amount ?? 0), 0);

  const sortedDeliveries = [...deliveries].sort((a, b) => (a.delivery_slot_id ?? 0) - (b.delivery_slot_id ?? 0));

  return (
    <div style={{ padding: "24px 20px 60px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 18 }}>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 500, color: C.primary, margin: 0 }}>
            Operations
          </h1>
          <span style={{ fontSize: 12, color: C.light }}>
            {new Date(today).toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long" })}
          </span>
        </div>

        {closures.length > 0 && (
          <div style={{
            background: `${C.error}12`, border: `1px solid ${C.error}40`, borderRadius: 12,
            padding: "12px 16px", marginBottom: 16,
          }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: C.error }}>
              Kitchen closed today{closures[0].reason ? ` — ${closures[0].reason}` : ""}
            </p>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
          <Card label="Deliveries today" value={String(deliveries.length)} sub={`${deliveriesDone} completed`} />
          <Card label="Meal plan days" value={String(mealPlanDays.length)} />
          <Card label="Cooked" value={`${cookingDone}/${recipes.length}`} sub="recipes" />
          <Card label="Packaged" value={`${packagingDone}/${recipes.length}`} sub="recipes" />
          <Card label="Paid today" value={`$${paidAmount.toFixed(0)}`} sub={pendingAmount > 0 ? `$${pendingAmount.toFixed(0)} pending` : undefined} accent={C.tealDark} />
        </div>

        <Section title={`Deliveries (${deliveries.length})`}>
          {sortedDeliveries.length === 0 ? (
            <p style={{ fontSize: 13, color: C.light, margin: 0 }}>No deliveries scheduled today.</p>
          ) : (
            <div style={{ maxHeight: 420, overflowY: "auto" }}>
              <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", color: C.light, borderBottom: `1px solid ${C.border}` }}>
                    <th style={{ padding: "4px 6px" }}>Slot</th>
                    <th style={{ padding: "4px 6px" }}>Customer</th>
                    <th style={{ padding: "4px 6px" }}>Address</th>
                    <th style={{ padding: "4px 6px" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedDeliveries.map(d => {
                    const user = d.user_id ? usersById.get(d.user_id) : null;
                    return (
                      <tr key={d.id} style={{ borderBottom: `1px solid ${C.offWhite}` }}>
                        <td style={{ padding: "6px 6px", whiteSpace: "nowrap", color: C.muted }}>{fmtSlot(d.delivery_slot_id)}</td>
                        <td style={{ padding: "6px 6px", fontWeight: 600 }}>
                          {user ? `${user.name ?? ""} ${user.last_name ?? ""}`.trim() || "—" : "—"}
                        </td>
                        <td style={{ padding: "6px 6px", color: C.muted, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>
                          {d.delivery_address ?? "—"}
                        </td>
                        <td style={{ padding: "6px 6px" }}><StatusPill status={d.status} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section title="Payments today">
          {payments.length === 0 ? (
            <p style={{ fontSize: 13, color: C.light, margin: 0 }}>No payments tied to today&apos;s orders.</p>
          ) : (
            <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", color: C.light, borderBottom: `1px solid ${C.border}` }}>
                  <th style={{ padding: "4px 6px" }}>Amount</th>
                  <th style={{ padding: "4px 6px" }}>Provider</th>
                  <th style={{ padding: "4px 6px" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {payments.map(p => (
                  <tr key={p.id} style={{ borderBottom: `1px solid ${C.offWhite}` }}>
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
      </div>
    </div>
  );
}
