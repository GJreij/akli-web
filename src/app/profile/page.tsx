import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Profile from "@/components/Profile";

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const [profileRes, macroHistoryRes, addressesRes] = await Promise.all([
    supabase.from("user").select("*").eq("id", user.id).single(),
    supabase.from("daily_macro_target").select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase.from("user_delivery_address").select("*")
      .eq("user_id", user.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  return (
    <Profile
      userId={user.id}
      profile={profileRes.data}
      macroHistory={macroHistoryRes.data ?? []}
      addresses={addressesRes.data ?? []}
    />
  );
}
