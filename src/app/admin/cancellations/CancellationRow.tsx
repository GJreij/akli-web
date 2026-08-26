"use client";

import { useState, useTransition } from "react";
import { C, primaryButton, dangerButton, subtleButton, inputStyle, labelStyle } from "@/components/admin/ui";
import { approveAsWalletCredit, approveAsRealRefund, cancelWithNoRefund, rejectCancellation } from "./actions";

export type PendingCancellation = {
  id: number;
  meal_plan_id: number;
  user_id: string;
  requested_at: string;
  clientName: string;
  clientPhone: string | null;
  planStart: string | null;
  planEnd: string | null;
  cashAmount: number;
  walletAlreadyApplied: number;
  totalValue: number;
  unpaidCashAmount: number;
  isWholeOrder: boolean;
  requestedDates: string[];
};

type Mode = null | "wallet" | "refund" | "noRefund" | "reject";

export default function CancellationRow({ req }: { req: PendingCancellation }) {
  const [mode, setMode] = useState<Mode>(null);
  const [amount, setAmount] = useState(req.totalValue.toFixed(2));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        let discountCorrection: { amount: number; note: string } | null = null;
        if (mode === "wallet") {
          discountCorrection = await approveAsWalletCredit(req.id, req.user_id, req.meal_plan_id, parseFloat(amount), note);
        } else if (mode === "refund") {
          discountCorrection = await approveAsRealRefund(req.id, parseFloat(amount), note);
        } else if (mode === "noRefund") {
          if (!note.trim()) { setError("A reason is required when cancelling with no refund"); return; }
          discountCorrection = await cancelWithNoRefund(req.id, note);
        } else if (mode === "reject") {
          await rejectCancellation(req.id, note);
        }
        // This row disappears once the list refreshes (no longer pending),
        // so a persistent inline note wouldn't stay visible — an alert is
        // the only reliable way to surface this before that happens.
        if (discountCorrection) {
          window.alert(discountCorrection.note);
        }
        setMode(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: mode ? 10 : 0 }}>
        <div>
          <p style={{ margin: "0 0 2px", fontSize: 13.5, fontWeight: 600, color: C.primary }}>
            {req.clientName} {req.clientPhone && <span style={{ color: C.light, fontWeight: 400 }}>· {req.clientPhone}</span>}
          </p>
          <p style={{ margin: "0 0 2px", fontSize: 12, color: C.muted }}>
            Order #{req.meal_plan_id} · {req.planStart ?? "—"} – {req.planEnd ?? "—"}
          </p>
          <p style={{ margin: "0 0 4px", fontSize: 12.5, fontWeight: 600, color: C.primary }}>
            Total value: ${req.totalValue.toFixed(2)}
            <span style={{ fontWeight: 400, color: C.light }}>
              {" "}(cash ${req.cashAmount.toFixed(2)}{req.walletAlreadyApplied > 0 ? ` + wallet already used $${req.walletAlreadyApplied.toFixed(2)}` : ""})
            </span>
          </p>
          {req.unpaidCashAmount > 0 && (
            <p style={{ margin: "0 0 4px", fontSize: 11.5, fontWeight: 600, color: "#b45309" }}>
              ⚠ ${req.unpaidCashAmount.toFixed(2)} of the cash portion was never marked as paid — a real refund here would be paying back money that was never collected.
            </p>
          )}
          <p style={{ margin: "0 0 2px", fontSize: 11.5, fontWeight: 600, color: req.isWholeOrder ? C.error : "#b45309" }}>
            {req.isWholeOrder
              ? "Whole order"
              : `Partial — ${req.requestedDates.length} day${req.requestedDates.length !== 1 ? "s" : ""}: ${req.requestedDates.join(", ")}`}
          </p>
          <p style={{ margin: 0, fontSize: 11, color: C.light }}>
            Requested {new Date(req.requested_at).toLocaleString("en-GB", { timeZone: "Asia/Beirut" })}
          </p>
        </div>
        {!mode && (
          <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 260 }}>
            <button style={primaryButton} onClick={() => setMode("wallet")}>Wallet credit</button>
            <button style={subtleButton} onClick={() => setMode("refund")}>Real refund</button>
            <button style={dangerButton} onClick={() => setMode("noRefund")}>Cancel — no refund</button>
            <button style={dangerButton} onClick={() => setMode("reject")}>Reject</button>
          </div>
        )}
      </div>

      {mode && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, background: C.offWhite, borderRadius: 8, padding: 10 }}>
          {mode === "noRefund" && (
            <p style={{ margin: 0, fontSize: 12.5, color: C.error, fontWeight: 600 }}>
              This forfeits the full ${req.totalValue.toFixed(2)} — nothing will be refunded or credited to the wallet.
            </p>
          )}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            {(mode === "wallet" || mode === "refund") && (
              <label style={{ ...labelStyle, flex: "0 1 140px" }}>
                {mode === "wallet" ? "Credit amount ($)" : "Refund amount ($)"}
                <input type="number" step="0.01" min="0.01" value={amount} onChange={e => setAmount(e.target.value)} style={inputStyle} />
              </label>
            )}
            <label style={{ ...labelStyle, flex: "1 1 220px" }}>
              {mode === "reject" || mode === "noRefund" ? "Reason (required)" : "Note (optional)"}
              <input type="text" value={note} onChange={e => setNote(e.target.value)} style={inputStyle} />
            </label>
            <button style={primaryButton} disabled={pending} onClick={submit}>
              {pending ? "Saving…" : "Confirm"}
            </button>
            <button style={subtleButton} disabled={pending} onClick={() => { setMode(null); setError(null); }}>
              Back
            </button>
          </div>
        </div>
      )}

      {error && <p style={{ margin: "8px 0 0", fontSize: 12, color: C.error }}>{error}</p>}
    </div>
  );
}
