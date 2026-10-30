"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { KitchenSettings } from "@/lib/flask";
import { saveKitchenSettings } from "@/app/admin/kitchen/actions";
import { C } from "../ui";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Cook days decide how far ahead each batch should cover (until the day
// before the next cook day); the buffer adds a margin for late orders.
export default function KitchenSettingsBar({ settings, isCookDay, nextPlanned, fmtDay }: {
  settings: KitchenSettings;
  isCookDay: boolean | null;
  nextPlanned: string | null;
  fmtDay: (iso: string) => string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<number[]>(settings.cook_days);
  const [buffer, setBuffer] = useState(String(settings.late_order_buffer_pct));
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        await saveKitchenSettings({ cookDays: days, lateOrderBufferPct: parseInt(buffer, 10) || 0 });
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save.");
      }
    });
  }

  const summary = settings.cook_days.length
    ? `Cook days: ${settings.cook_days.map(d => DAYS[d]).join(", ")}`
    : "Cook days: every delivery day";
  const bufferText = settings.late_order_buffer_pct ? ` · +${settings.late_order_buffer_pct}% for late orders` : "";

  return (
    <div style={{ marginBottom: 12 }}>
      {isCookDay === false && (
        <div style={{ background: "#fff8e6", border: "1px solid #f5d48a", borderRadius: 10, padding: "8px 12px", marginBottom: 8, fontSize: 12.5, color: "#b45309" }}>
          This isn&apos;t one of your cook days. Only what&apos;s still uncovered for today shows as “to cook”.
          {nextPlanned && <> Next cook day: <strong>{fmtDay(nextPlanned)}</strong>.</>}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: C.muted }}>
          {summary}{bufferText}
          {nextPlanned && isCookDay !== false && <> · batches cover until {fmtDay(nextPlanned)} (next cook day)</>}
        </span>
        <button onClick={() => setOpen(v => !v)} style={{ background: "transparent", border: "none", padding: 0, color: C.tealDark, fontSize: 12, fontWeight: 600, cursor: "pointer", textDecoration: "underline" }}>
          {open ? "Close" : "Change"}
        </button>
      </div>
      {open && (
        <div style={{ marginTop: 8, background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px" }}>
          <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 600, color: C.primary }}>Which days do you cook?</p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {DAYS.map((label, d) => {
              const on = days.includes(d);
              return (
                <button key={d} onClick={() => setDays(prev => on ? prev.filter(x => x !== d) : [...prev, d])}
                  style={{ padding: "6px 11px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
                    border: `1px solid ${on ? C.primary : C.border}`, background: on ? C.primary : C.white, color: on ? C.white : C.muted }}>
                  {label}
                </button>
              );
            })}
          </div>
          <p style={{ margin: "6px 0 10px", fontSize: 11.5, color: C.light }}>
            None selected = cook on every delivery day. On a cook day, batches cover until the next one (as long as the dish keeps).
          </p>
          <label style={{ fontSize: 12, color: C.muted, display: "flex", alignItems: "center", gap: 6 }}>
            Extra for late orders
            <input type="number" min="0" max="50" value={buffer} onChange={e => setBuffer(e.target.value)}
              style={{ width: 60, padding: "5px 8px", borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 13 }} />
            % (only on days that can still take orders)
          </label>
          <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
            <button onClick={save} disabled={pending} style={{ background: C.primary, color: C.white, border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              {pending ? "Saving…" : "Save"}
            </button>
            {error && <span style={{ fontSize: 12, color: C.error }}>{error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
