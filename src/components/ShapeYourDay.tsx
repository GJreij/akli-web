"use client";

// Advanced planning v2 (beta, experiment): "Shape your day", picked in step 1
// BEFORE the plan is built. Three ways to say it:
//   - Simple: Light / Normal / Big per meal
//   - % of calories per meal
//   - Exact kcal and/or protein / carbs / fat per meal (any subset)
// Flask turns these into per-meal goals (services/mealplan_service.py
// resolve_meal_goals — keep MEAL_BASE_SHARE / MEAL_SIZE_FACTOR in sync) and
// treats them as soft goals next to the day's normal macro targets. Optional
// second day type for some weekdays. Saved per user in this browser.

import { useState } from "react";
import { IconChevronDown, IconRefresh, IconPlus, IconX, IconAlertTriangle } from "@tabler/icons-react";
import type { PlanDay } from "@/lib/flask";

const C = {
  primary: "#063330", teal: "#67b1b0", tealDark: "#437b7b", offWhite: "#eee9e6",
  muted: "#5c5c5c", light: "#9a9a9a", border: "#e0dbd5", white: "#ffffff",
  warn: "#b8860b", warnBg: "#fbf3df", warnBorder: "#ecd9a8",
};

export type MealSize = "light" | "normal" | "big";
export type ShapeMode = "simple" | "pct" | "exact";
export interface ExactGoal { kcal?: number; protein?: number; carbs?: number; fat?: number }
export interface DaySettings {
  sizes: Partial<Record<string, MealSize>>;
  pct: Partial<Record<string, number>>;
  exact: Partial<Record<string, ExactGoal>>;
}
export interface DayShape {
  mode: ShapeMode;
  base: DaySettings;
  alt: DaySettings | null;    // second day type, or null
  altWeekdays: number[];      // Mon=0 … Sun=6
}
export type MealSetting = MealSize | { pct: number } | ExactGoal;
export interface DayTargets { kcal: number | null; protein: number | null; carbs: number | null; fat: number | null }

const emptySettings = (): DaySettings => ({ sizes: {}, pct: {}, exact: {} });
export const EMPTY_SHAPE: DayShape = { mode: "simple", base: emptySettings(), alt: null, altWeekdays: [] };

/** Reads what's stored in the browser, including the first (sizes-only) format. */
export function parseStoredShape(raw: string | null): DayShape {
  if (!raw) return EMPTY_SHAPE;
  try {
    const j = JSON.parse(raw);
    const fix = (s: unknown): DaySettings | null => {
      if (!s || typeof s !== "object") return null;
      const o = s as Record<string, unknown>;
      if ("sizes" in o || "pct" in o || "exact" in o) {
        return { sizes: (o.sizes as DaySettings["sizes"]) ?? {}, pct: (o.pct as DaySettings["pct"]) ?? {}, exact: (o.exact as DaySettings["exact"]) ?? {} };
      }
      return { ...emptySettings(), sizes: o as DaySettings["sizes"] }; // old format
    };
    return {
      mode: j.mode === "pct" || j.mode === "exact" ? j.mode : "simple",
      base: fix(j.base) ?? emptySettings(),
      alt: fix(j.alt),
      altWeekdays: Array.isArray(j.altWeekdays) ? j.altWeekdays : [],
    };
  } catch { return EMPTY_SHAPE; }
}

const MEAL_BASE_SHARE: Record<string, number> = { breakfast: 0.25, lunch: 0.35, dinner: 0.30, snack: 0.10 };
const MEAL_SIZE_FACTOR: Record<MealSize, number> = { light: 0.65, normal: 1, big: 1.45 };
const MEAL_ORDER = ["breakfast", "lunch", "snack", "dinner"];
const MEAL_LABEL: Record<string, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" };
const MEAL_COLOR: Record<string, string> = { breakfast: "#e9c46a", lunch: "#67b1b0", snack: "#c9a9a6", dinner: "#2f6f6c" };
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SIZES: MealSize[] = ["light", "normal", "big"];
const SIZE_LABEL: Record<MealSize, string> = { light: "Light", normal: "Normal", big: "Big" };
const MODE_LABEL: Record<ShapeMode, string> = { simple: "Simple", pct: "% of calories", exact: "Exact macros" };
const MACROS = [
  { key: "kcal", label: "kcal", unit: "" },
  { key: "protein", label: "P", unit: "g" },
  { key: "carbs", label: "C", unit: "g" },
  { key: "fat", label: "F", unit: "g" },
] as const;

