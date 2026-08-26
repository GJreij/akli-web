import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { PageHeader, Section, inputStyle, labelStyle, th, td, C } from "@/components/admin/ui";
import OrdersAccordion, { type OrderGroup } from "./OrdersAccordion";

type PaymentRow = Pick<
  Database["public"]["Tables"]["payment"]["Row"],
  "id" | "amount" | "currency" | "provider" | "status" | "created_at" | "ordered_user_id" | "meal_plan_day_id"
>;
type SimpleUser = { id: string; name: string | null; last_name: string | null; phone_number: string | null };
type MealPlanDayRow = { id: number; meal_plan_id: number | null; date: string | null };
type MealPlanRow = { id: number; start_date: string | null; end_date: string | null };

function fmtMoney(amount: number, currency = "$") {
  return `${currency}${amount.toFixed(2)}`;
}

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function startOfWeek(d: Date) {
  const date = new Date(d);
  const day = date.getDay(); // 0 = Sunday
  const diff = (day + 6) % 7; // days since Monday
  date.setDate(date.getDate() - diff);
  return date;
}

function presetRange(preset: string): { start: string; end: string } {
  const now = new Date();
  const today = toISODate(now);
  switch (preset) {
    case "all_time": {
      return { start: "", end: "" };
    }
    case "last7": {
      const start = new Date(now);
      start.setDate(start.getDate() - 6);
      return { start: toISODate(start), end: today };
    }
    case "this_week": {
      const start = startOfWeek(now);
      return { start: toISODate(start), end: today };
    }
    case "last_week": {
      const thisStart = startOfWeek(now);
      const lastStart = new Date(thisStart);
      lastStart.setDate(lastStart.getDate() - 7);
      const lastEnd = new Date(thisStart);
      lastEnd.setDate(lastEnd.getDate() - 1);
      return { start: toISODate(lastStart), end: toISODate(lastEnd) };
    }
    case "this_month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: toISODate(start), end: today };
    }
    case "last_month": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: toISODate(start), end: toISODate(end) };
    }
    default: {
      const start = new Date(now);
      start.setDate(start.getDate() - 29);
      return { start: toISODate(start), end: today };
    }
  }
}

const PRESETS: { key: string; label: string }[] = [
  { key: "this_week", label: "This week" },
  { key: "last_week", label: "Last week" },
  { key: "last7", label: "Last 7 days" },
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "all_time", label: "All time" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "paid", label: "Paid" },
  { value: "pending", label: "Not paid" },
  { value: "partial", label: "Partially paid" },
];

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", flex: "1 1 180px" }}>
      <p style={{ margin: "0 0 4px", fontSize: 11, color: C.light, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</p>
      <p style={{ margin: 0, fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 500, color: C.primary }}>{value}</p>
      {sub && <p style={{ margin: "2px 0 0", fontSize: 11.5, color: C.light }}>{sub}</p>}
    </div>
  );
}

