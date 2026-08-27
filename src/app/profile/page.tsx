import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Profile from "@/components/Profile";

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const [profileRes, macroHistoryRes, addressesRes, walletBalanceRes, topupRequestsRes] = await Promise.all([
    supabase.from("user").select("*").eq("id", user.id).single(),
    supabase.from("daily_macro_target").select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase.from("user_delivery_address").select("*")
      .eq("user_id", user.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false }),
    // Server-side SUM via get_wallet_balance() — a plain `.select("amount")`
    // here is capped at PostgREST's default row limit and silently
    // truncates the sum once a user's wallet_transactions history grows
    // past it.
    (supabase as any).rpc("get_wallet_balance", { p_user_id: user.id }), // eslint-disable-line @typescript-eslint/no-explicit-any
    supabase.from("wallet_topup_request").select("id, amount, status, payment_note, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const walletBalance = Number(walletBalanceRes.data ?? 0);

  return (
    <Profile
      userId={user.id}
      profile={profileRes.data}
      macroHistory={macroHistoryRes.data ?? []}
      addresses={addressesRes.data ?? []}
      walletBalance={walletBalance}
      walletTopupRequests={topupRequestsRes.data ?? []}
    />
  );
}
