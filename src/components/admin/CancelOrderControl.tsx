"use client";

import { useState, useTransition } from "react";
import { C, primaryButton, dangerButton, subtleButton, inputStyle, labelStyle } from "@/components/admin/ui";
import { adminCancelOrder } from "@/app/admin/users/[id]/actions";

type Mode = null | "noRefund" | "wallet" | "refund";

export default function CancelOrderControl({ userId, mealPlanId }: { userId: string; mealPlanId: number }) {
  const [mode, setMode] = useState<Mode>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  if (done) {
    return <p style={{ margin: 0, fontSize: 11.5, color: C.tealDark, fontWeight: 600 }}>Cancelled</p>;
  }

  function submit() {
    if (!mode) return;
    setError(null);
    startTransition(async () => {
      try {
        await adminCancelOrder({
          userId, mealPlanId, mode,
          amount: amount ? parseFloat(amount) : undefined,
          note,
        });
        setDone(true);
        setMode(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  if (!mode) {
    return (
      <button style={dangerButton} onClick={() => setMode("noRefund")}>
        Cancel order
      </button>
    );
  }

  return (
    <div style={{ background: C.offWhite, borderRadius: 8, padding: 10, marginTop: 8 }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <button style={mode === "noRefund" ? primaryButton : subtleButton} onClick={() => setMode("noRefund")}>No refund</button>
        <button style={mode === "wallet" ? primaryButton : subtleButton} onClick={() => setMode("wallet")}>Wallet credit</button>
        <button style={mode === "refund" ? primaryButton : subtleButton} onClick={() => setMode("refund")}>Real refund</button>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        {(mode === "wallet" || mode === "refund") && (
          <label style={{ ...labelStyle, flex: "0 1 140px" }}>
            {mode === "wallet" ? "Credit amount ($)" : "Refund amount ($)"}
            <input type="number" step="0.01" min="0.01" value={amount} onChange={e => setAmount(e.target.value)} style={inputStyle} />
          </label>
        )}
        <label style={{ ...labelStyle, flex: "1 1 200px" }}>
          {mode === "noRefund" ? "Reason (required)" : "Note (optional)"}
          <input type="text" value={note} onChange={e => setNote(e.target.value)} style={inputStyle} />
        </label>
        <button style={primaryButton} disabled={pending} onClick={submit}>
          {pending ? "Cancelling…" : "Confirm"}
        </button>
        <button style={subtleButton} disabled={pending} onClick={() => { setMode(null); setError(null); }}>
          Back
        </button>
      </div>

      {error && <p style={{ margin: "8px 0 0", fontSize: 12, color: C.error }}>{error}</p>}
    </div>
  );
}
