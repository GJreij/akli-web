"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { KitchenStockBatch } from "@/lib/flask";
import { closeBatch, correctBatchRemaining } from "@/app/admin/kitchen/actions";
import { C } from "../ui";
import { fmtDay, fmtServings, smallBtn } from "./format";

// One cooked batch: what's left, use-by, and Correct / Used up / Throw away.
export default function StockRow({ b }: { b: KitchenStockBatch }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [correcting, setCorrecting] = useState(false);
  const [actual, setActual] = useState(fmtServings(Math.max(b.remaining, 0)));
  const [err, setErr] = useState<string | null>(null);
  const empty = b.remaining <= 0.01;

  function run(fn: () => Promise<void>) {
    setErr(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Couldn't update the batch.");
      }
    });
  }

  function saveCorrection() {
    const n = parseFloat(actual);
    if (!Number.isFinite(n) || n < 0) { setErr("Enter how many servings you actually have."); return; }
    run(async () => {
      await correctBatchRemaining(b.batch_id, b.remaining, n);
      setCorrecting(false);
    });
  }

  function close(status: "finished" | "discarded") {
    const msg = status === "discarded"
      ? `Throw away the ${fmtServings(Math.max(b.remaining, 0))} servings left in this batch?`
      : "Mark this batch as used up?";
    if (!window.confirm(msg)) return;
    run(() => closeBatch(b.batch_id, status, status === "discarded" ? Math.max(b.remaining, 0) : undefined));
  }

  return (
    <div>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap",
        background: b.expired ? "#fdecea" : C.white, border: `1px solid ${C.border}`, borderRadius: 9, padding: "7px 10px",
      }}>
        <span style={{ fontSize: 12, color: C.muted }}>
          <strong style={{ color: C.primary }}>{b.storage === "freezer" ? "❄️ Freezer" : "Fridge"}</strong>
          {" · "}made {fmtDay(b.cooked_on)} · <strong style={{ color: C.primary }}>{fmtServings(b.remaining)}</strong> of {fmtServings(b.servings_cooked)} left
          {" · "}
          <span style={{ color: b.expired ? C.error : C.muted, fontWeight: b.expired ? 700 : 400 }}>
            {b.expired ? "expired " : "use by "}{fmtDay(b.use_by)}
          </span>
        </span>
        <span style={{ display: "flex", gap: 6 }}>
          {!correcting && <button style={smallBtn} disabled={pending} onClick={() => setCorrecting(true)}>Correct</button>}
          {empty || b.expired
            ? <button style={smallBtn} disabled={pending} onClick={() => close(b.expired && !empty ? "discarded" : "finished")}>{b.expired && !empty ? "Thrown away" : "Used up"}</button>
            : <button style={{ ...smallBtn, color: C.error }} disabled={pending} onClick={() => close("discarded")}>Throw away</button>}
        </span>
      </div>
      {correcting && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "5px 0 0 4px", fontSize: 12.5, color: C.muted }}>
          Actually left right now:
          <input
            type="number" step="any" min="0" inputMode="decimal" value={actual} onChange={e => setActual(e.target.value)}
            style={{ width: 80, padding: "6px 8px", borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 14 }}
          />
          servings
          <button onClick={saveCorrection} disabled={pending} style={{ ...smallBtn, background: C.primary, color: C.white, border: "none" }}>
            {pending ? "Saving…" : "Save"}
          </button>
          <button onClick={() => { setCorrecting(false); setErr(null); }} style={{ background: "transparent", border: "none", color: C.muted, fontSize: 12, cursor: "pointer" }}>Cancel</button>
        </div>
      )}
      {err && <p style={{ margin: "4px 0 0 4px", fontSize: 12, color: C.error }}>{err}</p>}
    </div>
  );
}
