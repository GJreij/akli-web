"use client";

import Link from "next/link";
import { useState } from "react";
import { th, td, C } from "@/components/admin/ui";

export interface AdjustmentItem {
  id: number;
  userId: string | null;
  clientName: string;
  label: string;
  // Signed for revenue: positive = client charged, negative = credited back.
  revenue: number;
  date: string;
}

const PREVIEW_COUNT = 5;

function fmtMoney(amount: number) {
  return `$${amount.toFixed(2)}`;
}

// Swaps/day edits pile up fast and made the Financial page very long, so the
// list starts collapsed (summary only), opens to the latest few, and only
// shows the full list on request. Rows arrive newest first.
export default function AdjustmentsPanel({ items, rangeLabel }: { items: AdjustmentItem[]; rangeLabel: string }) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const net = items.reduce((s, a) => s + a.revenue, 0);
  const shown = showAll ? items : items.slice(0, PREVIEW_COUNT);

  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px", marginBottom: 16 }}>
      <button
        onClick={() => setOpen(o => !o)}
        disabled={items.length === 0}
        aria-expanded={open}
        style={{
          width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
          background: "transparent", border: "none", padding: 0, textAlign: "left",
          cursor: items.length === 0 ? "default" : "pointer",
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 600, color: C.primary }}>
          {items.length > 0 && <span style={{ color: C.muted, marginRight: 6 }}>{open ? "▾" : "▸"}</span>}
          Swaps and adjustments {rangeLabel} ({items.length})
        </span>
        <span style={{ fontSize: 12.5, color: items.length === 0 ? C.light : net >= 0 ? C.primary : C.error, fontWeight: 600 }}>
          {items.length === 0 ? "None" : `Net ${net >= 0 ? "+" : "-"}${fmtMoney(Math.abs(net))}`}
        </span>
      </button>

      {open && items.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <th style={th}>Client</th>
                <th style={th}>Type</th>
                <th style={th}>Amount</th>
                <th style={th}>Date</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(a => {
                const charged = a.revenue >= 0;
                return (
                  <tr key={a.id}>
                    <td style={td}>
                      {a.userId ? (
                        <Link href={`/admin/users/${a.userId}`} style={{ color: C.primary, fontWeight: 600, textDecoration: "none" }}>
                          {a.clientName}
                        </Link>
                      ) : a.clientName}
                    </td>
                    <td style={{ ...td, color: C.muted }}>{a.label} {charged ? "(charged)" : "(credited)"}</td>
                    <td style={{ ...td, fontWeight: 700, color: charged ? C.primary : C.error }}>
                      {charged ? "+" : "-"}{fmtMoney(Math.abs(a.revenue))}
                    </td>
                    <td style={{ ...td, color: C.muted }}>{a.date}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {items.length > PREVIEW_COUNT && (
            <button
              onClick={() => setShowAll(v => !v)}
              style={{
                marginTop: 10, background: C.offWhite, color: C.primary, border: `1px solid ${C.border}`,
                borderRadius: 7, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}
            >
              {showAll ? `Show latest ${PREVIEW_COUNT} only` : `Show all ${items.length}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
