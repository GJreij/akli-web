import { redirect } from "next/navigation";
import { getAuthUser, getUserRole } from "@/lib/supabase/server";
import AdminNav from "@/components/AdminNav";
import StaleAppGuard from "@/components/admin/StaleAppGuard";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser();
  if (!user) redirect("/home");

  if ((await getUserRole(user.id)) !== "admin") redirect("/home");

  return (
    <div style={{ minHeight: "100vh", background: "#eee9e6" }}>
      <StaleAppGuard />
      <AdminNav />
      {children}
    </div>
  );
}
