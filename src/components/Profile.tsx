"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconArrowLeft, IconUser, IconChevronDown,
  IconPencil, IconCheck, IconBrandWhatsapp,
} from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import ProfileAddresses from "@/components/ProfileAddresses";
import DietWizard from "@/components/DietWizard";
import { COUNTRY_CODES } from "@/lib/theme";
import type { Database } from "@/lib/supabase/types";

type UserRow    = Database["public"]["Tables"]["user"]["Row"];
type MacroRow   = Database["public"]["Tables"]["daily_macro_target"]["Row"];
type AddressRow = Database["public"]["Tables"]["user_delivery_address"]["Row"];

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

const DIET_LABELS: Record<string, string> = {
  "high-protein": "High protein", balanced: "Balanced", "low-carb": "Low carb", "low-fat": "Low fat",
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

export default function Profile({ userId, profile, macroHistory, addresses }: {
  userId: string;
  profile: UserRow | null;
  macroHistory: MacroRow[];
  addresses: AddressRow[];
}) {
  const router = useRouter();
  const [macroHistoryState, setMacroHistoryState] = useState(macroHistory);
  const [savedFlash, setSavedFlash] = useState(false);

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