/** The meal settings this day type sends, in the active mode (only meals that differ from automatic). */
function settingsFor(s: DaySettings | null, mode: ShapeMode, meals: string[]): Record<string, MealSetting> {
  if (!s) return {};
  const out: Record<string, MealSetting> = {};
  for (const m of meals) {
    if (mode === "simple") { const v = s.sizes[m]; if (v && v !== "normal") out[m] = v; }
    else if (mode === "pct") { const v = s.pct[m]; if (v != null && Number.isFinite(v)) out[m] = { pct: v }; }
    else {
      const e = s.exact[m];
      if (e) {
        const clean = Object.fromEntries(Object.entries(e).filter(([, v]) => v != null && Number.isFinite(v as number))) as ExactGoal;
        if (Object.keys(clean).length) out[m] = clean;
      }
    }
  }
  return out;
}

const hasAny = (s: DaySettings | null, mode: ShapeMode, meals: string[]) => Object.keys(settingsFor(s, mode, meals)).length > 0;
export const shapeIsSet = (shape: DayShape, meals: string[]) =>
  hasAny(shape.base, shape.mode, meals) || (!!shape.alt && shape.altWeekdays.length > 0 && hasAny(shape.alt, shape.mode, meals));

/** What /generate_meal_plan takes: a default plus per-weekday overrides. */
export function shapeRequest(shape: DayShape, meals: string[]) {
  const base = settingsFor(shape.base, shape.mode, meals);
  const out: { meal_sizes?: Record<string, MealSetting>; meal_sizes_by_weekday?: Record<string, Record<string, MealSetting>> } = {};
  if (Object.keys(base).length) out.meal_sizes = base;
  if (shape.alt && shape.altWeekdays.length) {
    const alt = settingsFor(shape.alt, shape.mode, meals);
    // An all-automatic "other days" type still has to override a shaped base.
    const altOrAuto = Object.keys(alt).length ? alt : { [meals[0]]: "normal" as MealSize };
    out.meal_sizes_by_weekday = Object.fromEntries(shape.altWeekdays.map(w => [String(w), altOrAuto]));
  }
  return out;
}

/** kcal per meal as Flask will aim for it (mirror of resolve_meal_goals). */
function mealKcal(s: DaySettings, mode: ShapeMode, meals: string[], dayKcal: number): Record<string, number> {
  const set = settingsFor(s, mode, meals);
  const out: Record<string, number> = {};
  let fixed = 0;
  for (const m of meals) {
    const v = set[m];
    if (v && typeof v === "object" && "pct" in v) { out[m] = (v.pct / 100) * dayKcal; fixed += out[m]; }
    else if (v && typeof v === "object") {
      const e = v as ExactGoal;
      const k = e.kcal ?? (e.protein != null && e.carbs != null && e.fat != null ? e.protein * 4 + e.carbs * 4 + e.fat * 9 : null);
      if (k != null) { out[m] = k; fixed += k; }
    }
  }
  const rest = meals.filter(m => out[m] == null);
  const raw = Object.fromEntries(rest.map(m => {
    const v = set[m];
    return [m, (MEAL_BASE_SHARE[m] ?? 0.25) * (typeof v === "string" ? MEAL_SIZE_FACTOR[v] : 1)];
  }));
  const tot = Object.values(raw).reduce((a, b) => a + b, 0) || 1;
  for (const m of rest) out[m] = Math.max(0, dayKcal - fixed) * raw[m] / tot;
  return out;
}

