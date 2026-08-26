"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { th, td, C } from "@/components/admin/ui";
import { setPaymentStatus } from "./actions";

export type OrderDay = { id: number; date: string; amount: number; currency: string; status: string; cancelled: boolean };
export type OrderTopup = { checkoutTopupId: number; walletTransactionId: number | null; amount: number; creditedAt: string | null };
export type OrderGroup = {
  key: string;
  mealPlanId: number | null;
  userId: string | null;
  clientName: string;
  startDate: string;
  endDate: string;
  total: number;
  currency: string;
  status: "paid" | "pending" | "partial";
  days: OrderDay[];
  topup?: OrderTopup | null;
};

const STATUS_LABEL: Record<OrderGroup["status"], string> = {
  paid: "Paid",
  pending: "Not paid",
  partial: "Partially paid",
};

const STATUS_COLOR: Record<OrderGroup["status"], string> = {
  paid: C.tealDark,
  pending: C.warn,
  partial: C.teal,
};

function StatusPill({ status }: { status: OrderGroup["status"] }) {
  const color = STATUS_COLOR[status];
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
      color, background: `${color}1a`, whiteSpace: "nowrap",
    }}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function fmtDate(date: string) {
  return new Date(date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
}

function fmtMoney(amount: number, currency = "$") {
  return `${currency}${amount.toFixed(2)}`;
}

// Reverting a paid order to pending never claws back an already-credited
// checkout wallet top-up — that money deliberately stays put. Since that's
// silent otherwise, force a confirmation that points straight at the rows
// to hand-fix in Supabase if a real reversal is ever needed.
function confirmUnpaidRevert(topup: OrderTopup | null | undefined): boolean {
  if (!topup) return true;
  const credited = topup.creditedAt ? fmtDate(topup.creditedAt) : "an earlier date";
  return window.confirm(
    `Heads up: this order included a ${fmtMoney(topup.amount)} wallet top-up already credited to the client (on ${credited}).\n\n` +
    `Marking it unpaid will NOT reverse that credit — the money stays in their wallet.\n\n` +
    `To reverse it by hand in Supabase if needed:\n` +
    `• wallet_checkout_topup, id = ${topup.checkoutTopupId} → set credited = false\n` +
    (topup.walletTransactionId != null
      ? `• wallet_transactions, id = ${topup.walletTransactionId} → delete or offset this +${fmtMoney(topup.amount)} row\n\n`
      : `• wallet_transactions → find and delete/offset the matching +${fmtMoney(topup.amount)} "checkout_topup" row\n\n`) +
    `Continue marking this order unpaid?`
  );
}

function actionBtnStyle(color: string): React.CSSProperties {
  return {
    fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 6,
    border: `1px solid ${color}40`, background: `${color}14`, color, cursor: "pointer", whiteSpace: "nowrap",
  };
}

const PAGE_SIZE = 20;

export default function OrdersAccordion({ orders }: { orders: OrderGroup[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [, startTransition] = useTransition();

  function toggle(key: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function updateStatus(actionKey: string, paymentIds: number[], status: "paid" | "pending", mealPlanId?: number | null) {
    setError(null);
    setPendingKeys(prev => new Set(prev).add(actionKey));
    startTransition(async () => {
      try {
        await setPaymentStatus(paymentIds, status, mealPlanId);
        window.location.reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to update payment status.");
        setPendingKeys(prev => { const next = new Set(prev); next.delete(actionKey); return next; });
      }
    });
  }

  if (orders.length === 0) {
    return <p style={{ fontSize: 13, color: C.light, margin: 0 }}>No orders match these filters.</p>;
  }

  const visibleOrders = orders.slice(0, visibleCount);
  const remaining = orders.length - visibleOrders.length;

  return (
    <div>
      {error && <p style={{ color: C.error, fontSize: 12.5, margin: "0 0 8px" }}>{error}</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {visibleOrders.map(o => {
          const isOpen = expanded.has(o.key);
          const markPaidKey = `order-${o.key}-paid`;
          const markUnpaidKey = `order-${o.key}-unpaid`;
          const allDayIds = o.days.filter(d => !d.cancelled).map(d => d.id);
          return (
            <div key={o.key} style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => toggle(o.key)}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(o.key); } }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                  padding: "10px 12px", background: isOpen ? C.offWhite : C.white, border: "none", cursor: "pointer",
                  textAlign: "left", flexWrap: "wrap",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <span style={{ fontSize: 11, color: C.light, transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.1s" }}>▸</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.primary }}>
                    {o.userId ? (
                      <Link
                        href={`/admin/users/${o.userId}`}
                        onClick={e => e.stopPropagation()}
                        style={{ color: C.primary, textDecoration: "none" }}
                      >
                        {o.clientName}
                      </Link>
                    ) : o.clientName}
                  </span>
                  <span style={{ fontSize: 12, color: C.muted }}>
                    {o.startDate === o.endDate ? fmtDate(o.startDate) : `${fmtDate(o.startDate)} → ${fmtDate(o.endDate)}`}
                  </span>
                  <span style={{ fontSize: 11.5, color: C.light }}>{o.days.length} day{o.days.length === 1 ? "" : "s"}</span>
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: C.primary }}>{fmtMoney(o.total, o.currency)}</span>
                  <StatusPill status={o.status} />
                  {o.status !== "paid" && (
                    <button
                      onClick={e => { e.stopPropagation(); updateStatus(markPaidKey, allDayIds, "paid", o.mealPlanId); }}
                      disabled={pendingKeys.has(markPaidKey)}
                      style={actionBtnStyle(C.tealDark)}
                    >
                      {pendingKeys.has(markPaidKey) ? "…" : "Mark all paid"}
                    </button>
                  )}
                  {o.status !== "pending" && (
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        if (!confirmUnpaidRevert(o.topup)) return;
                        updateStatus(markUnpaidKey, allDayIds, "pending");
                      }}
                      disabled={pendingKeys.has(markUnpaidKey)}
                      style={actionBtnStyle(C.muted)}
                    >
                      {pendingKeys.has(markUnpaidKey) ? "…" : "Mark all unpaid"}
                    </button>
                  )}
                </span>
              </div>

              {isOpen && (
                <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", borderTop: `1px solid ${C.border}` }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                      <th style={th}>Day</th>
                      <th style={th}>Amount</th>
                      <th style={th}>Status</th>
                      <th style={th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.days.map(d => {
                      const dayKey = `day-${d.id}`;
                      const isPaid = d.status === "paid";
                      if (d.cancelled) {
                        return (
                          <tr key={d.id} style={{ opacity: 0.6 }}>
                            <td style={{ ...td, color: C.muted }}>{fmtDate(d.date)}</td>
                            <td style={{ ...td, textDecoration: "line-through", color: C.muted }}>{fmtMoney(d.amount, d.currency)}</td>
                            <td style={td}>
                              <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, color: C.error, background: `${C.error}1a`, whiteSpace: "nowrap" }}>
                                Cancelled
                              </span>
                            </td>
                            <td style={td}></td>
                          </tr>
                        );
                      }
                      return (
                        <tr key={d.id}>
                          <td style={{ ...td, color: C.muted }}>{fmtDate(d.date)}</td>
                          <td style={td}>{fmtMoney(d.amount, d.currency)}</td>
                          <td style={td}>
                            <StatusPill status={isPaid ? "paid" : "pending"} />
                          </td>
                          <td style={{ ...td, textAlign: "right" }}>
                            <button
                              onClick={() => {
                                if (isPaid && !confirmUnpaidRevert(o.topup)) return;
                                updateStatus(dayKey, [d.id], isPaid ? "pending" : "paid", o.mealPlanId);
                              }}
                              disabled={pendingKeys.has(dayKey)}
                              style={actionBtnStyle(isPaid ? C.muted : C.tealDark)}
                            >
                              {pendingKeys.has(dayKey) ? "…" : isPaid ? "Mark unpaid" : "Mark paid"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </div>
      {remaining > 0 && (
        <button
          onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
          style={{
            marginTop: 10, width: "100%", fontSize: 12.5, fontWeight: 600, padding: "8px 12px", borderRadius: 8,
            border: `1px solid ${C.border}`, background: C.offWhite, color: C.primary, cursor: "pointer",
          }}
        >
          Show {Math.min(PAGE_SIZE, remaining)} more ({remaining} remaining)
        </button>
      )}
    </div>
  );
}
