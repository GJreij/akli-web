import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AkliApp from "@/components/AkliApp";

export default async function RootPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const params = await searchParams;

  // Supabase password-reset links land here with ?code= — forward to reset page
  if (params.code) {
    redirect(`/reset-password?code=${params.code}`);
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) redirect("/home");

  return <AkliApp initialScreen="landing" />;
}
