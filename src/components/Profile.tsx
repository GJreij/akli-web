"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconArrowLeft, IconUser, IconChevronDown,
  IconPencil, IconCheck, IconBrandWhatsapp, IconWallet,
} from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import ProfileAddresses from "@/components/ProfileAddresses";
import DietWizard from "@/components/DietWizard";
import { COUNTRY_CODES } from "@/lib/theme";
import { requestWalletTopup } from "@/app/profile/actions";
import type { Database } from "@/lib/supabase/types";

type UserRow    = Database["public"]["Tables"]["user"]["Row"];
type MacroRow   = Database["public"]["Tables"]["daily_macro_target"]["Row"];
type AddressRow = Database["public"]["Tables"]["user_delivery_address"]["Row"];

type WalletTopupRequestRow = {
  id: number;
  amount: number;
  status: string;
  payment_note: string | null;
  created_at: string;
};

const C = {
  primary:  "#063330",
  teal:     "#67b1b0",
  tealDark: "#437b7b",
  offWhite: "#eee9e6",
  muted:    "#5c5c5c",
  light:    "#9a9a9a",
  border:   "#e0dbd5",
  white:    "#ffffff",
  error:    "#c0392b",
};

const TOPUP_STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  pending:  { label: "Pending review", bg: "#fff8e6", color: "#b45309" },
  approved: { label: "Approved",       bg: "#f0faf0", color: "#15803d" },
  rejected: { label: "Rejected",       bg: "#fff0f0", color: C.error },
};

const DIET_LABELS: Record<string, string> = {
  "high-protein": "💪 High Protein", balanced: "⚖️ Balanced", "low-carb": "🥗 Low Carb", "low-fat": "🥗 Light & Clean",
  "personalized": "✨ Personalized Macros",
};

const GOAL_LABELS: Record<string, string> = {
  lose: "Lose weight", maintain: "Maintain weight", build: "Build muscle", health: "General health",
};

function fmtDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// Split a stored "+961XXXXXXXX" phone number into country code + national
// number, same convention used at onboarding (see AkliApp.tsx).
function splitPhone(raw: string | null): { cc: string; national: string } {
  if (!raw) return { cc: "+961", national: "" };
  const byLongestCode = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);
  const match = byLongestCode.find(c => raw.startsWith(c.code));
  if (match) return { cc: match.code, national: raw.slice(match.code.length) };
  return { cc: "+961", national: raw.replace(/\D/g, "") };
}

// ─── Collapsible section shell ─────────────────────────────────────────────────

function Section({ title, subtitle, children, defaultOpen = false }: {
  title: string; subtitle?: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, marginBottom: 14, overflow: "hidden" }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
        background: "none", border: "none", padding: "16px 16px", cursor: "pointer", textAlign: "left",
      }}>
        <div>
          <p style={{ margin: "0 0 2px", fontSize: 14.5, fontWeight: 600 }}>{title}</p>
          {subtitle && <p style={{ margin: 0, fontSize: 11.5, color: C.light }}>{subtitle}</p>}
        </div>
        <IconChevronDown size={16} color={C.light} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }} />
      </button>
      {open && <div style={{ padding: "0 16px 16px" }}>{children}</div>}
    </div>
  );
}

// ─── Account info ───────────────────────────────────────────────────────────────

