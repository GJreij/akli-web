"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { deleteMyAccount, getDeletionStatus } from "@/app/profile/deleteAccount";
import type { DeletionBlockers } from "@/lib/accountDeletion";

const C = {
  primary: "#063330", tealDark: "#437b7b", muted: "#5c5c5c", light: "#9a9a9a",
  border: "#e0dbd5", white: "#ffffff", error: "#c0392b", errorBg: "#fdf0ef",
};
const WHATSAPP_URL = "https://wa.me/96181567192?text=" + encodeURIComponent("Hi Akli, I'd like to delete my account.");

function money(n: number) {
  return `$${Math.abs(n).toFixed(2)}`;
}

function BlockerList({ b }: { b: DeletionBlockers }) {
  const items: React.ReactNode[] = [];
  if (b.notClient) {
    items.push(<li key="role">This type of account can&apos;t be deleted in the app. Message us and we&apos;ll take care of it.</li>);
  }
  if (b.upcomingOrders > 0) {
    items.push(
      <li key="orders">
        You have {b.upcomingOrders} upcoming delivery {b.upcomingOrders === 1 ? "day" : "days"}. Cancel {b.upcomingOrders === 1 ? "it" : "them"} from your{" "}
        <Link href="/orders" style={{ color: C.tealDark }}>Orders page</Link> first.
      </li>
    );
  }
  if (b.pendingTopups > 0) {
    items.push(<li key="topup">You have a wallet top-up waiting for review. Message us so we can settle it first.</li>);
  }
  if (b.walletBalance >= 0.01) {
    items.push(<li key="credit">You have {money(b.walletBalance)} in your wallet. Message us and we&apos;ll refund it, then you can delete your account.</li>);
  }
  if (b.walletBalance <= -0.01) {
    items.push(<li key="owed">Your wallet shows {money(b.walletBalance)} owed. Message us so we can settle it first.</li>);
  }
  return <ul style={{ margin: "0 0 14px", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8, fontSize: 13.5, lineHeight: 1.5 }}>{items}</ul>;
}

function Sheet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [phase, setPhase] = useState<"loading" | "blocked" | "confirm" | "failed">("loading");
  const [blockers, setBlockers] = useState<DeletionBlockers | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDeletionStatus()
      .then(({ blockers, canDelete }) => { if (!cancelled) { setBlockers(blockers); setPhase(canDelete ? "confirm" : "blocked"); } })
      .catch(e => { if (!cancelled) { setError(e instanceof Error ? e.message : "Something went wrong."); setPhase("failed"); } });
    return () => { cancelled = true; };
  }, []);

  async function confirmDelete() {
    setBusy(true);
    setError(null);
    try {
      await deleteMyAccount(typed);
      // Clear this device's session only; the login is already disabled server-side.
      await createClient().auth.signOut({ scope: "local" });
      router.push("/");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't delete your account. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={busy ? undefined : onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.white, width: "100%", maxWidth: 480, borderRadius: "18px 18px 0 0", padding: "22px 20px 28px", maxHeight: "88vh", overflowY: "auto" }}>
        <p style={{ margin: "0 0 12px", fontSize: 17, fontWeight: 600, fontFamily: "'Playfair Display', Georgia, serif" }}>Delete your account</p>

        {phase === "loading" && <p style={{ margin: 0, fontSize: 13.5, color: C.muted }}>Checking your account…</p>}

        {phase === "failed" && <p style={{ margin: 0, fontSize: 13.5, color: C.error }}>{error}</p>}

        {phase === "blocked" && blockers && (
          <>
            <p style={{ margin: "0 0 10px", fontSize: 13.5, color: C.muted }}>Before we can delete your account:</p>
            <BlockerList b={blockers} />
            <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" style={{ display: "block", textAlign: "center", background: C.primary, color: C.white, padding: "12px", borderRadius: 10, fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
              Message Akli on WhatsApp
            </a>
          </>
        )}

        {phase === "confirm" && (
          <>
            <p style={{ margin: "0 0 10px", fontSize: 13.5, color: C.muted, lineHeight: 1.55 }}>
              This can&apos;t be undone. We&apos;ll permanently delete your name, email, phone, date of birth, addresses, nutrition details, allergens, preferences,
              food diary and chats, and you&apos;ll be signed out everywhere. Past orders and payments stay in our records without any link to you.
            </p>
            <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 600 }}>Type DELETE to confirm</p>
            <input
              value={typed} onChange={e => setTyped(e.target.value)} autoCapitalize="characters" autoComplete="off"
              style={{ width: "100%", padding: "11px 12px", border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 16, marginBottom: 10 }}
            />
            {error && <p style={{ margin: "0 0 10px", fontSize: 13, color: C.error }}>{error}</p>}
            <button
              onClick={confirmDelete} disabled={busy || typed.trim().toUpperCase() !== "DELETE"}
              style={{ width: "100%", background: C.error, color: C.white, border: "none", borderRadius: 10, padding: "12px", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: busy || typed.trim().toUpperCase() !== "DELETE" ? 0.45 : 1 }}
            >
              {busy ? "Deleting…" : "Delete my account permanently"}
            </button>
          </>
        )}

        <button onClick={onClose} disabled={busy} style={{ display: "block", margin: "14px auto 0", background: "none", border: "none", fontSize: 13, color: C.light, cursor: "pointer", textDecoration: "underline" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function DeleteAccount() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <p style={{ margin: "0 0 12px", fontSize: 13, color: C.muted, lineHeight: 1.55 }}>
        Permanently remove your personal details from Akli. You can only do this once you have no upcoming deliveries and your wallet is at zero.
      </p>
      <button onClick={() => setOpen(true)} style={{ background: C.white, color: C.error, border: `1px solid ${C.error}`, borderRadius: 10, padding: "10px 16px", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>
        Delete my account
      </button>
      {open && <Sheet onClose={() => setOpen(false)} />}
    </div>
  );
}
