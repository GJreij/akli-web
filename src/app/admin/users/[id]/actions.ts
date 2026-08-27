"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/requireAdmin";
import type { Database } from "@/lib/supabase/types";

export async function updateUserRoleStatus(userId: string, role: string, status: string) {
  const { supabase } = await requireAdmin();

  const update: Database["public"]["Tables"]["user"]["Update"] = { role, status };
  await (supabase.from("user") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .update(update)
    .eq("id", userId);
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
}
