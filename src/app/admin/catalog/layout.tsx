"use client";

import { usePathname, useRouter } from "next/navigation";
import { C } from "@/components/admin/ui";

const TABS = [
  { href: "/admin/catalog/ingredients", label: "Ingredients" },
  { href: "/admin/catalog/subrecipes", label: "Subrecipes" },
  { href: "/admin/catalog/recipes", label: "Recipes" },
  { href: "/admin/catalog/weekly-menus", label: "Weekly menus" },
];

export default function CatalogLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div>
      <div style={{ padding: "16px 20px 0", maxWidth: 760, margin: "0 auto" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {TABS.map(tab => {
            const active = pathname.startsWith(tab.href);
            return (
              <button
                key={tab.href}
                onClick={() => router.push(tab.href)}
                style={{
                  background: active ? C.primary : C.offWhite,
                  color: active ? C.white : C.muted,
                  border: "none", borderRadius: 8, padding: "6px 12px",
                  fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
      {children}
    </div>
  );
}
