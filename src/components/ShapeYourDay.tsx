"use client";

// Advanced planning v2 (beta, experiment): "Shape your day", picked in step 1
// BEFORE the plan is built. Three ways to say it:
//   - Simple: Light / Normal / Big per meal
//   - % of calories per meal
//   - Exact kcal and/or protein / carbs / fat per meal (any subset)
// Up to MAX_TYPES day types: the first covers every day no other type takes;
// each extra type owns its weekdays (e.g. Mon/Wed/Fri training days) and can
// also change that day's own totals (kcal / P / C / F).
// Flask turns these into per-meal goals (services/mealplan_service.py
// resolve_meal_goals — keep MEAL_BASE_SHARE / MEAL_SIZE_FACTOR / MEAL_MIN_SHARE
// in sync) and per-day targets (routes/mealplan_routes.py _day_base_target —
// keep TOTALS_MIN/MAX in sync). Extremes are clamped there, never rejected;
// the hints below just tell the client what will happen.
// Saved per user in user_day_shape (localStorage as an instant cache).

import { useState } from "react";
import { IconChevronDown, IconRefresh, IconPlus, IconTrash, IconAlertTriangle, IconInfoCircle } from "@tabler/icons-react";
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
export type DayTotals = ExactGoal; // empty = the client's usual daily target
export interface DayType {
  id: string;
  settings: DaySettings;
  weekdays: number[];   // Mon=0 … Sun=6; ignored for types[0]
  totals: DayTotals;
}
export interface DayShape {
  mode: ShapeMode;
  types: DayType[];     // types[0] = every day no other type takes
}
export type MealSetting = MealSize | { pct: number } | ExactGoal;
export interface DayTargets { kcal: number | null; protein: number | null; carbs: number | null; fat: number | null }

const MAX_TYPES = 4;
const TOTALS_MIN = 800, TOTALS_MAX = 6000;
const MEAL_MIN_SHARE = 0.05;
const emptySettings = (): DaySettings => ({ sizes: {}, pct: {}, exact: {} });
const newId = () => Math.random().toString(36).slice(2, 9);
export const EMPTY_SHAPE: DayShape = { mode: "simple", types: [{ id: "base", settings: emptySettings(), weekdays: [], totals: {} }] };

const posNum = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined);
function cleanGoal(v: unknown): ExactGoal {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const out: ExactGoal = {};
  for (const k of ["kcal", "protein", "carbs", "fat"] as const) { const n = posNum(o[k]); if (n != null) out[k] = n; }
  return out;
}
function cleanSettings(s: unknown): DaySettings | null {
  if (!s || typeof s !== "object") return null;
  const o = s as Record<string, unknown>;
  if ("sizes" in o || "pct" in o || "exact" in o) {
    return { sizes: (o.sizes as DaySettings["sizes"]) ?? {}, pct: (o.pct as DaySettings["pct"]) ?? {}, exact: (o.exact as DaySettings["exact"]) ?? {} };
  }
  return { ...emptySettings(), sizes: o as DaySettings["sizes"] }; // first (sizes-only) format
}
const cleanDays = (v: unknown) => Array.isArray(v) ? [...new Set(v.filter(w => Number.isInteger(w) && w >= 0 && w <= 6))] as number[] : [];

/** Any saved shape (DB jsonb or localStorage), including the older base/alt format. */
export function parseShape(j: unknown): DayShape {
  if (!j || typeof j !== "object") return EMPTY_SHAPE;
  const o = j as Record<string, unknown>;
  const mode: ShapeMode = o.mode === "pct" || o.mode === "exact" ? o.mode : "simple";
  if (Array.isArray(o.types) && o.types.length) {
    const taken = new Set<number>();
    const types = (o.types as Record<string, unknown>[]).slice(0, MAX_TYPES).map((t, i) => {
      const days = i === 0 ? [] : cleanDays(t?.weekdays).filter(w => !taken.has(w));
      days.forEach(w => taken.add(w));
      return {
        id: i === 0 ? "base" : (typeof t?.id === "string" ? t.id : newId()),
        settings: cleanSettings(t?.settings) ?? emptySettings(),
        weekdays: days,
        totals: cleanGoal(t?.totals),
      };
    });
    return { mode, types };
  }
  const hasBase = "base" in o || "alt" in o;
  const types: DayType[] = [{ id: "base", settings: (hasBase ? cleanSettings(o.base) : cleanSettings(o)) ?? emptySettings(), weekdays: [], totals: {} }];
  const alt = cleanSettings(o.alt);
  if (alt) types.push({ id: newId(), settings: alt, weekdays: cleanDays(o.altWeekdays), totals: {} });
  return { mode, types };
}
export function parseStoredShape(raw: string | null): DayShape {
  if (!raw) return EMPTY_SHAPE;
  try { return parseShape(JSON.parse(raw)); } catch { return EMPTY_SHAPE; }
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
  { key: "protein", label: "Protein", unit: "g" },
  { key: "carbs", label: "Carbs", unit: "g" },
  { key: "fat", label: "Fat", unit: "g" },
] as const;

