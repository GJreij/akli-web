import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AkliApp from "@/components/AkliApp";

export default async function RootPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) redirect("/home");

  return <AkliApp initialScreen="landing" />;
}
