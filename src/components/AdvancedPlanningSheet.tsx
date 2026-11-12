"use client";

// Advanced planning (beta): full-screen editor for the servings of
// "flexible" subrecipes (rice, chicken, ...) on an already-generated plan.
// Edits stay local (live macro totals) until "Save"; the parent then sends
// them to Flask (/advanced_planning/apply), which recomputes the macros —
// and checkout prices the result with the normal rules. No prices here.

import { useState } from "react";
import { IconX, IconMinus, IconPlus, IconAlertTriangle, IconRefresh } from "@tabler/icons-react";
import type { GenerateMealPlanResponse, PlanDay } from "@/lib/flask";
import { ADVANCED_PLANNING, clampServings, isAdjustable } from "@/lib/advancedPlanning";

const C = {
  primary: "#063330", teal: "#67b1b0", tealDark: "#437b7b", offWhite: "#eee9e6",
  muted: "#5c5c5c", light: "#9a9a9a", border: "#e0dbd5", white: "#ffffff",
  warn: "#b8860b", warnBg: "#fbf3df", error: "#c0392b",
};

const MEAL_LABELS: Record<string, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" };
const MEAL_ORDER: Record<string, number> = { breakfast: 0, lunch: 1, snack: 2, dinner: 3 };

type Macros = { protein: number; carbs: number; fat: number; kcal: number };
const MACRO_KEYS = ["protein", "carbs", "fat", "kcal"] as const;

// "Kafta with Potatoes in Tomato Sauce — Kafta & Sauce" → "Kafta & Sauce"
// (the recipe name is already shown above the item).
function shortName(name: string): string {
  const parts = name.split(" — ");
  return parts.length > 1 ? parts[parts.length - 1] : name;
}

function fmtServings(n: number): string {
  return String(Math.round(n * 100) / 100);
}

function dayLabel(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });
}

// Per-serving macros from the solver output (macros = per-serving × servings;
// servings are never 0 here).
function perServing(sub: { servings: number; macros: Macros }): Macros {
  const s = sub.servings || 1;
  return { protein: sub.macros.protein / s, carbs: sub.macros.carbs / s, fat: sub.macros.fat / s, kcal: sub.macros.kcal / s };
}

export type DraftServings = Record<string, number>; // key: date|meal_key|subrecipe_id
export const draftKey = (date: string, mealKey: string, subId: number) => `${date}|${mealKey}|${subId}`;

function dayTotals(day: PlanDay, draft: DraftServings): Macros {
  const t: Macros = { protein: 0, carbs: 0, fat: 0, kcal: 0 };
  for (const meal of day.meals) {
    for (const sub of meal.subrecipes) {
      const ps = perServing(sub);
      const servings = draft[draftKey(day.date, meal.meal_key, sub.subrecipe_id)] ?? sub.servings;
      for (const k of MACRO_KEYS) t[k] += ps[k] * servings;
    }
  }
  return t;
}

function ServingInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? fmtServings(value);
  const commit = (raw: string) => {
    setText(null);
    const n = parseFloat(raw.replace(",", "."));
    if (Number.isFinite(n)) onChange(clampServings(n));
  };
  const btn = (disabled: boolean) => ({
    width: 34, height: 34, borderRadius: 10, border: `1px solid ${C.border}`, background: disabled ? C.offWhite : C.white,
    color: disabled ? C.light : C.primary, display: "flex", alignItems: "center", justifyContent: "center",
    cursor: disabled ? "default" : "pointer", flexShrink: 0, padding: 0,
  });
  const icon = { flexShrink: 0, minWidth: 16 };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <button
        aria-label="Less"
        disabled={value <= ADVANCED_PLANNING.min}
        onClick={() => onChange(clampServings(value - ADVANCED_PLANNING.step))}
        style={btn(value <= ADVANCED_PLANNING.min)}
      ><IconMinus size={16} stroke={2.4} style={icon} /></button>
      <input
        inputMode="decimal"
        aria-label="Servings"
        value={shown}
        onChange={e => setText(e.target.value)}
        onBlur={e => commit(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        style={{
          width: 52, height: 34, textAlign: "center", borderRadius: 10, border: `1px solid ${C.border}`,
          fontSize: 14, fontWeight: 600, color: C.primary, background: C.white,
        }}
      />
      <button
        aria-label="More"
        disabled={value >= ADVANCED_PLANNING.max}
        onClick={() => onChange(clampServings(value + ADVANCED_PLANNING.step))}
        style={btn(value >= ADVANCED_PLANNING.max)}
      ><IconPlus size={16} stroke={2.4} style={icon} /></button>
    </div>
  );
}

