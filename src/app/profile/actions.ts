"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// A wallet top-up request has no order/slot side effects, so — unlike
// cancellations, which go through Flask — this is a plain client-session
// insert. user_id always comes from the authenticated session, never from
// the caller, so a client can only ever request a top-up for themselves
// (the wallet_topup_request_insert_own RLS policy enforces the same thing
// server-side as a second line of defense).
export async function requestWalletTopup(amount: number, note?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Enter an amount greater than $0.");
  }

  const { error } = await (supabase.from("wallet_topup_request") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .insert({
      user_id: user.id,
      amount: Math.round(amount * 100) / 100,
      payment_note: note?.trim() || null,
    });
  if (error) throw new Error(error.message);

  revalidatePath("/profile");
}
