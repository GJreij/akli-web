"use client";

// Advanced planning v2 (beta, experiment): the "Your day" card in step 1,
// picked BEFORE the plan is built. It holds:
//   - which meals are included (the old Meal types card, for beta clients)
//   - day types (e.g. Training / Rest), each owning its weekdays, with its
//     own meal split and optionally its own day totals
//   - the meal split, three ways:
//       Simple   Light / Normal / Big per meal
//       Calories kcal OR % per meal (the other is shown)
//       Macros   grams per meal (calories follow)
//     Meals left empty share what's left of the day: usual proportions or
//     evenly ("_rest": "even").
// Flask turns these into per-meal goals (services/mealplan_service.py
// resolve_meal_goals — keep MEAL_BASE_SHARE / MEAL_SIZE_FACTOR / MEAL_MIN_SHARE
// in sync) and per-day targets (routes/mealplan_routes.py _day_base_target —
// keep TOTALS_MIN/MAX in sync). Extremes are clamped there, never rejected;
// the hints below only tell the client what will happen.
// Saved per user in user_day_shape (localStorage as an instant cache).

import { useState, type ReactNode } from "react";
import {
  IconChevronDown, IconRefresh, IconPlus, IconTrash, IconAlertTriangle, IconInfoCircle,
  IconBarbell, IconMoon, IconCalendar, IconPencil,
} from "@tabler/icons-react";
import type { PlanDay } from "@/lib/flask";

const C = {
  primary: "#063330", teal: "#67b1b0", tealDark: "#437b7b", offWhite: "#eee9e6",
  muted: "#5c5c5c", light: "#9a9a9a", border: "#e0dbd5", white: "#ffffff",
  warn: "#b8860b", warnBg: "#fbf3df", warnBorder: "#ecd9a8",
};

export type MealSize = "light" | "normal" | "big";
export type ShapeMode = "simple" | "kcal" | "macros";
export type RestSplit = "usual" | "even";
export interface CalGoal { kcal?: number; pct?: number }          // one of the two
export interface GramGoal { protein?: number; carbs?: number; fat?: number }
export interface DaySettings {
  sizes: Partial<Record<string, MealSize>>;
  cal: Partial<Record<string, CalGoal>>;
  grams: Partial<Record<string, GramGoal>>;
  rest: RestSplit;
}
export interface DayTotals {
  mode: "kcal" | "grams";
  kcal?: number; proteinPct?: number; carbsPct?: number; fatPct?: number;  // "kcal + %"
  protein?: number; carbs?: number; fat?: number;                         // "grams"
}
export type DayKind = "training" | "rest";
export interface DayType {
  id: string;
  name: string;         // "" = default label
  kind?: DayKind;       // only picks the icon
  settings: DaySettings;
  weekdays: number[];   // Mon=0 … Sun=6; ignored for types[0]
  totals: DayTotals;    // empty = follow types[0], or the client's usual target
}
export interface DayShape {
  mode: ShapeMode;
  types: DayType[];     // types[0] = every day no other type takes
}
export type MealSetting = MealSize | { pct: number } | { kcal?: number; protein?: number; carbs?: number; fat?: number };
export interface DayTargets { kcal: number | null; protein: number | null; carbs: number | null; fat: number | null }

const MAX_TYPES = 4;
const TOTALS_MIN = 800, TOTALS_MAX = 6000;
const MEAL_MIN_SHARE = 0.05;
const emptySettings = (): DaySettings => ({ sizes: {}, cal: {}, grams: {}, rest: "usual" });
const emptyTotals = (): DayTotals => ({ mode: "kcal" });
const newId = () => Math.random().toString(36).slice(2, 9);
const baseType = (): DayType => ({ id: "base", name: "", settings: emptySettings(), weekdays: [], totals: emptyTotals() });
export const EMPTY_SHAPE: DayShape = { mode: "simple", types: [baseType()] };
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

// ── Parsing saved shapes (any older format too) ───────────────────────────────
const posNum = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined);
const pctNum = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.min(100, v) : undefined);
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? v as Obj : {});
function cleanGrams(v: unknown): GramGoal {
  const o = obj(v); const out: GramGoal = {};
  for (const k of ["protein", "carbs", "fat"] as const) { const n = posNum(o[k]); if (n != null) out[k] = n; }
  return out;
}
function cleanSettings(s: unknown): DaySettings | null {
  if (!s || typeof s !== "object") return null;
  const o = s as Obj;
  const out = emptySettings();
  if (!("sizes" in o || "pct" in o || "exact" in o || "cal" in o || "grams" in o)) {
    out.sizes = o as DaySettings["sizes"]; // first (sizes-only) format
    return out;
  }
  out.sizes = obj(o.sizes) as DaySettings["sizes"];
  out.rest = o.rest === "even" ? "even" : "usual";
  for (const [m, v] of Object.entries(obj(o.cal))) {
    const k = posNum(obj(v).kcal), p = pctNum(obj(v).pct);
    if (k != null) out.cal[m] = { kcal: k }; else if (p != null) out.cal[m] = { pct: p };
  }
  for (const [m, v] of Object.entries(obj(o.grams))) { const g = cleanGrams(v); if (Object.keys(g).length) out.grams[m] = g; }
  // older modes: pct -> Calories, exact -> Calories (kcal) + Macros (grams)
  for (const [m, v] of Object.entries(obj(o.pct))) { const p = pctNum(v); if (p != null && !out.cal[m]) out.cal[m] = { pct: p }; }
  for (const [m, v] of Object.entries(obj(o.exact))) {
    const k = posNum(obj(v).kcal); if (k != null && !out.cal[m]) out.cal[m] = { kcal: k };
    const g = cleanGrams(v); if (Object.keys(g).length && !out.grams[m]) out.grams[m] = g;
  }
  return out;
}
function cleanTotals(v: unknown): DayTotals {
  const o = obj(v);
  const t: DayTotals = { mode: o.mode === "grams" ? "grams" : "kcal" };
  const k = posNum(o.kcal); if (k != null) t.kcal = k;
  for (const x of ["proteinPct", "carbsPct", "fatPct"] as const) { const p = pctNum(o[x]); if (p != null) t[x] = p; }
  Object.assign(t, cleanGrams(o));
  if (o.mode == null && k == null && (t.protein || t.carbs || t.fat)) t.mode = "grams"; // older {protein,…}
  return t;
}
const cleanDays = (v: unknown) => Array.isArray(v) ? [...new Set(v.filter(w => Number.isInteger(w) && w >= 0 && w <= 6))] as number[] : [];

