"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export async function updateUserRoleStatus(userId: string, role: string, status: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: actingProfile } = await supabase.from("user").select("*").eq("id", user.id).single();
  if ((actingProfile as { role: string | null } | null)?.role !== "admin") throw new Error("Not authorized");

  const update: Database["public"]["Tables"]["user"]["Update"] = { role, status };
  await (supabase.from("user") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .update(update)
    .eq("id", userId);
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
}
