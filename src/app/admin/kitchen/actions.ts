"use server";

import { requireAdmin } from "@/lib/supabase/requireAdmin";

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