// ── Split bar ─────────────────────────────────────────────────────────────────
function SplitBar({ kcal, meals, showKcal }: { kcal: Record<string, number>; meals: string[]; showKcal: boolean }) {
  const total = meals.reduce((a, m) => a + (kcal[m] ?? 0), 0) || 1;
  return (
    <div style={{ margin: "2px 0 10px" }}>
      <div style={{ display: "flex", height: 10, borderRadius: 99, overflow: "hidden", gap: 2 }}>
        {meals.map(m => (
          <div key={m} style={{ width: `${((kcal[m] ?? 0) / total) * 100}%`, background: MEAL_COLOR[m], transition: "width 0.3s ease" }} />
        ))}
      </div>
      <div style={{ display: "flex", marginTop: 5 }}>
        {meals.map(m => (
          <div key={m} style={{ width: `${((kcal[m] ?? 0) / total) * 100}%`, minWidth: 0, transition: "width 0.3s ease" }}>
            <p style={{ margin: 0, fontSize: 10.5, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{MEAL_LABEL[m]}</p>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: C.primary, whiteSpace: "nowrap" }}>
              {showKcal ? `~${Math.round((kcal[m] ?? 0) / 10) * 10}` : `${Math.round(((kcal[m] ?? 0) / total) * 100)}%`}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

const Dot = ({ meal }: { meal: string }) => <span style={{ width: 8, height: 8, borderRadius: 99, background: MEAL_COLOR[meal], flexShrink: 0 }} />;

function SizeRow({ meal, value, onChange }: { meal: string; value: MealSize; onChange: (v: MealSize) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "7px 0" }}>
      <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, fontWeight: 600, color: "#1a1a1a" }}>
        <Dot meal={meal} />{MEAL_LABEL[meal]}
      </span>
      <div role="radiogroup" aria-label={`${MEAL_LABEL[meal]} size`} style={{ display: "flex", background: C.offWhite, borderRadius: 10, padding: 3 }}>
        {SIZES.map(s => {
          const on = value === s;
          return (
            <button
              key={s} role="radio" aria-checked={on} onClick={() => onChange(s)}
              style={{
                minWidth: 58, padding: "6px 8px", borderRadius: 8, border: "none", cursor: "pointer",
                fontSize: 12, fontWeight: on ? 700 : 500,
                background: on ? C.white : "transparent", color: on ? C.primary : C.muted,
                boxShadow: on ? "0 1px 3px rgba(0,0,0,0.12)" : "none", transition: "all 0.15s",
              }}
            >{SIZE_LABEL[s]}</button>
          );
        })}
      </div>
    </div>
  );
}

function NumBox({ value, onChange, placeholder, suffix, label, width = 58 }: {
  value: number | undefined; onChange: (v: number | undefined) => void; placeholder: string; suffix: string; label: string; width?: number;
}) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 2, background: C.white, border: `1px solid ${value != null ? C.teal : C.border}`, borderRadius: 9, padding: "0 7px", height: 34, width }}>
      <input
        inputMode="decimal"
        aria-label={label}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={e => {
          const t = e.target.value.replace(",", ".").trim();
          if (t === "") return onChange(undefined);
          const n = parseFloat(t);
          if (Number.isFinite(n) && n >= 0) onChange(Math.round(n));
        }}
        style={{ width: "100%", minWidth: 0, border: "none", outline: "none", background: "transparent", fontSize: 13, fontWeight: 600, color: C.primary, textAlign: "right", padding: 0 }}
      />
      <span style={{ fontSize: 11, color: C.light, flexShrink: 0 }}>{suffix}</span>
    </label>
  );
}

