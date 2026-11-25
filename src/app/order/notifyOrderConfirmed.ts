"use server";

import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient, getAuthUser } from "@/lib/supabase/server";

// Sends the "Order confirmed" push to the customer who just placed an order.
// It never throws to the caller: a notification problem must not make a
// successful order look like it failed. A claim row in push_notification_log
// (one per order) guarantees the customer is told once, even if this runs twice.

function shortDate(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short", timeZone: "UTC",
  });
}

export async function notifyOrderConfirmed(): Promise<void> {
  try {
    const user = await getAuthUser();
    if (!user) return;

    // Read with the customer's own session: it can only ever see their rows.
    const supabase = await createClient();
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: plans } = await supabase
      .from("meal_plan")
      .select("id")
      .eq("user_id", user.id)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1);
    const plan = (plans as { id: number }[] | null)?.[0];
    if (!plan) return;

    const { data: daysData } = await supabase
      .from("meal_plan_day")
      .select("date, status")
      .eq("meal_plan_id", plan.id);
    const dates = ((daysData ?? []) as { date: string; status: string }[])
      .filter((d) => d.status !== "cancelled")
      .map((d) => d.date)
      .sort();
    if (!dates.length) return;

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // No point claiming (or logging) for customers who don't have the app.
    const { data: tokens } = await admin.from("device_token").select("id").eq("user_id", user.id).limit(1);
    if (!tokens?.length) return;

    const { data: claimed, error: claimErr } = await admin
      .from("push_notification_log")
      .upsert(
        { user_id: user.id, kind: "order_confirmed", ref: String(plan.id) },
        { onConflict: "user_id,kind,ref", ignoreDuplicates: true },
      )
      .select("id");
    if (claimErr || !claimed?.length) return;

    const what = dates.length === 1
      ? `Your order for ${shortDate(dates[0])} is confirmed.`
      : `Your order for ${dates.length} days (${shortDate(dates[0])} to ${shortDate(dates[dates.length - 1])}) is confirmed.`;

    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-push`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_ids: [user.id],
        title: "Order confirmed",
        body: `${what} We'll remind you on delivery day.`,
        path: "/orders",
      }),
    });
    const result = res.ok ? await res.json().catch(() => null) : null;
    if (!result || !(result.sent > 0)) {
      // Nothing went out: release the claim so it isn't lost.
      await admin.from("push_notification_log").delete()
        .eq("user_id", user.id).eq("kind", "order_confirmed").eq("ref", String(plan.id));
    }
  } catch (e) {
    console.error("[push] order confirmed notification failed", e);
  }
}
