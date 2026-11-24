import Link from "next/link";
import type { ReactNode } from "react";
import { COLORS as C, FONTS } from "@/lib/theme";

export const LEGAL_CONTACT = {
  company: "AGOGO L.L.C",
  place: "Dekweneh, Metn, Lebanon",
  whatsapp: "+961 81 567 192",
  email: "georges.jreij@akli-lb.org",
};

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: 34 }}>
      <h2 style={{ fontFamily: FONTS.serif, fontSize: 22, color: C.primary, margin: "0 0 10px" }}>{title}</h2>
      {children}
    </section>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p style={{ margin: "0 0 12px" }}>{children}</p>;
}

export function Ul({ children }: { children: ReactNode }) {
  return <ul style={{ margin: "0 0 12px", paddingLeft: 22, display: "flex", flexDirection: "column", gap: 8 }}>{children}</ul>;
}

export default function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: C.offWhite, color: C.text, fontFamily: FONTS.sans }}>
      <header style={{ background: C.primary, padding: "16px 20px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <Link href="/" style={{ fontFamily: FONTS.serif, fontSize: 24, color: C.white, textDecoration: "none" }}>Akli</Link>
          <nav style={{ display: "flex", gap: 18, fontSize: 13 }}>
            <Link href="/privacy" style={{ color: C.cream, textDecoration: "none" }}>Privacy</Link>
            <Link href="/terms" style={{ color: C.cream, textDecoration: "none" }}>Terms</Link>
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px 72px", fontSize: 15, lineHeight: 1.7 }}>
        <h1 style={{ fontFamily: FONTS.serif, fontSize: 36, color: C.primary, margin: 0 }}>{title}</h1>
        <p style={{ color: C.textMuted, fontSize: 13, margin: "8px 0 0" }}>Last updated {updated}</p>
        {children}

        <section style={{ marginTop: 44, paddingTop: 20, borderTop: `1px solid ${C.border}`, fontSize: 13, color: C.textMuted }}>
          <div>{LEGAL_CONTACT.company} · {LEGAL_CONTACT.place}</div>
          <div>WhatsApp {LEGAL_CONTACT.whatsapp} · <a href={`mailto:${LEGAL_CONTACT.email}`} style={{ color: C.tealDark }}>{LEGAL_CONTACT.email}</a></div>
        </section>
      </main>
    </div>
  );
}
