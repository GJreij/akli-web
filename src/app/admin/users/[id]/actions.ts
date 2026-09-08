"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/requireAdmin";
import type { Database } from "@/lib/supabase/types";
import { requestCancellation } from "@/lib/flask";
import { approveAsWalletCredit, approveAsRealRefund, cancelWithNoRefund } from "@/app/admin/cancellations/actions";
import { KITCHEN_LOCATION } from "@/lib/constants";

export async function updateUserRoleStatus(userId: string, role: string, status: string) {
  const { supabase } = await requireAdmin();

  const update: Database["public"]["Tables"]["user"]["Update"] = { role, status };
  await (supabase.from("user") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .update(update)
    .eq("id", userId);
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
}

type CancelMode = "noRefund" | "wallet" | "refund";

// Collapses the normal client-requests / admin-reviews cancellation flow into
// one action — for an order the admin placed themselves, the admin is both
// parties, so there's no reason to make them click through a review queue
// for their own order. Reuses the exact same Flask-side finalize logic
// (slot release, day status, discount correction) as a real client
// cancellation via admin/cancellations/actions.ts.
export async function adminCancelOrder(input: {
  userId: string;
  mealPlanId: number;
  mode: CancelMode;
  amount?: number;
  note: string;
}) {
  // Captured once and threaded through to the calls below — they'd otherwise
  // each redo their own requireAdmin() (auth.getUser() + role lookup) even
  // though this request already proved the caller is an admin.
  const adminCtx = await requireAdmin();

  const reqRes = await requestCancellation(input.userId, input.mealPlanId);
  if (!reqRes.success || !reqRes.cancellation_request_id) {
    throw new Error(reqRes.error ?? "Could not start the cancellation.");
  }
  const cancellationRequestId = reqRes.cancellation_request_id;

  if (input.mode === "noRefund") {
    if (!input.note.trim()) throw new Error("A reason is required when cancelling with no refund.");
    await cancelWithNoRefund(cancellationRequestId, input.note, adminCtx);
  } else if (input.mode === "wallet") {
    if (!input.amount || input.amount <= 0) throw new Error("Enter a credit amount.");
    await approveAsWalletCredit(cancellationRequestId, input.userId, input.mealPlanId, input.amount, input.note, adminCtx);
  } else {
    if (!input.amount || input.amount <= 0) throw new Error("Enter a refund amount.");
    await approveAsRealRefund(cancellationRequestId, input.amount, input.note, adminCtx);
  }

  revalidatePath(`/admin/users/${input.userId}`);
}

// ── Per-address delivery fee override ───────────────────────────────────────
// Default pricing for every address is the flat macro_price.delivery_price.
// This is the only way one specific address's fee can differ from that.

// fee: null clears the override, falling back to the flat default fee again.
export async function setDeliveryFeeOverride(input: {
  addressId: number;
  userId: string;
  fee: number | null;
  note?: string;
}): Promise<void> {
  const { supabase, adminId } = await requireAdmin();

  if (input.fee === null) {
    const { error } = await supabase.from("delivery_fee_override").delete().eq("address_id", input.addressId);
    if (error) throw new Error(error.message);
    revalidatePath(`/admin/users/${input.userId}`);
    return;
  }
  if (input.fee < 0) throw new Error("Fee can't be negative.");

  const upsertRow: Database["public"]["Tables"]["delivery_fee_override"]["Insert"] = {
    address_id: input.addressId,
    fee_per_day: input.fee,
    note: input.note?.trim() || null,
    set_by_admin_id: adminId,
  };
  const { error } = await (supabase.from("delivery_fee_override") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .upsert(upsertRow, { onConflict: "address_id" });
  if (error) throw new Error(error.message);

  revalidatePath(`/admin/users/${input.userId}`);
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Advisory only — never auto-charges anyone. Tries OSRM's free public routing
// API for a real driving distance/duration; falls back to a straight-line
// haversine estimate if OSRM is slow, down, or errors (it's a community demo
// instance, not guaranteed for production use, which is fine for the low
// volume this admin tool sees).
export async function estimateDeliveryDistance(lat: number, lng: number) {
  await requireAdmin();

  const { lat: kLat, lng: kLng } = KITCHEN_LOCATION;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${kLng},${kLat};${lng},${lat}?overview=false`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      const route = data?.routes?.[0];
      if (route) {
        return {
          distance_km: Math.round((route.distance / 1000) * 10) / 10,
          duration_min: Math.round(route.duration / 60),
          mode: "routing" as const,
        };
      }
    }
  } catch {
    // fall through to the straight-line estimate below
  }

  return {
    distance_km: Math.round(haversineKm(kLat, kLng, lat, lng) * 10) / 10,
    duration_min: null,
    mode: "straight_line" as const,
  };
}
