"use server";

import { requireAdmin } from "@/lib/supabase/requireAdmin";
import { getKitchenDay } from "@/lib/flask";
import { sortComments, unsortedCommentGroups } from "@/lib/kitchenAi";
import type { NoteTurn, SavedChoice, ScheduleItem, TeamMember } from "@/lib/kitchenPlan";

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// One cooked pot/tray. use_by is fixed at log time from the subrecipe's
// fridge/freezer days, so later edits to the catalog don't move it.
export async function logBatches(input: {
  subrecipeId: number;
  cookedOn: string;
  batches: { servings: number; storage: "fridge" | "freezer"; cookedWeightG?: number | null }[];
  notes?: string | null;
}) {
  const batches = input.batches.filter(b => Number.isFinite(b.servings) && b.servings > 0);
  if (batches.length === 0) throw new Error("Enter how many servings you cooked.");

  const { supabase } = await requireAdmin();
  const { data: sub, error: subErr } = await (supabase.from("subrecipe") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .select("fridge_days, freezer_days")
    .eq("id", input.subrecipeId)
    .single();
  if (subErr || !sub) throw new Error(`Couldn't load the subrecipe: ${subErr?.message ?? "not found"}`);

  const rows = batches.map(b => {
    const days = b.storage === "freezer" ? sub.freezer_days : sub.fridge_days;
    if (b.storage === "freezer" && days == null) throw new Error("This subrecipe isn't marked as freezable.");
    return {
      subrecipe_id: input.subrecipeId,
      cooked_on: input.cookedOn,
      servings_cooked: Math.round(b.servings * 100) / 100,
      cooked_weight_g: b.cookedWeightG && b.cookedWeightG > 0 ? b.cookedWeightG : null,
      storage: b.storage,
      use_by: addDays(input.cookedOn, days ?? 0),
      notes: input.notes?.trim() || null,
    };
  });

  const { data, error } = await (supabase.from("kitchen_batch") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .insert(rows)
    .select("id");
  if (error) throw new Error(`Couldn't log the batch: ${error.message} (code ${error.code})`);
  return (data ?? []).map((r: { id: number }) => r.id) as number[];
}

// "I only have 1 left, not 4": the board's `remaining` is derived (cooked −
// discarded − what deliveries since then used), so the gap is booked on the
// batch itself — less than expected goes to discarded_servings, more than
// expected raises servings_cooked. Each correction is appended to notes.
export async function correctBatchRemaining(batchId: number, shownRemaining: number, actualRemaining: number) {
  if (!Number.isFinite(actualRemaining) || actualRemaining < 0) throw new Error("Enter how many servings you actually have.");
  const diff = Math.round((shownRemaining - actualRemaining) * 100) / 100;
  if (Math.abs(diff) < 0.01) return;

  const { supabase } = await requireAdmin();
  const { data: batch, error: readErr } = await (supabase.from("kitchen_batch") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .select("servings_cooked, discarded_servings, notes")
    .eq("id", batchId)
    .single();
  if (readErr || !batch) throw new Error(`Couldn't load the batch: ${readErr?.message ?? "not found"}`);

  const stamp = new Date().toISOString().slice(0, 10);
  const note = `${stamp}: corrected ${shownRemaining} → ${actualRemaining} left`;
  const update = diff > 0
    ? { discarded_servings: Math.round(((batch.discarded_servings ?? 0) + diff) * 100) / 100 }
    : { servings_cooked: Math.round((batch.servings_cooked - diff) * 100) / 100 };

  const { data, error } = await (supabase.from("kitchen_batch") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .update({ ...update, notes: batch.notes ? `${batch.notes}\n${note}` : note, updated_at: new Date().toISOString() })
    .eq("id", batchId)
    .select("id");
  if (error) throw new Error(`Couldn't save the correction: ${error.message} (code ${error.code})`);
  if (!data || data.length === 0) throw new Error("Couldn't save the correction: no matching row.");
}

// "I actually have 30 in the fridge": sets the total left in one storage.
// Less than shown is taken off the oldest batches first. More than shown is
// booked as its own batch dated on the cook date (earlier days' deliveries
// would otherwise use it up on paper), marked so Prep doesn't count it as
// today's cooking.
export async function setStockLevel(input: {
  subrecipeId: number;
  cookDate: string;
  storage: "fridge" | "freezer";
  target: number;
  batches: { id: number; cookedOn: string; remaining: number }[];
}) {
  if (!Number.isFinite(input.target) || input.target < 0) throw new Error("Enter how many servings you have.");
  const batches = [...input.batches].sort((a, b) => a.cookedOn.localeCompare(b.cookedOn));
  const current = batches.reduce((n, b) => n + Math.max(0, b.remaining), 0);
  let diff = Math.round((input.target - current) * 100) / 100;
  if (Math.abs(diff) < 0.01) return;

  if (diff < 0) {
    for (const b of batches) {
      if (diff > -0.01) break;
      const take = Math.min(Math.max(0, b.remaining), -diff);
      if (take < 0.01) continue;
      await correctBatchRemaining(b.id, b.remaining, Math.round((b.remaining - take) * 100) / 100);
      diff += take;
    }
    return;
  }
  await logBatches({
    subrecipeId: input.subrecipeId, cookedOn: input.cookDate,
    batches: [{ servings: diff, storage: input.storage }], notes: "Already had it (Kitchen Day)",
  });
}

// finished = used up; discarded = thrown away (counts as waste).
export async function closeBatch(batchId: number, status: "finished" | "discarded", discardedServings?: number) {
  const { supabase } = await requireAdmin();
  const { data, error } = await (supabase.from("kitchen_batch") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .update({
      status,
      updated_at: new Date().toISOString(),
      ...(status === "discarded" && discardedServings != null ? { discarded_servings: Math.max(0, discardedServings) } : {}),
    })
    .eq("id", batchId)
    .select("id");
  if (error) throw new Error(`Couldn't update the batch: ${error.message} (code ${error.code})`);
  if (!data || data.length === 0) throw new Error("Couldn't update the batch: no matching row.");
}

export async function saveKitchenSettings(input: { cookDays: number[]; lateOrderBufferPct: number }) {
  const cook_days = [...new Set(input.cookDays.filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
  const late_order_buffer_pct = Math.max(0, Math.min(50, Math.round(input.lateOrderBufferPct || 0)));
  const { supabase } = await requireAdmin();
  const { error } = await (supabase.from("kitchen_settings") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .upsert({ tenant_id: 1, cook_days, late_order_buffer_pct, updated_at: new Date().toISOString() });
  if (error) throw new Error(`Couldn't save kitchen settings: ${error.message} (code ${error.code})`);
}

// How one client comment affects one subrecipe (see kitchen_comment_handling).
export async function setCommentHandling(input: {
  userId: string; recipeId: number | null; subrecipeId: number; comment: string;
  handling: "assembly" | "separate_pot" | "ignore"; instruction?: string | null; decidedBy?: "ai" | "admin";
}) {
  const { supabase } = await requireAdmin();
  await upsertCommentHandling(supabase, [input]);
}

// No upsert: the unique key is an expression index (coalesce(recipe_id, 0)),
// which PostgREST's on_conflict can't target — so update, then insert.
// Not exported: every export of a "use server" file is a callable endpoint,
// and this one trusts its caller to have checked requireAdmin().
async function upsertCommentHandling(
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"],
  rows: { userId: string; recipeId: number | null; subrecipeId: number; comment: string;
    handling: "assembly" | "separate_pot" | "ignore"; instruction?: string | null; decidedBy?: "ai" | "admin" }[],
) {
  for (const r of rows) {
    const payload = {
      handling: r.handling, instruction: r.instruction?.trim() || null,
      decided_by: r.decidedBy ?? "admin", updated_at: new Date().toISOString(),
    };
    let q = (supabase.from("kitchen_comment_handling") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      .update(payload).eq("user_id", r.userId).eq("subrecipe_id", r.subrecipeId).eq("comment", r.comment.trim());
    q = r.recipeId == null ? q.is("recipe_id", null) : q.eq("recipe_id", r.recipeId);
    const { data, error } = await q.select("id");
    if (error) throw new Error(`Couldn't save the comment handling: ${error.message} (code ${error.code})`);
    if (data && data.length > 0) continue;
    const { error: insErr } = await (supabase.from("kitchen_comment_handling") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      .insert({ user_id: r.userId, recipe_id: r.recipeId, subrecipe_id: r.subrecipeId, comment: r.comment.trim(), ...payload });
    if (insErr) throw new Error(`Couldn't save the comment handling: ${insErr.message} (code ${insErr.code})`);
  }
}

// Sends the cook date's unsorted comments to Claude and saves its choice for
// each part of the dish (decided_by 'ai' — the chips on the card override).
export async function sortCommentsWithAi(cookDate: string) {
  const { supabase } = await requireAdmin();
  const groups = unsortedCommentGroups(await getKitchenDay(cookDate));
  if (groups.length === 0) return { sorted: 0 };
  const decisions = await sortComments(groups);
  const byKey = new Map(groups.map(g => [g.key, g]));
  await upsertCommentHandling(supabase, decisions.map(d => {
    const g = byKey.get(d.key)!;
    return {
      userId: g.userId, recipeId: g.recipeId, subrecipeId: d.subrecipeId, comment: g.comment,
      handling: d.handling, instruction: d.instruction, decidedBy: "ai" as const,
    };
  }));
  return { sorted: groups.length };
}

// ─── Saved day plan (kitchen_day_plan) ──────────────────────────────────────

async function patchDayPlan(cookDate: string, patch: Record<string, unknown>) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cookDate)) throw new Error("Bad cook date.");
  const { supabase } = await requireAdmin();
  const { error } = await (supabase.from("kitchen_day_plan") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .upsert({ tenant_id: 1, cook_date: cookDate, ...patch, updated_at: new Date().toISOString() }, { onConflict: "tenant_id,cook_date" });
  if (error) throw new Error(`Couldn't save the plan: ${error.message} (code ${error.code})`);
  return supabase;
}

// "Confirm my plan": the amounts are frozen here, so Prep and the helper's
// phone show exactly what was decided.
export async function confirmDayPlan(cookDate: string, choices: Record<string, SavedChoice>) {
  const clean: Record<string, SavedChoice> = {};
  for (const [id, c] of Object.entries(choices)) {
    if (!/^\d+$/.test(id) || !["must", "suggested", "freeze", "custom"].includes(c.plan)) continue;
    const r = (n: number) => Math.max(0, Math.round((Number(n) || 0) * 100) / 100);
    clean[id] = { plan: c.plan, servings: r(c.servings), fridge: r(c.fridge), freezer: r(c.freezer) };
  }
  const { supabase } = await requireAdmin();
  const { data: { user } } = await supabase.auth.getUser();
  await patchDayPlan(cookDate, { choices: clean, confirmed_at: new Date().toISOString(), confirmed_by: user?.id ?? null });
}

export async function reopenDayPlan(cookDate: string) {
  await patchDayPlan(cookDate, { confirmed_at: null });
}

// Done ticks for Prep tasks that aren't a batch of their own (separate pots).
export async function setPlanTaskDone(cookDate: string, key: string, done: boolean, servings?: number | null) {
  const { supabase } = await requireAdmin();
  const { data, error } = await (supabase.from("kitchen_day_plan") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .select("done").eq("tenant_id", 1).eq("cook_date", cookDate).maybeSingle();
  if (error) throw new Error(`Couldn't load the plan: ${error.message}`);
  const next = { ...((data?.done as Record<string, unknown>) ?? {}) };
  if (done) next[key] = { at: new Date().toISOString(), servings: servings ?? null };
  else delete next[key];
  await patchDayPlan(cookDate, { done: next });
}

export async function saveDaySchedule(cookDate: string, schedule: ScheduleItem[] | null) {
  const clean = schedule?.slice(0, 60).map(s => ({
    time: String(s.time).slice(0, 10), who: String(s.who).slice(0, 20),
    station: String(s.station).slice(0, 20), task: String(s.task).slice(0, 300),
  })) ?? null;
  await patchDayPlan(cookDate, { schedule: clean });
}

// Who's in the kitchen today. Saved as soon as it changes.
export async function saveDayTeam(cookDate: string, team: TeamMember[]) {
  const hhmm = (t: string) => (/^\d{2}:\d{2}$/.test(t) ? t : "");
  const clean = team.slice(0, 20)
    .map(m => ({ id: String(m.id).slice(0, 40), name: String(m.name).trim().slice(0, 40), from: hhmm(m.from), to: hhmm(m.to) }))
    .filter(m => m.id && m.name);
  await patchDayPlan(cookDate, { team: clean });
}

// Who does each Prep task: the whole map (task key -> team member id).
export async function saveDayAssign(cookDate: string, assign: Record<string, string>) {
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(assign).slice(0, 300)) {
    if (k && v) clean[String(k).slice(0, 120)] = String(v).slice(0, 40);
  }
  await patchDayPlan(cookDate, { assign: clean });
}

// The next-day WhatsApp note and the chat that wrote it.
export async function saveDayNote(cookDate: string, note: string, chat: NoteTurn[], final: boolean) {
  await patchDayPlan(cookDate, {
    note: note.slice(0, 4000),
    note_chat: chat.slice(-40).map(t => ({ role: t.role === "user" ? "user" : "assistant", content: String(t.content).slice(0, 2000) })),
    note_final: final,
  });
}

// What the kitchen assistant remembers (shown in its panel).
export async function listKitchenMemory() {
  const { supabase } = await requireAdmin();
  const { data, error } = await (supabase.from("kitchen_ai_memory") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .select("id, content, created_at").eq("active", true).order("created_at");
  if (error) throw new Error(`Couldn't load the assistant's memory: ${error.message}`);
  return (data ?? []) as { id: number; content: string; created_at: string }[];
}

export async function forgetKitchenMemory(id: number) {
  const { supabase } = await requireAdmin();
  const { error } = await (supabase.from("kitchen_ai_memory") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .update({ active: false }).eq("id", id);
  if (error) throw new Error(`Couldn't remove it: ${error.message}`);
}
