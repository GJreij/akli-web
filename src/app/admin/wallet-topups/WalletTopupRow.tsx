"use client";

import { useState, useTransition } from "react";
import { C, primaryButton, dangerButton, subtleButton, inputStyle, labelStyle } from "@/components/admin/ui";
import { approveWalletTopup, rejectWalletTopup } from "./actions";

export type PendingTopup = {
  id: number;
  user_id: string;
  amount: number;
  payment_note: string | null;
  requested_at: string;
  clientName: string;
  clientPhone: string | null;
};

type Mode = null | "approve" | "reject";

export default function WalletTopupRow({ req }: { req: PendingTopup }) {
  const [mode, setMode] = useState<Mode>(null);
  const [amount, setAmount] = useState(req.amount.toFixed(2));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        if (mode === "approve") {
          await approveWalletTopup(req.id, req.user_id, parseFloat(amount), note);
        } else if (mode === "reject") {
          if (!note.trim()) { setError("A reason is required to reject a request"); return; }
          await rejectWalletTopup(req.id, note);
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
          <p style={{ margin: "0 0 4px", fontSize: 12.5, fontWeight: 600, color: C.primary }}>
            Requested ${req.amount.toFixed(2)}
          </p>
          {req.payment_note && (
            <p style={{ margin: "0 0 4px", fontSize: 12, color: C.muted }}>&ldquo;{req.payment_note}&rdquo;</p>
          )}
          <p style={{ margin: 0, fontSize: 11, color: C.light }}>
            Requested {new Date(req.requested_at).toLocaleString("en-GB", { timeZone: "Asia/Beirut" })}
          </p>
        </div>
        {!mode && (
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button style={primaryButton} onClick={() => setMode("approve")}>Approve & credit</button>
            <button style={dangerButton} onClick={() => setMode("reject")}>Reject</button>
          </div>
        )}
      </div>

      {mode && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, background: C.offWhite, borderRadius: 8, padding: 10 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            {mode === "approve" && (
              <label style={{ ...labelStyle, flex: "0 1 140px" }}>
                Credit amount ($)
                <input type="number" step="0.01" min="0.01" value={amount} onChange={e => setAmount(e.target.value)} style={inputStyle} />
              </label>
            )}
            <label style={{ ...labelStyle, flex: "1 1 220px" }}>
              {mode === "reject" ? "Reason (required)" : "Note (optional)"}
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
