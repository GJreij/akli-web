"use client";

import { Fragment, useState, useTransition } from "react";
import {
  createAffiliate, updateAffiliate, endAffiliateProgram, deleteAffiliate, recordPayout,
  createPromoCode, updatePromoCode, deletePromoCode,
  createVolumeRule, updateVolumeRule, deleteVolumeRule,
} from "./actions";

const C = {
  primary: "#063330", teal: "#67b1b0", tealDark: "#437b7b",
  offWhite: "#eee9e6", muted: "#5c5c5c", light: "#9a9a9a",
  border: "#e0dbd5", white: "#ffffff", warn: "#b8860b", error: "#c0392b",
};

export type AffiliateRow = {
  id: number;
  user_id: string;
  tier: string;
  status: string;
  commission_rate: number;
  personal_discount_rate: number | null;
  content_compliant: boolean;
  joined_date: string;
  notes: string | null;
  user: { name: string | null; last_name: string | null; email: string | null } | null;
  commission: {
    commission_earned_paid_orders: number;
    commission_earned_pending_orders: number;
    already_paid_out: number;
    balance_owed: number;
  };
};

export type PromoCodeRow = {
  id: number;
  code: string | null;
  discount_type: string | null;
  discount_value: number | null;
  is_active: boolean | null;
  start_date: string | null;
  end_date: string | null;
  max_global_uses: number | null;
  max_uses_per_user: number | null;
  min_order_value: number | null;
  min_order_days: number | null;
  max_discount_amount: number | null;
  commission_rate_override: number | null;
  waives_delivery: boolean | null;
  affiliate_id: number | null;
  user_id: string | null;
  affiliate_name: string | null;
  used_by_name: string | null;
};

export type VolumeRuleRow = {
  id: number;
  name: string;
  description: string | null;
  min_order_days: number;
  discount_type: string;
  discount_value: number;
  max_discount_amount: number | null;
  stackable_with_promo: boolean;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
};

type SimpleUser = { id: string; name: string | null; last_name: string | null; email: string | null };

function userLabel(u: SimpleUser) {
  return `${u.name ?? ""} ${u.last_name ?? ""}`.trim() || u.email || u.id;
}

function fmtDate(d: string | null) {
  if (!d) return null;
  return new Date(d + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Effective status combines the is_active flag with the start/end date window. */
function effectiveStatus(c: PromoCodeRow): { label: string; color: string; bg: string } {
  if (!c.is_active) return { label: "inactive", color: C.light, bg: C.offWhite };
  const today = new Date().toISOString().slice(0, 10);
  if (c.start_date && today < c.start_date) return { label: "scheduled", color: C.warn, bg: "#fdf0d5" };
  if (c.end_date && today > c.end_date) return { label: "expired", color: C.error, bg: "#fbe4e1" };
  return { label: "active", color: C.tealDark, bg: `${C.teal}30` };
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: C.muted, flex: 1, minWidth: 120 }}>
      {label}
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "7px 9px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, background: C.white,
};