export default function ShapeYourDay({
  shape, onChange, meals, targets, weekendsOn,
}: {
  shape: DayShape;
  onChange: (s: DayShape) => void;
  meals: string[];               // included meal types
  targets: DayTargets;           // the day's targets, for live sums/labels
  weekendsOn: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"base" | "alt">("base");
  const ordered = MEAL_ORDER.filter(m => meals.includes(m));
  if (ordered.length < 2) return null; // one meal a day: nothing to move calories between

  const isAlt = tab === "alt" && !!shape.alt;
  const active = isAlt ? shape.alt! : shape.base;
  const setActive = (next: DaySettings) => onChange(isAlt ? { ...shape, alt: next } : { ...shape, base: next });
  const dayKcal = targets.kcal ?? 0;
  const kcalSplit = mealKcal(active, shape.mode, ordered, dayKcal || 1000);
  const days = weekendsOn ? WEEKDAYS : WEEKDAYS.slice(0, 5);
  const altLabel = shape.altWeekdays.length ? [...shape.altWeekdays].sort().map(w => WEEKDAYS[w]).join(", ") : "pick days";
  const set = shapeIsSet(shape, ordered);

  const describe = (s: DaySettings | null): string => {
    const v = settingsFor(s, shape.mode, ordered);
    const parts = ordered.filter(m => v[m] != null).map(m => {
      const x = v[m];
      if (typeof x === "string") return `${SIZE_LABEL[x]} ${MEAL_LABEL[m].toLowerCase()}`;
      if ("pct" in x) return `${MEAL_LABEL[m]} ${x.pct}%`;
      const e = x as ExactGoal;
      return `${MEAL_LABEL[m]} ${[e.kcal != null && `${e.kcal} kcal`, e.protein != null && `${e.protein}P`, e.carbs != null && `${e.carbs}C`, e.fat != null && `${e.fat}F`].filter(Boolean).join(" ")}`;
    });
    return parts.length ? parts.join(" · ") : "Automatic";
  };
  const headline = shape.alt && shape.altWeekdays.length
    ? `${describe(shape.base)} · ${altLabel}: ${describe(shape.alt)}`
    : describe(shape.base);

  // Live totals for the precise modes.
  const pctTotal = ordered.reduce((a, m) => a + (active.pct[m] ?? 0), 0);
  const pctMissing = ordered.filter(m => active.pct[m] == null);
  const exactSum = (k: keyof ExactGoal) => ordered.reduce((a, m) => a + (active.exact[m]?.[k] ?? 0), 0);

  return (
    <div style={{ marginBottom: 16 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
          background: C.white, border: `1px solid ${set ? C.teal : C.border}`,
          borderRadius: open ? "12px 12px 0 0" : 12, padding: "14px 16px", cursor: "pointer",
        }}
      >
        <div style={{ textAlign: "left", minWidth: 0 }}>
          <p style={{ margin: "0 0 2px", fontSize: 13.5, fontWeight: 600, color: "#1a1a1a" }}>
            Shape your day
            <span style={{ fontSize: 9.5, fontWeight: 700, color: C.tealDark, border: `1px solid ${C.teal}`, borderRadius: 6, padding: "1px 5px", marginLeft: 6, verticalAlign: "middle" }}>BETA</span>
          </p>
          <p style={{ margin: 0, fontSize: 11.5, color: set ? C.tealDark : C.light, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {set ? headline : "Bigger lunch, lighter dinner… — optional"}
          </p>
        </div>
        <IconChevronDown size={16} color={C.light} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }} />
      </button>

      {open && (
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderTop: "none", borderRadius: "0 0 12px 12px", padding: "12px 16px 14px" }}>
          {/* Mode */}
          <div role="tablist" style={{ display: "flex", background: C.offWhite, borderRadius: 10, padding: 3, marginBottom: 10 }}>
            {(["simple", "pct", "exact"] as ShapeMode[]).map(m => {
              const on = shape.mode === m;
              return (
                <button
                  key={m} role="tab" aria-selected={on} onClick={() => onChange({ ...shape, mode: m })}
                  style={{
                    flex: 1, padding: "7px 4px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 11.5,
                    fontWeight: on ? 700 : 500, background: on ? C.white : "transparent", color: on ? C.primary : C.muted,
                    boxShadow: on ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
                  }}
                >{MODE_LABEL[m]}</button>
              );
            })}
          </div>

          <p style={{ margin: "0 0 12px", fontSize: 11.5, color: C.muted, lineHeight: 1.45 }}>
            {shape.mode === "exact"
              ? "Fill in only what matters to you — anything left empty is planned automatically. Your daily targets still apply."
              : "Your daily calories and macros stay the same — this only moves food between meals."}
          </p>

          {shape.alt && (
            <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
              {(["base", "alt"] as const).map(t => (
                <button
                  key={t} onClick={() => setTab(t)}
                  style={{
                    flex: 1, padding: "8px 6px", borderRadius: 9, cursor: "pointer", fontSize: 12,
                    border: `1.5px solid ${tab === t ? C.tealDark : C.border}`,
                    background: tab === t ? "#f0f7f7" : C.white, color: tab === t ? C.tealDark : C.muted,
                    fontWeight: tab === t ? 700 : 500,
                  }}
                >{t === "base" ? "Most days" : `Other days (${altLabel})`}</button>
              ))}
            </div>
          )}

          <SplitBar kcal={kcalSplit} meals={ordered} showKcal={!!dayKcal} />

          {shape.mode === "simple" && ordered.map(m => (
            <SizeRow key={m} meal={m} value={active.sizes[m] ?? "normal"} onChange={v => setActive({ ...active, sizes: { ...active.sizes, [m]: v } })} />
          ))}

          {shape.mode === "pct" && (
            <>
              {ordered.map(m => (
                <div key={m} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "6px 0" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, fontWeight: 600, color: "#1a1a1a" }}>
                    <Dot meal={m} />{MEAL_LABEL[m]}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {dayKcal > 0 && active.pct[m] != null && (
                      <span style={{ fontSize: 11, color: C.light }}>~{Math.round(((active.pct[m] ?? 0) / 100) * dayKcal / 10) * 10} kcal</span>
                    )}
                    <NumBox
                      label={`${MEAL_LABEL[m]} percent of calories`} placeholder="auto" suffix="%" width={74}
                      value={active.pct[m]}
                      onChange={v => setActive({ ...active, pct: { ...active.pct, [m]: v } })}
                    />
                  </span>
                </div>
              ))}
              <p style={{ margin: "8px 0 0", fontSize: 11.5, fontWeight: 600, color: pctMissing.length === 0 && pctTotal !== 100 ? C.warn : C.tealDark }}>
                {pctMissing.length === 0
                  ? (pctTotal === 100 ? "Total 100% ✓" : `Total ${pctTotal}% — should add up to 100%`)
                  : `${pctTotal}% set · the other ${Math.max(0, 100 - pctTotal)}% goes to ${pctMissing.map(m => MEAL_LABEL[m].toLowerCase()).join(" & ")}`}
              </p>
            </>
          )}

          {shape.mode === "exact" && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr repeat(4, 54px)", gap: 5, alignItems: "center", fontSize: 10.5, color: C.light, marginBottom: 2 }}>
                <span />
                {MACROS.map(x => <span key={x.key} style={{ textAlign: "center" }}>{x.key === "kcal" ? "kcal" : x.key === "protein" ? "Protein" : x.key === "carbs" ? "Carbs" : "Fat"}</span>)}
              </div>
              {ordered.map(m => (
                <div key={m} style={{ display: "grid", gridTemplateColumns: "1fr repeat(4, 54px)", gap: 5, alignItems: "center", padding: "4px 0" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: "#1a1a1a", minWidth: 0 }}>
                    <Dot meal={m} /><span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{MEAL_LABEL[m]}</span>
                  </span>
                  {MACROS.map(x => (
                    <NumBox
                      key={x.key} width={54} label={`${MEAL_LABEL[m]} ${x.key}`} placeholder="–" suffix={x.unit}
                      value={active.exact[m]?.[x.key]}
                      onChange={v => setActive({ ...active, exact: { ...active.exact, [m]: { ...active.exact[m], [x.key]: v } } })}
                    />
                  ))}
                </div>
              ))}
              <div style={{ display: "grid", gridTemplateColumns: "1fr repeat(4, 54px)", gap: 5, alignItems: "center", marginTop: 6, paddingTop: 6, borderTop: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 11, color: C.muted }}>Set / your day</span>
                {MACROS.map(x => {
                  const t = targets[x.key];
                  const sum = exactSum(x.key);
                  const over = t != null && sum > t * 1.03;
                  return (
                    <span key={x.key} style={{ textAlign: "center", fontSize: 10.5, lineHeight: 1.25, color: over ? C.warn : C.muted, fontWeight: over ? 700 : 500 }}>
                      {sum || "–"}<br />/{t != null ? Math.round(t) : "?"}
                    </span>
                  );
                })}
              </div>
              {MACROS.some(x => targets[x.key] != null && exactSum(x.key) > (targets[x.key] ?? 0) * 1.03) && (
                <p style={{ margin: "6px 0 0", fontSize: 11, color: C.warn }}>More than your daily target — the plan will get as close as it can.</p>
              )}
            </>
          )}

          {isAlt && (
            <div style={{ marginTop: 10 }}>
              <p style={{ margin: "0 0 6px", fontSize: 11.5, color: C.muted }}>Use this on:</p>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {days.map(d => {
                  const w = WEEKDAYS.indexOf(d);
                  const on = shape.altWeekdays.includes(w);
                  return (
                    <button
                      key={d}
                      onClick={() => onChange({ ...shape, altWeekdays: on ? shape.altWeekdays.filter(x => x !== w) : [...shape.altWeekdays, w] })}
                      style={{
                        padding: "6px 10px", borderRadius: 20, fontSize: 12, cursor: "pointer",
                        border: `1.5px solid ${on ? C.tealDark : C.border}`,
                        background: on ? C.tealDark : C.white, color: on ? C.white : C.muted, fontWeight: on ? 700 : 500,
                      }}
                    >{d}</button>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            {!shape.alt ? (
              <button onClick={() => { onChange({ ...shape, alt: JSON.parse(JSON.stringify(shape.base)), altWeekdays: [] }); setTab("alt"); }} style={linkBtn}>
                <IconPlus size={13} /> Different on some days
              </button>
            ) : (
              <button onClick={() => { onChange({ ...shape, alt: null, altWeekdays: [] }); setTab("base"); }} style={linkBtn}>
                <IconX size={13} /> Same every day
              </button>
            )}
            {set && (
              <button onClick={() => { onChange({ ...EMPTY_SHAPE, mode: shape.mode }); setTab("base"); }} style={linkBtn}>
                <IconRefresh size={13} /> Back to automatic
              </button>
            )}
          </div>
          {set && <p style={{ margin: "10px 0 0", fontSize: 10.5, color: C.light }}>Saved for your next orders.</p>}
        </div>
      )}
    </div>
  );
}

const linkBtn: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 4, background: "none", border: `1px solid ${C.border}`,
  borderRadius: 20, padding: "6px 11px", fontSize: 11.5, color: C.tealDark, cursor: "pointer",
};

// ── Step 2: what the shape couldn't do ───────────────────────────────────────
export interface MealShapeEntry {
  meal_type: string;
  size: MealSize | "pct" | "exact";
  target_kcal: number;
  kcal: number;
  targets?: Partial<Record<"kcal" | "protein" | "carbs" | "fat", number>>;
  actual?: Partial<Record<"kcal" | "protein" | "carbs" | "fat", number>>;
  ok: boolean;
}

/** One-line reason a meal missed, e.g. "aimed ~280 kcal, gets 440" or "aimed 50g protein, gets 38g". */
export function missText(e: MealShapeEntry): string {
  const t = e.targets ?? { kcal: e.target_kcal };
  const a = e.actual ?? { kcal: e.kcal };
  const keys = (["kcal", "protein", "carbs", "fat"] as const).filter(k => t[k] != null && a[k] != null);
  // The worst miss, relative to its goal.
  const worst = keys.sort((x, y) => Math.abs(a[y]! - t[y]!) / (t[y]! || 1) - Math.abs(a[x]! - t[x]!) / (t[x]! || 1))[0] ?? "kcal";
  const u = worst === "kcal" ? " kcal" : `g ${worst}`;
  return `aimed ~${t[worst]}${u}, gets ${a[worst]}${worst === "kcal" ? "" : "g"}`;
}

const isChanged = (e: MealShapeEntry) => e.size !== "normal";

export function ShapeReport({ days, onSwap }: {
  days: (PlanDay & { meal_shape?: MealShapeEntry[] })[];
  onSwap: (date: string, mealType: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const shaped = days.flatMap(d => (d.meal_shape ?? []).filter(isChanged).map(e => ({ d, e })));
  if (shaped.length === 0) return null;
  const misses = shaped.filter(x => !x.e.ok);
  const okCount = shaped.length - misses.length;
  const fmtDay = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

  return (
    <div style={{ background: misses.length ? C.warnBg : "#eef6f5", border: `1px solid ${misses.length ? C.warnBorder : "#cfe5e5"}`, borderRadius: 14, padding: "11px 14px", marginBottom: 14 }}>
      <button
        onClick={() => misses.length && setOpen(o => !o)}
        style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between", gap: 8, background: "none", border: "none", padding: 0, cursor: misses.length ? "pointer" : "default", textAlign: "left" }}
      >
        <span>
          <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.primary }}>
            {misses.length ? `Your day shape: ${okCount} of ${shaped.length} meals match` : `Your day shape: all ${shaped.length} meals match ✓`}
          </span>
          {misses.length > 0 && (
            <span style={{ display: "block", fontSize: 11.5, color: C.warn, marginTop: 2 }}>
              {misses.length} dish{misses.length !== 1 ? "es" : ""} can&apos;t be sized that way — {open ? "hide" : "see which"} (also marked on each day)
            </span>
          )}
        </span>
        {misses.length > 0 && <IconChevronDown size={15} color={C.warn} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }} />}
      </button>
      {open && misses.map(({ d, e }) => {
        const meal = d.meals.find(m => m.meal_type === e.meal_type);
        return (
          <div key={d.date + e.meal_type} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, borderTop: `1px solid ${C.warnBorder}`, marginTop: 9, paddingTop: 9 }}>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.primary }}>{fmtDay(d.date)} · {MEAL_LABEL[e.meal_type]}</span>
              <span style={{ display: "block", fontSize: 11.5, color: C.muted, marginTop: 1 }}>{meal?.recipe_name ?? "This dish"}: {missText(e)}</span>
            </span>
            <button onClick={() => onSwap(d.date, e.meal_type)} style={swapBtn}>Swap dish</button>
          </div>
        );
      })}
    </div>
  );
}