function AccountInfo({ profile }: { profile: UserRow | null }) {
  const [editing, setEditing] = useState(false);
  const [name, setName]       = useState(profile?.name ?? "");
  const [lastName, setLastName] = useState(profile?.last_name ?? "");
  const initialPhone = splitPhone(profile?.phone_number ?? null);
  const [countryCode, setCountryCode] = useState(initialPhone.cc);
  const [phone, setPhone]     = useState(initialPhone.national);
  const [dob, setDob]         = useState(profile?.DoB ?? "");
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState<string | null>(null);

  // Local state above is also what drives the read-only view below, so the
  // display updates immediately after a successful save — no need to
  // refetch/refresh the page to see the new values.
  const displayPhone = phone.trim() ? `${countryCode}${phone.trim()}` : null;

  async function save() {
    if (!profile) return;
    setSaving(true); setErr(null);
    try {
      const supabase = createClient();
      const { error } = await (supabase.from("user") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
        .update({
          name: name.trim() || null,
          last_name: lastName.trim() || null,
          phone_number: displayPhone,
          DoB: dob || null,
        }).eq("id", profile.id);
      if (error) throw new Error(error.message);
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save changes.");
    } finally { setSaving(false); }
  }

  if (!editing) {
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ fontSize: 13.5, lineHeight: 1.9 }}>
            <p style={{ margin: 0 }}><span style={{ color: C.light }}>Name:</span> {name} {lastName}</p>
            <p style={{ margin: 0 }}><span style={{ color: C.light }}>Email:</span> {profile?.email}</p>
            <p style={{ margin: 0 }}><span style={{ color: C.light }}>Phone:</span> {displayPhone || "—"}</p>
            <p style={{ margin: 0 }}><span style={{ color: C.light }}>Date of birth:</span> {dob ? fmtDate(dob) : "—"}</p>
          </div>
          <button onClick={() => setEditing(true)} style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", padding: 0, color: C.tealDark, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
            <IconPencil size={13} /> Edit
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input type="text" placeholder="First name" value={name} onChange={e => setName(e.target.value)} />
        <input type="text" placeholder="Last name" value={lastName} onChange={e => setLastName(e.target.value)} />
      </div>

      {/* Phone with country code — same pattern as onboarding */}
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <select
            value={countryCode}
            onChange={e => setCountryCode(e.target.value)}
            style={{ paddingRight: 28, paddingLeft: 10, width: "auto", minWidth: 90, cursor: "pointer" }}
          >
            {COUNTRY_CODES.map(c => (
              <option key={c.code} value={c.code}>
                {c.flag} {c.code}
              </option>
            ))}
          </select>
          <IconChevronDown size={13} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: C.light }} />
        </div>
        <div style={{ position: "relative", flex: 1 }}>
          <input
            type="tel"
            inputMode="numeric"
            placeholder="Phone number"
            value={phone}
            onChange={e => setPhone(e.target.value.replace(/\D/g, ""))}
            style={{ paddingLeft: 36 }}
          />
          <IconBrandWhatsapp size={15} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.light }} />
        </div>
      </div>

      <input type="date" value={dob ?? ""} onChange={e => setDob(e.target.value)} style={{ marginBottom: 10 }} />
      <p style={{ fontSize: 11.5, color: C.light, margin: "0 0 10px" }}>
        Email can&apos;t be changed here — message Akli on WhatsApp if you need to update it.
      </p>
      {err && <p style={{ fontSize: 11.5, color: C.error, margin: "0 0 8px" }}>{err}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={save} disabled={saving} style={{ flex: 1, padding: "9px 0", fontSize: 13 }}>
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button onClick={() => setEditing(false)} style={{ padding: "9px 14px", fontSize: 13, background: "none", border: `1px solid ${C.border}` }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Diet section ────────────────────────────────────────────────────────────────

function DietSection({ userId, profile, macroHistory, onWizardSaved }: {
  userId: string;
  profile: UserRow | null;
  macroHistory: MacroRow[];
  onWizardSaved: (m: MacroRow) => void;
}) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const current = macroHistory[0] ?? null;
  const fullHistory = macroHistory.slice(1);
  const history = showAllHistory ? fullHistory : fullHistory.slice(0, 3);

  return (
    <>
      {current ? (
        <div style={{ background: C.offWhite, borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
          <p style={{ fontSize: 11, color: C.light, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Current daily target
          </p>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {[
              { label: "Kcal",    val: Math.round(current.kcal_target ?? 0).toLocaleString() },
              { label: "Protein", val: `${Math.round(current.protein_g ?? 0)}g` },
              { label: "Carbs",   val: `${Math.round(current.carbs_g ?? 0)}g` },
              { label: "Fat",     val: `${Math.round(current.fat_g ?? 0)}g` },
            ].map(({ label, val }) => (
              <div key={label} style={{ flex: 1, textAlign: "center", background: C.white, borderRadius: 7, padding: "6px 2px" }}>
                <p style={{ fontSize: 9.5, color: C.light, margin: "0 0 2px", textTransform: "uppercase" }}>{label}</p>
                <p style={{ fontSize: 12.5, fontWeight: 700, margin: 0, color: C.primary }}>{val}</p>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11.5, color: C.muted, margin: 0 }}>
            Style: {DIET_LABELS[current.diet_type ?? ""] ?? "—"} · since {current.created_at ? fmtDate(current.created_at.split("T")[0]) : "—"}
          </p>
          {(current.goal || current.weight_kg) && (
            <p style={{ fontSize: 11.5, color: C.muted, margin: "3px 0 0" }}>
              {current.goal && <>Goal: {GOAL_LABELS[current.goal] ?? current.goal}</>}
              {current.goal && current.weight_kg ? " · " : ""}
              {current.weight_kg && <>{current.weight_kg}kg{current.height_cm ? `, ${current.height_cm}cm` : ""}</>}
            </p>
          )}
        </div>
      ) : (
        <p style={{ fontSize: 13, color: C.light, margin: "0 0 12px" }}>No diet set up yet.</p>
      )}

      <button onClick={() => setWizardOpen(true)} className="btn-primary" style={{ width: "100%", marginBottom: history.length > 0 ? 16 : 0 }}>
        Update my diet
      </button>

      {history.length > 0 && (
        <div>
          <p style={{ fontSize: 12, color: C.muted, margin: "0 0 8px", fontWeight: 600 }}>History</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {history.map(m => (
              <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 12.5, padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ color: C.muted }}>{m.created_at ? fmtDate(m.created_at.split("T")[0]) : "—"}</span>
                  <span>{Math.round(m.kcal_target ?? 0).toLocaleString()} kcal · {DIET_LABELS[m.diet_type ?? ""] ?? m.diet_type}</span>
                </div>
                {m.goal && (
                  <span style={{ fontSize: 11, color: C.light }}>
                    {GOAL_LABELS[m.goal] ?? m.goal}{m.weight_kg ? ` · ${m.weight_kg}kg` : ""}
                  </span>
                )}
              </div>
            ))}
          </div>
          {fullHistory.length > 3 && (
            <button
              onClick={() => setShowAllHistory(s => !s)}
              style={{ background: "none", border: "none", padding: 0, marginTop: 10, color: C.tealDark, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
            >
              {showAllHistory ? "Show less" : `View all history (${fullHistory.length})`}
            </button>
          )}
        </div>
      )}

      {wizardOpen && (
        <DietWizard
          userId={userId}
          currentMacro={current}
          profile={profile}
          onClose={() => setWizardOpen(false)}
          onSaved={(m) => { onWizardSaved(m); setWizardOpen(false); }}
        />
      )}
    </>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────────

// ─── Wallet top-up request sheet ───────────────────────────────────────────

function WalletTopupSheet({ onClose, onSubmitted }: { onClose: () => void; onSubmitted: () => void }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [phase, setPhase] = useState<"form" | "done">("form");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const parsed = parseFloat(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Enter an amount greater than $0.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await requestWalletTopup(parsed, note);
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit this request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div onClick={phase === "done" ? undefined : onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(6,51,48,0.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, background: C.white, borderRadius: "18px 18px 0 0", padding: "22px 20px 32px" }}>
        {phase === "form" && (
          <>
            <h3 style={{ margin: "0 0 4px", fontSize: 18 }}>Request a top-up</h3>
            <p style={{ fontSize: 12.5, color: C.muted, margin: "0 0 16px" }}>
              Let us know how much you&apos;d like added to your wallet — we&apos;ll confirm once your payment comes
              through (Whish, cash, or however works for you).
            </p>

            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Amount</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 14, color: C.muted }}>$</span>
              <input
                type="number" inputMode="decimal" min={0} step={1} placeholder="0.00"
                value={amount} onChange={e => setAmount(e.target.value)}
                style={{ flex: 1 }}
              />
            </div>

            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
              Note <span style={{ fontWeight: 400, color: C.light }}>(optional)</span>
            </label>
            <input
              type="text" placeholder="e.g. paying via Whish today"
              value={note} onChange={e => setNote(e.target.value)}
              style={{ width: "100%", marginBottom: 16 }}
            />

            {error && (
              <div style={{ background: "#fdf0ef", border: `1px solid ${C.error}`, borderRadius: 10, padding: "10px 14px", fontSize: 12.5, color: C.error, marginBottom: 14 }}>
                {error}
              </div>
            )}

            <button
              onClick={submit}
              disabled={submitting}
              style={{
                width: "100%", padding: "13px 0", borderRadius: 12, border: "none",
                background: C.primary, color: C.white, fontSize: 14, fontWeight: 600,
                cursor: submitting ? "default" : "pointer", opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? "Sending…" : "Send request"}
            </button>
          </>
        )}

        {phase === "done" && (
          <div style={{ textAlign: "center", padding: "12px 0 4px" }}>
            <div style={{
              width: 52, height: 52, borderRadius: "50%", background: "#e6f7f0", margin: "0 auto 16px",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <IconCheck size={26} color="#15803d" />
            </div>
            <h3 style={{ margin: "0 0 8px", fontSize: 18 }}>Request sent</h3>
            <p style={{ fontSize: 13, color: C.muted, margin: "0 0 20px", lineHeight: 1.6 }}>
              We&apos;ll review it and add the funds to your wallet once your payment is confirmed.
            </p>
            <button
              onClick={onSubmitted}
              style={{
                width: "100%", padding: "13px 0", borderRadius: 12, border: "none",
                background: C.primary, color: C.white, fontSize: 14, fontWeight: 600, cursor: "pointer",
              }}
            >
              Got it
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Profile({ userId, profile, macroHistory, addresses, walletBalance = 0, walletTopupRequests = [] }: {
  userId: string;
  profile: UserRow | null;
  macroHistory: MacroRow[];
  addresses: AddressRow[];
  walletBalance?: number;
  walletTopupRequests?: WalletTopupRequestRow[];
}) {
  const router = useRouter();
  const [macroHistoryState, setMacroHistoryState] = useState(macroHistory);
  const [savedFlash, setSavedFlash] = useState(false);
  const [topupSheet, setTopupSheet] = useState(false);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  function handleDietSaved(m: MacroRow) {
    setMacroHistoryState(prev => [m, ...prev]);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2500);
  }

  return (
    <div style={{ minHeight: "100vh", background: C.offWhite, display: "flex", flexDirection: "column" }}>
      {/* Hero header */}
      <div style={{ background: C.primary, padding: "18px 20px 26px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => router.push("/home")} style={{ background: "none", border: "none", padding: 0, color: "rgba(255,255,255,0.6)", cursor: "pointer", display: "flex" }}>
              <IconArrowLeft size={18} />
            </button>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>Back to home</span>
          </div>
          <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 17, color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>akli</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <IconUser size={22} color="rgba(255,255,255,0.7)" />
          </div>
          <div>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 500, color: C.white, margin: 0 }}>
              {profile?.name ? `${profile.name} ${profile.last_name ?? ""}`.trim() : "Your profile"}
            </h2>
            <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.5)", margin: "2px 0 0" }}>{profile?.email}</p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: "18px 20px 40px" }}>

        {savedFlash && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#f0f7f7", border: `1px solid ${C.teal}`, borderRadius: 10, padding: "10px 14px", fontSize: 13, color: C.tealDark, marginBottom: 14 }}>
            <IconCheck size={16} /> Your diet has been updated.
          </div>
        )}

        {topupSheet && (
          <WalletTopupSheet
            onClose={() => setTopupSheet(false)}
            onSubmitted={() => { setTopupSheet(false); router.refresh(); }}
          />
        )}

        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          background: C.white, border: `1px solid ${C.border}`, borderRadius: 14,
          padding: "14px 16px", marginBottom: 14,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, background: "#f0f7f7",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <IconWallet size={19} color={C.tealDark} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ margin: "0 0 1px", fontSize: 11.5, color: C.light, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Wallet balance
            </p>
            <p style={{ margin: 0, fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 500, color: C.primary }}>
              ${walletBalance.toFixed(2)}
            </p>
          </div>
          <button
            onClick={() => setTopupSheet(true)}
            style={{ background: "none", border: "none", padding: 0, fontSize: 12.5, fontWeight: 600, color: C.tealDark, cursor: "pointer", textDecoration: "underline" }}
          >
            Request top-up
          </button>
        </div>

        {walletTopupRequests.length > 0 && (
          <Section title="Wallet top-up requests" subtitle="Your recent requests">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {walletTopupRequests.map(r => {
                const cfg = TOPUP_STATUS_CONFIG[r.status] ?? TOPUP_STATUS_CONFIG.pending;
                return (
                  <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px" }}>
                    <div>
                      <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 600 }}>${r.amount.toFixed(2)}</p>
                      <p style={{ margin: 0, fontSize: 11, color: C.light }}>{fmtDate(r.created_at.split("T")[0])}</p>
                    </div>
                    <span style={{
                      fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em",
                      padding: "2px 8px", borderRadius: 20, background: cfg.bg, color: cfg.color,
                    }}>
                      {cfg.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        <Section title="Account" subtitle="Your personal details" defaultOpen>
          <AccountInfo profile={profile} />
        </Section>

        <Section title="Your diet" subtitle="Current target, history, and updates" defaultOpen>
          <DietSection userId={userId} profile={profile} macroHistory={macroHistoryState} onWizardSaved={handleDietSaved} />
        </Section>

        <Section title="Delivery addresses" subtitle="Manage where Akli delivers to you">
          <ProfileAddresses userId={userId} initialAddresses={addresses} />
        </Section>

        <button onClick={signOut} style={{ display: "block", margin: "20px auto 0", background: "none", border: "none", fontSize: 13, color: C.light, cursor: "pointer", textDecoration: "underline" }}>
          Sign out
        </button>
      </div>
    </div>
  );
}
