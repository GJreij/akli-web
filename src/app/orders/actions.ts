"use server";

import { revalidatePath } from "next/cache";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { beirutISODate } from "@/lib/dates";
import type { Database } from "@/lib/supabase/types";

// Clients have SELECT-only RLS on `deliveries` (writes are service_role
// only, normally via Flask). Flask trusts whatever user_id the body carries,
// so this toggle lives here instead: the owner check uses the authenticated
// session, and only after it passes does the service-role client write —
// and that write touches nothing but needs_cutlery on that one row.
export async function setDeliveryCutlery(deliveryId: number, needsCutlery: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  if (!Number.isInteger(deliveryId) || typeof needsCutlery !== "boolean") {
    throw new Error("Invalid request.");
  }

  const { data, error: readErr } = await supabase
    .from("deliveries")
    .select("id, user_id, delivery_date, status")
    .eq("id", deliveryId)
    .maybeSingle();
  const delivery = data as { id: number; user_id: string | null; delivery_date: string | null; status: string | null } | null;
  if (readErr) throw new Error(readErr.message);
  // Admins can SELECT every row through RLS — still only let anyone change
  // their own delivery from this client-facing action.
  if (!delivery || delivery.user_id !== user.id) throw new Error("Delivery not found.");

  if (delivery.status === "cancelled" || delivery.status === "cancellation_pending" || delivery.status === "delivered") {
    throw new Error("This delivery can no longer be changed.");
  }
  // Packing happens on the delivery day itself, so changes close at the end
  // of the day before (Beirut time).
  if (!delivery.delivery_date || delivery.delivery_date < beirutISODate(1)) {
    throw new Error("Cutlery can only be changed until the day before delivery.");
  }

  const admin = createServiceClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { error } = await admin
    .from("deliveries")
    .update({ needs_cutlery: needsCutlery, updated_at: new Date().toISOString() })
    .eq("id", deliveryId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/orders");
}