/** Any saved shape (DB jsonb or localStorage), including older formats. */
export function parseShape(j: unknown): DayShape {
  if (!j || typeof j !== "object") return EMPTY_SHAPE;
  const o = j as Obj;
  const anyGrams = (ts: DayType[]) => ts.some(t => Object.keys(t.settings.grams).length);
  let types: DayType[];
  if (Array.isArray(o.types) && o.types.length) {
    const taken = new Set<number>();
    types = (o.types as Obj[]).slice(0, MAX_TYPES).map((t, i) => {
      const days = i === 0 ? [] : cleanDays(t?.weekdays).filter(w => !taken.has(w));
      days.forEach(w => taken.add(w));
      return {
        id: i === 0 ? "base" : (typeof t?.id === "string" ? t.id : newId()),
        name: typeof t?.name === "string" ? t.name.slice(0, 24) : "",
        kind: t?.kind === "training" || t?.kind === "rest" ? t.kind : undefined,
        settings: cleanSettings(t?.settings) ?? emptySettings(),
        weekdays: days,
        totals: cleanTotals(t?.totals),
      };
    });
  } else {
    const hasBase = "base" in o || "alt" in o;
    types = [{ ...baseType(), settings: (hasBase ? cleanSettings(o.base) : cleanSettings(o)) ?? emptySettings() }];
    const alt = cleanSettings(o.alt);
    if (alt) types.push({ id: newId(), name: "", settings: alt, weekdays: cleanDays(o.altWeekdays), totals: emptyTotals() });
  }
  const mode: ShapeMode =
    o.mode === "kcal" || o.mode === "macros" || o.mode === "simple" ? o.mode
    : o.mode === "pct" ? "kcal"
    : o.mode === "exact" ? (anyGrams(types) ? "macros" : "kcal")
    : "simple";
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
const MODE_LABEL: Record<ShapeMode, string> = { simple: "Simple", kcal: "Calories", macros: "Macros" };
const GRAM_KEYS = [
  { key: "protein", label: "Protein", short: "P", kcal: 4 },
  { key: "carbs", label: "Carbs", short: "C", kcal: 4 },
  { key: "fat", label: "Fat", short: "F", kcal: 9 },
] as const;
type GramKey = typeof GRAM_KEYS[number]["key"];
const r10 = (n: number) => Math.round(n / 10) * 10;
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const mealsText = (ms: string[]) => ms.map(m => MEAL_LABEL[m].toLowerCase()).join(" & ");

// ── What gets sent ────────────────────────────────────────────────────────────
/** Per-meal settings a day type sends in the active mode (only meals that differ from automatic). */
function settingsFor(s: DaySettings, mode: ShapeMode, meals: string[]): Record<string, MealSetting> {
  const out: Record<string, MealSetting> = {};
  for (const m of meals) {
    if (mode === "simple") { const v = s.sizes[m]; if (v && v !== "normal") out[m] = v; }
    else if (mode === "kcal") {
      const v = s.cal[m];
      if (v?.kcal != null && v.kcal > 0) out[m] = { kcal: v.kcal };
      else if (v?.pct != null && Number.isFinite(v.pct)) out[m] = { pct: Math.min(100, Math.max(0, v.pct)) };
    } else {
      const g = cleanGrams(s.grams[m]);
      if (Object.keys(g).length) out[m] = g;
    }
  }
  return out;
}
function requestFor(s: DaySettings, mode: ShapeMode, meals: string[]): Record<string, MealSetting | "even"> {
  const v: Record<string, MealSetting | "even"> = settingsFor(s, mode, meals);
  if (Object.keys(v).length && mode !== "simple" && s.rest === "even") v._rest = "even";
  return v;
}

const usualPct = (n: DayTargets) => {
  const k = n.kcal || 0;
  if (!k || n.protein == null || n.carbs == null || n.fat == null) return { protein: 30, carbs: 40, fat: 30 };
  return { protein: n.protein * 4 / k * 100, carbs: n.carbs * 4 / k * 100, fat: n.fat * 9 / k * 100 };
};
const hasTotals = (t: DayTotals) =>
  t.mode === "grams" ? !!(t.protein || t.carbs || t.fat) : !!(t.kcal || t.proteinPct != null || t.carbsPct != null || t.fatPct != null);

/** The protein/carbs/fat % a "kcal + %" total uses: typed ones stay, empty ones
 *  share what's left of 100 in their usual proportion. Only if the typed ones
 *  alone pass 100 (or all three are typed and miss 100) is everything scaled.
 *  raw = what the client typed adds up to, for the hint. */
function totalsPct(t: DayTotals, n: DayTargets) {
  const u = usualPct(n);
  const typed = { protein: t.proteinPct, carbs: t.carbsPct, fat: t.fatPct };
  const keys = ["protein", "carbs", "fat"] as const;
  const typedSum = keys.reduce((a, k) => a + (typed[k] ?? 0), 0);
  const empty = keys.filter(k => typed[k] == null);
  const p = { protein: 0, carbs: 0, fat: 0 };
  const left = Math.max(0, 100 - typedSum);
  const uSum = empty.reduce((a, k) => a + u[k], 0) || 1;
  for (const k of keys) p[k] = typed[k] ?? left * u[k] / uSum;
  const sum = p.protein + p.carbs + p.fat || 1;
  const scale = sum > 100.5 || (!empty.length && Math.abs(sum - 100) > 0.5) ? 100 / sum : 1;
  return { protein: p.protein * scale, carbs: p.carbs * scale, fat: p.fat * scale, raw: empty.length ? Math.max(typedSum, sum) : typedSum, scaled: scale !== 1 };
}

/** A day type's totals as Flask's day_targets_by_weekday entry. */
function flaskTotals(t: DayTotals, n: DayTargets): Record<string, number> {
  if (!hasTotals(t)) return {};
  if (t.mode === "grams") {
    const o: Record<string, number> = {};
    if (t.protein) o.protein_g = t.protein;
    if (t.carbs) o.carbs_g = t.carbs;
    if (t.fat) o.fat_g = t.fat;
    return o;
  }
  const k = t.kcal ?? n.kcal;
  if (!k) return {};
  const anyPct = t.proteinPct != null || t.carbsPct != null || t.fatPct != null;
  if (!anyPct) return { kcal: k };
  const p = totalsPct(t, n);
  return { kcal: k, protein_g: Math.round(k * p.protein / 400), carbs_g: Math.round(k * p.carbs / 400), fat_g: Math.round(k * p.fat / 900) };
}

/** Mirror of Flask _day_base_target: the day's targets once a totals override applies. */
function applyTotals(n: DayTargets, ov: Record<string, number>): DayTargets {
  if (!Object.keys(ov).length || !n.kcal) return n;
  const P = ov.protein_g, Cb = ov.carbs_g, F = ov.fat_g;
  let kcal = ov.kcal ?? null;
  if (kcal == null) kcal = 4 * ((P ?? n.protein ?? 0) + (Cb ?? n.carbs ?? 0)) + 9 * (F ?? n.fat ?? 0);
  kcal = Math.min(TOTALS_MAX, Math.max(TOTALS_MIN, kcal));
  const r = kcal / n.kcal;
  return {
    kcal,
    protein: P ?? (n.protein != null ? n.protein * r : null),
    carbs: Cb ?? (n.carbs != null ? n.carbs * r : null),
    fat: F ?? (n.fat != null ? n.fat * r : null),
  };
}

/** The totals a type actually uses: its own, else the first type's. */
const typeTotals = (types: DayType[], i: number) => (i > 0 && !hasTotals(types[i].totals) ? types[0].totals : types[i].totals);

const typeInUse = (t: DayType, i: number) => i === 0 || t.weekdays.length > 0;
export const shapeIsSet = (shape: DayShape, meals: string[]) =>
  (shape.types ?? []).some((t, i) => typeInUse(t, i) && (Object.keys(settingsFor(t.settings, shape.mode, meals)).length > 0 || hasTotals(t.totals)));

/** What /generate_meal_plan takes: a default plus per-weekday meal shapes and day totals. */
export function shapeRequest(shape: DayShape, meals: string[], usual: DayTargets = { kcal: null, protein: null, carbs: null, fat: null }) {
  const types = shape.types?.length ? shape.types : EMPTY_SHAPE.types;
  const [base, ...others] = types;
  const out: {
    meal_sizes?: Record<string, MealSetting | "even">;
    meal_sizes_by_weekday?: Record<string, Record<string, MealSetting | "even">>;
    day_targets_by_weekday?: Record<string, Record<string, number>>;
  } = {};
  const baseSet = requestFor(base.settings, shape.mode, meals);
  const baseTotals = flaskTotals(base.totals, usual);
  if (Object.keys(baseSet).length) out.meal_sizes = baseSet;
  const bySizes: Record<string, Record<string, MealSetting | "even">> = {};
  const byTotals: Record<string, Record<string, number>> = {};
  const taken = new Set<number>();
  others.forEach((t, j) => {
    const s = requestFor(t.settings, shape.mode, meals);
    // An all-automatic day type still has to override a shaped default.
    const sizes = Object.keys(s).length ? s : Object.keys(baseSet).length ? { [meals[0]]: "normal" as MealSize } : null;
    const totals = flaskTotals(typeTotals(types, j + 1), usual);
    for (const w of t.weekdays) {
      if (taken.has(w)) continue;
      taken.add(w);
      if (sizes) bySizes[w] = sizes;
      if (Object.keys(totals).length) byTotals[w] = totals;
    }
  });
  if (Object.keys(baseTotals).length) for (let w = 0; w < 7; w++) if (!taken.has(w)) byTotals[w] = baseTotals;
  if (Object.keys(bySizes).length) out.meal_sizes_by_weekday = bySizes;
  if (Object.keys(byTotals).length) out.day_targets_by_weekday = byTotals;
  return out;
}

// ── Live preview (simplified mirror of resolve_meal_goals) ───────────────────
interface MealPlanPreview {
  kcal: Record<string, number>;
  grams: Record<string, Record<GramKey, number>>;
  fixed: Set<string>;      // meals whose calories the client set
}
function preview(s: DaySettings, mode: ShapeMode, meals: string[], day: DayTargets): MealPlanPreview {
  const dayKcal = day.kcal || 1000;
  const set = settingsFor(s, mode, meals);
  const sizes = meals.map(m => set[m]).filter(v => typeof v === "string");
  const allSame = sizes.length === meals.length && new Set(sizes).size === 1;
  const minK = MEAL_MIN_SHARE * dayKcal;
  const kcal: Record<string, number> = {};
  const pctMeals = meals.filter(m => { const v = set[m]; return v && typeof v === "object" && "pct" in v; });
  const pctTotal = pctMeals.reduce((a, m) => a + (set[m] as { pct: number }).pct, 0);
  const scale = pctMeals.length === meals.length && pctTotal > 0 ? 100 / pctTotal : 1;
  for (const m of meals) {
    const v = set[m] as Record<string, number> | string | undefined;
    if (!v || typeof v === "string") continue;
    if (v.pct != null) kcal[m] = (v.pct * scale / 100) * dayKcal;
    else if (v.kcal != null) kcal[m] = Math.min(v.kcal, dayKcal);
    else if (v.protein != null && v.carbs != null && v.fat != null) kcal[m] = Math.min(v.protein * 4 + v.carbs * 4 + v.fat * 9, dayKcal);
  }
  const fixed = meals.filter(m => kcal[m] != null);
  const rest = meals.filter(m => kcal[m] == null);
  for (const m of fixed) kcal[m] = Math.max(kcal[m], minK);
  const room = dayKcal - rest.length * minK;
  const fixedSum = fixed.reduce((a, m) => a + kcal[m], 0);
  if (rest.length && fixedSum > room && fixedSum > 0) for (const m of fixed) kcal[m] = Math.max(minK, kcal[m] * Math.max(room, 0) / fixedSum);
  const left = Math.max(dayKcal - fixed.reduce((a, m) => a + kcal[m], 0), rest.length * minK);
  const even = mode !== "simple" && s.rest === "even" && fixed.length + Object.keys(set).length > 0;
  const raw = Object.fromEntries(rest.map(m => {
    const v = set[m];
    const f = typeof v === "string" && !allSame ? MEAL_SIZE_FACTOR[v] : 1;
    return [m, (even ? 1 : MEAL_BASE_SHARE[m] ?? 0.25) * f];
  }));
  const tot = Object.values(raw).reduce((a, b) => a + b, 0) || 1;
  for (const m of rest) kcal[m] = Math.max(minK, left * raw[m] / tot);

  // Grams: typed ones stay; the rest of each macro follows calories.
  const grams: Record<string, Record<GramKey, number>> = Object.fromEntries(meals.map(m => [m, { protein: 0, carbs: 0, fat: 0 }]));
  for (const { key } of GRAM_KEYS) {
    const dayG = day[key] ?? 0;
    const typed = mode === "macros" ? meals.filter(m => s.grams[m]?.[key] != null) : [];
    const typedSum = typed.reduce((a, m) => a + (s.grams[m]![key] ?? 0), 0);
    for (const m of typed) grams[m][key] = s.grams[m]![key]!;
    const others = meals.filter(m => !typed.includes(m));
    const kSum = others.reduce((a, m) => a + kcal[m], 0) || 1;
    for (const m of others) grams[m][key] = Math.max(0, dayG - typedSum) * kcal[m] / kSum;
  }
  return { kcal, grams, fixed: new Set(fixed) };
}

/** Plain-language notes for settings the planner will bend (never block). */
function extremeHints(s: DaySettings, mode: ShapeMode, meals: string[], day: DayTargets, totals: DayTotals, usual: DayTargets): string[] {
  const out: string[] = [];
  const dayKcal = day.kcal ?? 0;
  if (mode === "simple") {
    const vals = meals.map(m => s.sizes[m] ?? "normal");
    if (new Set(vals).size === 1 && vals[0] !== "normal") {
      out.push(`Every meal ${SIZE_LABEL[vals[0]]} keeps the same proportions as automatic — sizes are relative to each other. To eat ${vals[0] === "big" ? "more" : "less"} on these days, change the totals below.`);
    }
  } else if (mode === "kcal") {
    const set = settingsFor(s, mode, meals);
    const pctOf = (m: string) => { const v = set[m] as CalGoal | undefined; return v?.pct ?? (v?.kcal != null && dayKcal ? v.kcal / dayKcal * 100 : null); };
    const tiny = meals.filter(m => { const p = pctOf(m); return p != null && p < MEAL_MIN_SHARE * 100; });
    const free = meals.filter(m => set[m] == null);
    const total = meals.reduce((a, m) => a + (pctOf(m) ?? 0), 0);
    if (tiny.length) out.push(`Every meal keeps at least ${MEAL_MIN_SHARE * 100}% of the day, so ${mealsText(tiny)} will get a little. To skip a meal, turn it off above.`);
    if (free.length && total >= 100 - free.length * MEAL_MIN_SHARE * 100) {
      out.push(`That leaves almost nothing for ${mealsText(free)} — ${free.length > 1 ? "each" : "it"} still gets at least ${MEAL_MIN_SHARE * 100}%, and your numbers are scaled down to make room.`);
    }
    const allPct = meals.every(m => (set[m] as CalGoal | undefined)?.pct != null);
    if (!free.length && total > 0 && Math.abs(total - 100) > 2) {
      out.push(allPct
        ? `Your meals add up to ${Math.round(total)}% — they'll be scaled to 100% keeping the same proportions.`
        : `Your meals add up to ${fmt(total / 100 * dayKcal)} kcal but the day is ${fmt(dayKcal)} — the plan gets as close as it can. Change the totals below if you meant a ${total > 100 ? "bigger" : "smaller"} day.`);
    }
  } else {
    for (const { key, label } of GRAM_KEYS) {
      const sum = meals.reduce((a, m) => a + (s.grams[m]?.[key] ?? 0), 0);
      const t = day[key];
      if (t != null && sum > t * 1.03) out.push(`${label} adds up to ${fmt(sum)} g but the day is ${fmt(t)} g — the plan gets as close as it can. Change the totals below if you meant more.`);
    }
  }
  const tk = flaskTotals(totals, usual);
  const k = tk.kcal ?? (Object.keys(tk).length ? 4 * ((tk.protein_g ?? usual.protein ?? 0) + (tk.carbs_g ?? usual.carbs ?? 0)) + 9 * (tk.fat_g ?? usual.fat ?? 0) : null);
  if (k != null && (k < TOTALS_MIN || k > TOTALS_MAX)) out.push(`Daily calories are kept between ${fmt(TOTALS_MIN)} and ${fmt(TOTALS_MAX)} kcal.`);
  return out;
}

const dayList = (ws: number[]) => {
  const s = [...ws].sort((a, b) => a - b);
  if (s.length >= 3 && s.every((w, i) => i === 0 || w === s[i - 1] + 1)) return `${WEEKDAYS[s[0]]}–${WEEKDAYS[s[s.length - 1]]}`;
  return s.map(w => WEEKDAYS[w]).join(", ");
};

// ── Small pieces ──────────────────────────────────────────────────────────────
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
              {showKcal ? `~${r10(kcal[m] ?? 0)}` : `${Math.round(((kcal[m] ?? 0) / total) * 100)}%`}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

const Dot = ({ meal }: { meal: string }) => <span style={{ width: 8, height: 8, borderRadius: 99, background: MEAL_COLOR[meal], flexShrink: 0 }} />;
const MealName = ({ meal }: { meal: string }) => (
  <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: "#1a1a1a", minWidth: 0 }}>
    <Dot meal={meal} /><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{MEAL_LABEL[meal]}</span>
  </span>
);

