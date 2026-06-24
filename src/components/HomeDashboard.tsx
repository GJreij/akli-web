"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { track } from "@/lib/analytics";
import {
  IconShoppingBag, IconClockHour4, IconLeaf, IconHeart, IconUserCircle, IconPencil,
  IconCrown, IconStar, IconUsers, IconCopy, IconCheck,
} from "@tabler/icons-react";
import type { Database } from "@/lib/supabase/types";
import DietWizard from "@/components/DietWizard";

type UserRow  = Database["public"]["Tables"]["user"]["Row"];
type MacroRow = Database["public"]["Tables"]["daily_macro_target"]["Row"];

type RecipeRow = {
  id: number;
  name: string | null;
  description: string | null;
  photo: string | null;
  could_be_breakfast: boolean | null;
  could_be_lunch: boolean | null;
  could_be_dinner: boolean | null;
  could_be_snack: boolean | null;
};

const C = {
  primary:  "#063330",
  teal:     "#67b1b0",
  tealDark: "#437b7b",
  sand:     "#bfa280",
  cream:    "#dacab6",
  offWhite: "#eee9e6",
  muted:    "#5c5c5c",
  light:    "#9a9a9a",
  border:   "#e0dbd5",
  white:    "#ffffff",
};

function mealLabel(r: RecipeRow): string {
  if (r.could_be_breakfast) return "Breakfast";
  if (r.could_be_lunch)     return "Lunch";
  if (r.could_be_dinner)    return "Dinner";
  if (r.could_be_snack)     return "Snack";
  return "Meal";
}

// ── Macro ring ───────────────────────────────────────────────────────────────

// Brighter colors that pop on the dark green hero background
const RING = { protein: "#e8a87c", carbs: "#c9a84c", fat: "#7abfbe" };

