"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: actingProfile } = await supabase.from("user").select("role").eq("id", user.id).single();
  if ((actingProfile as { role: string | null } | null)?.role !== "admin") throw new Error("Not authorized");

  return supabase;
}

type AffiliateInsert = Database["public"]["Tables"]["affiliates"]["Insert"];
type AffiliateUpdate = Database["public"]["Tables"]["affiliates"]["Update"];
type PromoCodeInsert = Database["public"]["Tables"]["promo_codes"]["Insert"];
type PromoCodeUpdate = Database["public"]["Tables"]["promo_codes"]["Update"];
type VolumeRuleInsert = Database["public"]["Tables"]["automatic_discount_rules"]["Insert"];
type VolumeRuleUpdate = Database["public"]["Tables"]["automatic_discount_rules"]["Update"];

/**
 * A new public code is ambiguous if another active public code already uses
 * the same text (any requester would match both). A new private code is only
 * ambiguous against another active code already private to that same user —
 * different users can safely reuse the same private code text since
 * resolution always filters by user_id first.
 */
async function assertCodeNotAmbiguous(
  supabase: Awaited<ReturnType<typeof requireAdmin>>,
  code: string,
  userId: string | null | undefined,
  excludeId?: number,
) {
  let query = supabase.from("promo_codes").select("id").eq("is_active", true).ilike("code", code);
  query = userId ? query.eq("user_id", userId) : query.is("user_id", null);
  if (excludeId) query = query.neq("id", excludeId);

  const { data: existing } = await query;
  if (existing && existing.length > 0) {
    throw new Error(`Code "${code}" is already active${userId ? " for this user" : ""} — pick a unique code.`);
  }
}

function assertDateOrder(start?: string | null, end?: string | null) {
  if (start && end && end < start) {
    throw new Error("End date can't be before the start date.");
  }
}