function SizeRow({ meal, value, onChange }: { meal: string; value: MealSize; onChange: (v: MealSize) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "7px 0" }}>
      <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, fontWeight: 600, color: "#1a1a1a" }}>
        <Dot meal={meal} />{MEAL_LABEL[meal]}
      </span>
      <Segmented
        label={`${MEAL_LABEL[meal]} size`} value={value} onChange={onChange}
        options={SIZES.map(s => ({ value: s, label: SIZE_LABEL[s] }))} minWidth={58}
      />
    </div>
  );
}

function Segmented<T extends string>({ value, onChange, options, label, minWidth, small }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string; minWidth?: number; small?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} style={{ display: "flex", background: C.offWhite, borderRadius: 10, padding: 3 }}>
      {options.map(o => {
        const on = value === o.value;
        return (
          <button
            key={o.value} role="radio" aria-checked={on} onClick={() => onChange(o.value)}
            style={{
              flex: minWidth ? undefined : 1, minWidth, padding: small ? "4px 8px" : "6px 8px", borderRadius: 8, border: "none", cursor: "pointer",
              fontSize: small ? 11 : 12, fontWeight: on ? 700 : 500,
              background: on ? C.white : "transparent", color: on ? C.primary : C.muted,
              boxShadow: on ? "0 1px 3px rgba(0,0,0,0.12)" : "none", transition: "all 0.15s",
            }}
          >{o.label}</button>
        );
      })}
    </div>
  );
}