function MacroRing({ p, c, f, kcal }: { p: number; c: number; f: number; kcal: number }) {
  const total = p * 4 + c * 4 + f * 9;
  const pPct  = total ? (p * 4 / total) * 100 : 33;
  const cPct  = total ? (c * 4 / total) * 100 : 33;
  const fPct  = 100 - pPct - cPct;

  const r = 42, cx = 54, cy = 54, stroke = 11;
  const circ = 2 * Math.PI * r;
  const gap = 2.5;

  function arc(offset: number, pct: number, color: string) {
    const len = Math.max(0, circ * (pct / 100) - gap);
    return (
      <circle
        cx={cx} cy={cy} r={r}
        fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${len} ${circ}`}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transform: "rotate(-90deg)", transformOrigin: `${cx}px ${cy}px` }}
      />
    );
  }

  const o1 = 0;
  const o2 = -(circ * (pPct / 100));
  const o3 = -(circ * ((pPct + cPct) / 100));

  return (
    <div style={{ position: "relative", width: 108, height: 108, flexShrink: 0 }}>
      <svg width={108} height={108} viewBox="0 0 108 108">
        {/* Track */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={stroke} />
        {arc(o1, pPct, RING.protein)}
        {arc(o2, cPct, RING.carbs)}
        {arc(o3, fPct, RING.fat)}
      </svg>
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, fontWeight: 500, color: C.white, lineHeight: 1 }}>
          {kcal.toLocaleString("en-US")}
        </span>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 3 }}>kcal</span>
      </div>
    </div>
  );
}

// ── Affiliate / Ambassador / Athlete badge ──────────────────────────────────

const TIER_STYLE: Record<string, { label: string; icon: typeof IconCrown; gradient: string; glow: string }> = {
  athlete:    { label: "Athlete",    icon: IconCrown, gradient: "linear-gradient(135deg, #e8c468, #b8860b)", glow: "rgba(232,196,104,0.45)" },
  ambassador: { label: "Ambassador", icon: IconStar,  gradient: "linear-gradient(135deg, #9bd6d4, #437b7b)", glow: "rgba(103,177,176,0.4)" },
  affiliate:  { label: "Affiliate",  icon: IconUsers, gradient: "linear-gradient(135deg, #d8c3a5, #bfa280)", glow: "rgba(191,162,128,0.4)" },
};

function fmtBadgeDate(d: string | null) {
  if (!d) return null;
  return new Date(d + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// navigator.clipboard requires a secure context (HTTPS or localhost) — on a
// plain-HTTP LAN address it's undefined or silently rejects, so fall back to
// the legacy textarea+execCommand approach, which works everywhere.
function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).catch(() => copyTextFallback(text));
  }
  return copyTextFallback(text);
}

function copyTextFallback(text: string): Promise<void> {
  return new Promise(resolve => {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try { document.execCommand("copy"); } catch { /* ignore */ }
    document.body.removeChild(textarea);
    resolve();
  });
}

function BadgeCodeRow({ code, discountValue, endDate }: { code: string; discountValue: number; endDate: string | null }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    copyText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.85)" }}>
          <span style={{ fontWeight: 700, letterSpacing: "0.04em" }}>{code}</span> — {discountValue}% off
          {endDate && <span style={{ color: "rgba(255,255,255,0.6)" }}> · expires {fmtBadgeDate(endDate)}</span>}
        </span>
      </div>
      <button
        onClick={handleCopy}
        style={{
          background: "rgba(255,255,255,0.25)", border: "none", borderRadius: 8,
          padding: "4px 8px", display: "flex", alignItems: "center", gap: 4,
          color: "#fff", fontSize: 10.5, fontWeight: 600, cursor: "pointer", flexShrink: 0,
        }}
      >
        {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function AffiliateBadge({ tier, codes }: { tier: string; codes: { code: string; discount_value: number; end_date: string | null }[] }) {
  const style = TIER_STYLE[tier];
  if (!style) return null;
  const Icon = style.icon;

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 10,
      background: style.gradient, borderRadius: 14, padding: "10px 14px",
      marginBottom: 16, position: "relative",
      boxShadow: `0 4px 16px ${style.glow}`,
    }}>
      <div style={{
        width: 30, height: 30, borderRadius: "50%", background: "rgba(255,255,255,0.25)",
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1,
      }}>
        <Icon size={17} color="#fff" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: "#fff", letterSpacing: "0.02em" }}>
          Akli {style.label}
        </p>
        {codes.length === 0 ? (
          <p style={{ margin: "2px 0 0", fontSize: 10.5, color: "rgba(255,255,255,0.7)" }}>No active codes right now.</p>
        ) : (
          codes.map(c => (
            <BadgeCodeRow key={c.code} code={c.code} discountValue={c.discount_value} endDate={c.end_date} />
          ))
        )}
      </div>
    </div>
  );
}

// ── Recipe modal ─────────────────────────────────────────────────────────────

function RecipeModal({ recipe, onClose }: { recipe: RecipeRow; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        background: "rgba(6,51,48,0.55)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 480,
          background: C.white, borderRadius: "18px 18px 0 0",
          overflow: "hidden",
          animation: "slideUp 0.22s ease",
        }}
      >
        {recipe.photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={recipe.photo}
            alt={recipe.name ?? ""}
            style={{ width: "100%", height: 240, objectFit: "cover" }}
          />
        )}
        <div style={{ padding: "20px 22px 32px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: 20 }}>{recipe.name}</h3>
            <span style={{
              fontSize: 11, fontWeight: 600, color: C.tealDark,
              background: "#e8f4f4", padding: "3px 8px", borderRadius: 20, whiteSpace: "nowrap", marginLeft: 10,
            }}>
              {mealLabel(recipe)}
            </span>
          </div>
          {recipe.description && (
            <p style={{ fontSize: 13.5, color: C.muted, margin: 0, lineHeight: 1.65 }}>{recipe.description}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Recipe card ───────────────────────────────────────────────────────────────

function RecipeCard({ recipe, onClick }: { recipe: RecipeRow; onClick: () => void }) {
  const [imgErr, setImgErr] = useState(false);

  return (
    <button
      onClick={onClick}
      style={{
        flexShrink: 0, width: 160, borderRadius: 14,
        overflow: "hidden", border: `1px solid ${C.border}`,
        background: C.white, padding: 0, textAlign: "left",
        cursor: "pointer", position: "relative",
      }}
    >
      {recipe.photo && !imgErr ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={recipe.photo}
          alt={recipe.name ?? ""}
          onError={() => setImgErr(true)}
          style={{ width: "100%", height: 110, objectFit: "cover", display: "block" }}
        />
      ) : (
        <div style={{ width: "100%", height: 110, background: C.offWhite, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <IconLeaf size={28} color={C.light} />
        </div>
      )}
      {/* Meal type badge */}
      <span style={{
        position: "absolute", top: 8, left: 8,
        fontSize: 10, fontWeight: 600, color: C.white,
        background: "rgba(6,51,48,0.72)", backdropFilter: "blur(4px)",
        padding: "3px 7px", borderRadius: 20,
      }}>
        {mealLabel(recipe)}
      </span>
      <div style={{ padding: "10px 11px 12px", height: 56, display: "flex", alignItems: "flex-start" }}>
        <p style={{
          fontSize: 12.5, fontWeight: 600, margin: 0, color: "#1a1a1a", lineHeight: 1.35,
          WebkitLineClamp: 2, display: "-webkit-box", WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>
          {recipe.name}
        </p>
      </div>
    </button>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function HomeDashboard({
  profile,
  macroTarget,
  menuRecipes = [],
  affiliateInfo = null,
}: {
  profile:      UserRow | null;
  macroTarget:  MacroRow | null;
  menuRecipes?: RecipeRow[];
  affiliateInfo?: { tier: string; codes: { code: string; discount_value: number; end_date: string | null }[] } | null;
}) {
  const router = useRouter();
  const [activeRecipe, setActiveRecipe] = useState<RecipeRow | null>(null);
  const [dietWizardOpen, setDietWizardOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [navigatingProfile, setNavigatingProfile] = useState(false);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    track("signout", {}, "auth");
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  const name    = profile?.name ?? "";
  const kcal    = Math.round(macroTarget?.kcal_target ?? 0);
  const protein = Math.round(macroTarget?.protein_g   ?? 0);
  const carbs   = Math.round(macroTarget?.carbs_g     ?? 0);
  const fat     = Math.round(macroTarget?.fat_g       ?? 0);
  const hasPlan = kcal > 0;

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  const dayStr = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div style={{ minHeight: "100vh", background: C.offWhite, display: "flex", flexDirection: "column" }}>

      {/* ── Hero header ── */}
      <div style={{
        background: C.primary,
        padding: "20px 20px 28px",
        position: "relative", overflow: "hidden",
      }}>
        {/* subtle texture overlay */}
        <div style={{
          position: "absolute", inset: 0, opacity: 0.04,
          backgroundImage: "radial-gradient(circle at 70% 30%, #fff 0%, transparent 60%)",
          pointerEvents: "none",
        }} />

        {/* top bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, position: "relative" }}>
          <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: C.white, fontWeight: 500, letterSpacing: "0.01em" }}>
            akli
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button
              onClick={() => { setNavigatingProfile(true); router.push("/profile"); }}
              title="Profile"
              style={{
                background: "none", border: "none", padding: 10, margin: -10,
                color: "rgba(255,255,255,0.7)", cursor: "pointer", display: "flex",
                opacity: navigatingProfile ? 0.5 : 1,
              }}
            >
              <IconUserCircle size={22} />
            </button>
            <button
              onClick={signOut}
              disabled={signingOut}
              style={{
                background: "none", border: "none", fontSize: 12, color: "rgba(255,255,255,0.45)",
                padding: "10px 8px", margin: "-10px -8px -10px 0", cursor: "pointer",
                opacity: signingOut ? 0.5 : 1,
              }}
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>

        {/* greeting */}
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", margin: "0 0 2px", position: "relative" }}>{dayStr}</p>
        <h2 style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: name ? 26 : 22, fontWeight: 500,
          color: C.white, margin: "0 0 20px", position: "relative",
        }}>
          {name ? `${greeting}, ${name}.` : greeting + "."}
        </h2>

        {affiliateInfo && <AffiliateBadge tier={affiliateInfo.tier} codes={affiliateInfo.codes} />}

        {/* Macro card inside hero — edit icon opens the diet wizard */}
        {hasPlan ? (
          <div style={{
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 16, padding: "18px",
            display: "flex", gap: 18, alignItems: "center",
          }}>
            <MacroRing p={protein} c={carbs} f={fat} kcal={kcal} />

            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", margin: 0, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Your daily plan
                </p>
                <button
                  onClick={() => setDietWizardOpen(true)}
                  title="Update your diet"
                  style={{ background: "none", border: "none", padding: 4, color: "rgba(255,255,255,0.55)", cursor: "pointer", display: "flex" }}
                >
                  <IconPencil size={14} />
                </button>
              </div>
              {[
                { label: "Protein", val: protein, color: RING.protein },
                { label: "Carbs",   val: carbs,   color: RING.carbs },
                { label: "Fat",     val: fat,      color: RING.fat },
              ].map(({ label, val, color }) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 12.5, color: "rgba(255,255,255,0.55)" }}>{label}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color }}>{val}g</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 16, padding: "18px",
            color: "rgba(255,255,255,0.6)", fontSize: 13, textAlign: "center",
          }}>
            No macro plan set yet.{" "}
            <button
              onClick={() => setDietWizardOpen(true)}
              style={{ background: "none", border: "none", padding: 0, color: C.teal, textDecoration: "underline", fontSize: 13, cursor: "pointer" }}
            >
              Set one up
            </button>
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, padding: "22px 20px 40px" }}>

        {/* Primary CTA — the one action that matters most, full-width and unmistakable */}
        <button
          className="btn-primary"
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 15, padding: "14px 0", marginBottom: 14, lineHeight: 1 }}
          onClick={() => router.push("/order/new")}
        >
          <IconShoppingBag size={17} style={{ flexShrink: 0, display: "block" }} />
          <span style={{ lineHeight: 1 }}>Order this week</span>
        </button>

        {/* Secondary actions — clearly tappable cards, but visually a step down from the CTA above */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 28 }}>
          <button
            style={{
              background: C.white, border: `1px solid ${C.border}`, borderRadius: 12,
              padding: "13px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
              fontSize: 12.5, fontWeight: 600, color: C.muted, cursor: "pointer",
            }}
            onClick={() => router.push("/orders")}
          >
            <IconClockHour4 size={18} color={C.tealDark} />
            My orders
          </button>
          <button
            style={{
              background: C.white, border: `1px solid ${C.border}`, borderRadius: 12,
              padding: "13px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
              fontSize: 12.5, fontWeight: 600, color: C.muted, cursor: "pointer",
            }}
            onClick={() => router.push("/tastes")}
          >
            <IconHeart size={18} color={C.tealDark} />
            My Tastes
          </button>
        </div>

        {/* This week's menu */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 17 }}>On the menu</h3>
            <button
              onClick={() => router.push("/menu")}
              style={{ background: "none", border: "none", padding: 0, fontSize: 12.5, color: C.teal, fontWeight: 500, cursor: "pointer" }}
            >
              View all →
            </button>
          </div>

          {menuRecipes.length > 0 ? (
            <>
              <div style={{
                display: "flex", gap: 10,
                overflowX: "auto", paddingBottom: 6,
                scrollSnapType: "x mandatory",
                marginLeft: -20, marginRight: -20,
                paddingLeft: 20, paddingRight: 20,
              }}>
                {menuRecipes.slice(0, 5).map(r => (
                  <div key={r.id} style={{ scrollSnapAlign: "start" }}>
                    <RecipeCard recipe={r} onClick={() => setActiveRecipe(r)} />
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 12, color: C.light, marginTop: 10, textAlign: "center" }}>
                Tap a dish to read more · Menu rotates weekly
              </p>
            </>
          ) : (
            <div style={{
              border: `1px dashed ${C.border}`, borderRadius: 12,
              padding: "28px 20px", textAlign: "center",
              color: C.light, fontSize: 13,
            }}>
              This week&apos;s menu isn&apos;t published yet. Check back soon.
            </div>
          )}
        </div>
      </div>

      {/* Recipe modal */}
      {activeRecipe && (
        <RecipeModal recipe={activeRecipe} onClose={() => setActiveRecipe(null)} />
      )}

      {/* Diet wizard */}
      {dietWizardOpen && profile?.id && (
        <DietWizard
          userId={profile.id}
          currentMacro={macroTarget}
          profile={profile}
          onClose={() => setDietWizardOpen(false)}
          onSaved={() => { track("diet_wizard_saved", {}, "diet"); setDietWizardOpen(false); router.refresh(); }}
        />
      )}

      {/* slide-up animation */}
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(40px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}
