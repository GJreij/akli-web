"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconArrowLeft, IconUser, IconChevronDown, IconClockHour4,
  IconTruck, IconPencil, IconCheck,
} from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import ProfileAddresses from "@/components/ProfileAddresses";
import DietWizard from "@/components/DietWizard";
import type { Database } from "@/lib/supabase/types";

type UserRow    = Database["public"]["Tables"]["user"]["Row"];
type MacroRow   = Database["public"]["Tables"]["daily_macro_target"]["Row"];
type AddressRow = Database["public"]["Tables"]["user_delivery_address"]["Row"];
type DeliveryRow = { id: number; delivery_date: string | null; status: string | null; delivery_address: string | null };

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
  const [phone, setPhone]     = useState(profile?.phone_number ?? "");
  const [dob, setDob]         = useState(profile?.DoB ?? "");
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState<string | null>(null);

  async function save() {
    if (!profile) return;
    setSaving(true); setErr(null);
    try {
      const supabase = createClient();
      const { error } = await (supabase.from("user") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
        .update({
          name: name.trim() || null,
          last_name: lastName.trim() || null,
          phone_number: phone.trim() || null,
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
            <p style={{ margin: 0 }}><span style={{ color: C.light }}>Name:</span> {profile?.name} {profile?.last_name}</p>
            <p style={{ margin: 0 }}><span style={{ color: C.light }}>Email:</span> {profile?.email}</p>
            <p style={{ margin: 0 }}><span style={{ color: C.light }}>Phone:</span> {profile?.phone_number || "—"}</p>
            <p style={{ margin: 0 }}><span style={{ color: C.light }}>Date of birth:</span> {profile?.DoB ? fmtDate(profile.DoB) : "—"}</p>
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
      <input type="tel" placeholder="Phone number" value={phone} onChange={e => setPhone(e.target.value)} style={{ marginBottom: 8 }} />
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

function DietSection({ userId, macroHistory, onWizardSaved }: {
  userId: string;
  macroHistory: MacroRow[];
  onWizardSaved: (m: MacroRow) => void;
}) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const current = macroHistory[0] ?? null;
  const history = macroHistory.slice(1);

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
        </div>
      )}

      {wizardOpen && (
        <DietWizard
          userId={userId}
          currentMacro={current}
          onClose={() => setWizardOpen(false)}
          onSaved={(m) => { onWizardSaved(m); setWizardOpen(false); }}
        />
      )}
    </>
  );
}

// ─── Recent deliveries ───────────────────────────────────────────────────────────

function DeliveriesSection({ deliveries }: { deliveries: DeliveryRow[] }) {
  const router = useRouter();
  return (
    <>
      {deliveries.length === 0 ? (
        <p style={{ fontSize: 13, color: C.light, margin: "0 0 12px" }}>No deliveries yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          {deliveries.map(d => (
            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", border: `1px solid ${C.border}`, borderRadius: 8 }}>
              <IconTruck size={15} color={C.light} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{d.delivery_date ? fmtDate(d.delivery_date) : "—"}</p>
                {d.delivery_address && (
                  <p style={{ margin: 0, fontSize: 11.5, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.delivery_address}</p>
                )}
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.tealDark, background: "#e8f4f4", padding: "3px 8px", borderRadius: 20, textTransform: "capitalize", flexShrink: 0 }}>
                {d.status ?? "pending"}
              </span>
            </div>
          ))}
        </div>
      )}
      <button onClick={() => router.push("/orders")} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: 0, color: C.tealDark, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
        <IconClockHour4 size={14} /> View full order history
      </button>
    </>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────────

export default function Profile({ userId, profile, macroHistory, addresses, recentDeliveries }: {
  userId: string;
  profile: UserRow | null;
  macroHistory: MacroRow[];
  addresses: AddressRow[];
  recentDeliveries: DeliveryRow[];
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
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <button onClick={() => router.push("/home")} style={{ background: "none", border: "none", padding: 0, color: "rgba(255,255,255,0.6)", cursor: "pointer", display: "flex" }}>
            <IconArrowLeft size={18} />
          </button>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>Back to home</span>
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
          <DietSection userId={userId} macroHistory={macroHistoryState} onWizardSaved={handleDietSaved} />
        </Section>

        <Section title="Delivery addresses" subtitle="Manage where Akli delivers to you">
          <ProfileAddresses userId={userId} initialAddresses={addresses} />
        </Section>

        <Section title="Deliveries & orders" subtitle="Recent activity">
          <DeliveriesSection deliveries={recentDeliveries} />
        </Section>

        <button onClick={signOut} style={{ display: "block", margin: "20px auto 0", background: "none", border: "none", fontSize: 13, color: C.light, cursor: "pointer", textDecoration: "underline" }}>
          Sign out
        </button>
      </div>
    </div>
  );
}
