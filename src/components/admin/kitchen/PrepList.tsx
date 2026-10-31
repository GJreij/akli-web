"use client";

import { useEffect, useState } from "react";
import type { KitchenIngredient, KitchenSubrecipe } from "@/lib/flask";
import CopyListButton from "../CopyListButton";
import { C } from "../ui";

export interface PrepLine extends KitchenIngredient {
  dishes: { name: string; quantity: number }[];
}

// One line per ingredient across every dish passed in, so onions for four
// dishes are cut once. Same ingredient_id always has the same unit.
export function buildPrepLines(
  subs: KitchenSubrecipe[],
  ingredientsFor: (s: KitchenSubrecipe) => KitchenIngredient[],
): PrepLine[] {
  const byId = new Map<number, PrepLine>();
  for (const s of subs) {
    for (const i of ingredientsFor(s)) {
      if (i.quantity <= 0) continue;
      const line = byId.get(i.ingredient_id) ?? { ...i, quantity: 0, dishes: [] };
      line.quantity = Math.round((line.quantity + i.quantity) * 10) / 10;
      line.dishes.push({ name: s.name, quantity: i.quantity });
      byId.set(i.ingredient_id, line);
    }
  }
  // A to Z, with the always-in-stock staples in their own A to Z block at the end.
  return [...byId.values()].sort((a, b) => Number(a.is_staple) - Number(b.is_staple) || a.name.localeCompare(b.name));
}

function qty(i: { quantity: number; unit: string | null }) {
  const q = i.unit === "g" || i.unit === "ml" ? Math.round(i.quantity) : i.quantity;
  return `${q} ${i.unit ?? ""}`.trim();
}

// Ticks are a per-device convenience for the day (localStorage), not data.
export function useTicks(storageKey: string) {
  const [ticks, setTicks] = useState<Set<number>>(new Set());
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      setTicks(new Set(raw ? (JSON.parse(raw) as number[]) : []));
    } catch { /* storage unavailable: start empty */ }
  }, [storageKey]);
  function toggle(id: number) {
    setTicks(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem(storageKey, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }
  return { ticks, toggle };
}

export default function PrepList({ lines, storageKey }: { lines: PrepLine[]; storageKey: string }) {
  const { ticks, toggle } = useTicks(storageKey);
  const done = lines.filter(l => ticks.has(l.ingredient_id)).length;

  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: "10px 14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: C.light }}>{done}/{lines.length} done</span>
        <CopyListButton label="Copy" text={lines.map(l => `${l.name}: ${qty(l)}`).join("\n")} />
      </div>
      {lines.map((l, idx) => {
        const ticked = ticks.has(l.ingredient_id);
        const firstStaple = l.is_staple && (idx === 0 || !lines[idx - 1].is_staple);
        return (
          <div key={l.ingredient_id}>
            {firstStaple && (
              <p style={{ margin: "10px 0 2px", fontSize: 11, fontWeight: 700, color: C.light, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Always in stock: just measure
              </p>
            )}
            <label style={{
              display: "flex", gap: 10, alignItems: "flex-start", padding: "7px 0", borderTop: idx === 0 || firstStaple ? "none" : `1px solid ${C.offWhite}`,
              cursor: "pointer", opacity: ticked ? 0.45 : 1,
            }}>
              <input type="checkbox" checked={ticked} onChange={() => toggle(l.ingredient_id)} style={{ marginTop: 3 }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 13.5, color: C.primary, textDecoration: ticked ? "line-through" : "none" }}>
                    {l.stored_frozen && "❄️ "}{l.name}
                  </span>
                  <strong style={{ fontSize: 13.5, color: C.primary, whiteSpace: "nowrap" }}>{qty(l)}</strong>
                </span>
                {l.dishes.length > 1 && (
                  <span style={{ display: "block", fontSize: 11.5, color: C.light }}>
                    {l.dishes.map(d => `${d.name} ${qty({ quantity: d.quantity, unit: l.unit })}`).join(" · ")}
                  </span>
                )}
                {l.dishes.length === 1 && (
                  <span style={{ display: "block", fontSize: 11.5, color: C.light }}>{l.dishes[0].name}</span>
                )}
              </span>
            </label>
          </div>
        );
      })}
    </div>
  );
}
