"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { KitchenSubrecipe } from "@/lib/flask";
import { setStockLevel } from "@/app/admin/kitchen/actions";
import { C } from "../ui";
import { fmtServings, smallBtn, todayBatches } from "./format";

const r2 = (n: number) => Math.round(n * 100) / 100;

// What's already cooked from earlier days (not expired), per storage.
export function earlierStock(s: KitchenSubrecipe, cookDate: string) {
  const cookedToday = new Set(todayBatches(s, cookDate));
  const open = s.stock.filter(b => !b.expired && b.cooked_on <= cookDate && !cookedToday.has(b));
  const sum = (st: "fridge" | "freezer") => r2(open.filter(b => b.storage === st).reduce((n, b) => n + Math.max(0, b.remaining), 0));
  return { open, fridge: sum("fridge"), freezer: sum("freezer") };
}

// "Already cooked: fridge 12 · freezer 0 · Correct". Filled from the batches;
// correcting it sets what's really there, and the amount to cook follows.
export default function AlreadyCooked({ s, cookDate, locked, label = "Already cooked" }: {
  s: KitchenSubrecipe; cookDate: string; locked: boolean; label?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { open, fridge, freezer } = earlierStock(s, cookDate);
  const freezable = s.freezer_days != null || freezer > 0;
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState(fmtServings(fridge));
  const [z, setZ] = useState(fmtServings(freezer));
  const [err, setErr] = useState<string | null>(null);

  function start() {
    setF(fmtServings(fridge));
    setZ(fmtServings(freezer));
    setErr(null);
    setEditing(true);
  }

  function save() {
    const nf = parseFloat(f || "0");
    const nz = freezable ? parseFloat(z || "0") : 0;
    if (!Number.isFinite(nf) || nf < 0 || !Number.isFinite(nz) || nz < 0) { setErr("Enter the servings you have (0 if none)."); return; }
    setErr(null);
    const batches = (st: "fridge" | "freezer") => open.filter(b => b.storage === st).map(b => ({ id: b.batch_id, cookedOn: b.cooked_on, remaining: b.remaining }));
    startTransition(async () => {
      try {
        await setStockLevel({ subrecipeId: s.subrecipe_id, cookDate, storage: "fridge", target: nf, batches: batches("fridge") });
        if (freezable) await setStockLevel({ subrecipeId: s.subrecipe_id, cookDate, storage: "freezer", target: nz, batches: batches("freezer") });
        setEditing(false);
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Couldn't save it.");
      }
    });
  }

  const input = (value: string, set: (v: string) => void, label: string) => (
    <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {label}
      <input type="number" step="any" min="0" inputMode="decimal" value={value} onChange={e => set(e.target.value)}
        style={{ width: 72, height: 40, padding: "0 10px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14 }} />
    </label>
  );

  return (
    <div style={{ marginTop: 8, background: "#f4f8f8", border: "1px solid #dbe9e8", borderRadius: 10, padding: "6px 10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12.5, color: C.muted }}>
          {label}: Fridge <strong style={{ color: C.primary }}>{fmtServings(fridge)}</strong>
          {freezable && <> · ❄️ Freezer <strong style={{ color: C.primary }}>{fmtServings(freezer)}</strong></>}
        </span>
        {!editing && <button onClick={start} style={{ ...smallBtn, minHeight: 36, background: C.white }}>Correct</button>}
      </div>
      {editing && (
        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 12.5, color: C.muted }}>
            I really have
            {input(f, setF, "Fridge")}
            {freezable && input(z, setZ, "❄️ Freezer")}
            servings
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={save} disabled={pending} style={{ ...smallBtn, minHeight: 40, background: C.primary, color: C.white, border: "none" }}>
              {pending ? "Saving…" : "Save"}
            </button>
            <button onClick={() => setEditing(false)} style={{ background: "none", border: "none", color: C.muted, fontSize: 12.5, cursor: "pointer" }}>Cancel</button>
          </div>
          <span style={{ fontSize: 11.5, color: C.light }}>
            {locked
              ? "Your plan is already confirmed: tap Change plan to recount what to cook."
              : `What you have is used first. If it covers today's ${fmtServings(s.today.servings)}, it moves to “nothing to do”.`}
          </span>
        </div>
      )}
      {err && <span style={{ display: "block", fontSize: 12, color: C.error, marginTop: 4 }}>{err}</span>}
    </div>
  );
}
