"use server";

import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/supabase/requireAdmin";
import { emptyAllergenFlags } from "@/lib/allergens";
import type { Database } from "@/lib/supabase/types";

// Server-only — service role key never reaches the browser. Needed because
// creating the auth.users row itself (below) is an Admin API operation with
// no RLS-based equivalent; requireAdmin()'s cookie-bound client can't do it.
function serviceRoleClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function createGuestUser(input: {
  name: string;
  last_name: string;
  phone_number: string;
  email: string;
}) {
  // Gate: only a signed-in admin may create a guest profile.
  await requireAdmin();

  const name = input.name.trim();
  const last_name = input.last_name.trim();
  const phone_number = input.phone_number.trim();
  const email = input.email.trim().toLowerCase();
  if (!name || !last_name || !phone_number || !email) {
    throw new Error("Name, last name, phone, and email are all required.");
  }

  const admin = serviceRoleClient();

  // No password set — this account can't be signed into until the client
  // claims it themselves (see the reset-password claim flow). The
  // handle_new_user trigger fires on this insert and creates a stub
  // public.user(id, email) row automatically.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: false,
  });

  if (createErr) {
    if (/already.*registered|already.*exists/i.test(createErr.message)) {
      throw new Error(
        `A user with ${email} already exists — search for them in the list instead of creating a new one.`
      );
    }
    throw new Error(createErr.message);
  }

  const userId = created.user?.id;
  if (!userId) throw new Error("Guest account creation failed unexpectedly.");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: profileErr } = await (admin.from("user") as any).update({
    name,
    last_name,
    phone_number,
    tenant_id: 1,
    role: "client",
    status: "active",
    is_guest: true,
    onboarding: false,
    ...emptyAllergenFlags(),
  }).eq("id", userId);

  if (profileErr) throw new Error(profileErr.message);

  redirect(`/admin/users/${userId}`);
}