/** The meal settings a day type sends, in the active mode (only meals that differ from automatic). */
function settingsFor(s: DaySettings | null, mode: ShapeMode, meals: string[]): Record<string, MealSetting> {
  if (!s) return {};
  const out: Record<string, MealSetting> = {};
  for (const m of meals) {
    if (mode === "simple") { const v = s.sizes[m]; if (v && v !== "normal") out[m] = v; }
    else if (mode === "pct") { const v = s.pct[m]; if (v != null && Number.isFinite(v)) out[m] = { pct: Math.min(100, Math.max(0, v)) }; }
    else {
      const clean = cleanGoal(s.exact[m]);
      if (Object.keys(clean).length) out[m] = clean;
    }
  }
  return out;
}

const hasSettings = (t: DayType, mode: ShapeMode, meals: string[]) => Object.keys(settingsFor(t.settings, mode, meals)).length > 0;
const hasTotals = (t: DayType) => Object.keys(cleanGoal(t.totals)).length > 0;
const typeInUse = (t: DayType, i: number) => i === 0 || t.weekdays.length > 0;
export const shapeIsSet = (shape: DayShape, meals: string[]) =>
  (shape.types ?? []).some((t, i) => typeInUse(t, i) && (hasSettings(t, shape.mode, meals) || hasTotals(t)));

function flaskTotals(t: DayTotals): Record<string, number> {
  const c = cleanGoal(t);
  const o: Record<string, number> = {};
  if (c.kcal) o.kcal = c.kcal;
  if (c.protein) o.protein_g = c.protein;
  if (c.carbs) o.carbs_g = c.carbs;
  if (c.fat) o.fat_g = c.fat;
  return o;
}

/** What /generate_meal_plan takes: a default plus per-weekday meal shapes and day totals. */
export function shapeRequest(shape: DayShape, meals: string[]) {
  const [base, ...others] = shape.types?.length ? shape.types : EMPTY_SHAPE.types;
  const out: {
    meal_sizes?: Record<string, MealSetting>;
    meal_sizes_by_weekday?: Record<string, Record<string, MealSetting>>;
    day_targets_by_weekday?: Record<string, Record<string, number>>;
  } = {};
  const baseSet = settingsFor(base.settings, shape.mode, meals);
  const baseTotals = flaskTotals(base.totals);
  if (Object.keys(baseSet).length) out.meal_sizes = baseSet;
  const bySizes: Record<string, Record<string, MealSetting>> = {};
  const byTotals: Record<string, Record<string, number>> = {};
  const taken = new Set<number>();
  for (const t of others) {
    const s = settingsFor(t.settings, shape.mode, meals);
    // An all-automatic day type still has to override a shaped default.
    const sizes = Object.keys(s).length ? s : Object.keys(baseSet).length ? { [meals[0]]: "normal" as MealSize } : null;
    const own = flaskTotals(t.totals);
    const totals = Object.keys(own).length ? own : baseTotals; // empty totals follow the default type
    for (const w of t.weekdays) {
      if (taken.has(w)) continue;
      taken.add(w);
      if (sizes) bySizes[w] = sizes;
      if (Object.keys(totals).length) byTotals[w] = totals;
    }
  }
  if (Object.keys(baseTotals).length) for (let w = 0; w < 7; w++) if (!taken.has(w)) byTotals[w] = baseTotals;
  if (Object.keys(bySizes).length) out.meal_sizes_by_weekday = bySizes;
  if (Object.keys(byTotals).length) out.day_targets_by_weekday = byTotals;
  return out;
}

