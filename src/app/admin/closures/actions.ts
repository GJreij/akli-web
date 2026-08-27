"use server";

import { requireAdmin } from "@/lib/supabase/requireAdmin";

export async function addClosure(closureDate: string, reason: string | null) {
  const { supabase } = await requireAdmin();
  const { error } = await (supabase.from("kitchen_closure") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .insert({ closure_date: closureDate, reason });
  if (error) throw new Error(error.message);
}

export async function deleteClosure(id: number) {
  const { supabase } = await requireAdmin();
  await supabase.from("kitchen_closure").delete().eq("id", id);
}
