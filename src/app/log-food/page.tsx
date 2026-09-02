import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { beirutISODate } from "@/lib/dates";
import LogFood from "@/components/LogFood";

export default async function LogFoodPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: dateParam } = await searchParams;
  const date = dateParam ?? beirutISODate(0);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const [profileRes, macroTargetRes, orderRes, entriesRes] = await Promise.all([
    supabase.from("user").select("name").eq("id", user.id).single(),
    supabase
      .from("daily_macro_target")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single(),
    supabase
      .from("daily_macro_order")
      .select("kcal_ordered, protein_ordered, carbs_ordered, fat_ordered")
      .eq("user_id", user.id)
      .eq("for_date", date)
      .maybeSingle(),
    // A removed order_auto entry stays fetched (as "hidden") so it can show
    // an always-available Restore control in its meal section — only
    // catalog/quick_add removals are truly dropped from view.
    supabase
      .from("food_log_entry")
      .select("*, food_catalog_item:food_catalog_item_id ( status )")
      .eq("user_id", user.id)
      .eq("log_date", date)
      .or("hidden_by_user.eq.false,entry_source.eq.order_auto")
      .order("created_at", { ascending: true }),
  ]);

  const profile = profileRes.data as { name: string | null } | null;

  return (
    <LogFood
      userId={user.id}
      name={profile?.name ?? ""}
      date={date}
      macroTarget={macroTargetRes.data}
      order={orderRes.data}
      initialEntries={entriesRes.data ?? []}
    />
  );
}
