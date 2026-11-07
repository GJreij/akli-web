"use client";

import { useEffect, useState } from "react";
import type { KitchenPerson, Person } from "@/lib/kitchenSimple";
import { C } from "../ui";
import { useKitchen } from "./live";

export const r2 = (n: number) => Math.round(n * 100) / 100;

export function fmt(n: number) {
  const r = r2(n);
  return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/0$/, "");
}

export function weekday(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short" });
}

export function dayLabel(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });
}

export function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function qty(quantity: number, unit: string | null) {
  if ((unit === "g" || unit === "ml") && quantity >= 1000) return `${r2(quantity / 1000)} ${unit === "g" ? "kg" : "L"}`;
  const shown = unit === "g" || unit === "ml" ? Math.round(quantity) : Math.round(quantity * 10) / 10;
  return `${shown} ${unit ?? ""}`.trim();
}

const COLORS = [
  { bg: "#e6eef9", fg: "#24507f" },
  { bg: "#fbe9f0", fg: "#8a2c55" },
  { bg: "#e7f4ea", fg: "#2e6b3c" },
  { bg: "#fdf0dc", fg: "#8a5a00" },
  { bg: "#efe8fa", fg: "#5b3a8c" },
  { bg: "#e3f3f3", fg: "#2c6767" },
];

export function personColor(people: KitchenPerson[], id: string) {
  const i = people.findIndex(p => p.id === id);
  return COLORS[(i < 0 ? 0 : i) % COLORS.length];
}

// Tap to pick who does it (the phone's own list opens).
export function WhoChip({ who, onChange, disabled }: { who: Person; onChange?: (p: Person) => void; disabled?: boolean }) {
  const { people } = useKitchen();
  const col = personColor(people, who);
  const current = people.find(p => p.id === who);
  const options = people.filter(p => p.active || p.id === who);
  const style = {
    minHeight: 32, padding: "0 10px", borderRadius: 16, border: "none", fontSize: 12, fontWeight: 700,
    backgroundColor: col.bg, color: col.fg, whiteSpace: "nowrap" as const, flex: "0 0 auto", width: "auto", maxWidth: 140,
  };
  if (!onChange) return <span style={{ ...style, display: "inline-flex", alignItems: "center" }}>{current?.name ?? who}</span>;
  return (
    <select
      value={who} disabled={disabled} onClick={e => e.stopPropagation()}
      onChange={e => { e.stopPropagation(); onChange(e.target.value); }}
      aria-label="Who does it"
      style={{ ...style, cursor: "pointer", appearance: "none", WebkitAppearance: "none", paddingRight: 22,
        backgroundImage: `linear-gradient(45deg, transparent 50%, ${col.fg} 50%), linear-gradient(135deg, ${col.fg} 50%, transparent 50%)`,
        backgroundPosition: "right 11px center, right 7px center", backgroundSize: "4px 4px, 4px 4px", backgroundRepeat: "no-repeat",
        backgroundColor: col.bg }}
    >
      {options.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      {!current && <option value={who}>{who}</option>}
    </select>
  );
}

export function NumberBox({ value, onChange, label, width = 74, disabled }: {
  value: string; onChange: (v: string) => void; label: string; width?: number; disabled?: boolean;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: C.muted, fontWeight: 600 }}>
      {label}
      <input
        type="number" step="any" min="0" inputMode="decimal" value={value} disabled={disabled}
        onChange={e => onChange(e.target.value)} onFocus={e => e.target.select()}
        style={{ width, height: 44, padding: "0 10px", border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 17, fontWeight: 700, color: C.primary }}
      />
    </label>
  );
}

export type Sort = "amount" | "az";

// Per-phone list preferences (sort, hide done), remembered across visits.
export function usePref<T extends string | boolean>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(initial);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) setV(JSON.parse(raw) as T);
    } catch { /* storage unavailable */ }
  }, [key]);
  const set = (x: T) => {
    setV(x);
    try { localStorage.setItem(key, JSON.stringify(x)); } catch { /* ignore */ }
  };
  return [v, set];
}

const toolChip = (on: boolean) => ({
  minHeight: 38, padding: "0 12px", borderRadius: 19, fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" as const,
  background: on ? C.primary : C.white, color: on ? C.white : C.primary, border: `1px solid ${on ? C.primary : C.border}`,
});

// Search box + "A–Z" + "Hide done", stuck to the top while scrolling.
export function ListTools({ query, setQuery, sort, setSort, hideDone, setHideDone, doneCount }: {
  query: string; setQuery: (q: string) => void; sort: Sort; setSort: (s: Sort) => void;
  hideDone: boolean; setHideDone: (v: boolean) => void; doneCount: number;
}) {
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 5, background: "#eee9e6", padding: "8px 0", marginBottom: 6, display: "flex", flexDirection: "column", gap: 6 }}>
      <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a subrecipe…"
        style={{ width: "100%", boxSizing: "border-box", height: 44, padding: "0 12px", border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 15, color: C.primary, background: C.white }} />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button onClick={() => setSort("amount")} style={toolChip(sort === "amount")}>Most first</button>
        <button onClick={() => setSort("az")} style={toolChip(sort === "az")}>A–Z</button>
        <button onClick={() => setHideDone(!hideDone)} style={{ ...toolChip(hideDone), marginLeft: "auto" }}>
          {hideDone ? "✓ " : ""}Hide done{doneCount ? ` (${doneCount})` : ""}
        </button>
      </div>
    </div>
  );
}

export const matchesQuery = (name: string, q: string) => !q.trim() || name.toLowerCase().includes(q.trim().toLowerCase());
export const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);

export const bigBtn = (primary: boolean) => ({
  minHeight: 46, padding: "0 16px", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer",
  border: primary ? "none" : `1px solid ${C.border}`, background: primary ? C.primary : C.white, color: primary ? C.white : C.primary,
}) as const;

export const linkBtn = { background: "none", border: "none", padding: 0, color: C.tealDark, fontSize: 12.5, textDecoration: "underline", cursor: "pointer" } as const;
