// Kitchen (simple): one cook date as plain lines. Per subrecipe: what's
// ordered over the week, what I have, what I cook and who does it.
// Tables: kitchen_plan_item, kitchen_plan_step, kitchen_equipment.
import type { KitchenIngredient, KitchenSimpleComment, KitchenSimpleData } from "@/lib/flask";

// kitchen_person.id, e.g. "georges".
export type Person = string;

export interface KitchenPerson { id: string; name: string; sort: number; active: boolean }

export interface PlanItem {
  subrecipe_id: number;
  need: number;
  have: number;
  cook: number;
  assignee: Person;
  cooked: number | null;
  done_at: string | null;
  portioned_at: string | null;
}

export interface PlanStep {
  id: number;
  text: string;
  assignee: Person;
  done_at: string | null;
  sort: number;
}

export interface Equipment { id: number; name: string; weight_g: number }

// One subrecipe on the planner, ordered servings per day plus what the
// cook needs at the stove.
export interface PlanRow {
  subrecipe_id: number;
  name: string;
  prep_type: "cook" | "assemble" | "slice" | "ready";
  is_side_salad: boolean;
  by_date: Record<string, number>;
  // Ordered for the cook date itself.
  need: number;
  // meal_plan_day_recipe ids delivered on the cook date (portioning).
  mpdr_ids: number[];
  instructions: string | null;
  comments: KitchenSimpleComment[];
  ingredients_per_serving: KitchenIngredient[];
  // Left over from the last saved day, if any.
  suggested_have: number | null;
  suggested_from: string | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

// Kitchen server actions return their error instead of throwing it: Next.js
// hides thrown messages in production ("Rita is already on the team" would
// become a generic error). unwrap() turns it back into a throw on the phone.
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
export function unwrap<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(r.error);
  return r.data;
}
// What a failed save says on screen.
export function saveError(e: unknown) {
  if (e instanceof TypeError || (e instanceof Error && /fetch failed|failed to fetch|network/i.test(e.message))) {
    return "No connection: that didn't save.";
  }
  return e instanceof Error ? e.message : "Couldn't save.";
}

// Last day's leftovers: what I had + what got cooked − what went out that day.
export function leftover(prev: Pick<PlanItem, "have" | "cook" | "cooked" | "need">) {
  return Math.max(0, r2(prev.have + (prev.cooked ?? prev.cook) - prev.need));
}

export function buildRows(
  data: KitchenSimpleData,
  previous: Map<number, { cook_date: string; item: PlanItem }>,
): PlanRow[] {
  return data.subrecipes.map(s => {
    const prev = previous.get(s.subrecipe_id);
    return {
      subrecipe_id: s.subrecipe_id,
      name: s.name,
      prep_type: s.prep_type,
      is_side_salad: s.is_side_salad,
      by_date: s.by_date,
      need: r2(s.by_date[data.cook_date] ?? 0),
      mpdr_ids: s.today_mpdr_ids,
      instructions: s.instructions,
      comments: s.comments,
      ingredients_per_serving: s.ingredients_per_serving,
      suggested_have: prev ? leftover(prev.item) : null,
      suggested_from: prev?.cook_date ?? null,
    };
  });
}

// How far a pot reaches: "today → Tue", walking the week's orders in date order.
export function coversThrough(row: PlanRow, dates: string[], total: number) {
  let left = total;
  let last: string | null = null;
  for (const d of dates) {
    const n = row.by_date[d] ?? 0;
    if (n <= 0) continue;
    if (left + 0.01 < n) return { last, left: r2(left), short: true };
    left -= n;
    last = d;
  }
  return { last, left: r2(left), short: false };
}

// Side salads go to Guitta, everything else to Georges (or the first person
// in the list when they're not there).
export function defaultAssignee(row: Pick<PlanRow, "is_side_salad">, people: KitchenPerson[]): Person {
  const active = people.filter(p => p.active);
  const want = row.is_side_salad ? "guitta" : "georges";
  return active.find(p => p.id === want)?.id ?? active[0]?.id ?? want;
}

export function weekTotal(row: Pick<PlanRow, "by_date">) {
  return r2(Object.values(row.by_date).reduce((n, x) => n + x, 0));
}
