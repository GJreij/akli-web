import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import AdminNav from "@/components/AdminNav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/home");

  const profileRes = await supabase.from("user").select("*").eq("id", user.id).single();
  const profile = profileRes.data as Database["public"]["Tables"]["user"]["Row"] | null;
  if (profile?.role !== "admin") redirect("/home");

  return (
    <div style={{ minHeight: "100vh", background: "#eee9e6" }}>
      <AdminNav />
      {children}
    </div>
  );
}
