"use server";

import { requireAdmin } from "@/lib/supabase/requireAdmin";
import type { Equipment, KitchenPerson, Person, PlanItem, PlanStep, Result } from "@/lib/kitchenSimple";

/* eslint-disable @typescript-eslint/no-explicit-any */
const TENANT = 1;
const r2 = (n: number) => Math.round(n * 100) / 100;

// Every action the phone calls returns { ok, data } or { ok: false, error }
// instead of throwing: Next.js hides thrown messages in production, and the
// cook needs to read why a save didn't go through.
async function safe<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    console.error("[kitchen]", e);
    const msg = e instanceof Error ? e.message : "Couldn't save.";
    return { ok: false, error: /fetch failed|timeout/i.test(msg) ? "The server couldn't reach the database. Try again." : msg };
  }
}

// Every assignee must be a kitchen_person (active or not: old days keep theirs).
async function assertPeople(supabase: any, ids: string[]) {
  const want = [...new Set(ids)];
  if (want.length === 0) return;
  const { data, error } = await (supabase.from("kitchen_person") as any)
    .select("id").eq("tenant_id", TENANT).in("id", want);
  check(error, "check who does it");
  const known = new Set((data ?? []).map((p: { id: string }) => p.id));
  const missing = want.filter(id => !known.has(id));
  if (missing.length) throw new Error(`Unknown person: ${missing.join(", ")}.`);
}

function check(error: { message: string; code?: string } | null, what: string) {
  if (error) throw new Error(`Couldn't ${what}: ${error.message}${error.code ? ` (code ${error.code})` : ""}`);
}

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const num = (x: any) => (x == null ? null : Number(x));
const toItem = (r: any): PlanItem => ({
  subrecipe_id: Number(r.subrecipe_id), need: Number(r.need), have: Number(r.have), cook: Number(r.cook),
  assignee: r.assignee, cooked: num(r.cooked), done_at: r.done_at, portioned_at: r.portioned_at,
});

// Page load (server component): throws, the page's error screen shows it.
export async function loadPlan(cookDate: string) {
  const { supabase } = await requireAdmin();
  const [items, steps, prev, equipment, people] = await Promise.all([
    (supabase.from("kitchen_plan_item") as any)
      .select("subrecipe_id, need, have, cook, assignee, cooked, done_at, portioned_at")
      .eq("tenant_id", TENANT).eq("cook_date", cookDate),
    (supabase.from("kitchen_plan_step") as any)
      .select("id, text, assignee, done_at, sort")
      .eq("tenant_id", TENANT).eq("cook_date", cookDate).order("sort").order("id"),
    (supabase.from("kitchen_plan_item") as any)
      .select("cook_date, subrecipe_id, need, have, cook, assignee, cooked, done_at, portioned_at")
      .eq("tenant_id", TENANT).lt("cook_date", cookDate).gte("cook_date", addDays(cookDate, -14))
      .order("cook_date", { ascending: false }),
    (supabase.from("kitchen_equipment") as any)
      .select("id, name, weight_g").eq("tenant_id", TENANT).order("name"),
    (supabase.from("kitchen_person") as any)
      .select("id, name, sort, active").eq("tenant_id", TENANT).order("sort").order("name"),
  ]);
  check(items.error, "load the plan");
  check(steps.error, "load the steps");
  check(prev.error, "load the last plan");
  check(equipment.error, "load the pots");
  check(people.error, "load the team");

  // Latest earlier day per subrecipe: its leftovers suggest today's "have".
  const previous = new Map<number, { cook_date: string; item: PlanItem }>();
  for (const r of prev.data ?? []) {
    const id = Number(r.subrecipe_id);
    if (!previous.has(id)) previous.set(id, { cook_date: r.cook_date, item: toItem(r) });
  }
  return {
    items: (items.data ?? []).map(toItem) as PlanItem[],
    steps: (steps.data ?? []) as PlanStep[],
    previous,
    equipment: (equipment.data ?? []).map((e: any) => ({ ...e, weight_g: Number(e.weight_g) })) as Equipment[],
    people: (people.data ?? []) as KitchenPerson[],
  };
}

async function readPeople(supabase: any) {
  const { data, error } = await (supabase.from("kitchen_person") as any)
    .select("id, name, sort, active").eq("tenant_id", TENANT).order("sort").order("name");
  check(error, "load the team");
  return (data ?? []) as KitchenPerson[];
}

