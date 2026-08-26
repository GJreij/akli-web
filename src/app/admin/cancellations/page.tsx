import { createClient } from "@/lib/supabase/server";
import { PageHeader, Section, C } from "@/components/admin/ui";
import CancellationRow, { type PendingCancellation } from "./CancellationRow";

type RawRequest = {
  id: number;
  meal_plan_id: number;
  user_id: string;
  requested_at: string;
  meal_plan_day_ids: number[] | null;
};

export default async function CancellationsPage() {
  const supabase = await createClient();

  const requestsRes = await supabase
    .from("cancellation_request")
    .select("id, meal_plan_id, user_id, requested_at, meal_plan_day_ids")
    .eq("status", "pending")
    .order("requested_at", { ascending: true });

  const requests = (requestsRes.data ?? []) as RawRequest[];

  if (requests.length === 0) {
    return (
      <div style={{ padding: "24px 20px 60px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <PageHeader title="Cancellations" />
          <Section>
            <p style={{ margin: 0, fontSize: 13, color: C.light }}>No pending cancellation requests.</p>
          </Section>
        </div>
      </div>
    );
  }

  const planIds = [...new Set(requests.map(r => r.meal_plan_id))];
  const userIds = [...new Set(requests.map(r => r.user_id))];

  const [plansRes, usersRes, daysRes] = await Promise.all([
    supabase.from("meal_plan").select("id, start_date, end_date").in("id", planIds),
    supabase.from("user").select("id, name, last_name, phone_number").in("id", userIds),
    supabase.from("meal_plan_day").select("id, meal_plan_id, date, status").in("meal_plan_id", planIds),
  ]);

  const plans = (plansRes.data ?? []) as { id: number; start_date: string | null; end_date: string | null }[];
  const users = (usersRes.data ?? []) as { id: string; name: string | null; last_name: string | null; phone_number: string | null }[];
  const days  = (daysRes.data ?? []) as { id: number; meal_plan_id: number | null; date: string | null; status: string | null }[];

  const planMap = new Map(plans.map(p => [p.id, p]));
  const userMap = new Map(users.map(u => [u.id, u]));
  const dayMap  = new Map(days.map(d => [d.id, d]));

  // "Whole order" for a plan = every day on the plan that isn't already
  // terminal (cancelled from some earlier, separate action) — matches how
  // the client's cancel sheet defaults to selecting all eligible days.
  const nonTerminalDaysByPlan = new Map<number, number>();
  for (const d of days) {
    if (d.meal_plan_id == null) continue;
    if (d.status === "cancelled") continue;
    nonTerminalDaysByPlan.set(d.meal_plan_id, (nonTerminalDaysByPlan.get(d.meal_plan_id) ?? 0) + 1);
  }

  const allDayIds = [...new Set(requests.flatMap(r => r.meal_plan_day_ids ?? []))];
  const paymentsRes = allDayIds.length
    ? await supabase.from("payment").select("meal_plan_day_id, amount, wallet_amount_applied, status").in("meal_plan_day_id", allDayIds)
    : { data: [] as { meal_plan_day_id: number | null; amount: number | null; wallet_amount_applied: number | null; status: string | null }[] };
  const payments = paymentsRes.data ?? [];
  const paymentByDay = new Map(payments.map(p => [p.meal_plan_day_id, p]));

  const pending: PendingCancellation[] = requests.map(r => {
    const plan = planMap.get(r.meal_plan_id);
    const user = userMap.get(r.user_id);
    const requestedDayIds = r.meal_plan_day_ids ?? [];
    const requestedDates = requestedDayIds
      .map(id => dayMap.get(id)?.date)
      .filter((d): d is string => !!d)
      .sort();

    // The value "at risk" for a cancelled day is the FULL price of that day,
    // regardless of how it was paid — cash/whish/neo (payment.amount) AND
    // any wallet credit already spent on it (wallet_amount_applied). Summing
    // only payment.amount silently drops the wallet portion, which is the
    // exact bug that made a client's wallet balance look like it "lost"
    // money on a cancellation that reused earlier wallet credit.
    let cashAmount = 0;
    let walletAlreadyApplied = 0;
    let unpaidCashAmount = 0;
    for (const id of requestedDayIds) {
      const p = paymentByDay.get(id);
      if (!p) continue;
      cashAmount += p.amount ?? 0;
      walletAlreadyApplied += p.wallet_amount_applied ?? 0;
      if (p.status !== "paid") unpaidCashAmount += p.amount ?? 0;
    }
    const totalValue = cashAmount + walletAlreadyApplied;
    const isWholeOrder = requestedDayIds.length > 0 && requestedDayIds.length >= (nonTerminalDaysByPlan.get(r.meal_plan_id) ?? 0);

    return {
      id: r.id,
      meal_plan_id: r.meal_plan_id,
      user_id: r.user_id,
      requested_at: r.requested_at,
      clientName: user ? `${user.name ?? ""} ${user.last_name ?? ""}`.trim() || "Unknown client" : "Unknown client",
      clientPhone: user?.phone_number ?? null,
      planStart: plan?.start_date ?? null,
      planEnd: plan?.end_date ?? null,
      cashAmount,
      walletAlreadyApplied,
      totalValue,
      unpaidCashAmount,
      isWholeOrder,
      requestedDates,
    };
  });

  return (
    <div style={{ padding: "24px 20px 60px" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <PageHeader title="Cancellations" />
        <Section title={`Pending review (${pending.length})`}>
          {pending.map(req => <CancellationRow key={req.id} req={req} />)}
        </Section>
      </div>
    </div>
  );
}
