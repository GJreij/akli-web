import { createClient } from "@/lib/supabase/server";

/**
 * Guard for admin-only server actions. A Next.js server action is an
 * independently callable POST endpoint — it is not protected by
 * AdminLayout's page-render check, so every admin action must call this
 * itself rather than relying on the page it's normally invoked from.
 * Throws (rather than redirecting) since actions surface errors to the
 * caller, not a page navigation.
 */
export async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: actingProfile } = await supabase.from("user").select("role").eq("id", user.id).single();
  if ((actingProfile as { role: string | null } | null)?.role !== "admin") throw new Error("Not authorized");

  return { supabase, adminId: user.id };
}
