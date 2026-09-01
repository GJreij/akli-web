"use server";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

// Server-only — service role key never reaches the browser. Needed because
// the visitor calling this (mid-onboarding, before they've signed up) has no
// Supabase session at all — anonymous auth is disabled on this project, so
// there's no RLS-visible identity to query public.user under. A server
// action runs regardless of the caller's session, so it can check this one
// narrow fact (does a guest profile exist for this email) without opening up
// any new RLS surface to unauthenticated visitors.
function serviceRoleClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// Used by the onboarding "save" step to detect an admin-created guest
// profile before calling auth.signUp() — routes into the claim flow instead
// of attempting to create a duplicate account for the same email.
export async function checkGuestEmail(email: string): Promise<boolean> {
  const admin = serviceRoleClient();
  const { data } = await admin
    .from("user")
    .select("is_guest")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();
  return (data as { is_guest: boolean } | null)?.is_guest === true;
}