// Add someone to the team; a removed person with the same name comes back.
export async function addPerson(name: string) {
  return safe(async () => {
    const n = name.trim().replace(/\s+/g, " ");
    if (!n) throw new Error("Write a name first.");
    if (n.length > 40) throw new Error("That name is too long.");
    const { supabase } = await requireAdmin();
    const base = n.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "person";
    const { data: all, error: readErr } = await (supabase.from("kitchen_person") as any)
      .select("id, name, active, sort").eq("tenant_id", TENANT);
    check(readErr, "load the team");
    const same = (all ?? []).find((p: any) => p.name.toLowerCase() === n.toLowerCase());
    if (same?.active) throw new Error(`${same.name} is already on the team.`);
    if (same) {
      const { error } = await (supabase.from("kitchen_person") as any).update({ active: true }).eq("tenant_id", TENANT).eq("id", same.id);
      check(error, "add them back");
      return readPeople(supabase);
    }
    const taken = new Set((all ?? []).map((p: any) => p.id));
    let id = base;
    for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
    const sort = Math.max(0, ...(all ?? []).map((p: any) => p.sort ?? 0)) + 1;
    const { error } = await (supabase.from("kitchen_person") as any).insert({ tenant_id: TENANT, id, name: n, sort });
    check(error, "add them");
    return readPeople(supabase);
  });
}

// Hide someone from the team; their old tasks keep their name.
export async function removePerson(id: string) {
  return safe(async () => {
    const { supabase } = await requireAdmin();
    const { data: active, error: readErr } = await (supabase.from("kitchen_person") as any)
      .select("id").eq("tenant_id", TENANT).eq("active", true);
    check(readErr, "load the team");
    if ((active ?? []).length <= 1) throw new Error("Keep at least one person on the team.");
    const { error } = await (supabase.from("kitchen_person") as any).update({ active: false }).eq("tenant_id", TENANT).eq("id", id);
    check(error, "remove them");
    return readPeople(supabase);
  });
}

// Just the saved plan (lines + steps): fast, no Flask call. The screen's
// background re-read does the same from the browser (KitchenSimple.tsx).
async function readLive(supabase: any, cookDate: string) {
  const [items, steps] = await Promise.all([
    (supabase.from("kitchen_plan_item") as any)
      .select("subrecipe_id, need, have, cook, assignee, cooked, done_at, portioned_at")
      .eq("tenant_id", TENANT).eq("cook_date", cookDate),
    (supabase.from("kitchen_plan_step") as any)
      .select("id, text, assignee, done_at, sort")
      .eq("tenant_id", TENANT).eq("cook_date", cookDate).order("sort").order("id"),
  ]);
  check(items.error, "load the plan");
  check(steps.error, "load the steps");
  return { items: (items.data ?? []).map(toItem) as PlanItem[], steps: (steps.data ?? []) as PlanStep[] };
}

// Save the planner: upsert every line with something in it, drop the
// lines that went back to nothing. Done/portioned ticks are kept.
export async function savePlan(cookDate: string, lines: { subrecipe_id: number; need: number; have: number; cook: number; assignee: Person }[], remove: number[]) {
  return safe(async () => {
    const { supabase } = await requireAdmin();
    for (const l of lines) {
      if (![l.need, l.have, l.cook].every(n => Number.isFinite(n) && n >= 0)) throw new Error("Servings must be 0 or more.");
    }
    await assertPeople(supabase, lines.map(l => l.assignee));
    if (lines.length) {
      const { error } = await (supabase.from("kitchen_plan_item") as any).upsert(
        lines.map(l => ({
          tenant_id: TENANT, cook_date: cookDate, subrecipe_id: l.subrecipe_id,
          need: r2(l.need), have: r2(l.have), cook: r2(l.cook), assignee: l.assignee, updated_at: new Date().toISOString(),
        })),
        { onConflict: "tenant_id,cook_date,subrecipe_id" },
      );
      check(error, "save the plan");
    }
    if (remove.length) {
      const { error } = await (supabase.from("kitchen_plan_item") as any)
        .delete().eq("tenant_id", TENANT).eq("cook_date", cookDate).in("subrecipe_id", remove);
      check(error, "clear the empty lines");
    }
    // The saved plan straight back: no second trip to re-read it.
    return readLive(supabase, cookDate);
  });
}

