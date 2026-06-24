import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import CommerceClient, { type AffiliateRow, type PromoCodeRow, type VolumeRuleRow } from "./CommerceClient";

const C = { primary: "#063330" };

type AffiliateDbRow = Database["public"]["Tables"]["affiliates"]["Row"];
type PromoCodeDbRow = Database["public"]["Tables"]["promo_codes"]["Row"];
type VolumeRuleDbRow = Database["public"]["Tables"]["automatic_discount_rules"]["Row"];
type SimpleUserRow = { id: string; name: string | null; last_name: string | null; email: string | null };
type PaymentCommissionRow = { commission_amount: number | null; status: string | null };
type PayoutAmountRow = { amount: number };

export default async function AdminCommercePage() {
  const supabase = await createClient();

  async function getCommissionSummary(affiliateId: number) {
    const paymentsRes = await supabase
      .from("payment")
      .select("commission_amount,status")
      .eq("affiliate_id", affiliateId);
    const rows = (paymentsRes.data ?? []) as PaymentCommissionRow[];

    const paidOrders = rows.filter(p => p.status === "paid");
    const pendingOrders = rows.filter(p => p.status === "pending");
    const earnedPaid = paidOrders.reduce((s, p) => s + (p.commission_amount ?? 0), 0);
    const earnedPending = pendingOrders.reduce((s, p) => s + (p.commission_amount ?? 0), 0);

    const payoutsRes = await supabase
      .from("affiliate_payouts")
      .select("amount")
      .eq("affiliate_id", affiliateId);
    const payoutRows = (payoutsRes.data ?? []) as PayoutAmountRow[];
    const paidOut = payoutRows.reduce((s, p) => s + (p.amount ?? 0), 0);

    return {
      commission_earned_paid_orders: Math.round(earnedPaid * 100) / 100,
      commission_earned_pending_orders: Math.round(earnedPending * 100) / 100,
      already_paid_out: Math.round(paidOut * 100) / 100,
      balance_owed: Math.round((earnedPaid - paidOut) * 100) / 100,
    };
  }

  const affiliatesRes = await supabase.from("affiliates").select("*").order("created_at", { ascending: false });
  const promoCodesRes = await supabase.from("promo_codes").select("*").order("created_at", { ascending: false });
  const usersRes = await supabase.from("user").select("id,name,last_name,email").order("name");
  const volumeRulesRes = await supabase.from("automatic_discount_rules").select("*").order("min_order_days");

  const affiliatesRaw = (affiliatesRes.data ?? []) as AffiliateDbRow[];
  const promoCodesRaw = (promoCodesRes.data ?? []) as PromoCodeDbRow[];
  const usersRaw = (usersRes.data ?? []) as SimpleUserRow[];
  const volumeRules = (volumeRulesRes.data ?? []) as VolumeRuleDbRow[] as VolumeRuleRow[];

  const userMap = new Map(usersRaw.map(u => [u.id, u]));

  const affiliates: AffiliateRow[] = await Promise.all(
    affiliatesRaw.map(async a => ({
      ...a,
      user: userMap.get(a.user_id) ?? null,
      commission: await getCommissionSummary(a.id),
    }))
  );
  const affiliateNameMap = new Map(
    affiliates.map(a => [a.id, `${a.user?.name ?? ""} ${a.user?.last_name ?? ""}`.trim() || a.user_id])
  );

  const promoCodes: PromoCodeRow[] = promoCodesRaw.map(c => ({
    ...c,
    affiliate_name: c.affiliate_id ? affiliateNameMap.get(c.affiliate_id) ?? null : null,
    used_by_name: c.user_id
      ? (() => {
          const u = userMap.get(c.user_id as string);
          return u ? `${u.name ?? ""} ${u.last_name ?? ""}`.trim() || u.email : null;
        })()
      : null,
  }));

  return (
    <div style={{ padding: "24px 20px 60px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 500, color: C.primary, margin: "0 0 18px" }}>
          Commerce — Affiliates &amp; Promo Codes
        </h1>
        <CommerceClient affiliates={affiliates} promoCodes={promoCodes} users={usersRaw} volumeRules={volumeRules} />
      </div>
    </div>
  );
}