function Btn({ children, onClick, disabled, variant = "primary" }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean; variant?: "primary" | "ghost";
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "7px 14px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: disabled ? "default" : "pointer",
        border: variant === "primary" ? "none" : `1px solid ${C.border}`,
        background: variant === "primary" ? C.primary : C.white,
        color: variant === "primary" ? C.white : C.muted,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

// Defaults per the business model: Affiliate 10% audience / 10% commission, no
// personal discount. Ambassador adds a 40% personal discount. Athlete's personal
// discount is 100% and also waives delivery (full free service).
const TIER_DEFAULTS = {
  affiliate: { commission: "10", audience: "10", personal: "", waivesDelivery: false },
  ambassador: { commission: "10", audience: "10", personal: "40", waivesDelivery: false },
  athlete: { commission: "10", audience: "10", personal: "100", waivesDelivery: true },
} as const;

function NewAffiliateForm({ users, eligibleUserIds, onDone }: {
  users: SimpleUser[]; eligibleUserIds: Set<string>; onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState("");
  const [tier, setTier] = useState<"affiliate" | "ambassador" | "athlete">("affiliate");
  const [commissionRate, setCommissionRate] = useState<string>(TIER_DEFAULTS.affiliate.commission);
  const [personalDiscount, setPersonalDiscount] = useState<string>(TIER_DEFAULTS.affiliate.personal);
  const [audienceDiscount, setAudienceDiscount] = useState<string>(TIER_DEFAULTS.affiliate.audience);
  const [waivesDelivery, setWaivesDelivery] = useState<boolean>(TIER_DEFAULTS.affiliate.waivesDelivery);
  const [audienceCode, setAudienceCode] = useState("");
  const [personalCode, setPersonalCode] = useState("");

  function pickTier(next: typeof tier) {
    setTier(next);
    const d = TIER_DEFAULTS[next];
    setCommissionRate(d.commission);
    setAudienceDiscount(d.audience);
    setPersonalDiscount(d.personal);
    setWaivesDelivery(d.waivesDelivery);
  }

  const eligibleUsers = users.filter(u => eligibleUserIds.has(u.id));

  function submit() {
    if (!userId) { setError("Pick a user."); return; }
    setError(null);
    startTransition(async () => {
      try {
        await createAffiliate({
          user_id: userId,
          tier,
          commission_rate: parseFloat(commissionRate) / 100,
          personal_discount_rate: personalDiscount ? parseFloat(personalDiscount) / 100 : null,
          audience_discount_rate: parseFloat(audienceDiscount),
          audience_code: audienceCode || null,
          personal_code: personalCode || null,
          waives_delivery: waivesDelivery,
        });
        onDone();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create affiliate.");
      }
    });
  }

  return (
    <Card>
      <p style={{ margin: "0 0 10px", fontSize: 13.5, fontWeight: 700, color: C.primary }}>New affiliate / ambassador / athlete</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <Field label="User">
          <select value={userId} onChange={e => setUserId(e.target.value)} style={inputStyle}>
            <option value="">Select a user…</option>
            {eligibleUsers.map(u => (
              <option key={u.id} value={u.id}>{userLabel(u)}</option>
            ))}
          </select>
        </Field>
        <Field label="Tier">
          <select value={tier} onChange={e => pickTier(e.target.value as typeof tier)} style={inputStyle}>
            <option value="affiliate">Affiliate</option>
            <option value="ambassador">Ambassador</option>
            <option value="athlete">Athlete</option>
          </select>
        </Field>
        <Field label="Commission %">
          <input type="number" step="0.1" value={commissionRate} onChange={e => setCommissionRate(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Audience discount % (their public code)">
          <input type="number" step="0.1" value={audienceDiscount} onChange={e => setAudienceDiscount(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Personal discount % (own orders, optional)">
          <input type="number" step="0.1" value={personalDiscount} onChange={e => setPersonalDiscount(e.target.value)} style={inputStyle} placeholder="leave blank if none" />
        </Field>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <Field label="Audience code text (optional)">
          <input value={audienceCode} onChange={e => setAudienceCode(e.target.value.toUpperCase())} style={inputStyle} placeholder="auto-generated if blank" />
        </Field>
        {personalDiscount && (
          <>
            <Field label="Personal code text (optional)">
              <input value={personalCode} onChange={e => setPersonalCode(e.target.value.toUpperCase())} style={inputStyle} placeholder="auto-generated if blank" />
            </Field>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.muted, marginTop: 18 }}>
              <input type="checkbox" checked={waivesDelivery} onChange={e => setWaivesDelivery(e.target.checked)} />
              Personal code also waives delivery fee
            </label>
          </>
        )}
      </div>
      {error && <p style={{ color: C.error, fontSize: 12, margin: "0 0 8px" }}>{error}</p>}
      <Btn onClick={submit} disabled={pending}>{pending ? "Creating…" : "Create affiliate"}</Btn>
    </Card>
  );
}

function PayoutForm({ affiliateId, onDone }: { affiliateId: number; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  function submit() {
    const amt = parseFloat(amount);
    if (!amt) return;
    startTransition(async () => {
      await recordPayout({ affiliate_id: affiliateId, amount: amt, note: note || null });
      setAmount(""); setNote(""); onDone();
    });
  }

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8 }}>
      <input placeholder="Amount paid" type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} style={{ ...inputStyle, width: 100 }} />
      <input placeholder="Note (optional)" value={note} onChange={e => setNote(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
      <Btn onClick={submit} disabled={pending || !amount} variant="ghost">{pending ? "…" : "Log payout"}</Btn>
    </div>
  );
}

function EditAffiliateForm({ affiliate, onDone, onCancel }: {
  affiliate: AffiliateRow; onDone: () => void; onCancel: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [tier, setTier] = useState(affiliate.tier);
  const [commissionRate, setCommissionRate] = useState(String(affiliate.commission_rate * 100));
  const [personalDiscount, setPersonalDiscount] = useState(
    affiliate.personal_discount_rate ? String(affiliate.personal_discount_rate * 100) : ""
  );

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        await updateAffiliate(affiliate.id, {
          tier,
          commission_rate: parseFloat(commissionRate) / 100,
          personal_discount_rate: personalDiscount ? parseFloat(personalDiscount) / 100 : null,
        });
        onDone();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to update affiliate.");
      }
    });
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginTop: 8, flexWrap: "wrap" }}>
      <Field label="Tier">
        <select value={tier} onChange={e => setTier(e.target.value as typeof tier)} style={inputStyle}>
          <option value="affiliate">Affiliate</option>
          <option value="ambassador">Ambassador</option>
          <option value="athlete">Athlete</option>
        </select>
      </Field>
      <Field label="Commission %">
        <input type="number" step="0.1" value={commissionRate} onChange={e => setCommissionRate(e.target.value)} style={inputStyle} />
      </Field>
      <Field label="Personal discount % (optional)">
        <input type="number" step="0.1" value={personalDiscount} onChange={e => setPersonalDiscount(e.target.value)} style={inputStyle} placeholder="none" />
      </Field>
      <Btn onClick={submit} disabled={pending}>{pending ? "Saving…" : "Save"}</Btn>
      <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
      {error && <p style={{ color: C.error, fontSize: 12, margin: 0, width: "100%" }}>{error}</p>}
    </div>
  );
}

