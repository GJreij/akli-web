import { createClient, getAuthUser, getUserRole } from "@/lib/supabase/server";

/**
 * Guard for admin-only server actions. A Next.js server action is an
 * independently callable POST endpoint — it is not protected by
 * AdminLayout's page-render check, so every admin action must call this
 * itself rather than relying on the page it's normally invoked from.
 * Throws (rather than redirecting) since actions surface errors to the
 * caller, not a page navigation.
 */
export async function requireAdmin() {
  const user = await getAuthUser();
  if (!user) throw new Error("Not authenticated");

  if ((await getUserRole(user.id)) !== "admin") throw new Error("Not authorized");

  const supabase = await createClient();

  return { supabase, adminId: user.id };
}