/** The day's targets once a type's own totals apply (mirror of Flask _day_base_target). */
function effectiveTargets(n: DayTargets, totals: DayTotals): DayTargets {
  const t = cleanGoal(totals);
  if (!Object.keys(t).length || !n.kcal) return n;
  let kcal = t.kcal ?? null;
  if (kcal == null) kcal = 4 * ((t.protein ?? n.protein ?? 0) + (t.carbs ?? n.carbs ?? 0)) + 9 * (t.fat ?? n.fat ?? 0);
  kcal = Math.min(TOTALS_MAX, Math.max(TOTALS_MIN, kcal));
  const r = kcal / n.kcal;
  return {
    kcal,
    protein: t.protein ?? (n.protein != null ? n.protein * r : null),
    carbs: t.carbs ?? (n.carbs != null ? n.carbs * r : null),
    fat: t.fat ?? (n.fat != null ? n.fat * r : null),
  };
}

/** kcal per meal as Flask will aim for it (simplified mirror of resolve_meal_goals). */
function mealKcal(s: DaySettings, mode: ShapeMode, meals: string[], dayKcal: number): Record<string, number> {
  const set = settingsFor(s, mode, meals);
  const sizes = meals.map(m => set[m]).filter(v => typeof v === "string");
  const allSame = sizes.length === meals.length && new Set(sizes).size === 1;
  const minK = MEAL_MIN_SHARE * dayKcal;
  const out: Record<string, number> = {};
  const pctMeals = meals.filter(m => { const v = set[m]; return v && typeof v === "object" && "pct" in v; });
  const pctTotal = pctMeals.reduce((a, m) => a + (set[m] as { pct: number }).pct, 0);
  const scale = pctMeals.length === meals.length && pctTotal > 0 ? 100 / pctTotal : 1;
  for (const m of meals) {
    const v = set[m];
    if (v && typeof v === "object" && "pct" in v) out[m] = (v.pct * scale / 100) * dayKcal;
    else if (v && typeof v === "object") {
      const e = v as ExactGoal;
      const k = e.kcal ?? (e.protein != null && e.carbs != null && e.fat != null ? e.protein * 4 + e.carbs * 4 + e.fat * 9 : null);
      if (k != null) out[m] = Math.min(k, dayKcal);
    }
  }
  const fixed = meals.filter(m => out[m] != null);
  const rest = meals.filter(m => out[m] == null);
  for (const m of fixed) out[m] = Math.max(out[m], minK);
  const room = dayKcal - rest.length * minK;
  const fixedSum = fixed.reduce((a, m) => a + out[m], 0);
  if (rest.length && fixedSum > room && fixedSum > 0) for (const m of fixed) out[m] = Math.max(minK, out[m] * Math.max(room, 0) / fixedSum);
  const left = Math.max(dayKcal - fixed.reduce((a, m) => a + out[m], 0), rest.length * minK);
  const raw = Object.fromEntries(rest.map(m => {
    const v = set[m];
    return [m, (MEAL_BASE_SHARE[m] ?? 0.25) * (typeof v === "string" && !allSame ? MEAL_SIZE_FACTOR[v] : 1)];
  }));
  const tot = Object.values(raw).reduce((a, b) => a + b, 0) || 1;
  for (const m of rest) out[m] = Math.max(minK, left * raw[m] / tot);
  return out;
}