function AffiliateRowCard({ affiliate, onChanged }: { affiliate: AffiliateRow; onChanged: () => void }) {
  const [pending, startTransition] = useTransition();
  const [showPayout, setShowPayout] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function toggleCompliant() {
    startTransition(async () => {
      await updateAffiliate(affiliate.id, { content_compliant: !affiliate.content_compliant });
      onChanged();
    });
  }
  function toggleStatus() {
    const next = affiliate.status === "active" ? "paused" : "active";
    startTransition(async () => {
      await updateAffiliate(affiliate.id, { status: next });
      onChanged();
    });
  }
  function endProgram() {
    if (!window.confirm("End this affiliate's program? Their codes are deactivated so they stop working on new orders, but commission history stays intact.")) return;
    startTransition(async () => {
      await endAffiliateProgram(affiliate.id);
      onChanged();
    });
  }
  function remove() {
    if (!window.confirm("Delete this affiliate? Their codes will be detached, not deleted.")) return;
    setDeleteError(null);
    startTransition(async () => {
      try {
        await deleteAffiliate(affiliate.id);
        onChanged();
      } catch (e) {
        setDeleteError(e instanceof Error ? e.message : "Failed to delete affiliate.");
      }
    });
  }

  const name = `${affiliate.user?.name ?? ""} ${affiliate.user?.last_name ?? ""}`.trim() || affiliate.user?.email || affiliate.user_id;

  return (
    <div style={{ padding: "12px 0", borderBottom: `1px solid ${C.offWhite}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <div>
          <p style={{ margin: "0 0 2px", fontSize: 13.5, fontWeight: 700, color: C.primary }}>{name}</p>
          <p style={{ margin: 0, fontSize: 11.5, color: C.light }}>
            {affiliate.tier} · {(affiliate.commission_rate * 100).toFixed(1)}% commission
            {affiliate.personal_discount_rate ? ` · ${(affiliate.personal_discount_rate * 100).toFixed(0)}% personal discount` : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{
            fontSize: 10.5, fontWeight: 600, padding: "2px 8px", borderRadius: 6,
            color: affiliate.status === "active" ? C.tealDark : affiliate.status === "ended" ? C.error : C.warn,
            background: affiliate.status === "active" ? `${C.teal}30` : affiliate.status === "ended" ? "#fbe4e1" : "#fdf0d5",
          }}>
            {affiliate.status}
          </span>
          <span style={{
            fontSize: 10.5, fontWeight: 600, padding: "2px 8px", borderRadius: 6,
            color: affiliate.content_compliant ? C.tealDark : C.error,
            background: affiliate.content_compliant ? `${C.teal}30` : "#fbe4e1",
          }}>
            {affiliate.content_compliant ? "content ok" : "content lapsed"}
          </span>
          <Btn variant="ghost" onClick={toggleCompliant} disabled={pending || affiliate.status === "ended"}>Toggle content</Btn>
          {affiliate.status !== "ended" && (
            <Btn variant="ghost" onClick={toggleStatus} disabled={pending}>
              {affiliate.status === "active" ? "Pause" : "Reactivate"}
            </Btn>
          )}
          <Btn variant="ghost" onClick={() => setEditing(e => !e)} disabled={pending}>
            {editing ? "Cancel edit" : "Edit"}
          </Btn>
          {affiliate.status !== "ended" && (
            <Btn variant="ghost" onClick={endProgram} disabled={pending}>End program</Btn>
          )}
          <Btn variant="ghost" onClick={remove} disabled={pending}>Delete</Btn>
        </div>
      </div>
      {editing && (
        <EditAffiliateForm
          affiliate={affiliate}
          onCancel={() => setEditing(false)}
          onDone={() => { setEditing(false); onChanged(); }}
        />
      )}
      {deleteError && <p style={{ color: C.error, fontSize: 12, margin: "8px 0 0" }}>{deleteError}</p>}
      <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 12, color: C.muted, flexWrap: "wrap" }}>
        <span>Earned (paid orders): <b style={{ color: C.primary }}>${affiliate.commission.commission_earned_paid_orders.toFixed(2)}</b></span>
        <span>Pending orders: ${affiliate.commission.commission_earned_pending_orders.toFixed(2)}</span>
        <span>Already paid out: ${affiliate.commission.already_paid_out.toFixed(2)}</span>
        <span style={{ fontWeight: 700, color: affiliate.commission.balance_owed > 0 ? C.warn : C.muted }}>
          Owed now: ${affiliate.commission.balance_owed.toFixed(2)}
        </span>
        <button onClick={() => setShowPayout(s => !s)} style={{ background: "none", border: "none", color: C.tealDark, fontSize: 12, cursor: "pointer", padding: 0 }}>
          {showPayout ? "cancel" : "log payout"}
        </button>
      </div>
      {showPayout && <PayoutForm affiliateId={affiliate.id} onDone={() => { setShowPayout(false); onChanged(); }} />}
    </div>
  );
}

function NewPromoCodeForm({ affiliates, users, onDone }: {
  affiliates: AffiliateRow[]; users: SimpleUser[]; onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">("percentage");
  const [discountValue, setDiscountValue] = useState("10");
  const [maxDiscountAmount, setMaxDiscountAmount] = useState("");
  const [minOrderValue, setMinOrderValue] = useState("");
  const [minOrderDays, setMinOrderDays] = useState("");
  const [maxGlobalUses, setMaxGlobalUses] = useState("");
  const [maxUsesPerUser, setMaxUsesPerUser] = useState("");
  const [affiliateId, setAffiliateId] = useState("");
  const [commissionOverride, setCommissionOverride] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [targetUserId, setTargetUserId] = useState("");
  const [waivesDelivery, setWaivesDelivery] = useState(false);

  function submit() {
    if (!code.trim()) { setError("Code is required."); return; }
    setError(null);
    startTransition(async () => {
      try {
        await createPromoCode({
          code: code.trim().toUpperCase(),
          discount_type: discountType,
          discount_value: parseFloat(discountValue) || 0,
          max_discount_amount: maxDiscountAmount ? parseFloat(maxDiscountAmount) : null,
          min_order_value: minOrderValue ? parseFloat(minOrderValue) : null,
          min_order_days: minOrderDays ? parseInt(minOrderDays, 10) : null,
          max_global_uses: maxGlobalUses ? parseInt(maxGlobalUses, 10) : null,
          max_uses_per_user: maxUsesPerUser ? parseInt(maxUsesPerUser, 10) : null,
          affiliate_id: affiliateId ? parseInt(affiliateId, 10) : null,
          commission_rate_override: commissionOverride ? parseFloat(commissionOverride) / 100 : null,
          start_date: startDate || null,
          end_date: endDate || null,
          user_id: targetUserId || null,
          waives_delivery: waivesDelivery,
          is_active: true,
        });
        onDone();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create code.");
      }
    });
  }

  return (
    <Card>
      <p style={{ margin: "0 0 10px", fontSize: 13.5, fontWeight: 700, color: C.primary }}>New promo code</p>
      <p style={{ margin: "0 0 10px", fontSize: 11.5, color: C.light }}>
        Leave &quot;applies to one person&quot; blank for a code anyone can use. Set it to restrict the code to a single
        person&apos;s account — for a one-off personal offer, separate from the affiliate program.
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <Field label="Code"><input value={code} onChange={e => setCode(e.target.value)} style={inputStyle} placeholder="e.g. SUMMER20" /></Field>
        <Field label="Type">
          <select value={discountType} onChange={e => setDiscountType(e.target.value as typeof discountType)} style={inputStyle}>
            <option value="percentage">Percentage</option>
            <option value="fixed">Fixed $</option>
          </select>
        </Field>
        <Field label="Value"><input type="number" step="0.1" value={discountValue} onChange={e => setDiscountValue(e.target.value)} style={inputStyle} /></Field>
        <Field label="Max discount $ (cap)"><input type="number" step="0.01" value={maxDiscountAmount} onChange={e => setMaxDiscountAmount(e.target.value)} style={inputStyle} placeholder="optional" /></Field>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <Field label="Min order value $"><input type="number" step="0.01" value={minOrderValue} onChange={e => setMinOrderValue(e.target.value)} style={inputStyle} placeholder="optional" /></Field>
        <Field label="Min order days"><input type="number" value={minOrderDays} onChange={e => setMinOrderDays(e.target.value)} style={inputStyle} placeholder="e.g. 10" /></Field>
        <Field label="Max global uses"><input type="number" value={maxGlobalUses} onChange={e => setMaxGlobalUses(e.target.value)} style={inputStyle} placeholder="optional" /></Field>
        <Field label="Max uses per user"><input type="number" value={maxUsesPerUser} onChange={e => setMaxUsesPerUser(e.target.value)} style={inputStyle} placeholder="optional" /></Field>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <Field label="Start date"><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} /></Field>
        <Field label="End date"><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inputStyle} /></Field>
        <Field label="Applies to one person (optional)">
          <select value={targetUserId} onChange={e => setTargetUserId(e.target.value)} style={inputStyle}>
            <option value="">Anyone (public code)</option>
            {users.map(u => <option key={u.id} value={u.id}>{userLabel(u)}</option>)}
          </select>
        </Field>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <Field label="Linked affiliate (commission attribution)">
          <select value={affiliateId} onChange={e => setAffiliateId(e.target.value)} style={inputStyle}>
            <option value="">None (plain marketing code)</option>
            {affiliates.map(a => (
              <option key={a.id} value={a.id}>
                {`${a.user?.name ?? ""} ${a.user?.last_name ?? ""}`.trim() || a.user_id} ({a.tier})
              </option>
            ))}
          </select>
        </Field>
        {affiliateId && (
          <Field label="Commission % override">
            <input type="number" step="0.1" value={commissionOverride} onChange={e => setCommissionOverride(e.target.value)} style={inputStyle} placeholder="defaults to affiliate rate" />
          </Field>
        )}
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.muted, marginTop: 18 }}>
          <input type="checkbox" checked={waivesDelivery} onChange={e => setWaivesDelivery(e.target.checked)} />
          Also waives delivery fee
        </label>
      </div>
      {error && <p style={{ color: C.error, fontSize: 12, margin: "0 0 8px" }}>{error}</p>}
      <Btn onClick={submit} disabled={pending}>{pending ? "Creating…" : "Create code"}</Btn>
    </Card>
  );
}

function EditPromoCodeForm({ code, onDone, onCancel }: {
  code: PromoCodeRow; onDone: () => void; onCancel: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [discountValue, setDiscountValue] = useState(String(code.discount_value ?? 0));
  const [maxDiscountAmount, setMaxDiscountAmount] = useState(code.max_discount_amount != null ? String(code.max_discount_amount) : "");
  const [minOrderValue, setMinOrderValue] = useState(code.min_order_value != null ? String(code.min_order_value) : "");
  const [minOrderDays, setMinOrderDays] = useState(code.min_order_days != null ? String(code.min_order_days) : "");
  const [startDate, setStartDate] = useState(code.start_date ?? "");
  const [endDate, setEndDate] = useState(code.end_date ?? "");
  const [waivesDelivery, setWaivesDelivery] = useState(!!code.waives_delivery);

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        await updatePromoCode(code.id, {
          discount_value: parseFloat(discountValue) || 0,
          max_discount_amount: maxDiscountAmount ? parseFloat(maxDiscountAmount) : null,
          min_order_value: minOrderValue ? parseFloat(minOrderValue) : null,
          min_order_days: minOrderDays ? parseInt(minOrderDays, 10) : null,
          start_date: startDate || null,
          end_date: endDate || null,
          waives_delivery: waivesDelivery,
        });
        onDone();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to update code.");
      }
    });
  }

  return (
    <tr style={{ borderBottom: `1px solid ${C.offWhite}`, background: C.offWhite }}>
      <td colSpan={7} style={{ padding: "10px 14px" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <Field label="Discount value"><input type="number" step="0.1" value={discountValue} onChange={e => setDiscountValue(e.target.value)} style={inputStyle} /></Field>
          <Field label="Max discount $ (cap)"><input type="number" step="0.01" value={maxDiscountAmount} onChange={e => setMaxDiscountAmount(e.target.value)} style={inputStyle} placeholder="none" /></Field>
          <Field label="Min order value $"><input type="number" step="0.01" value={minOrderValue} onChange={e => setMinOrderValue(e.target.value)} style={inputStyle} placeholder="none" /></Field>
          <Field label="Min order days"><input type="number" value={minOrderDays} onChange={e => setMinOrderDays(e.target.value)} style={inputStyle} placeholder="none" /></Field>
          <Field label="Start date (activation)"><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} /></Field>
          <Field label="End date"><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inputStyle} /></Field>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.muted, marginBottom: 7 }}>
            <input type="checkbox" checked={waivesDelivery} onChange={e => setWaivesDelivery(e.target.checked)} />
            Waives delivery
          </label>
          <Btn onClick={submit} disabled={pending}>{pending ? "Saving…" : "Save"}</Btn>
          <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
        </div>
        {error && <p style={{ color: C.error, fontSize: 12, margin: "6px 0 0" }}>{error}</p>}
      </td>
    </tr>
  );
}

function PromoCodeTable({ codes, onChanged }: { codes: PromoCodeRow[]; onChanged: () => void }) {
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteErrorId, setDeleteErrorId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function toggleActive(c: PromoCodeRow) {
    setPendingId(c.id);
    // Manually toggling a code is a deliberate admin action — clear
    // auto_paused so a later affiliate pause/reactivate cycle doesn't
    // second-guess it.
    updatePromoCode(c.id, { is_active: !c.is_active, auto_paused: false }).finally(() => { setPendingId(null); onChanged(); });
  }
  function remove(c: PromoCodeRow) {
    if (!window.confirm(`Delete code "${c.code}"? This can't be undone.`)) return;
    setPendingId(c.id);
    setDeleteErrorId(null);
    deletePromoCode(c.id)
      .then(onChanged)
      .catch(e => { setDeleteErrorId(c.id); setDeleteError(e instanceof Error ? e.message : "Failed to delete code."); })
      .finally(() => setPendingId(null));
  }

  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
      <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", color: C.light, borderBottom: `1px solid ${C.border}` }}>
            <th style={{ padding: "10px 14px" }}>Code</th>
            <th style={{ padding: "10px 14px" }}>Discount</th>
            <th style={{ padding: "10px 14px" }}>Conditions</th>
            <th style={{ padding: "10px 14px" }}>Affiliate</th>
            <th style={{ padding: "10px 14px" }}>Validity</th>
            <th style={{ padding: "10px 14px" }}>Status</th>
            <th style={{ padding: "10px 14px" }} />
          </tr>
        </thead>
        <tbody>
          {codes.length === 0 ? (
            <tr><td colSpan={7} style={{ padding: "24px 14px", textAlign: "center", color: C.light }}>No promo codes yet.</td></tr>
          ) : codes.map(c => {
            const status = effectiveStatus(c);
            return (
            <Fragment key={c.id}>
              <tr style={{ borderBottom: `1px solid ${C.offWhite}` }}>
                <td style={{ padding: "10px 14px", fontWeight: 700, color: C.primary }}>
                  {c.code}
                  {c.user_id ? <span style={{ color: C.light, fontWeight: 400 }}> (private{c.used_by_name ? ` · ${c.used_by_name}` : ""})</span> : ""}
                </td>
                <td style={{ padding: "10px 14px" }}>
                  {c.discount_type === "percentage" ? `${c.discount_value}%` : `$${c.discount_value}`}
                  {c.max_discount_amount ? ` (cap $${c.max_discount_amount})` : ""}
                  {c.waives_delivery ? <span style={{ display: "block", fontSize: 10.5, color: C.tealDark }}>+ free delivery</span> : null}
                </td>
                <td style={{ padding: "10px 14px", color: C.muted }}>
                  {[
                    c.min_order_value ? `min $${c.min_order_value}` : null,
                    c.min_order_days ? `min ${c.min_order_days}d` : null,
                    c.max_uses_per_user ? `≤${c.max_uses_per_user}/user` : null,
                    c.max_global_uses ? `≤${c.max_global_uses} total` : null,
                  ].filter(Boolean).join(" · ") || "—"}
                </td>
                <td style={{ padding: "10px 14px", color: C.muted }}>{c.affiliate_name ?? "—"}</td>
                <td style={{ padding: "10px 14px", color: C.muted, fontSize: 11.5 }}>
                  {c.start_date || c.end_date
                    ? `${fmtDate(c.start_date) ?? "always"} → ${fmtDate(c.end_date) ?? "no end"}`
                    : "no date limits"}
                </td>
                <td style={{ padding: "10px 14px" }}>
                  <span style={{
                    fontSize: 10.5, fontWeight: 600, padding: "2px 8px", borderRadius: 6,
                    color: status.color, background: status.bg,
                  }}>
                    {status.label}
                  </span>
                </td>
                <td style={{ padding: "10px 14px", display: "flex", gap: 6 }}>
                  <Btn variant="ghost" onClick={() => toggleActive(c)} disabled={pendingId === c.id}>
                    {c.is_active ? "Deactivate" : "Activate"}
                  </Btn>
                  <Btn variant="ghost" onClick={() => setEditingId(id => id === c.id ? null : c.id)} disabled={pendingId === c.id}>
                    {editingId === c.id ? "Cancel" : "Edit"}
                  </Btn>
                  <Btn variant="ghost" onClick={() => remove(c)} disabled={pendingId === c.id}>Delete</Btn>
                </td>
              </tr>
              {editingId === c.id && (
                <EditPromoCodeForm code={c} onCancel={() => setEditingId(null)} onDone={() => { setEditingId(null); onChanged(); }} />
              )}
              {deleteErrorId === c.id && deleteError && (
                <tr><td colSpan={7} style={{ padding: "0 14px 10px" }}><p style={{ color: C.error, fontSize: 12, margin: 0 }}>{deleteError}</p></td></tr>
              )}
            </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function NewVolumeRuleForm({ onDone }: { onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [minOrderDays, setMinOrderDays] = useState("3");
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">("percentage");
  const [discountValue, setDiscountValue] = useState("10");
  const [maxDiscountAmount, setMaxDiscountAmount] = useState("");
  const [stackableWithPromo, setStackableWithPromo] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  function submit() {
    if (!name.trim()) { setError("Name is required — it's shown to admins, not customers."); return; }
    setError(null);
    startTransition(async () => {
      try {
        await createVolumeRule({
          name: name.trim(),
          min_order_days: parseInt(minOrderDays, 10) || 0,
          discount_type: discountType,
          discount_value: parseFloat(discountValue) || 0,
          max_discount_amount: maxDiscountAmount ? parseFloat(maxDiscountAmount) : null,
          stackable_with_promo: stackableWithPromo,
          start_date: startDate || null,
          end_date: endDate || null,
          is_active: true,
        });
        onDone();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create rule.");
      }
    });
  }

  return (
    <Card>
      <p style={{ margin: "0 0 4px", fontSize: 13.5, fontWeight: 700, color: C.primary }}>New automatic discount tier</p>
      <p style={{ margin: "0 0 10px", fontSize: 11.5, color: C.light }}>
        Applies automatically at checkout once the order is long enough — no code needed. Customers see it live as
        they pick dates in the order flow.
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <Field label="Internal name"><input value={name} onChange={e => setName(e.target.value)} style={inputStyle} placeholder="e.g. Full month discount" /></Field>
        <Field label="Min order days"><input type="number" value={minOrderDays} onChange={e => setMinOrderDays(e.target.value)} style={inputStyle} /></Field>
        <Field label="Type">
          <select value={discountType} onChange={e => setDiscountType(e.target.value as typeof discountType)} style={inputStyle}>
            <option value="percentage">Percentage</option>
            <option value="fixed">Fixed $</option>
          </select>
        </Field>
        <Field label="Value"><input type="number" step="0.1" value={discountValue} onChange={e => setDiscountValue(e.target.value)} style={inputStyle} /></Field>
        <Field label="Max discount $ (cap)"><input type="number" step="0.01" value={maxDiscountAmount} onChange={e => setMaxDiscountAmount(e.target.value)} style={inputStyle} placeholder="optional" /></Field>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <Field label="Start date (optional)"><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} /></Field>
        <Field label="End date (optional)"><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inputStyle} /></Field>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.muted, marginTop: 18 }}>
          <input type="checkbox" checked={stackableWithPromo} onChange={e => setStackableWithPromo(e.target.checked)} />
          Stacks with a promo code (uncheck to make this exclusive)
        </label>
      </div>
      {error && <p style={{ color: C.error, fontSize: 12, margin: "0 0 8px" }}>{error}</p>}
      <Btn onClick={submit} disabled={pending}>{pending ? "Creating…" : "Create rule"}</Btn>
    </Card>
  );
}

function EditVolumeRuleForm({ rule, onDone, onCancel }: {
  rule: VolumeRuleRow; onDone: () => void; onCancel: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(rule.name);
  const [minOrderDays, setMinOrderDays] = useState(String(rule.min_order_days));
  const [discountValue, setDiscountValue] = useState(String(rule.discount_value));
  const [maxDiscountAmount, setMaxDiscountAmount] = useState(rule.max_discount_amount != null ? String(rule.max_discount_amount) : "");
  const [stackableWithPromo, setStackableWithPromo] = useState(rule.stackable_with_promo);
  const [startDate, setStartDate] = useState(rule.start_date ?? "");
  const [endDate, setEndDate] = useState(rule.end_date ?? "");

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        await updateVolumeRule(rule.id, {
          name: name.trim(),
          min_order_days: parseInt(minOrderDays, 10) || 0,
          discount_value: parseFloat(discountValue) || 0,
          max_discount_amount: maxDiscountAmount ? parseFloat(maxDiscountAmount) : null,
          stackable_with_promo: stackableWithPromo,
          start_date: startDate || null,
          end_date: endDate || null,
        });
        onDone();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to update rule.");
      }
    });
  }

  return (
    <tr style={{ borderBottom: `1px solid ${C.offWhite}`, background: C.offWhite }}>
      <td colSpan={7} style={{ padding: "10px 14px" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <Field label="Internal name"><input value={name} onChange={e => setName(e.target.value)} style={inputStyle} /></Field>
          <Field label="Min order days"><input type="number" value={minOrderDays} onChange={e => setMinOrderDays(e.target.value)} style={inputStyle} /></Field>
          <Field label="Value"><input type="number" step="0.1" value={discountValue} onChange={e => setDiscountValue(e.target.value)} style={inputStyle} /></Field>
          <Field label="Max discount $ (cap)"><input type="number" step="0.01" value={maxDiscountAmount} onChange={e => setMaxDiscountAmount(e.target.value)} style={inputStyle} placeholder="none" /></Field>
          <Field label="Start date"><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} /></Field>
          <Field label="End date"><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inputStyle} /></Field>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.muted, marginBottom: 7 }}>
            <input type="checkbox" checked={stackableWithPromo} onChange={e => setStackableWithPromo(e.target.checked)} />
            Stacks with promo
          </label>
          <Btn onClick={submit} disabled={pending}>{pending ? "Saving…" : "Save"}</Btn>
          <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
        </div>
        {error && <p style={{ color: C.error, fontSize: 12, margin: "6px 0 0" }}>{error}</p>}
      </td>
    </tr>
  );
}

