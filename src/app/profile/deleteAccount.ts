"use server";

import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { beirutISODate } from "@/lib/dates";
import {
  anonymizeAccount,
  getDeletionBlockers,
  hasBlockers,
  type DeletionBlockers,
} from "@/lib/accountDeletion";

export async function getDeletionStatus(): Promise<{ blockers: DeletionBlockers; canDelete: boolean }> {
  const user = await getAuthUser();
  if (!user) throw new Error("Not authenticated");
  const supabase = await createClient();
  const blockers = await getDeletionBlockers(supabase, user.id, beirutISODate(0));
  return { blockers, canDelete: !hasBlockers(blockers) };
}

// The blockers are re-checked here on the server: a server action is a
// directly callable endpoint, so the confirm screen's own check is not trusted.
export async function deleteMyAccount(confirmation: string): Promise<{ ok: true }> {
  if (confirmation.trim().toUpperCase() !== "DELETE") throw new Error("Type DELETE to confirm.");

  const user = await getAuthUser();
  if (!user) throw new Error("Not authenticated");

  const supabase = await createClient();
  const blockers = await getDeletionBlockers(supabase, user.id, beirutISODate(0));
  if (hasBlockers(blockers)) {
    throw new Error("Your account can't be deleted yet. Please message us on WhatsApp.");
  }

  // Service-role key stays on the server; needed to disable the login and to
  // rewrite rows the customer's own session isn't allowed to touch.
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  await anonymizeAccount(admin, user.id);
  return { ok: true };
}