/** Plain-language notes for settings the planner will bend (never block). */
function extremeHints(s: DaySettings, mode: ShapeMode, meals: string[], dayKcal: number, totals: DayTotals): string[] {
  const out: string[] = [];
  const list = (ms: string[]) => ms.map(m => MEAL_LABEL[m].toLowerCase()).join(" & ");
  if (mode === "simple") {
    const vals = meals.map(m => s.sizes[m] ?? "normal");
    if (new Set(vals).size === 1 && vals[0] !== "normal") {
      out.push(`Every meal ${SIZE_LABEL[vals[0]]} keeps the same proportions as automatic — sizes are relative to each other. To eat ${vals[0] === "big" ? "more" : "less"} on these days, change Daily totals below.`);
    }
  } else if (mode === "pct") {
    const set = meals.filter(m => s.pct[m] != null);
    const zero = set.filter(m => (s.pct[m] ?? 0) < MEAL_MIN_SHARE * 100);
    const total = set.reduce((a, m) => a + (s.pct[m] ?? 0), 0);
    const missing = meals.filter(m => s.pct[m] == null);
    if (zero.length) out.push(`Every meal keeps at least ${MEAL_MIN_SHARE * 100}% of the day, so ${list(zero)} will get a little. To skip a meal, turn it off in Meal types below.`);
    if (missing.length && total >= 100 - missing.length * MEAL_MIN_SHARE * 100) {
      out.push(`That leaves almost nothing for ${list(missing)} — ${missing.length > 1 ? "each" : "it"} still gets at least ${MEAL_MIN_SHARE * 100}%, and your numbers are scaled down to make room.`);
    }
    if (!missing.length && total > 0 && total !== 100) out.push(`Your numbers add up to ${total}% — they'll be scaled to 100% keeping the same proportions.`);
  } else {
    const big = meals.filter(m => (s.exact[m]?.kcal ?? 0) > dayKcal * 0.8 && dayKcal > 0);
    if (big.length) out.push(`${list(big)} would be almost your whole day — other meals still get at least ${MEAL_MIN_SHARE * 100}% each, so it'll be trimmed.`);
  }
  const k = cleanGoal(totals).kcal;
  if (k != null && (k < TOTALS_MIN || k > TOTALS_MAX)) out.push(`Daily calories are kept between ${TOTALS_MIN} and ${TOTALS_MAX} kcal.`);
  return out;
}

const dayList = (ws: number[]) => {
  const s = [...ws].sort((a, b) => a - b);
  if (s.length >= 3 && s.every((w, i) => i === 0 || w === s[i - 1] + 1)) return `${WEEKDAYS[s[0]]}–${WEEKDAYS[s[s.length - 1]]}`;
  return s.map(w => WEEKDAYS[w]).join(", ");
};

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

function NumBox({ value, onChange, placeholder, suffix, label, width = 58, max }: {
  value: number | undefined; onChange: (v: number | undefined) => void; placeholder: string; suffix: string; label: string; width?: number | string; max?: number;
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
          if (Number.isFinite(n) && n >= 0) onChange(Math.round(max != null ? Math.min(n, max) : n));
        }}
        style={{ width: "100%", minWidth: 0, border: "none", outline: "none", background: "transparent", fontSize: 13, fontWeight: 600, color: C.primary, textAlign: "right", padding: 0 }}
      />
      <span style={{ fontSize: 11, color: C.light, flexShrink: 0 }}>{suffix}</span>
    </label>
  );
}

const Hint = ({ text }: { text: string }) => (
  <p style={{ display: "flex", gap: 6, alignItems: "flex-start", margin: "8px 0 0", fontSize: 11.5, color: C.warn, lineHeight: 1.4 }}>
    <IconInfoCircle size={13} style={{ flexShrink: 0, marginTop: 2 }} />{text}
  </p>
);

