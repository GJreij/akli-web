import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import HomeDashboard from "@/components/HomeDashboard";

export default async function HomePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in");

  const [profileRes, macroRes] = await Promise.all([
    supabase.from("user").select("*").eq("id", user.id).single(),
    supabase
      .from("daily_macro_target")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single(),
  ]);

  return (
    <HomeDashboard
      profile={profileRes.data}
      macroTarget={macroRes.data}
    />
  );
}