function NumBox({ value, onChange, placeholder, suffix, label, width = 58, max }: {
  value: number | undefined; onChange: (v: number | undefined) => void; placeholder: string; suffix: string; label: string; width?: number | string; max?: number;
}) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 2, background: C.white, border: `1px solid ${value != null ? C.teal : C.border}`, borderRadius: 9, padding: "0 7px", height: 34, width, boxSizing: "border-box" }}>
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
const SectionLabel = ({ children }: { children: ReactNode }) => (
  <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: 0.4 }}>{children}</p>
);
const KindIcon = ({ t, size = 13 }: { t: DayType; size?: number }) =>
  t.kind === "training" ? <IconBarbell size={size} /> : t.kind === "rest" ? <IconMoon size={size} /> : <IconCalendar size={size} />;

// ── The card ─────────────────────────────────────────────────────────────────
export default function ShapeYourDay({
  shape, onChange, allMeals, excludedMeals, onToggleMeal, mealExtras, targets, weekendsOn,
  savedLabel = "Saved for your next orders.",
}: {
  shape: DayShape;
  onChange: (s: DayShape) => void;
  allMeals: string[];             // every meal type, in display order
  excludedMeals: string[];        // meals switched off
  onToggleMeal: (meal: string) => void;
  mealExtras?: ReactNode;         // what to do with a switched-off meal's calories, etc.
  targets: DayTargets;            // the client's usual day targets
  weekendsOn: boolean;
  savedLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState("base");
  const [totalsOpen, setTotalsOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const ordered = MEAL_ORDER.filter(m => allMeals.includes(m) && !excludedMeals.includes(m));
  const canShape = ordered.length >= 2;

  const types = shape.types?.length ? shape.types : EMPTY_SHAPE.types;
  const idx = Math.max(0, types.findIndex(t => t.id === activeId));
  const active = types[idx];
  const isBase = idx === 0;
  const hasOthers = types.length > 1;
  const days = weekendsOn ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4];
  const takenBy = (w: number) => types.findIndex((t, i) => i > 0 && t.weekdays.includes(w));
  const baseDays = days.filter(w => takenBy(w) < 0);

  const typeName = (t: DayType, i: number) =>
    t.name.trim() || (i === 0 ? (hasOthers ? "Other days" : "Every day") : `Day type ${i + 1}`);
  const typeDays = (t: DayType, i: number) =>
    i === 0 ? (hasOthers ? (baseDays.length ? (t.name.trim() ? dayList(baseDays) : "") : "not used") : "")
            : (t.weekdays.length ? dayList(t.weekdays) : "pick days");

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
    const t: DayType = { id: newId(), name: "", settings: clone(active.settings), weekdays: [], totals: emptyTotals() };
    onChange({ ...shape, types: [...types, t] });
    setActiveId(t.id);
  };
  const trainingAndRest = () => {
    const training: DayType = {
      id: newId(), name: "Training", kind: "training", settings: clone(types[0].settings),
      weekdays: [0, 2, 4].filter(w => days.includes(w)), totals: emptyTotals(),
    };
    onChange({ ...shape, types: [{ ...types[0], name: types[0].name || "Rest", kind: types[0].kind ?? "rest" }, training] });
    setActiveId(training.id);
  };
  const removeType = () => {
    onChange({ ...shape, types: types.filter((_, j) => j !== idx) });
    setActiveId("base");
  };

  const totals = typeTotals(types, idx);
  const ownTotals = hasTotals(active.totals);
  const inherits = !isBase && !ownTotals && hasTotals(types[0].totals);
  const dayT = applyTotals(targets, flaskTotals(totals, targets));
  const dayKcal = dayT.kcal ?? 0;
  const s = active.settings;
  const pv = preview(s, shape.mode, ordered, dayT);
  const set = canShape && shapeIsSet(shape, ordered);
  const hints = canShape ? extremeHints(s, shape.mode, ordered, dayT, totals, targets) : [];
  const setMeals = settingsFor(s, shape.mode, ordered);
  const freeMeals = ordered.filter(m => setMeals[m] == null);
  const totalsTitle = hasOthers || active.name.trim() ? `${typeName(active, idx)} totals` : "Daily totals";
  const fmtT = (t: DayTargets) =>
    [t.kcal != null && `${fmt(t.kcal)} kcal`, t.protein != null && `${fmt(t.protein)}P`, t.carbs != null && `${fmt(t.carbs)}C`, t.fat != null && `${fmt(t.fat)}F`].filter(Boolean).join(" · ");

  const describe = (t: DayType, i: number): string => {
    const v = settingsFor(t.settings, shape.mode, ordered);
    const parts = ordered.filter(m => v[m] != null).map(m => {
      const x = v[m] as MealSetting;
      if (typeof x === "string") return `${SIZE_LABEL[x]} ${MEAL_LABEL[m].toLowerCase()}`;
      if ("pct" in x) return `${MEAL_LABEL[m]} ${x.pct}%`;
      const e = x as Record<string, number>;
      return `${MEAL_LABEL[m]} ${[e.kcal != null && `${e.kcal} kcal`, e.protein != null && `${e.protein}P`, e.carbs != null && `${e.carbs}C`, e.fat != null && `${e.fat}F`].filter(Boolean).join(" ")}`;
    });
    const own = flaskTotals(types[i].totals, targets);
    if (own.kcal) parts.unshift(`${fmt(own.kcal)} kcal`);
    else if (Object.keys(own).length) parts.unshift(`${fmt(applyTotals(targets, own).kcal ?? 0)} kcal`);
    return parts.length ? parts.join(" · ") : "automatic";
  };
  const mealSummary = ordered.length === allMeals.length ? "All meals" : ordered.length === 0 ? "No meals" : `${ordered.length} of ${allMeals.length} meals`;
  const shapeSummary = !set ? "" : types
    .map((t, i) => ({ t, i }))
    .filter(({ t, i }) => typeInUse(t, i))
    .map(({ t, i }) => (hasOthers ? `${typeName(t, i)}: ${describe(t, i)}` : describe(t, i)))
    .join(" | ");

  // "Fill in": write the automatic numbers into the empty boxes.
  const fillIn = () => {
    if (shape.mode === "kcal") {
      const cal = { ...s.cal };
      for (const m of freeMeals) cal[m] = { kcal: r10(pv.kcal[m]) };
      setSettings({ ...s, cal });
    } else if (shape.mode === "macros") {
      const grams = { ...s.grams };
      for (const m of ordered) {
        const g = { ...grams[m] };
        for (const { key } of GRAM_KEYS) if (g[key] == null) g[key] = Math.round(pv.grams[m][key]);
        grams[m] = g;
      }
      setSettings({ ...s, grams });
    }
  };

  const restLine = () => {
    if (shape.mode === "simple" || !Object.keys(setMeals).length) return null;
    let text: string;
    if (shape.mode === "kcal") {
      const left = freeMeals.reduce((a, m) => a + pv.kcal[m], 0);
      text = freeMeals.length ? `${fmt(r10(left))} kcal left → ${mealsText(freeMeals)}` : `All meals set · ${fmt(ordered.reduce((a, m) => a + pv.kcal[m], 0))} of ${fmt(dayKcal)} kcal`;
    } else {
      const leftG = GRAM_KEYS.map(({ key, short }) => {
        const typed = ordered.reduce((a, m) => a + (s.grams[m]?.[key] ?? 0), 0);
        return `${fmt(Math.max(0, (dayT[key] ?? 0) - typed))}${short}`;
      });
      const anyFree = ordered.some(m => GRAM_KEYS.some(({ key }) => s.grams[m]?.[key] == null));
      text = anyFree ? `Left for the rest: ${leftG.join(" · ")}` : "All meals set";
    }
    const anyFree = shape.mode === "kcal" ? freeMeals.length > 0 : ordered.some(m => GRAM_KEYS.some(({ key }) => s.grams[m]?.[key] == null));
    return (
      <div style={{ marginTop: 10, background: "#f5fafa", borderRadius: 10, padding: "9px 11px" }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: C.tealDark }}>{text}</p>
        {anyFree && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 7, flexWrap: "wrap" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.muted }}>
              Share it
              <Segmented
                small label="How the rest is shared" value={s.rest} onChange={v => setSettings({ ...s, rest: v })}
                options={[{ value: "usual", label: "Usual split" }, { value: "even", label: "Evenly" }]}
              />
            </span>
            <button onClick={fillIn} style={{ ...linkBtn, padding: "4px 10px", fontSize: 11 }}>
              <IconPencil size={12} /> Fill in
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
          background: C.white, border: `1px solid ${ordered.length === 0 ? "#c0392b" : set ? C.teal : C.border}`,
          borderRadius: open ? "12px 12px 0 0" : 12, padding: "14px 16px", cursor: "pointer",
        }}
      >
        <div style={{ textAlign: "left", minWidth: 0 }}>
          <p style={{ margin: "0 0 2px", fontSize: 13.5, fontWeight: 600, color: "#1a1a1a" }}>
            Your day
            <span style={{ fontSize: 9.5, fontWeight: 700, color: C.tealDark, border: `1px solid ${C.teal}`, borderRadius: 6, padding: "1px 5px", marginLeft: 6, verticalAlign: "middle" }}>BETA</span>
          </p>
          <p style={{ margin: 0, fontSize: 11.5, color: set ? C.tealDark : ordered.length === 0 ? "#c0392b" : C.light, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {mealSummary} · {set ? shapeSummary : "meals, training days, bigger lunch…"}
          </p>
        </div>
        <IconChevronDown size={16} color={C.light} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }} />
      </button>

      {open && (
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderTop: "none", borderRadius: "0 0 12px 12px", padding: "12px 16px 14px" }}>
          {/* Meals */}
          <SectionLabel>Meals</SectionLabel>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {MEAL_ORDER.filter(m => allMeals.includes(m)).map(m => {
              const on = !excludedMeals.includes(m);
              return (
                <button
                  key={m} onClick={() => onToggleMeal(m)} aria-pressed={on}
                  aria-label={on ? `Skip ${m}` : `Enable ${m}`}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 20, cursor: "pointer", fontSize: 12.5,
                    border: `1.5px ${on ? "solid" : "dashed"} ${on ? MEAL_COLOR[m] : C.border}`,
                    background: on ? C.white : C.offWhite, color: on ? C.primary : C.light, fontWeight: on ? 600 : 500,
                    textDecoration: on ? "none" : "line-through",
                  }}
                >{on && <Dot meal={m} />}{MEAL_LABEL[m]}</button>
              );
            })}
          </div>
          {mealExtras && <div style={{ marginTop: 10 }}>{mealExtras}</div>}

          {!canShape ? (
            <p style={{ margin: "14px 0 0", fontSize: 11.5, color: C.light }}>Keep at least two meals to shape your day.</p>
          ) : (
            <>
              {/* Day types */}
              <div style={{ height: 1, background: C.border, margin: "14px 0" }} />
              <SectionLabel>Day types</SectionLabel>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                {types.map((t, i) => {
                  const on = i === idx;
                  const d = typeDays(t, i);
                  return (
                    <button
                      key={t.id} onClick={() => { setActiveId(t.id); setRenaming(false); }} aria-pressed={on}
                      style={{
                        display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 20, cursor: "pointer", fontSize: 12,
                        border: `1.5px solid ${on ? C.tealDark : C.border}`,
                        background: on ? "#f0f7f7" : C.white, color: on ? C.tealDark : C.muted, fontWeight: on ? 700 : 500,
                      }}
                    >
                      {(hasOthers || t.kind) && <KindIcon t={t} />}
                      {typeName(t, i)}
                      {d && <span style={{ fontWeight: 400, color: C.light, fontStyle: d === "pick days" ? "italic" : "normal" }}>{d}</span>}
                    </button>
                  );
                })}
                {!hasOthers && (
                  <button onClick={trainingAndRest} style={{ ...linkBtn, borderStyle: "dashed", padding: "7px 12px" }}>
                    <IconBarbell size={13} /> Training & rest days
                  </button>
                )}
                {types.length < MAX_TYPES && (
                  <button onClick={addType} style={{ ...linkBtn, borderStyle: "dashed", padding: "7px 12px" }}>
                    <IconPlus size={13} /> {hasOthers ? "Add" : "Other day type"}
                  </button>
                )}
              </div>

              {(hasOthers || active.name) && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, minHeight: 30 }}>
                  {renaming ? (
                    <input
                      autoFocus aria-label="Day type name" maxLength={24}
                      value={active.name} placeholder={typeName({ ...active, name: "" }, idx)}
                      onChange={e => updateType(idx, { name: e.target.value })}
                      onBlur={() => setRenaming(false)}
                      onKeyDown={e => { if (e.key === "Enter") setRenaming(false); }}
                      style={{ flex: 1, minWidth: 0, height: 30, border: `1px solid ${C.teal}`, borderRadius: 8, padding: "0 9px", fontSize: 13, fontWeight: 600, color: C.primary, outline: "none" }}
                    />
                  ) : (
                    <button onClick={() => setRenaming(true)} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 13.5, fontWeight: 700, color: C.primary }}>
                      <KindIcon t={active} size={15} />{typeName(active, idx)}
                      <IconPencil size={13} color={C.light} aria-label="Rename" />
                    </button>
                  )}
                </div>
              )}

              {!isBase && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {days.map(w => {
                      const on = active.weekdays.includes(w);
                      const owner = takenBy(w);
                      const elsewhere = !on && owner > 0;
                      return (
                        <button
                          key={w} onClick={() => toggleDay(w)}
                          title={elsewhere ? `Move ${WEEKDAYS[w]} here from ${typeName(types[owner], owner)}` : undefined}
                          style={{
                            padding: "6px 10px", borderRadius: 20, fontSize: 12, cursor: "pointer",
                            border: `1.5px ${elsewhere ? "dashed" : "solid"} ${on ? C.tealDark : C.border}`,
                            background: on ? C.tealDark : C.white, color: on ? C.white : elsewhere ? C.light : C.muted, fontWeight: on ? 700 : 500,
                          }}
                        >{WEEKDAYS[w]}</button>
                      );
                    })}
                  </div>
                  <p style={{ margin: "6px 0 0", fontSize: 11, color: C.light }}>
                    {active.weekdays.length === 0 ? "Pick the days this applies to — a day can only be in one type." : `Every other day follows ${typeName(types[0], 0)}.`}
                  </p>
                </div>
              )}
              {isBase && hasOthers && (
                <p style={{ margin: "-4px 0 12px", fontSize: 11.5, color: C.muted }}>
                  {baseDays.length ? `Used on ${dayList(baseDays)} — every day no other type takes.` : "Every day is taken by another type, so this one isn't used."}
                </p>
              )}

              {/* Meal split */}
              <Segmented
                label="How to set your meals" value={shape.mode} onChange={m => onChange({ ...shape, mode: m })}
                options={(["simple", "kcal", "macros"] as ShapeMode[]).map(m => ({ value: m, label: MODE_LABEL[m] }))}
              />
              <p style={{ margin: "10px 0 12px", fontSize: 11.5, color: C.muted, lineHeight: 1.45 }}>
                {shape.mode === "simple"
                  ? "Your totals stay the same — this only moves food between meals."
                  : shape.mode === "kcal"
                    ? "Type calories or a % for the meals you care about — leave the rest empty and they share what's left."
                    : "Type grams for the meals you care about — calories follow, and empty boxes share what's left."}
              </p>

              <SplitBar kcal={pv.kcal} meals={ordered} showKcal={!!dayKcal} />

              {shape.mode === "simple" && ordered.map(m => (
                <SizeRow key={m} meal={m} value={s.sizes[m] ?? "normal"} onChange={v => setSettings({ ...s, sizes: { ...s.sizes, [m]: v } })} />
              ))}

              {shape.mode === "kcal" && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 84px 66px", gap: 6, fontSize: 10.5, color: C.light, marginBottom: 2 }}>
                    <span /><span style={{ textAlign: "center" }}>kcal</span><span style={{ textAlign: "center" }}>% of day</span>
                  </div>
                  {ordered.map(m => {
                    const v = s.cal[m];
                    const autoK = r10(pv.kcal[m]);
                    const autoP = dayKcal ? Math.round(pv.kcal[m] / dayKcal * 100) : 0;
                    return (
                      <div key={m} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 84px 66px", gap: 6, alignItems: "center", padding: "3px 0" }}>
                        <MealName meal={m} />
                        <NumBox
                          width="100%" label={`${MEAL_LABEL[m]} kcal`} suffix="" placeholder={String(autoK)}
                          value={v?.kcal}
                          onChange={x => setSettings({ ...s, cal: { ...s.cal, [m]: x == null ? {} : { kcal: x } } })}
                        />
                        <NumBox
                          width="100%" label={`${MEAL_LABEL[m]} percent of calories`} suffix="%" placeholder={String(autoP)} max={100}
                          value={v?.pct}
                          onChange={x => setSettings({ ...s, cal: { ...s.cal, [m]: x == null ? {} : { pct: x } } })}
                        />
                      </div>
                    );
                  })}
                </>
              )}

              {shape.mode === "macros" && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) repeat(3, 54px) 44px", gap: 5, fontSize: 10.5, color: C.light, marginBottom: 2 }}>
                    <span />
                    {GRAM_KEYS.map(x => <span key={x.key} style={{ textAlign: "center" }}>{x.label}</span>)}
                    <span style={{ textAlign: "right" }}>kcal</span>
                  </div>
                  {ordered.map(m => (
                    <div key={m} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) repeat(3, 54px) 44px", gap: 5, alignItems: "center", padding: "3px 0" }}>
                      <MealName meal={m} />
                      {GRAM_KEYS.map(x => (
                        <NumBox
                          key={x.key} width={54} label={`${MEAL_LABEL[m]} ${x.key}`} suffix="g"
                          placeholder={String(Math.round(pv.grams[m][x.key]))}
                          value={s.grams[m]?.[x.key]}
                          onChange={v => setSettings({ ...s, grams: { ...s.grams, [m]: { ...s.grams[m], [x.key]: v } } })}
                        />
                      ))}
                      <span style={{ textAlign: "right", fontSize: 11.5, fontWeight: 600, color: setMeals[m] ? C.primary : C.light }}>
                        {r10(GRAM_KEYS.reduce((a, x) => a + pv.grams[m][x.key] * x.kcal, 0))}
                      </span>
                    </div>
                  ))}
                </>
              )}

              {restLine()}
              {hints.map(h => <Hint key={h} text={h} />)}

              {/* Totals for this day type */}
              <div style={{ marginTop: 14, border: `1px solid ${ownTotals ? C.teal : C.border}`, borderRadius: 10, padding: "9px 11px" }}>
                <button
                  onClick={() => setTotalsOpen(o => !o)}
                  style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center", gap: 8, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
                >
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "#1a1a1a" }}>{totalsTitle}</span>
                    <span style={{ display: "block", fontSize: 11, color: ownTotals ? C.tealDark : C.light, marginTop: 1 }}>
                      {ownTotals ? fmtT(dayT) : inherits ? `Same as ${typeName(types[0], 0)} (${fmtT(dayT)})` : `Your usual (${fmtT(targets)})`}
                    </span>
                  </span>
                  <IconChevronDown size={15} color={C.light} style={{ transform: totalsOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }} />
                </button>
                {totalsOpen && (() => {
                  const t = active.totals;
                  const pcts = totalsPct(t, targets);
                  const anyPct = t.proteinPct != null || t.carbsPct != null || t.fatPct != null;
                  return (
                    <>
                      <div style={{ margin: "10px 0 8px" }}>
                        <Segmented
                          small label="How to set the totals" value={t.mode}
                          onChange={m => setTotals({ ...t, mode: m })}
                          options={[{ value: "kcal", label: "Calories + %" }, { value: "grams", label: "Grams" }]}
                        />
                      </div>
                      {t.mode === "kcal" ? (
                        <>
                          <div style={{ display: "grid", gridTemplateColumns: "1.3fr repeat(3, 1fr)", gap: 6 }}>
                            {([
                              { k: "kcal", label: "kcal", suffix: "", ph: targets.kcal != null ? String(Math.round(targets.kcal)) : "–", max: undefined },
                              { k: "proteinPct", label: "Protein", suffix: "%", ph: String(Math.round(pcts.protein)), max: 100 },
                              { k: "carbsPct", label: "Carbs", suffix: "%", ph: String(Math.round(pcts.carbs)), max: 100 },
                              { k: "fatPct", label: "Fat", suffix: "%", ph: String(Math.round(pcts.fat)), max: 100 },
                            ] as const).map(f => (
                              <div key={f.k}>
                                <p style={{ margin: "0 0 3px", fontSize: 10.5, color: C.light, textAlign: "center" }}>{f.label}</p>
                                <NumBox
                                  width="100%" label={`${totalsTitle} ${f.label}${f.suffix ? " percent" : ""}`} suffix={f.suffix} placeholder={f.ph} max={f.max}
                                  value={t[f.k]} onChange={v => setTotals({ ...t, [f.k]: v })}
                                />
                              </div>
                            ))}
                          </div>
                          <p style={{ margin: "7px 0 0", fontSize: 11.5, fontWeight: 600, color: C.tealDark }}>
                            = {fmt(dayT.protein ?? 0)} g protein · {fmt(dayT.carbs ?? 0)} g carbs · {fmt(dayT.fat ?? 0)} g fat
                          </p>
                          {anyPct && pcts.scaled && (
                            <Hint text={`Your % add up to ${Math.round(pcts.raw)} — they're scaled to 100 (${Math.round(pcts.protein)} / ${Math.round(pcts.carbs)} / ${Math.round(pcts.fat)}).`} />
                          )}
                        </>
                      ) : (
                        <>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                            {GRAM_KEYS.map(x => (
                              <div key={x.key}>
                                <p style={{ margin: "0 0 3px", fontSize: 10.5, color: C.light, textAlign: "center" }}>{x.label}</p>
                                <NumBox
                                  width="100%" label={`${totalsTitle} ${x.label} grams`} suffix="g"
                                  placeholder={targets[x.key] != null ? String(Math.round(targets[x.key]!)) : "–"}
                                  value={t[x.key]} onChange={v => setTotals({ ...t, [x.key]: v })}
                                />
                              </div>
                            ))}
                          </div>
                          <p style={{ margin: "7px 0 0", fontSize: 11.5, fontWeight: 600, color: C.tealDark }}>= {fmt(dayT.kcal ?? 0)} kcal</p>
                        </>
                      )}
                      <p style={{ margin: "8px 0 0", fontSize: 11, color: C.muted, lineHeight: 1.4 }}>
                        Only for {hasOthers ? `${typeName(active, idx)} days` : "these orders"} — your profile stays the same.
                        {t.mode === "kcal" ? " Empty % share what's left in your usual proportion." : " Empty boxes keep your usual grams."}
                      </p>
                      {ownTotals && (
                        <button onClick={() => setTotals(emptyTotals())} style={{ ...linkBtn, marginTop: 8 }}>
                          <IconRefresh size={13} /> Back to {!isBase && hasTotals(types[0].totals) ? typeName(types[0], 0) : "my usual"}
                        </button>
                      )}
                    </>
                  );
                })()}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                {!isBase ? (
                  <button onClick={removeType} style={linkBtn}>
                    <IconTrash size={13} /> Remove {typeName(active, idx)}
                  </button>
                ) : <span />}
                {set && (
                  <button onClick={() => { onChange({ ...EMPTY_SHAPE, mode: shape.mode }); setActiveId("base"); }} style={linkBtn}>
                    <IconRefresh size={13} /> Back to automatic
                  </button>
                )}
              </div>
              {set && <p style={{ margin: "10px 0 0", fontSize: 10.5, color: C.light }}>{savedLabel}</p>}
            </>
          )}
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