export async function createAffiliate(input: {
  user_id: string;
  tier: "affiliate" | "ambassador" | "athlete";
  commission_rate: number;
  personal_discount_rate?: number | null;
  audience_discount_rate?: number;
  audience_code?: string | null; // custom code text; auto-generated if blank
  personal_code?: string | null; // custom code text; auto-generated if blank
  waives_delivery?: boolean;
  notes?: string | null;
}) {
  const supabase = await requireAdmin();

  const existingProfileRes = await supabase
    .from("affiliates")
    .select("id,tier")
    .eq("user_id", input.user_id)
    .maybeSingle();
  const existingProfile = existingProfileRes.data as { id: number; tier: string } | null;
  if (existingProfile) {
    throw new Error(
      `This user already has an affiliate profile (tier: ${existingProfile.tier}). Edit that profile instead of creating a new one.`
    );
  }

  const audienceCodeText = (input.audience_code?.trim() || null);
  const personalCodeText = (input.personal_code?.trim() || null);

  if (audienceCodeText) await assertCodeNotAmbiguous(supabase, audienceCodeText, null);
  if (personalCodeText) await assertCodeNotAmbiguous(supabase, personalCodeText, input.user_id);

  const affiliateRow: AffiliateInsert = {
    user_id: input.user_id,
    tier: input.tier,
    commission_rate: input.commission_rate,
    personal_discount_rate: input.personal_discount_rate ?? null,
    notes: input.notes ?? null,
  };

  const { data: affiliate, error } = await (supabase.from("affiliates") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .insert(affiliateRow)
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  // Public audience code — what the affiliate shares with their audience.
  // discount_value on promo_codes is always a raw percentage (e.g. 10 means
  // 10%), never a fraction — audience_discount_rate is already in that form.
  const audienceCode: PromoCodeInsert = {
    code: audienceCodeText || `AKLI-${input.tier.slice(0, 3).toUpperCase()}-${affiliate.id}`,
    affiliate_id: affiliate.id,
    discount_type: "percentage",
    discount_value: input.audience_discount_rate ?? 10,
    is_active: true,
  };
  const { error: audienceError } = await (supabase.from("promo_codes") as any).insert(audienceCode); // eslint-disable-line @typescript-eslint/no-explicit-any
  if (audienceError) throw new Error(`Affiliate created, but the audience code failed: ${audienceError.message}`);

  // Private personal-discount code for their own orders, if a rate was set.
  // personal_discount_rate on affiliates is a FRACTION (0.40 = 40%), but
  // discount_value here must be the raw percentage — convert it.
  if (input.personal_discount_rate) {
    const personalCode: PromoCodeInsert = {
      code: personalCodeText || `AKLI-SELF-${affiliate.id}`,
      affiliate_id: affiliate.id,
      user_id: input.user_id,
      discount_type: "percentage",
      discount_value: Math.round(input.personal_discount_rate * 1000) / 10,
      waives_delivery: input.waives_delivery ?? false,
      is_active: true,
    };
    const { error: personalError } = await (supabase.from("promo_codes") as any).insert(personalCode); // eslint-disable-line @typescript-eslint/no-explicit-any
    if (personalError) throw new Error(`Affiliate created, but the personal code failed: ${personalError.message}`);
  }

  revalidatePath("/admin/commerce");
}

export async function updateAffiliate(id: number, update: AffiliateUpdate) {
  const supabase = await requireAdmin();
  const { error } = await (supabase.from("affiliates") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .update(update)
    .eq("id", id);
  if (error) throw new Error(error.message);

  // Mirror status onto their codes: pausing/ending should stop the discount
  // from working, not just stop new commission. Reactivating should bring
  // those same codes back — but only the ones THIS pause turned off
  // (auto_paused), not any the admin had separately deactivated by hand
  // before the pause. That manual state survives a pause/reactivate cycle.
  if (update.status === "paused" || update.status === "ended") {
    await (supabase.from("promo_codes") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      .update({ is_active: false, auto_paused: true })
      .eq("affiliate_id", id)
      .eq("is_active", true);
  } else if (update.status === "active") {
    await (supabase.from("promo_codes") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      .update({ is_active: true, auto_paused: false })
      .eq("affiliate_id", id)
      .eq("auto_paused", true);
  }

  // personal_discount_rate on the affiliate is just the reference value —
  // the actual discount comes from their personal promo code(s), so keep
  // those in sync rather than silently leaving them stale (or never created
  // in the first place, e.g. when a personal rate is added after the
  // affiliate already exists).
  if (update.personal_discount_rate != null) {
    const affiliateRes = await supabase.from("affiliates").select("user_id").eq("id", id).single();
    const affiliate = affiliateRes.data as { user_id: string } | null;
    if (affiliate) {
      const discountValue = Math.round(update.personal_discount_rate * 1000) / 10;
      const existingCodesRes = await supabase
        .from("promo_codes")
        .select("id")
        .eq("affiliate_id", id)
        .eq("user_id", affiliate.user_id);
      const existingCodes = existingCodesRes.data as { id: number }[] | null;

      if (existingCodes && existingCodes.length > 0) {
        await (supabase.from("promo_codes") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
          .update({ discount_value: discountValue })
          .eq("affiliate_id", id)
          .eq("user_id", affiliate.user_id);
      } else {
        await (supabase.from("promo_codes") as any).insert({ // eslint-disable-line @typescript-eslint/no-explicit-any
          code: `AKLI-SELF-${id}`,
          affiliate_id: id,
          user_id: affiliate.user_id,
          discount_type: "percentage",
          discount_value: discountValue,
          is_active: true,
        });
      }
    }
  }

  revalidatePath("/admin/commerce");
}

export async function endAffiliateProgram(id: number) {
  const supabase = await requireAdmin();

  const { error } = await (supabase.from("affiliates") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .update({ status: "ended" })
    .eq("id", id);
  if (error) throw new Error(error.message);

  // Deactivate their codes too — ending the program should stop new orders
  // from getting the discount, not just stop new commission from accruing.
  await (supabase.from("promo_codes") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .update({ is_active: false, auto_paused: true })
    .eq("affiliate_id", id)
    .eq("is_active", true);

  revalidatePath("/admin/commerce");
}

export async function deleteAffiliate(id: number) {
  const supabase = await requireAdmin();

  const { count: paymentCount } = await supabase
    .from("payment")
    .select("id", { count: "exact", head: true })
    .eq("affiliate_id", id);
  if ((paymentCount ?? 0) > 0) {
    throw new Error(
      "This affiliate has commission history on real orders — set status to \"ended\" instead of deleting, to keep the financial record intact."
    );
  }

  const { count: payoutCount } = await supabase
    .from("affiliate_payouts")
    .select("id", { count: "exact", head: true })
    .eq("affiliate_id", id);
  if ((payoutCount ?? 0) > 0) {
    throw new Error(
      "This affiliate has recorded payouts — set status to \"ended\" instead of deleting, to keep that financial record intact."
    );
  }
  // Detach AND deactivate — otherwise a deleted affiliate's codes would keep
  // silently working as anonymous public codes.
  await (supabase.from("promo_codes") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .update({ affiliate_id: null, is_active: false })
    .eq("affiliate_id", id);

  const { error } = await supabase.from("affiliates").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/commerce");
}

export async function recordPayout(input: {
  affiliate_id: number;
  amount: number;
  period_start?: string | null;
  period_end?: string | null;
  note?: string | null;
}) {
  const supabase = await requireAdmin();
  const { error } = await (supabase.from("affiliate_payouts") as any).insert(input); // eslint-disable-line @typescript-eslint/no-explicit-any
  if (error) throw new Error(error.message);
  revalidatePath("/admin/commerce");
}

export async function createPromoCode(input: PromoCodeInsert) {
  const supabase = await requireAdmin();
  await assertCodeNotAmbiguous(supabase, input.code as string, input.user_id as string | null | undefined);
  assertDateOrder(input.start_date as string | null | undefined, input.end_date as string | null | undefined);

  const { error } = await (supabase.from("promo_codes") as any).insert(input); // eslint-disable-line @typescript-eslint/no-explicit-any
  if (error) throw new Error(error.message);
  revalidatePath("/admin/commerce");
}

export async function updatePromoCode(id: number, update: PromoCodeUpdate) {
  const supabase = await requireAdmin();
  if (update.code) {
    await assertCodeNotAmbiguous(supabase, update.code as string, update.user_id as string | null | undefined, id);
  }
  if (update.start_date !== undefined || update.end_date !== undefined) {
    const currentRes = await supabase.from("promo_codes").select("start_date,end_date").eq("id", id).single();
    const current = currentRes.data as { start_date: string | null; end_date: string | null } | null;
    const start = update.start_date !== undefined ? update.start_date : current?.start_date;
    const end = update.end_date !== undefined ? update.end_date : current?.end_date;
    assertDateOrder(start as string | null | undefined, end as string | null | undefined);
  }
  const { error } = await (supabase.from("promo_codes") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .update(update)
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/commerce");
}

export async function deletePromoCode(id: number) {
  const supabase = await requireAdmin();

  const { count } = await supabase
    .from("promo_code_usage")
    .select("id", { count: "exact", head: true })
    .eq("promo_code_id", id);
  if ((count ?? 0) > 0) {
    throw new Error("This code has been used on real orders — deactivate it instead of deleting, to keep the order history intact.");
  }

  const { error } = await supabase.from("promo_codes").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/commerce");
}

export async function createVolumeRule(input: VolumeRuleInsert) {
  const supabase = await requireAdmin();
  assertDateOrder(input.start_date as string | null | undefined, input.end_date as string | null | undefined);
  const { error } = await (supabase.from("automatic_discount_rules") as any).insert(input); // eslint-disable-line @typescript-eslint/no-explicit-any
  if (error) throw new Error(error.message);
  revalidatePath("/admin/commerce");
}

export async function updateVolumeRule(id: number, update: VolumeRuleUpdate) {
  const supabase = await requireAdmin();
  if (update.start_date !== undefined || update.end_date !== undefined) {
    const currentRes = await supabase.from("automatic_discount_rules").select("start_date,end_date").eq("id", id).single();
    const current = currentRes.data as { start_date: string | null; end_date: string | null } | null;
    const start = update.start_date !== undefined ? update.start_date : current?.start_date;
    const end = update.end_date !== undefined ? update.end_date : current?.end_date;
    assertDateOrder(start as string | null | undefined, end as string | null | undefined);
  }
  const { error } = await (supabase.from("automatic_discount_rules") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .update(update)
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/commerce");
}

export async function deleteVolumeRule(id: number) {
  const supabase = await requireAdmin();
  const { error } = await supabase.from("automatic_discount_rules").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/commerce");
}