async function FinancialData({ start, end, userId, statusFilter }: { start: string; end: string; userId: string; statusFilter: string }) {
  const supabase = await createClient();

  // Either bound can be cleared by the admin to mean "no limit on this side" —
  // an empty string must never reach the query builder as a date literal.
  let rangeQuery = supabase
    .from("payment")
    .select("id,amount,currency,provider,status,created_at,ordered_user_id,meal_plan_day_id")
    .order("created_at", { ascending: false });
  if (start) rangeQuery = rangeQuery.gte("created_at", `${start}T00:00:00Z`);
  if (end) {
    // Range end is a date (no time) — include the whole end day.
    const endExclusive = new Date(`${end}T00:00:00Z`);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    rangeQuery = rangeQuery.lt("created_at", endExclusive.toISOString());
  }
  if (userId !== "all") rangeQuery = rangeQuery.eq("ordered_user_id", userId);

  // Outstanding debt is a running total, independent of the selected date range.
  let owedQuery = supabase
    .from("payment")
    .select("id,amount,currency,provider,status,created_at,ordered_user_id,meal_plan_day_id")
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (userId !== "all") owedQuery = owedQuery.eq("ordered_user_id", userId);

  // Wallet top-ups (both sources: added at checkout, and requested from
  // Profile) — the ledger is the single source of truth, not re-derived
  // from wallet_checkout_topup/wallet_topup_request separately.
  let topupsQuery = supabase
    .from("wallet_transactions")
    .select("id, user_id, amount, type, note, created_at")
    .in("type", ["checkout_topup", "wallet_topup"])
    .order("created_at", { ascending: false });
  if (start) topupsQuery = topupsQuery.gte("created_at", `${start}T00:00:00Z`);
  if (end) {
    const endExclusive = new Date(`${end}T00:00:00Z`);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    topupsQuery = topupsQuery.lt("created_at", endExclusive.toISOString());
  }

  const [rangeRes, owedRes, usersRes, topupsRes, pendingTopupRequestsRes] = await Promise.all([
    rangeQuery,
    owedQuery,
    supabase.from("user").select("id,name,last_name,phone_number"),
    topupsQuery,
    supabase.from("wallet_topup_request").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);

  const rangeRows = (rangeRes.data ?? []) as PaymentRow[];
  const owedRows = (owedRes.data ?? []) as PaymentRow[];
  const users = (usersRes.data ?? []) as SimpleUser[];
  type TopupRow = { id: number; user_id: string | null; amount: number | null; type: string | null; note: string | null; created_at: string };
  const topupRows = (topupsRes.data ?? []) as TopupRow[];
  const topupsInRange = topupRows.reduce((s, t) => s + (t.amount ?? 0), 0);
  const pendingTopupRequestCount = pendingTopupRequestsRes.count ?? 0;
  const userMap = new Map(users.map(u => [u.id, u]));

  // A cancelled day's payment row is left untouched for audit history, but it
  // no longer represents real revenue or a real debt — without this, a
  // cancelled order would keep inflating "Total owed" / "Clients who owe"
  // forever, or double-count as void revenue in the range cards.
  const allMpdIds = [...new Set(
    [...rangeRows, ...owedRows].map(p => p.meal_plan_day_id).filter((id): id is number => id != null)
  )];
  const mpdStatusRes = allMpdIds.length
    ? await supabase.from("meal_plan_day").select("id, status").in("id", allMpdIds)
    : { data: [] as { id: number; status: string | null }[] };
  const dayStatusMap = new Map((mpdStatusRes.data ?? []).map(d => [d.id, d.status]));
  const isCancelled = (p: PaymentRow) => p.meal_plan_day_id != null && dayStatusMap.get(p.meal_plan_day_id) === "cancelled";

  const nameFor = (id: string | null) => {
    if (!id) return "Unknown client";
    const u = userMap.get(id);
    return u ? `${u.name ?? ""} ${u.last_name ?? ""}`.trim() || "Unknown client" : "Unknown client";
  };

  // Resolve each payment's meal_plan (the "order" it belongs to) so same-week
  // day-charges can be grouped instead of shown as one row per day.
  const mpdIds = [...new Set(rangeRows.map(p => p.meal_plan_day_id).filter((id): id is number => id != null))];
  const mpdRes = mpdIds.length
    ? await supabase.from("meal_plan_day").select("id,meal_plan_id,date").in("id", mpdIds)
    : { data: [] as MealPlanDayRow[] };
  const mpdMap = new Map(((mpdRes.data ?? []) as MealPlanDayRow[]).map(d => [d.id, d]));

  const planIds = [...new Set([...mpdMap.values()].map(d => d.meal_plan_id).filter((id): id is number => id != null))];
  const planRes = planIds.length
    ? await supabase.from("meal_plan").select("id,start_date,end_date").in("id", planIds)
    : { data: [] as MealPlanRow[] };
  const planMap = new Map(((planRes.data ?? []) as MealPlanRow[]).map(p => [p.id, p]));

  // Credited checkout top-ups are never auto-reversed when an order's payment
  // is later reverted to pending (the money stays in the client's wallet by
  // design) — so admins need a clear pointer to the exact rows to fix by hand
  // in Supabase if a revert really does need to claw the credit back.
  type CheckoutTopupRow = { id: number; meal_plan_id: number; amount: number | null; credited_at: string | null };
  type WalletTxRow = { id: number; related_order_id: number | null };
  const [checkoutTopupsRes, walletTxRes] = await Promise.all([
    planIds.length
      ? supabase.from("wallet_checkout_topup").select("id, meal_plan_id, amount, credited_at").in("meal_plan_id", planIds).eq("credited", true)
      : Promise.resolve({ data: [] as CheckoutTopupRow[] }),
    planIds.length
      ? supabase.from("wallet_transactions").select("id, related_order_id").eq("type", "checkout_topup").in("related_order_id", planIds)
      : Promise.resolve({ data: [] as WalletTxRow[] }),
  ]);
  const walletTxByPlan = new Map(((walletTxRes.data ?? []) as WalletTxRow[]).map(t => [t.related_order_id, t.id]));
  const creditedTopupByPlan = new Map(
    ((checkoutTopupsRes.data ?? []) as CheckoutTopupRow[]).map(t => [t.meal_plan_id, {
      checkoutTopupId: t.id,
      walletTransactionId: walletTxByPlan.get(t.meal_plan_id) ?? null,
      amount: t.amount ?? 0,
      creditedAt: t.credited_at,
    }])
  );

  const activeRangeRows = rangeRows.filter(p => !isCancelled(p));
  const activeOwedRows = owedRows.filter(p => !isCancelled(p));

  const paidInRange = activeRangeRows.filter(p => p.status === "paid");
  const pendingInRange = activeRangeRows.filter(p => p.status === "pending");
  const revenueInRange = paidInRange.reduce((s, p) => s + (p.amount ?? 0), 0);
  const pendingInRangeTotal = pendingInRange.reduce((s, p) => s + (p.amount ?? 0), 0);
  const totalOwed = activeOwedRows.reduce((s, p) => s + (p.amount ?? 0), 0);

  const owedByClient = new Map<string, { name: string; phone: string | null; total: number; count: number }>();
  for (const p of activeOwedRows) {
    const key = p.ordered_user_id ?? "unknown";
    const u = p.ordered_user_id ? userMap.get(p.ordered_user_id) : null;
    const existing = owedByClient.get(key);
    if (existing) {
      existing.total += p.amount ?? 0;
      existing.count += 1;
    } else {
      owedByClient.set(key, {
        name: nameFor(p.ordered_user_id),
        phone: u?.phone_number ?? null,
        total: p.amount ?? 0,
        count: 1,
      });
    }
  }
  const owedList = [...owedByClient.entries()].sort((a, b) => b[1].total - a[1].total);

  // Group day-level payments into orders (one meal_plan = one order). Payments
  // with no linked meal_plan_day (shouldn't normally happen) fall back to being
  // their own single-day order rather than being dropped.
  const orderMap = new Map<string, OrderGroup>();
  for (const p of rangeRows) {
    const mpd = p.meal_plan_day_id != null ? mpdMap.get(p.meal_plan_day_id) : undefined;
    const planId = mpd?.meal_plan_id ?? null;
    const plan = planId != null ? planMap.get(planId) : undefined;
    const key = planId != null ? `plan-${planId}` : `payment-${p.id}`;
    const dayDate = mpd?.date ?? p.created_at.slice(0, 10);

    let group = orderMap.get(key);
    if (!group) {
      group = {
        key,
        mealPlanId: planId,
        userId: p.ordered_user_id,
        clientName: nameFor(p.ordered_user_id),
        startDate: plan?.start_date ?? dayDate,
        endDate: plan?.end_date ?? dayDate,
        total: 0,
        currency: p.currency ?? "$",
        status: "pending",
        days: [],
        topup: planId != null ? creditedTopupByPlan.get(planId) ?? null : null,
      };
      orderMap.set(key, group);
    }
    const cancelled = isCancelled(p);
    if (!cancelled) group.total += p.amount ?? 0;
    group.days.push({ id: p.id, date: dayDate, amount: p.amount ?? 0, currency: p.currency ?? "$", status: p.status ?? "unknown", cancelled });
  }
  for (const group of orderMap.values()) {
    group.days.sort((a, b) => a.date.localeCompare(b.date));
    // Cancelled days stay visible in the day list (so a cancellation never
    // reads as vanished data) but don't count toward the order's paid/pending
    // status — that reflects what's still actually owed or collected.
    const activeDays = group.days.filter(d => !d.cancelled);
    const paidCount = activeDays.filter(d => d.status === "paid").length;
    group.status = activeDays.length === 0 ? "paid" : paidCount === 0 ? "pending" : paidCount === activeDays.length ? "paid" : "partial";
  }
  // An order that's fully cancelled has nothing left to track financially.
  for (const key of [...orderMap.keys()]) {
    const group = orderMap.get(key)!;
    if (group.days.length > 0 && group.days.every(d => d.cancelled)) orderMap.delete(key);
  }
  let orders = [...orderMap.values()].sort((a, b) => b.startDate.localeCompare(a.startDate));
  if (statusFilter !== "all") orders = orders.filter(o => o.status === statusFilter);

  const rangeLabel = start || end ? "in range" : "(all time)";

  return (
    <>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <Card label={`Revenue ${rangeLabel}`} value={fmtMoney(revenueInRange)} sub={`${paidInRange.length} day${paidInRange.length === 1 ? "" : "s"} paid`} />
        <Card label={`Pending ${rangeLabel}`} value={fmtMoney(pendingInRangeTotal)} sub={`${pendingInRange.length} day${pendingInRange.length === 1 ? "" : "s"} unpaid`} />
        <Card label="Total owed (all time)" value={fmtMoney(totalOwed)} sub={`${activeOwedRows.length} day${activeOwedRows.length === 1 ? "" : "s"} unpaid across ${owedList.length} client${owedList.length === 1 ? "" : "s"}`} />
        <Card label={`Wallet top-ups ${rangeLabel}`} value={fmtMoney(topupsInRange)} sub="Checkout + profile requests, credited" />
      </div>

      <Section title={`Wallet top-ups ${rangeLabel} (${topupRows.length})`}>
        {topupRows.length === 0 ? (
          <p style={{ fontSize: 13, color: C.light, margin: 0 }}>No wallet top-ups in this range.</p>
        ) : (
          <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <th style={th}>Client</th>
                <th style={th}>Source</th>
                <th style={th}>Amount</th>
                <th style={th}>Date</th>
              </tr>
            </thead>
            <tbody>
              {topupRows.map(t => (
                <tr key={t.id}>
                  <td style={td}>
                    {t.user_id ? (
                      <Link href={`/admin/users/${t.user_id}`} style={{ color: C.primary, fontWeight: 600, textDecoration: "none" }}>
                        {nameFor(t.user_id)}
                      </Link>
                    ) : nameFor(null)}
                  </td>
                  <td style={{ ...td, color: C.muted }}>{t.type === "checkout_topup" ? "At checkout" : "Profile request"}</td>
                  <td style={{ ...td, fontWeight: 700, color: C.primary }}>{fmtMoney(t.amount ?? 0)}</td>
                  <td style={{ ...td, color: C.muted }}>{new Date(t.created_at).toLocaleDateString("en-GB", { timeZone: "Asia/Beirut" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {pendingTopupRequestCount > 0 && (
        <Section title="Pending wallet top-up requests">
          <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
            {pendingTopupRequestCount} request{pendingTopupRequestCount === 1 ? "" : "s"} waiting for review —{" "}
            <Link href="/admin/wallet-topups" style={{ color: C.primary, fontWeight: 600 }}>review them here</Link>.
          </p>
        </Section>
      )}

      <Section title={`Clients who owe (${owedList.length})`}>
        {owedList.length === 0 ? (
          <p style={{ fontSize: 13, color: C.light, margin: 0 }}>Nobody owes anything right now.</p>
        ) : (
          <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <th style={th}>Client</th>
                <th style={th}>Phone</th>
                <th style={th}>Unpaid days</th>
                <th style={th}>Amount owed</th>
              </tr>
            </thead>
            <tbody>
              {owedList.map(([userId, info]) => (
                <tr key={userId}>
                  <td style={td}>
                    {userId !== "unknown" ? (
                      <Link href={`/admin/users/${userId}`} style={{ color: C.primary, fontWeight: 600, textDecoration: "none" }}>
                        {info.name}
                      </Link>
                    ) : info.name}
                  </td>
                  <td style={{ ...td, color: C.muted }}>{info.phone ?? "—"}</td>
                  <td style={td}>{info.count}</td>
                  <td style={{ ...td, fontWeight: 700, color: C.error }}>{fmtMoney(info.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title={`Orders ${rangeLabel} (${orders.length})`}>
        <OrdersAccordion orders={orders} />
      </Section>
    </>
  );
}

function FinancialFallback() {
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", flex: "1 1 180px", height: 64 }} />
      ))}
    </div>
  );
}

export default async function FinancialPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; end?: string; user?: string; status?: string }>;
}) {
  const params = await searchParams;
  const fallback = presetRange("last30");
  const rangeStart = params.start ?? fallback.start;
  const rangeEnd = params.end ?? fallback.end;
  const userId = params.user ?? "all";
  const statusFilter = params.status ?? "all";

  const supabase = await createClient();
  const clientsRes = await supabase.from("user").select("id,name,last_name").order("name");
  const clients = (clientsRes.data ?? []) as { id: string; name: string | null; last_name: string | null }[];

  const extraParams = `&user=${userId}&status=${statusFilter}`;

  return (
    <div style={{ padding: "24px 20px 60px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <PageHeader title="Financial" />

        <Section>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {PRESETS.map(p => {
              const r = presetRange(p.key);
              const active = r.start === rangeStart && r.end === rangeEnd;
              return (
                <Link
                  key={p.key}
                  href={`/admin/financial?start=${r.start}&end=${r.end}${extraParams}`}
                  style={{
                    fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 8, textDecoration: "none",
                    color: active ? C.white : C.primary,
                    background: active ? C.primary : C.offWhite,
                  }}
                >
                  {p.label}
                </Link>
              );
            })}
          </div>
          <form style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ ...labelStyle, flex: "0 1 160px" }}>Start date
              <input type="date" name="start" defaultValue={rangeStart} style={inputStyle} />
            </label>
            <label style={{ ...labelStyle, flex: "0 1 160px" }}>End date
              <input type="date" name="end" defaultValue={rangeEnd} style={inputStyle} />
            </label>
            <label style={{ ...labelStyle, flex: "1 1 200px" }}>Client
              <select name="user" defaultValue={userId} style={inputStyle}>
                <option value="all">All clients</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{`${c.name ?? ""} ${c.last_name ?? ""}`.trim() || c.id}</option>
                ))}
              </select>
            </label>
            <label style={{ ...labelStyle, flex: "0 1 170px" }}>Status
              <select name="status" defaultValue={statusFilter} style={inputStyle}>
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <button type="submit" style={{ background: C.primary, color: C.white, border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              Apply
            </button>
          </form>
        </Section>

        <Suspense fallback={<FinancialFallback />} key={`${rangeStart}-${rangeEnd}-${userId}-${statusFilter}`}>
          <FinancialData start={rangeStart} end={rangeEnd} userId={userId} statusFilter={statusFilter} />
        </Suspense>
      </div>
    </div>
  );
}
