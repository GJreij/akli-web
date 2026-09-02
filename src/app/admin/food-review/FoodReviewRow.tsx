"use client";

import { useState, useTransition } from "react";
import { C, primaryButton, dangerButton, subtleButton, inputStyle } from "@/components/admin/ui";
import { verifyFoodItem, rejectFoodItem } from "./actions";

export type PendingFoodItem = {
  id: number;
  name: string;
  brand: string | null;
  barcode: string | null;
  kcal_per_100: number | null;
  protein_per_100: number | null;
  carbs_per_100: number | null;
  fat_per_100: number | null;
  created_at: string;
  submittedByName: string;
};

type Mode = null | "reject";

export default function FoodReviewRow({ item }: { item: PendingFoodItem }) {
  const [mode, setMode] = useState<Mode>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function verify() {
    setError(null);
    startTransition(async () => {
      try {
        await verifyFoodItem(item.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  function reject() {
    setError(null);
    startTransition(async () => {
      try {
        await rejectFoodItem(item.id, note);
        setMode(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div>
          <p style={{ margin: "0 0 2px", fontSize: 13.5, fontWeight: 600, color: C.primary }}>
            {item.name} {item.brand && <span style={{ color: C.light, fontWeight: 400 }}>· {item.brand}</span>}
          </p>
          <p style={{ margin: "0 0 4px", fontSize: 12, color: C.muted }}>
            {item.barcode ? `Barcode ${item.barcode}` : "No barcode"} · per 100g: {Math.round(item.kcal_per_100 ?? 0)} kcal,
            {" "}P{Math.round(item.protein_per_100 ?? 0)} C{Math.round(item.carbs_per_100 ?? 0)} F{Math.round(item.fat_per_100 ?? 0)}
          </p>
          <p style={{ margin: 0, fontSize: 11, color: C.light }}>
            Submitted by {item.submittedByName} · {new Date(item.created_at).toLocaleString("en-GB", { timeZone: "Asia/Beirut" })}
          </p>
        </div>
        {mode === null && (
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button style={primaryButton} onClick={verify} disabled={pending}>Verify</button>
            <button style={dangerButton} onClick={() => setMode("reject")} disabled={pending}>Reject</button>
          </div>
        )}
      </div>

      {mode === "reject" && (
        <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
          <input
            style={inputStyle}
            placeholder="Reason for rejecting"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button style={dangerButton} onClick={reject} disabled={pending}>Confirm reject</button>
          <button style={subtleButton} onClick={() => { setMode(null); setNote(""); }} disabled={pending}>Cancel</button>
        </div>
      )}

      {error && <p style={{ margin: "8px 0 0", fontSize: 12, color: C.error }}>{error}</p>}
    </div>
  );
}
