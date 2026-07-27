import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AkliApp from "@/components/AkliApp";

export default async function RootPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; start?: string }>;
}) {
  const params = await searchParams;

  // Supabase password-reset links land here with ?code= — forward to reset page
  if (params.code) {
    redirect(`/reset-password?code=${params.code}`);
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) redirect("/home");

  // Marketing-site CTAs pass ?start=onboarding to skip this app's own
  // landing screen and drop the visitor straight onto the first onboarding
  // step (goal), instead of making them click "Get started" twice.
  const initialScreen = params.start === "onboarding" ? "onboarding" : "landing";
  return <AkliApp initialScreen={initialScreen} />;
}
