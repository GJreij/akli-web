import { createClient } from "@/lib/supabase/server";
import AkliApp from "@/components/AkliApp";
import type { Database } from "@/lib/supabase/types";

type UserRow = Database["public"]["Tables"]["user"]["Row"];
type MacroRow = Database["public"]["Tables"]["daily_macro_target"]["Row"];

export default async function RootPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
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
      <AkliApp
        initialScreen="home"
        profile={profileRes.data as UserRow | null}
        macroTarget={macroRes.data as MacroRow | null}
      />
    );
  }

  return <AkliApp initialScreen="landing" />;
}