// One macro: actual vs target, a bar (100% = target) and the difference.
function MacroLine({ label, actual, target, unit }: { label: string; actual: number; target: number | null; unit: string }) {
  const a = Math.round(actual);
  const t = target != null ? Math.round(target) : null;
  const diff = t != null ? a - t : 0;
  const off = t ? Math.abs(diff) / t : 0;
  const color = off > ADVANCED_PLANNING.warnPct ? C.warn : C.teal;
  const pct = t ? Math.min(100, (a / t) * 100) : 0;
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <p style={{ fontSize: 10, color: C.muted, margin: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</p>
      <p style={{ fontSize: 15, fontWeight: 700, color: C.primary, margin: "1px 0 0", lineHeight: 1.2 }}>
        {a}<span style={{ fontSize: 11, fontWeight: 500 }}>{unit}</span>
      </p>
      {t != null && (
        <>
          <p style={{ fontSize: 10.5, color: C.muted, margin: "1px 0 4px" }}>
            of {t}{unit}
            {diff !== 0 && <span style={{ color, fontWeight: 600 }}> {diff > 0 ? "+" : "−"}{Math.abs(diff)}</span>}
          </p>
          <div style={{ height: 4, borderRadius: 2, background: C.border, overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2 }} />
          </div>
        </>
      )}
    </div>
  );
}

export default function AdvancedPlanningSheet({
  plan, flexibleIds, mainPairs, draft, onDraftChange, manualDates, onResetDay, onResetAll, onClose, onSave, saving, error,
}: {
  plan: GenerateMealPlanResponse;
  flexibleIds: Set<number>;
  mainPairs: Set<string>;
  draft: DraftServings;
  onDraftChange: (d: DraftServings) => void;
  // Days whose saved servings were set by hand (can go back to automatic).
  manualDates: Set<string>;
  onResetDay: (date: string) => void;
  onResetAll: () => void;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
  error: string | null;
}) {
  const days = plan.days;
  const dirty = Object.keys(draft).length > 0;
  const draftDates = new Set(Object.keys(draft).map(k => k.split("|")[0]));

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, background: C.offWhite, display: "flex", flexDirection: "column" }}>
      <div style={{ background: C.primary, color: C.white, padding: "12px 16px 10px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Advanced planning</p>
          <p style={{ fontSize: 11.5, opacity: 0.8, margin: "2px 0 0" }}>Price updates at checkout based on your choices.</p>
        </div>
        <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: C.white, cursor: "pointer", padding: 4 }}>
          <IconX size={20} />
        </button>
      </div>

      {/* No padding on the scroller itself: it would offset the pinned day headers. */}
      <div style={{ flex: 1, overflowY: "auto" }}>
      <div style={{ padding: "12px 12px 120px" }}>
        {(manualDates.size > 0 || dirty) && (
          <button
            onClick={onResetAll}
            disabled={saving}
            style={{ display: "flex", alignItems: "center", gap: 5, margin: "0 0 12px", background: "none", border: `1px solid ${C.border}`, borderRadius: 20, padding: "6px 12px", fontSize: 12, color: C.tealDark, cursor: "pointer" }}
          >
            <IconRefresh size={13} /> Put every day back to automatic
          </button>
        )}
        {days.map(day => {
          const target = day.adjusted_target ?? plan.daily_macro_target;
          const totals = dayTotals(day, draft);
          const kcalOff = target?.kcal ? (totals.kcal - target.kcal) / target.kcal : 0;
          const protOff = target?.protein_g ? (totals.protein - target.protein_g) / target.protein_g : 0;
          const warnings: string[] = [];
          if (Math.abs(kcalOff) > ADVANCED_PLANNING.warnPct) {
            warnings.push(`${Math.abs(Math.round(totals.kcal - target.kcal))} kcal ${kcalOff > 0 ? "above" : "below"} your daily target`);
          }
          if (Math.abs(protOff) > ADVANCED_PLANNING.warnPct) {
            warnings.push(`${Math.abs(Math.round(totals.protein - target.protein_g))} g protein ${protOff > 0 ? "above" : "below"} your target`);
          }
          const showReset = manualDates.has(day.date) || draftDates.has(day.date);
          const meals = [...day.meals].sort((a, b) => (MEAL_ORDER[a.meal_type] ?? 9) - (MEAL_ORDER[b.meal_type] ?? 9));

          return (
            <div key={day.date} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: "0 14px 10px", marginBottom: 14 }}>
              {/* Pinned while this day's meals scroll under it. */}
              <div style={{
                position: "sticky", top: 0, zIndex: 2, background: C.white, margin: "0 -14px", padding: "12px 14px 10px",
                borderRadius: "14px 14px 0 0", borderBottom: `1px solid ${C.border}`, boxShadow: "0 4px 8px -6px rgba(0,0,0,0.15)",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8, minHeight: 28 }}>
                  <p style={{ fontSize: 14.5, fontWeight: 600, color: C.primary, margin: 0 }}>{dayLabel(day.date)}</p>
                  {showReset && (
                    <button
                      onClick={() => onResetDay(day.date)}
                      style={{ display: "flex", alignItems: "center", gap: 4, background: C.white, border: `1px solid ${C.teal}`, borderRadius: 20, padding: "5px 10px", fontSize: 11.5, fontWeight: 600, color: C.tealDark, cursor: "pointer", flexShrink: 0 }}
                    >
                      <IconRefresh size={13} /> Back to automatic
                    </button>
                  )}
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <MacroLine label="Calories" actual={totals.kcal} target={target?.kcal ?? null} unit="" />
                  <MacroLine label="Protein" actual={totals.protein} target={target?.protein_g ?? null} unit="g" />
                  <MacroLine label="Carbs" actual={totals.carbs} target={target?.carbs_g ?? null} unit="g" />
                  <MacroLine label="Fat" actual={totals.fat} target={target?.fat_g ?? null} unit="g" />
                </div>
                {warnings.length > 0 && (
                  <div style={{ display: "flex", gap: 6, alignItems: "flex-start", background: C.warnBg, borderRadius: 8, padding: "5px 8px", marginTop: 8 }}>
                    <IconAlertTriangle size={14} color={C.warn} style={{ flexShrink: 0, marginTop: 1 }} />
                    <p style={{ fontSize: 11.5, color: C.warn, margin: 0, lineHeight: 1.35 }}>{warnings.join(" · ")}. You can still keep it.</p>
                  </div>
                )}
              </div>

              {meals.map(meal => {
                // Only the adjustable items are listed; a meal with none is left out.
                const flexSubs = meal.subrecipes.filter(s => isAdjustable({ flexibleIds, mainPairs }, meal.recipe_id, s));
                if (flexSubs.length === 0) return null;
                return (
                  <div key={meal.meal_key} style={{ borderTop: `1px solid ${C.border}`, padding: "10px 0 4px", marginTop: -1 }}>
                    <p style={{ fontSize: 11, color: C.light, margin: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>{MEAL_LABELS[meal.meal_type] ?? meal.meal_type}</p>
                    <p style={{ fontSize: 13.5, fontWeight: 600, color: C.primary, margin: "2px 0 8px" }}>{meal.recipe_name}</p>
                    {flexSubs.map(sub => {
                      const key = draftKey(day.date, meal.meal_key, sub.subrecipe_id);
                      const value = draft[key] ?? sub.servings;
                      return (
                        <div key={sub.subrecipe_id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, minHeight: 40, marginBottom: 4 }}>
                          <span style={{ fontSize: 13, color: C.primary, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{shortName(sub.name)}</span>
                          <ServingInput
                            value={value}
                            onChange={v => {
                              const next = { ...draft };
                              if (Math.abs(v - sub.servings) < 1e-9) delete next[key]; else next[key] = v;
                              onDraftChange(next);
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      </div>

      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: C.white, borderTop: `1px solid ${C.border}`, padding: "12px 20px 28px" }}>
        {error && <p style={{ fontSize: 12, color: C.error, margin: "0 0 8px", textAlign: "center" }}>{error}</p>}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={{ padding: "0 16px", height: 48, borderRadius: 12, border: `1px solid ${C.border}`, background: C.white, fontSize: 13, fontWeight: 500, color: C.muted, cursor: "pointer" }}
          >
            Cancel
          </button>
          <button
            className="btn-primary"
            style={{ flex: 1 }}
            onClick={onSave}
            disabled={saving || !dirty}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
