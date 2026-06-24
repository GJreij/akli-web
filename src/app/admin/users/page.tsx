import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type UserRow = Pick<Database["public"]["Tables"]["user"]["Row"], "id" | "name" | "last_name" | "email" | "phone_number" | "role" | "created_at">;

const C = {
  primary: "#063330", teal: "#67b1b0", tealDark: "#437b7b",
  offWhite: "#eee9e6", muted: "#5c5c5c", light: "#9a9a9a",
  border: "#e0dbd5", white: "#ffffff", warn: "#b8860b",
};

function RolePill({ role }: { role: string | null }) {
  const isAdmin = role === "admin";
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 600, color: isAdmin ? C.primary : C.muted,
      background: isAdmin ? `${C.teal}30` : C.offWhite,
      borderRadius: 6, padding: "2px 7px", textTransform: "uppercase", letterSpacing: "0.03em",
    }}>
      {role ?? "client"}
    </span>
  );
}

function TableFallback() {
  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, height: 280 }} />
  );
}

async function UsersTable({ q }: { q?: string }) {
  const supabase = await createClient();

  let query = supabase.from("user").select("id,name,last_name,email,phone_number,role,created_at").order("created_at", { ascending: false }).limit(200);
  if (q) {
    query = query.or(`name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,phone_number.ilike.%${q}%`);
  }
  const { data } = await query;
  const users = (data ?? []) as UserRow[];

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: C.light }}>{users.length} shown</span>
      </div>
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
        <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", color: C.light, borderBottom: `1px solid ${C.border}` }}>
              <th style={{ padding: "10px 14px" }}>Name</th>
              <th style={{ padding: "10px 14px" }}>Email</th>
              <th style={{ padding: "10px 14px" }}>Phone</th>
              <th style={{ padding: "10px 14px" }}>Role</th>
              <th style={{ padding: "10px 14px" }}>Joined</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: "24px 14px", textAlign: "center", color: C.light }}>
                  No users found.
                </td>
              </tr>
            ) : users.map(u => (
              <tr key={u.id} style={{ borderBottom: `1px solid ${C.offWhite}` }}>
                <td style={{ padding: "10px 14px" }}>
                  <Link href={`/admin/users/${u.id}`} style={{ color: C.primary, fontWeight: 600, textDecoration: "none" }}>
                    {`${u.name ?? ""} ${u.last_name ?? ""}`.trim() || "—"}
                  </Link>
                </td>
                <td style={{ padding: "10px 14px", color: C.muted }}>{u.email ?? "—"}</td>
                <td style={{ padding: "10px 14px", color: C.muted }}>{u.phone_number ?? "—"}</td>
                <td style={{ padding: "10px 14px" }}><RolePill role={u.role} /></td>
                <td style={{ padding: "10px 14px", color: C.light, whiteSpace: "nowrap" }}>
                  {new Date(u.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;

  return (
    <div style={{ padding: "24px 20px 60px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 18 }}>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 500, color: C.primary, margin: 0 }}>
            Users
          </h1>
        </div>

        <form style={{ marginBottom: 16 }}>
          <input
            type="text"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search name, email, or phone…"
            style={{
              width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${C.border}`,
              fontSize: 13.5, background: C.white, color: C.primary,
            }}
          />
        </form>

        <Suspense fallback={<TableFallback />} key={q ?? ""}>
          <UsersTable q={q} />
        </Suspense>
      </div>
    </div>
  );
}
