"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { logout } from "@/app/admin/logout/actions";

const C = {
  primary: "#063330", teal: "#67b1b0",
  offWhite: "#eee9e6", muted: "#5c5c5c",
  border: "#e0dbd5", white: "#ffffff",
};

const TABS = [
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/admin/procurement", label: "Procurement" },
  { href: "/admin/cooking", label: "Cooking" },
  { href: "/admin/packaging", label: "Packaging" },
  { href: "/admin/deliveries", label: "Deliveries" },
  { href: "/admin/operations", label: "Operations" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/catalog", label: "Catalog" },
  { href: "/admin/commerce", label: "Commerce" },
  { href: "/admin/analytics", label: "Analytics" },
];

export default function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div style={{ background: C.primary, padding: "16px 20px 0" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, color: C.white, fontWeight: 500 }}>
            akli admin
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => router.push("/home")}
              style={{
                background: "rgba(255,255,255,0.1)", color: C.white, border: "none", borderRadius: 6,
                padding: "6px 12px", fontSize: 12, fontWeight: 500, cursor: "pointer",
              }}
            >
              Home (Order)
            </button>
            <button
              onClick={() => startTransition(() => logout())}
              disabled={pending}
              style={{
                background: "rgba(255,255,255,0.1)", color: C.white, border: "none", borderRadius: 6,
                padding: "6px 12px", fontSize: 12, fontWeight: 500, cursor: pending ? "default" : "pointer",
                opacity: pending ? 0.6 : 1,
              }}
            >
              {pending ? "Logging out…" : "Logout"}
            </button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, overflowX: "auto" }}>
          {TABS.map(tab => {
            const active = pathname.startsWith(tab.href);
            return (
              <button
                key={tab.href}
                onClick={() => router.push(tab.href)}
                style={{
                  background: active ? C.offWhite : "transparent",
                  color: active ? C.primary : "rgba(255,255,255,0.7)",
                  border: "none",
                  borderRadius: "10px 10px 0 0",
                  padding: "8px 16px",
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
