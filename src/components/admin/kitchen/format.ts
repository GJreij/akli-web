// Shared helpers for the Kitchen Day cards (amount choices, formatting).
import type { KitchenIngredient, KitchenStockBatch, KitchenSubrecipe } from "@/lib/flask";
import type { PlanKey, SavedChoice } from "@/lib/kitchenPlan";
import { C } from "../ui";

export type Plan = PlanKey;

// How much the cook chose to make of one dish while deciding.
export interface Choice { plan: Plan; customText: string }

export function defaultChoice(s: KitchenSubrecipe): Choice {
  const hasExtra = s.suggested.servings > s.must_cook.servings + 0.01;
  const covered = s.must_cook.servings <= 0.01;
  return {
    plan: hasExtra ? "suggested" : covered ? "custom" : "must",
    customText: fmtServings(Math.max(s.suggested.servings, s.must_cook.servings) || 1),
  };
}

export function choiceCustom(c: Choice) {
  return Math.max(0, parseFloat(c.customText) || 0);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function fmtServings(n: number) {
  const r = round2(n);
  return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/0$/, "");
}

export function fmtQty(i: { quantity: number; unit: string | null }) {
  const q = i.quantity;
  if ((i.unit === "g" || i.unit === "ml") && q >= 1000) return `${round2(q / 1000)} ${i.unit === "g" ? "kg" : "L"}`;
  const shown = i.unit === "g" || i.unit === "ml" ? Math.round(q) : Math.round(q * 10) / 10;
  return `${shown} ${i.unit ?? ""}`.trim();
}

export function fmtDay(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

export function fmtWeekday(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short" });
}

export const smallBtn = {
  background: C.offWhite, color: C.primary, border: `1px solid ${C.border}`, borderRadius: 7,
  padding: "5px 10px", fontSize: 11.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" as const,
};

// Combined ingredient amounts for a plan choice — "freeze" is suggested + the
// extra freezer portions, cooked as one pot.
export function planIngredients(s: KitchenSubrecipe, plan: Plan, custom: number): KitchenIngredient[] {
  return scaledIngredients(s, planServings(s, plan, custom));
}

export function planServings(s: KitchenSubrecipe, plan: Plan, custom = 0) {
  if (plan === "custom") return custom;
  if (plan === "must") return s.must_cook.servings;
  if (plan === "suggested") return s.suggested.servings;
  return round2(s.suggested.servings + (s.freeze?.servings ?? 0));
}

export function scaledIngredients(s: KitchenSubrecipe, servings: number): KitchenIngredient[] {
  return s.ingredients_per_serving.map(i => ({ ...i, quantity: Math.round(i.quantity * servings * 10) / 10 }));
}

// What gets saved on "Confirm my plan".
export function toSaved(s: KitchenSubrecipe, c: Choice): SavedChoice {
  const servings = round2(planServings(s, c.plan, choiceCustom(c)));
  const freezer = c.plan === "freeze" ? round2(s.freeze?.servings ?? 0) : 0;
  return { plan: c.plan, servings, fridge: round2(Math.max(0, servings - freezer)), freezer };
}

export function fromSaved(sc: SavedChoice): Choice {
  return { plan: sc.plan, customText: fmtServings(sc.servings) };
}

// Batches logged on the cook date: a Prep task counts as done once it has one.
// Note on batches booked from "Already cooked → Correct": dated on the day
// they were counted (so earlier days' deliveries don't use them up), but
// they're not today's cooking.
export const ALREADY_HAD_NOTE = "Already had it (Kitchen Day)";

export function todayBatches(s: KitchenSubrecipe, cookDate: string): KitchenStockBatch[] {
  return s.stock.filter(b => b.cooked_on === cookDate && !b.notes?.startsWith(ALREADY_HAD_NOTE));
}

// One portion, from the catalog ingredients: "120 g Greek Yogurt".
export function perPortion(s: KitchenSubrecipe) {
  return s.ingredients_per_serving.map(i => `${fmtQty(i)} ${i.name}`).join(" + ") || "1 portion";
}