function VolumeRuleTable({ rules, onChanged }: { rules: VolumeRuleRow[]; onChanged: () => void }) {
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  function toggleActive(r: VolumeRuleRow) {
    setPendingId(r.id);
    updateVolumeRule(r.id, { is_active: !r.is_active }).finally(() => { setPendingId(null); onChanged(); });
  }
  function remove(r: VolumeRuleRow) {
    if (!window.confirm(`Delete the rule "${r.name}"?`)) return;
    setPendingId(r.id);
    deleteVolumeRule(r.id).finally(() => { setPendingId(null); onChanged(); });
  }

  const sorted = [...rules].sort((a, b) => a.min_order_days - b.min_order_days);

  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
      <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", color: C.light, borderBottom: `1px solid ${C.border}` }}>
            <th style={{ padding: "10px 14px" }}>Name</th>
            <th style={{ padding: "10px 14px" }}>Threshold</th>
            <th style={{ padding: "10px 14px" }}>Discount</th>
            <th style={{ padding: "10px 14px" }}>Stacks with promo</th>
            <th style={{ padding: "10px 14px" }}>Validity</th>
            <th style={{ padding: "10px 14px" }}>Status</th>
            <th style={{ padding: "10px 14px" }} />
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr><td colSpan={7} style={{ padding: "24px 14px", textAlign: "center", color: C.light }}>No automatic discount tiers yet.</td></tr>
          ) : sorted.map(r => {
            const today = new Date().toISOString().slice(0, 10);
            const scheduled = r.start_date && today < r.start_date;
            const expired = r.end_date && today > r.end_date;
            const status = !r.is_active
              ? { label: "inactive", color: C.light, bg: C.offWhite }
              : scheduled
                ? { label: "scheduled", color: C.warn, bg: "#fdf0d5" }
                : expired
                  ? { label: "expired", color: C.error, bg: "#fbe4e1" }
                  : { label: "active", color: C.tealDark, bg: `${C.teal}30` };
            return (
              <Fragment key={r.id}>
                <tr style={{ borderBottom: `1px solid ${C.offWhite}` }}>
                  <td style={{ padding: "10px 14px", fontWeight: 700, color: C.primary }}>{r.name}</td>
                  <td style={{ padding: "10px 14px", color: C.muted }}>{r.min_order_days}+ days</td>
                  <td style={{ padding: "10px 14px" }}>
                    {r.discount_type === "percentage" ? `${r.discount_value}%` : `$${r.discount_value}`}
                    {r.max_discount_amount ? ` (cap $${r.max_discount_amount})` : ""}
                  </td>
                  <td style={{ padding: "10px 14px", color: C.muted }}>{r.stackable_with_promo ? "yes" : "no — exclusive"}</td>
                  <td style={{ padding: "10px 14px", color: C.muted, fontSize: 11.5 }}>
                    {r.start_date || r.end_date ? `${fmtDate(r.start_date) ?? "always"} → ${fmtDate(r.end_date) ?? "no end"}` : "no date limits"}
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <span style={{ fontSize: 10.5, fontWeight: 600, padding: "2px 8px", borderRadius: 6, color: status.color, background: status.bg }}>
                      {status.label}
                    </span>
                  </td>
                  <td style={{ padding: "10px 14px", display: "flex", gap: 6 }}>
                    <Btn variant="ghost" onClick={() => toggleActive(r)} disabled={pendingId === r.id}>
                      {r.is_active ? "Deactivate" : "Activate"}
                    </Btn>
                    <Btn variant="ghost" onClick={() => setEditingId(id => id === r.id ? null : r.id)} disabled={pendingId === r.id}>
                      {editingId === r.id ? "Cancel" : "Edit"}
                    </Btn>
                    <Btn variant="ghost" onClick={() => remove(r)} disabled={pendingId === r.id}>Delete</Btn>
                  </td>
                </tr>
                {editingId === r.id && (
                  <EditVolumeRuleForm rule={r} onCancel={() => setEditingId(null)} onDone={() => { setEditingId(null); onChanged(); }} />
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function CommerceClient({ affiliates, promoCodes, users, volumeRules }: {
  affiliates: AffiliateRow[]; promoCodes: PromoCodeRow[]; users: SimpleUser[]; volumeRules: VolumeRuleRow[];
}) {
  const [tab, setTab] = useState<"affiliates" | "codes" | "volume">("affiliates");
  const [showNewVolumeRule, setShowNewVolumeRule] = useState(false);
  const [showNewAffiliate, setShowNewAffiliate] = useState(false);
  const [showNewCode, setShowNewCode] = useState(false);
  const [, refresh] = useTransition();

  function reload() {
    refresh(() => { window.location.reload(); });
  }

  // A user already represented in the affiliates table (any tier/status) can't
  // get a second profile — filtered out of the "new affiliate" picker.
  const existingAffiliateUserIds = new Set(affiliates.map(a => a.user_id));
  const eligibleUserIds = new Set(users.filter(u => !existingAffiliateUserIds.has(u.id)).map(u => u.id));

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <Btn variant={tab === "affiliates" ? "primary" : "ghost"} onClick={() => setTab("affiliates")}>Affiliates</Btn>
        <Btn variant={tab === "codes" ? "primary" : "ghost"} onClick={() => setTab("codes")}>Promo codes</Btn>
        <Btn variant={tab === "volume" ? "primary" : "ghost"} onClick={() => setTab("volume")}>Automatic discounts</Btn>
      </div>

      {tab === "affiliates" && (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <Btn onClick={() => setShowNewAffiliate(s => !s)}>{showNewAffiliate ? "Cancel" : "+ New affiliate"}</Btn>
          </div>
          {showNewAffiliate && (
            <NewAffiliateForm
              users={users}
              eligibleUserIds={eligibleUserIds}
              onDone={() => { setShowNewAffiliate(false); reload(); }}
            />
          )}
          <Card>
            {affiliates.length === 0 ? (
              <p style={{ color: C.light, fontSize: 13, textAlign: "center", padding: "12px 0" }}>No affiliates yet.</p>
            ) : affiliates.map(a => <AffiliateRowCard key={a.id} affiliate={a} onChanged={reload} />)}
          </Card>
        </>
      )}

      {tab === "codes" && (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <Btn onClick={() => setShowNewCode(s => !s)}>{showNewCode ? "Cancel" : "+ New promo code"}</Btn>
          </div>
          {showNewCode && (
            <NewPromoCodeForm affiliates={affiliates} users={users} onDone={() => { setShowNewCode(false); reload(); }} />
          )}
          <PromoCodeTable codes={promoCodes} onChanged={reload} />
        </>
      )}

      {tab === "volume" && (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <Btn onClick={() => setShowNewVolumeRule(s => !s)}>{showNewVolumeRule ? "Cancel" : "+ New discount tier"}</Btn>
          </div>
          {showNewVolumeRule && (
            <NewVolumeRuleForm onDone={() => { setShowNewVolumeRule(false); reload(); }} />
          )}
          <VolumeRuleTable rules={volumeRules} onChanged={reload} />
        </>
      )}
    </div>
  );
}