async function updateItem(cookDate: string, subrecipeId: number, patch: Record<string, unknown>, what: string) {
  const { supabase } = await requireAdmin();
  if (typeof patch.assignee === "string") await assertPeople(supabase, [patch.assignee]);
  const { data, error } = await (supabase.from("kitchen_plan_item") as any)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("tenant_id", TENANT).eq("cook_date", cookDate).eq("subrecipe_id", subrecipeId).select("subrecipe_id");
  check(error, what);
  if (!data?.length) throw new Error(`Couldn't ${what}: this line isn't in the saved plan. Save the plan first.`);
  return null;
}

export async function setItemAssignee(cookDate: string, subrecipeId: number, assignee: Person) {
  return safe(() => updateItem(cookDate, subrecipeId, { assignee }, "change who does it"));
}

// Done ✓, with the servings really cooked when they differ from the plan.
export async function setItemDone(cookDate: string, subrecipeId: number, done: boolean, cooked: number | null = null) {
  return safe(async () => {
    if (cooked != null && (!Number.isFinite(cooked) || cooked < 0)) throw new Error("Enter how many servings you cooked.");
    return updateItem(cookDate, subrecipeId, done ? { done_at: new Date().toISOString(), cooked: cooked == null ? null : r2(cooked) } : { done_at: null, cooked: null }, "save it");
  });
}

// `need` = servings really portioned today (orders can change after the
// plan was saved); it feeds tomorrow's "left from" suggestion.
export async function setItemPortioned(cookDate: string, subrecipeId: number, portioned: boolean, need?: number) {
  return safe(async () => {
    const patch: Record<string, unknown> = { portioned_at: portioned ? new Date().toISOString() : null };
    if (portioned && need != null) {
      if (!Number.isFinite(need) || need < 0) throw new Error("Bad number of servings.");
      patch.need = r2(need);
    }
    return updateItem(cookDate, subrecipeId, patch, "save the portioning");
  });
}

export async function addStep(cookDate: string, text: string, assignee: Person) {
  return safe(async () => {
    const t = text.trim();
    if (!t) throw new Error("Write the step first.");
    const { supabase } = await requireAdmin();
    await assertPeople(supabase, [assignee]);
    const { data, error } = await (supabase.from("kitchen_plan_step") as any)
      .insert({ tenant_id: TENANT, cook_date: cookDate, text: t, assignee, sort: Date.now() % 2_000_000_000 })
      .select("id, text, assignee, done_at, sort").single();
    check(error, "add the step");
    return data as PlanStep;
  });
}

export async function updateStep(id: number, patch: { text?: string; assignee?: Person; done?: boolean }) {
  return safe(async () => {
    const row: Record<string, unknown> = {};
    if (patch.text != null) {
      if (!patch.text.trim()) throw new Error("A step can't be empty.");
      row.text = patch.text.trim();
    }
    if (patch.done != null) row.done_at = patch.done ? new Date().toISOString() : null;
    const { supabase } = await requireAdmin();
    if (patch.assignee != null) {
      await assertPeople(supabase, [patch.assignee]);
      row.assignee = patch.assignee;
    }
    const { data, error } = await (supabase.from("kitchen_plan_step") as any).update(row).eq("id", id).eq("tenant_id", TENANT).select("id");
    check(error, "save the step");
    if (!data?.length) throw new Error("Couldn't save the step: it was deleted.");
    return null;
  });
}

export async function deleteStep(id: number) {
  return safe(async () => {
    const { supabase } = await requireAdmin();
    const { error } = await (supabase.from("kitchen_plan_step") as any).delete().eq("id", id).eq("tenant_id", TENANT);
    check(error, "delete the step");
    return null;
  });
}

export async function addEquipment(name: string, weightG: number) {
  return safe(async () => {
    const n = name.trim();
    if (!n) throw new Error("Give the pot a name.");
    if (!Number.isFinite(weightG) || weightG < 0) throw new Error("Enter the pot's weight in grams.");
    const { supabase } = await requireAdmin();
    const { data, error } = await (supabase.from("kitchen_equipment") as any)
      .insert({ tenant_id: TENANT, name: n, weight_g: r2(weightG) }).select("id, name, weight_g").single();
    check(error, "save the pot");
    return { ...data, weight_g: Number(data.weight_g) } as Equipment;
  });
}

export async function deleteEquipment(id: number) {
  return safe(async () => {
    const { supabase } = await requireAdmin();
    const { error } = await (supabase.from("kitchen_equipment") as any).delete().eq("id", id).eq("tenant_id", TENANT);
    check(error, "delete the pot");
    return null;
  });
}