/** Inside a day card: the meals of THIS day that couldn't follow the shape. */
export function DayShapeAlert({ day, onSwap }: { day: PlanDay & { meal_shape?: MealShapeEntry[] }; onSwap: (mealType: string) => void }) {
  const misses = (day.meal_shape ?? []).filter(e => isChanged(e) && !e.ok);
  if (misses.length === 0) return null;
  return (
    <div style={{ margin: "10px 14px 0", background: C.warnBg, border: `1px solid ${C.warnBorder}`, borderRadius: 10, padding: "7px 10px" }}>
      {misses.map((e, i) => {
        const meal = day.meals.find(m => m.meal_type === e.meal_type);
        return (
          <div key={e.meal_type} style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between", paddingTop: i ? 6 : 0, marginTop: i ? 6 : 0, borderTop: i ? `1px solid ${C.warnBorder}` : "none" }}>
            <span style={{ display: "flex", gap: 6, alignItems: "flex-start", minWidth: 0 }}>
              <IconAlertTriangle size={13} color={C.warn} style={{ flexShrink: 0, marginTop: 2 }} />
              <span style={{ fontSize: 11.5, color: C.warn, lineHeight: 1.35 }}>
                <b>{MEAL_LABEL[e.meal_type]}</b> doesn&apos;t fit your shape — {meal?.recipe_name ?? "this dish"} {missText(e)}
              </span>
            </span>
            <button onClick={() => onSwap(e.meal_type)} style={{ ...swapBtn, padding: "4px 9px", fontSize: 11 }}>Swap</button>
          </div>
        );
      })}
    </div>
  );
}

const swapBtn: React.CSSProperties = {
  flexShrink: 0, padding: "6px 11px", borderRadius: 20, border: `1px solid ${C.tealDark}`, background: C.white,
  color: C.tealDark, fontSize: 11.5, fontWeight: 600, cursor: "pointer",
};