export default function ShapeYourDay({
  shape, onChange, meals, targets, weekendsOn, savedLabel = "Saved for your next orders.",
}: {
  shape: DayShape;
  onChange: (s: DayShape) => void;
  meals: string[];               // included meal types
  targets: DayTargets;           // the client's usual day targets
  weekendsOn: boolean;
  savedLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState("base");
  const [totalsOpen, setTotalsOpen] = useState(false);
  const ordered = MEAL_ORDER.filter(m => meals.includes(m));
  if (ordered.length < 2) return null; // one meal a day: nothing to move calories between

  const types = shape.types?.length ? shape.types : EMPTY_SHAPE.types;
  const idx = Math.max(0, types.findIndex(t => t.id === activeId));
  const active = types[idx];
  const isBase = idx === 0;
  const days = weekendsOn ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4];
  const takenBy = (w: number) => types.findIndex((t, i) => i > 0 && t.weekdays.includes(w));
  const baseDays = days.filter(w => takenBy(w) < 0);
  const hasOthers = types.length > 1;

  const updateType = (i: number, patch: Partial<DayType>) =>
    onChange({ ...shape, types: types.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const setSettings = (next: DaySettings) => updateType(idx, { settings: next });
  const setTotals = (next: DayTotals) => updateType(idx, { totals: next });
  const toggleDay = (w: number) => {
    const on = active.weekdays.includes(w);
    onChange({
      ...shape,
      types: types.map((t, j) => {
        if (j === idx) return { ...t, weekdays: on ? t.weekdays.filter(x => x !== w) : [...t.weekdays, w] };
        return on ? t : { ...t, weekdays: t.weekdays.filter(x => x !== w) }; // a weekday belongs to one type
      }),
    });
  };
  const addType = () => {
    const t: DayType = { id: newId(), settings: JSON.parse(JSON.stringify(active.settings)), weekdays: [], totals: {} };
    onChange({ ...shape, types: [...types, t] });
    setActiveId(t.id);
  };
  const removeType = () => {
    onChange({ ...shape, types: types.filter((_, j) => j !== idx) });
    setActiveId("base");
  };

  const typeLabel = (t: DayType, i: number) =>
    i === 0 ? (hasOthers ? (baseDays.length ? dayList(baseDays) : "Other days") : "Every day")
            : (t.weekdays.length ? dayList(t.weekdays) : "Pick days");

  const dayT = effectiveTargets(targets, active.totals);
  const dayKcal = dayT.kcal ?? 0;
  const kcalSplit = mealKcal(active.settings, shape.mode, ordered, dayKcal || 1000);
  const set = shapeIsSet(shape, ordered);
  const hints = extremeHints(active.settings, shape.mode, ordered, dayKcal, active.totals);

  const describe = (t: DayType): string => {
    const v = settingsFor(t.settings, shape.mode, ordered);
    const parts = ordered.filter(m => v[m] != null).map(m => {
      const x = v[m];
      if (typeof x === "string") return `${SIZE_LABEL[x]} ${MEAL_LABEL[m].toLowerCase()}`;
      if ("pct" in x) return `${MEAL_LABEL[m]} ${x.pct}%`;
      const e = x as ExactGoal;
      return `${MEAL_LABEL[m]} ${[e.kcal != null && `${e.kcal} kcal`, e.protein != null && `${e.protein}P`, e.carbs != null && `${e.carbs}C`, e.fat != null && `${e.fat}F`].filter(Boolean).join(" ")}`;
    });
    const tot = cleanGoal(t.totals);
    if (tot.kcal) parts.unshift(`${tot.kcal} kcal day`);
    else if (Object.keys(tot).length) parts.unshift("own macros");
    return parts.length ? parts.join(" · ") : "Automatic";
  };
  const headline = types
    .map((t, i) => ({ t, i }))
    .filter(({ t, i }) => typeInUse(t, i))
    .map(({ t, i }) => (hasOthers ? `${typeLabel(t, i)}: ${describe(t)}` : describe(t)))
    .join("  |  ");

  // Live totals for the precise modes.
  const s = active.settings;
  const pctTotal = ordered.reduce((a, m) => a + (s.pct[m] ?? 0), 0);
  const pctMissing = ordered.filter(m => s.pct[m] == null);
  const exactSum = (k: keyof ExactGoal) => ordered.reduce((a, m) => a + (s.exact[m]?.[k] ?? 0), 0);
  const ownTotals = hasTotals(active);
  const baseTotalsSet = !isBase && hasTotals(types[0]);
  const fmtT = (t: DayTargets) =>
    [t.kcal != null && `${Math.round(t.kcal)} kcal`, t.protein != null && `${Math.round(t.protein)}P`, t.carbs != null && `${Math.round(t.carbs)}C`, t.fat != null && `${Math.round(t.fat)}F`].filter(Boolean).join(" · ");

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
            {set ? headline : "Bigger lunch, training days… — optional"}
          </p>
        </div>
        <IconChevronDown size={16} color={C.light} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }} />
      </button>

      {open && (
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderTop: "none", borderRadius: "0 0 12px 12px", padding: "12px 16px 14px" }}>
          {/* Day types */}
          <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: 0.4 }}>Day types</p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            {types.map((t, i) => {
              const on = i === idx;
              return (
                <button
                  key={t.id} onClick={() => setActiveId(t.id)} aria-pressed={on}
                  style={{
                    padding: "7px 12px", borderRadius: 20, cursor: "pointer", fontSize: 12,
                    border: `1.5px solid ${on ? C.tealDark : C.border}`,
                    background: on ? "#f0f7f7" : C.white, color: on ? C.tealDark : C.muted,
                    fontWeight: on ? 700 : 500, fontStyle: i > 0 && !t.weekdays.length ? "italic" : "normal",
                  }}
                >{typeLabel(t, i)}</button>
              );
            })}
            {types.length < MAX_TYPES && (
              <button onClick={addType} style={{ ...linkBtn, borderStyle: "dashed", padding: "7px 12px" }}>
                <IconPlus size={13} /> Add day type
              </button>
            )}
          </div>

          {!isBase && (
            <div style={{ marginBottom: 12 }}>
              <p style={{ margin: "0 0 6px", fontSize: 11.5, color: C.muted }}>Use on:</p>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {days.map(w => {
                  const on = active.weekdays.includes(w);
                  const elsewhere = !on && takenBy(w) > 0;
                  return (
                    <button
                      key={w} onClick={() => toggleDay(w)}
                      title={elsewhere ? `Move ${WEEKDAYS[w]} here from ${typeLabel(types[takenBy(w)], takenBy(w))}` : undefined}
                      style={{
                        padding: "6px 10px", borderRadius: 20, fontSize: 12, cursor: "pointer",
                        border: `1.5px ${elsewhere ? "dashed" : "solid"} ${on ? C.tealDark : C.border}`,
                        background: on ? C.tealDark : C.white, color: on ? C.white : elsewhere ? C.light : C.muted, fontWeight: on ? 700 : 500,
                      }}
                    >{WEEKDAYS[w]}</button>
                  );
                })}
              </div>
              {active.weekdays.length === 0 && <p style={{ margin: "6px 0 0", fontSize: 11, color: C.light }}>Pick the days this applies to — a day can only be in one type.</p>}
            </div>
          )}
          {isBase && hasOthers && (
            <p style={{ margin: "-4px 0 12px", fontSize: 11.5, color: C.muted }}>
              {baseDays.length ? `Used on ${dayList(baseDays)} — every day no other type takes.` : "Every day is taken by another type, so this one isn't used."}
            </p>
          )}

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
              ? "Fill in only what matters to you — anything left empty is planned automatically. Your daily totals still apply."
              : "Your daily totals stay the same — this only moves food between meals."}
          </p>

          <SplitBar kcal={kcalSplit} meals={ordered} showKcal={!!dayKcal} />

          {shape.mode === "simple" && ordered.map(m => (
            <SizeRow key={m} meal={m} value={s.sizes[m] ?? "normal"} onChange={v => setSettings({ ...s, sizes: { ...s.sizes, [m]: v } })} />
          ))}

          {shape.mode === "pct" && (
            <>
              {ordered.map(m => (
                <div key={m} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "6px 0" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, fontWeight: 600, color: "#1a1a1a" }}>
                    <Dot meal={m} />{MEAL_LABEL[m]}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {dayKcal > 0 && s.pct[m] != null && (
                      <span style={{ fontSize: 11, color: C.light }}>~{Math.round((kcalSplit[m] ?? 0) / 10) * 10} kcal</span>
                    )}
                    <NumBox
                      label={`${MEAL_LABEL[m]} percent of calories`} placeholder="auto" suffix="%" width={74} max={100}
                      value={s.pct[m]}
                      onChange={v => setSettings({ ...s, pct: { ...s.pct, [m]: v } })}
                    />
                  </span>
                </div>
              ))}
              <p style={{ margin: "8px 0 0", fontSize: 11.5, fontWeight: 600, color: pctMissing.length === 0 && pctTotal !== 100 ? C.warn : C.tealDark }}>
                {pctMissing.length === 0
                  ? (pctTotal === 100 ? "Total 100% ✓" : `Total ${pctTotal}%`)
                  : `${pctTotal}% set · the other ${Math.max(0, 100 - pctTotal)}% goes to ${pctMissing.map(m => MEAL_LABEL[m].toLowerCase()).join(" & ")}`}
              </p>
            </>
          )}

          {shape.mode === "exact" && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr repeat(4, 54px)", gap: 5, alignItems: "center", fontSize: 10.5, color: C.light, marginBottom: 2 }}>
                <span />
                {MACROS.map(x => <span key={x.key} style={{ textAlign: "center" }}>{x.label}</span>)}
              </div>
              {ordered.map(m => (
                <div key={m} style={{ display: "grid", gridTemplateColumns: "1fr repeat(4, 54px)", gap: 5, alignItems: "center", padding: "4px 0" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: "#1a1a1a", minWidth: 0 }}>
                    <Dot meal={m} /><span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{MEAL_LABEL[m]}</span>
                  </span>
                  {MACROS.map(x => (
                    <NumBox
                      key={x.key} width={54} label={`${MEAL_LABEL[m]} ${x.key}`} placeholder="–" suffix={x.unit}
                      value={s.exact[m]?.[x.key]}
                      onChange={v => setSettings({ ...s, exact: { ...s.exact, [m]: { ...s.exact[m], [x.key]: v } } })}
                    />
                  ))}
                </div>
              ))}
              <div style={{ display: "grid", gridTemplateColumns: "1fr repeat(4, 54px)", gap: 5, alignItems: "center", marginTop: 6, paddingTop: 6, borderTop: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 11, color: C.muted }}>Set / your day</span>
                {MACROS.map(x => {
                  const t = dayT[x.key];
                  const sum = exactSum(x.key);
                  const over = t != null && sum > t * 1.03;
                  return (
                    <span key={x.key} style={{ textAlign: "center", fontSize: 10.5, lineHeight: 1.25, color: over ? C.warn : C.muted, fontWeight: over ? 700 : 500 }}>
                      {sum || "–"}<br />/{t != null ? Math.round(t) : "?"}
                    </span>
                  );
                })}
              </div>
              {MACROS.some(x => dayT[x.key] != null && exactSum(x.key) > (dayT[x.key] ?? 0) * 1.03) && (
                <Hint text="More than your daily total — the plan will get as close as it can. Raise Daily totals below if you meant a bigger day." />
              )}
            </>
          )}

          {hints.map(h => <Hint key={h} text={h} />)}

          {/* Daily totals for this day type */}
          <div style={{ marginTop: 14, border: `1px solid ${ownTotals ? C.teal : C.border}`, borderRadius: 10, padding: "9px 11px" }}>
            <button
              onClick={() => setTotalsOpen(o => !o)}
              style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center", gap: 8, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
            >
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "#1a1a1a" }}>Daily totals{hasOthers ? ` · ${typeLabel(active, idx)}` : ""}</span>
                <span style={{ display: "block", fontSize: 11, color: ownTotals ? C.tealDark : C.light, marginTop: 1 }}>
                  {ownTotals ? fmtT(dayT) : baseTotalsSet ? `Same as ${typeLabel(types[0], 0)} (${fmtT(effectiveTargets(targets, types[0].totals))})` : `Your usual (${fmtT(targets)})`}
                </span>
              </span>
              <IconChevronDown size={15} color={C.light} style={{ transform: totalsOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }} />
            </button>
            {totalsOpen && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginTop: 10 }}>
                  {MACROS.map(x => (
                    <div key={x.key}>
                      <p style={{ margin: "0 0 3px", fontSize: 10.5, color: C.light, textAlign: "center" }}>{x.label}</p>
                      <NumBox
                        width="100%" label={`Daily ${x.key}`} suffix={x.unit}
                        placeholder={targets[x.key] != null ? String(Math.round(targets[x.key]!)) : "–"}
                        value={active.totals[x.key]}
                        onChange={v => setTotals({ ...active.totals, [x.key]: v })}
                      />
                    </div>
                  ))}
                </div>
                <p style={{ margin: "8px 0 0", fontSize: 11, color: C.muted, lineHeight: 1.4 }}>
                  Only for {hasOthers ? typeLabel(active, idx) : "these orders"} — your profile stays the same. Set just calories and the macros follow; set just grams and the calories follow.
                </p>
                {ownTotals && (
                  <button onClick={() => setTotals({})} style={{ ...linkBtn, marginTop: 8 }}>
                    <IconRefresh size={13} /> Back to {baseTotalsSet ? typeLabel(types[0], 0) : "my usual"}
                  </button>
                )}
              </>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            {!isBase ? (
              <button onClick={removeType} style={linkBtn}>
                <IconTrash size={13} /> Remove this day type
              </button>
            ) : <span />}
            {set && (
              <button onClick={() => { onChange({ ...EMPTY_SHAPE, mode: shape.mode }); setActiveId("base"); }} style={linkBtn}>
                <IconRefresh size={13} /> Back to automatic
              </button>
            )}
          </div>
          {set && <p style={{ margin: "10px 0 0", fontSize: 10.5, color: C.light }}>{savedLabel}</p>}
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
