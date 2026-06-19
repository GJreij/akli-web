"use client";

import { useState, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { simplePriceSimulator } from "@/lib/flask";
import { COUNTRY_CODES } from "@/lib/theme";
import type { Database } from "@/lib/supabase/types";
import {
  IconTrendingDown, IconScale, IconTrendingUp, IconHeart,
  IconBolt, IconMinus, IconPlus, IconBrandWhatsapp, IconChevronDown,
  IconTruck, IconChartBar, IconCalendarEvent, IconAdjustments,
} from "@tabler/icons-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Screen    = "landing" | "signin" | "onboarding" | "home" | "delivery";
type Step      = "goal" | "basics" | "activity" | "manual" | "result" | "save";
type Goal      = "lose" | "maintain" | "build" | "health";
type Sex       = "female" | "male";
type DietType  = "high-protein" | "balanced" | "low-carb" | "low-fat";

type UserRow  = Database["public"]["Tables"]["user"]["Row"];
type MacroRow = Database["public"]["Tables"]["daily_macro_target"]["Row"];

const FULL_PATH: Step[] = ["goal", "basics", "activity", "result", "save"];
const SKIP_PATH: Step[] = ["goal", "manual", "result", "save"];
const KCAL_FLOOR = 1200, KCAL_CEIL = 4000, KCAL_STEP = 50;
const TENANT_ID = 1;
const DEFAULT_DIET: Record<Goal, DietType> = {
  lose: "high-protein", build: "high-protein", maintain: "balanced", health: "balanced",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ageFromDob(dob: string): number {
  const today = new Date();
  const birth = new Date(dob);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return Math.max(0, age);
}

function byWeight(kcal: number, weight: number, diet: DietType) {
  const pk = diet === "high-protein" ? 2.0 : diet === "low-fat" ? 1.8 : diet === "low-carb" ? 1.9 : 1.6;
  const fk = diet === "high-protein" ? 0.8 : diet === "low-fat" ? 0.5 : diet === "low-carb" ? 1.2 : 1.0;
  const p = weight * pk, f = weight * fk;
  return { protein: p, fat: f, carbs: Math.max(0, (kcal - p * 4 - f * 9) / 4) };
}

function byPercent(kcal: number, diet: DietType) {
  const pct =
    diet === "high-protein" ? { p: .35, f: .25, c: .40 } :
    diet === "low-carb"     ? { p: .30, f: .45, c: .25 } :
    diet === "low-fat"      ? { p: .30, f: .15, c: .55 } :
                              { p: .25, f: .30, c: .45 };
  return { protein: (kcal * pct.p) / 4, fat: (kcal * pct.f) / 9, carbs: (kcal * pct.c) / 4 };
}

function formatPrice(dayPrice: number | null, p: number, c: number, f: number) {
  if (dayPrice !== null) return `$${dayPrice.toFixed(2)}`;
  // Client-side fallback using same logic as Flask (midpoint per-gram rates)
  const estimate = p * 0.018 + c * 0.006 + f * 0.022 + 1.8; // macro cost + avg packaging
  return `~$${estimate.toFixed(2)}`;
}

const DIET_OPTIONS: {
  id: DietType; label: string; emoji: string;
  split: { p: number; c: number; f: number }; // percentages
  forWho: string;
}[] = [
  { id: "high-protein", label: "High Protein", emoji: "💪", split: { p: 35, c: 40, f: 25 }, forWho: "Active people or anyone who gets hungry fast." },
  { id: "balanced",     label: "Balanced",     emoji: "⚖️", split: { p: 25, c: 45, f: 30 }, forWho: "Everyday health and maintenance." },
  { id: "low-carb",     label: "Low Carb",     emoji: "🔥", split: { p: 30, c: 25, f: 45 }, forWho: "Fewer energy spikes, steady focus." },
  { id: "low-fat",      label: "Low Fat",      emoji: "🥗", split: { p: 30, c: 55, f: 15 }, forWho: "Light meals, calorie-conscious eating." },
];

function macrosFromDiet(kcal: number, diet: DietType) {
  const d = DIET_OPTIONS.find(o => o.id === diet)!;
  return {
    protein: Math.round((kcal * d.split.p / 100) / 4),
    carbs:   Math.round((kcal * d.split.c / 100) / 4),
    fat:     Math.round((kcal * d.split.f / 100) / 9),
    split:   d.split,
  };
}

// ─── Logo (hides gracefully if public/logo.png not found) ────────────────────

function LogoImage() {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt=""
      width={36}
      height={36}
      onError={() => setHidden(true)}
      style={{ objectFit: "contain", filter: "brightness(0) invert(1)", opacity: 0.92 }}
    />
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────

function Header({
  showProgress, progress, onLogoClick, onSignIn,
}: {
  showProgress: boolean; progress: number; onLogoClick: () => void; onSignIn?: () => void;
}) {
  return (
    <div style={{ background: "#063330", padding: "14px 20px", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {/* Logo wordmark — clickable */}
        <button
          onClick={onLogoClick}
          style={{
            background: "none", border: "none", padding: 0, cursor: "pointer",
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 22, color: "white", fontWeight: 500, letterSpacing: "0.01em",
          }}
        >
          akli
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {onSignIn && (
            <button
              onClick={onSignIn}
              style={{
                background: "none", border: "none", padding: 0, cursor: "pointer",
                fontSize: 13, color: C.teal, fontWeight: 600,
              }}
            >
              Sign in
            </button>
          )}
          <LogoImage />
        </div>
      </div>

      {showProgress && (
        <div style={{ height: 2, background: "rgba(255,255,255,0.2)", borderRadius: 2, marginTop: 12 }}>
          <div style={{
            height: 2, width: `${progress}%`,
            background: "#67b1b0",
            borderRadius: 2, transition: "width 0.3s ease",
          }} />
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AkliApp({
  initialScreen,
  profile,
  macroTarget,
}: {
  initialScreen: Screen;
  profile?: UserRow | null;
  macroTarget?: MacroRow | null;
}) {
  const supabase = createClient();

  // ── Screen / transition ──
  const [screen, setScreen]       = useState<Screen>(initialScreen);
  const [visible, setVisible]     = useState(true);
  const transTimer                = useRef<ReturnType<typeof setTimeout> | null>(null);

  function transition(to: Screen, cb?: () => void) {
    setVisible(false);
    if (transTimer.current) clearTimeout(transTimer.current);
    transTimer.current = setTimeout(() => {
      cb?.();
      setScreen(to);
      setVisible(true);
    }, 180);
  }

  // ── Step state ──
  const [path, setPath]   = useState<Step[]>(FULL_PATH);
  const [idx, setIdx]     = useState(0);
  const step = path[idx];
  const progress = Math.round(((idx + 1) / path.length) * 100);

  // ── Sign-in ──
  const [siEmail, setSiEmail]       = useState("");
  const [siPassword, setSiPassword] = useState("");
  const [siError, setSiError]       = useState<string | null>(null);
  const [siLoading, setSiLoading]   = useState(false);

  // ── Onboarding ──
  const [goal, setGoal]         = useState<Goal>("maintain");
  const [sex, setSex]           = useState<Sex>("female");
  const [dob, setDob]           = useState("");   // "YYYY-MM-DD" — derived from dobDay/Month/Year
  const [dobDay, setDobDay]     = useState("");
  const [dobMonth, setDobMonth] = useState("");
  const [dobYear, setDobYear]   = useState("");
  const [height, setHeight]     = useState(170);
  const [weight, setWeight]     = useState(70);
  const [activity, setActivity] = useState(1.375);
  const [kcalIn, setKcalIn]     = useState(2000);
  const [dietType, setDietType] = useState<DietType>("balanced");
  const [kcalFixed, setKcalFixed]   = useState(2100);
  const [kcalDefault, setKcalDefault] = useState(2100);
  const [weightKnown, setWeightKnown] = useState(false);
  const [lastMacros, setLastMacros]     = useState({ p: 126, c: 220, f: 62 });
  const [showUpdated, setShowUpdated]   = useState(false);
  const [finetuneNote, setFinetuneNote] = useState("");
  const [resultSubtitle, setResultSubtitle] = useState("Not a verdict. Adjust anytime.");
  const [dayPrice, setDayPrice]         = useState<number | null>(null);
  const priceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Save form ──
  const [fname, setFname]       = useState("");
  const [lname, setLname]       = useState("");
  const [countryCode, setCountryCode] = useState("+961");
  const [phone, setPhone]       = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saveError, setSaveError]   = useState<string | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});

  // ── Home ──
  const [homeName, setHomeName] = useState(profile?.name ?? "");
  const [homeKcal, setHomeKcal] = useState(macroTarget?.kcal_target ?? null);
  const [homeP, setHomeP]       = useState(macroTarget?.protein_g ?? null);
  const [homeC, setHomeC]       = useState(macroTarget?.carbs_g ?? null);
  const [homeF, setHomeF]       = useState(macroTarget?.fat_g ?? null);

  // ── Delivery ──
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliverySaved, setDeliverySaved]     = useState(false);

  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Macro helpers ─────────────────────────────────────────────────────────────

  function setNote(kcal: number) {
    if (kcal <= KCAL_FLOOR)
      setFinetuneNote("This is about as low as we would set without guidance from a professional.");
    else if (kcal >= KCAL_CEIL)
      setFinetuneNote("That is well above a typical default.");
    else setFinetuneNote("");
  }

  function getMacros(kcal: number, diet: DietType) {
    return weightKnown ? byWeight(kcal, weight, diet) : byPercent(kcal, diet);
  }

  function flash() {
    setShowUpdated(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setShowUpdated(false), 900);
  }

  function fetchPrice(p: number, c: number, f: number) {
    if (priceTimer.current) clearTimeout(priceTimer.current);
    // Debounce 400ms so we don't spam Flask on every nudge
    priceTimer.current = setTimeout(async () => {
      try {
        const res = await simplePriceSimulator({
          protein_g: Math.round(p),
          carbs_g: Math.round(c),
          fat_g: Math.round(f),
          meals_per_day: 3,
          avg_subrecipes_per_meal: 1.5,
          apply_kcal_discount: true,
        });
        setDayPrice(res.avg_day_price);
      } catch {
        // Flask unreachable — fall back to client estimate silently
        setDayPrice(null);
      }
    }, 400);
  }

  function repaint(kcal: number, diet: DietType) {
    const m = getMacros(kcal, diet);
    setLastMacros({ p: m.protein, c: m.carbs, f: m.fat });
    fetchPrice(m.protein, m.carbs, m.fat);
    flash();
  }

  function nudgeKcal(delta: number) {
    setKcalFixed(prev => {
      const next = Math.min(KCAL_CEIL, Math.max(KCAL_FLOOR, prev + delta));
      setNote(next);
      const m = getMacros(next, dietType);
      setLastMacros({ p: m.protein, c: m.carbs, f: m.fat });
      flash();
      return next;
    });
  }

  function resetKcal() {
    setKcalFixed(kcalDefault);
    setNote(kcalDefault);
    repaint(kcalDefault, dietType);
  }

  function changeDiet(d: DietType) {
    setDietType(d);
    repaint(kcalFixed, d);
  }

  // ── Navigation ────────────────────────────────────────────────────────────────

  function startOnboarding() {
    transition("onboarding", () => { setPath(FULL_PATH); setIdx(0); });
  }

  function handleSkip() {
    setPath(SKIP_PATH); setIdx(1);
  }

  function handleBack() {
    if (idx > 0) {
      const newIdx = idx - 1;
      if (newIdx === 0) setPath(FULL_PATH);
      setIdx(newIdx);
    }
  }

  function fillResultFromBasics() {
    const age = dob ? ageFromDob(dob) : 28;
    const bmr = sex === "male"
      ? 10 * weight + 6.25 * height - 5 * age + 5
      : 10 * weight + 6.25 * height - 5 * age - 161;
    const tdee = bmr * activity;
    let kcal = tdee;
    if (goal === "lose") kcal -= 500;
    if (goal === "build") kcal += 300;
    kcal = Math.max(KCAL_FLOOR, Math.round(kcal / 10) * 10);

    const diet = DEFAULT_DIET[goal];
    setWeightKnown(true);
    setKcalFixed(kcal); setKcalDefault(kcal); setDietType(diet); setNote(kcal);
    setResultSubtitle("Not a verdict. Adjust anytime.");
    const m = byWeight(kcal, weight, diet);
    setLastMacros({ p: m.protein, c: m.carbs, f: m.fat });
    fetchPrice(m.protein, m.carbs, m.fat);
  }

  function fillResultFromManual() {
    setWeightKnown(false);
    setKcalFixed(kcalIn); setKcalDefault(kcalIn); setNote(kcalIn);
    const m = byPercent(kcalIn, dietType);
    setLastMacros({ p: m.protein, c: m.carbs, f: m.fat });
    fetchPrice(m.protein, m.carbs, m.fat);
    setResultSubtitle("Looks good. Fine-tune the calories if needed.");
  }

  async function handleNext() {
    if (step === "basics" && !dob) {
      setSaveErrors(p => ({ ...p, dob: "Please enter your date of birth" }));
      return;
    }
    if (step === "activity") { fillResultFromBasics(); setIdx(i => i + 1); return; }
    if (step === "manual")   { fillResultFromManual(); setIdx(i => i + 1); return; }
    if (step === "save")     { await handleSave(); return; }
    setSaveErrors({});
    setIdx(i => i + 1);
  }

  // ── Auth ──────────────────────────────────────────────────────────────────────

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setSiError(null); setSiLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: siEmail, password: siPassword });
    if (error) { setSiError(error.message); setSiLoading(false); return; }
    window.location.href = "/home";
  }

  async function handleSave() {
    const errs: Record<string, string> = {};
    if (!fname.trim()) errs.fname = "Required";
    if (!lname.trim()) errs.lname = "Required";
    const rawPhone = phone.replace(/\D/g, "");
    if (!rawPhone || rawPhone.length < 5) errs.phone = "Enter a valid phone number";
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) errs.email = "Enter a valid email";
    if (password.length < 8) errs.password = "At least 8 characters";
    if (password !== confirmPassword) errs.confirmPassword = "Passwords don't match";
    if (Object.keys(errs).length) { setSaveErrors(errs); return; }

    setSaveLoading(true); setSaveError(null);

    // 1. Create auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
    if (authError) { setSaveError(authError.message); setSaveLoading(false); return; }

    const userId = authData.user?.id;
    if (!userId) { setSaveError("Sign-up failed. Please try again."); setSaveLoading(false); return; }

    // 2. Save profile + macros via server route (uses service role key, bypasses RLS)
    const res = await fetch("/api/create-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        name: fname.trim(),
        last_name: lname.trim(),
        phone_number: `${countryCode}${rawPhone}`,
        email: email.trim(),
        dob: dob || null,
        tenant_id: TENANT_ID,
        kcal_target: kcalFixed,
        protein_g: lastMacros.p,
        carbs_g: lastMacros.c,
        fat_g: lastMacros.f,
        diet_type: dietType,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setSaveError(body.error ?? "Failed to save your profile. Please try again.");
      setSaveLoading(false);
      return;
    }

    // 3. Sign in to establish session
    await supabase.auth.signInWithPassword({ email, password });

    setHomeName(fname);
    setHomeKcal(kcalFixed);
    setHomeP(Math.round(lastMacros.p));
    setHomeC(Math.round(lastMacros.c));
    setHomeF(Math.round(lastMacros.f));
    setSaveLoading(false);
    window.location.href = "/home";
  }

  async function handleSignOut(e: React.MouseEvent) {
    e.preventDefault();
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  // ── Macro check text ──────────────────────────────────────────────────────────

  // ── Next button label ─────────────────────────────────────────────────────────

  function nextLabel() {
    if (step === "activity" || step === "manual") return "Build my plan";
    if (step === "result") return "Looks good — save my plan";
    if (step === "save") return saveLoading ? "Creating account…" : "Create account";
    return "Continue";
  }

  // ── Inline styles (from theme) ────────────────────────────────────────────────

  const C = {
    primary:   "#063330",
    teal:      "#67b1b0",
    tealDark:  "#437b7b",
    sand:      "#bfa280",
    cream:     "#dacab6",
    offWhite:  "#eee9e6",
    muted:     "#5c5c5c",
    light:     "#9a9a9a",
    border:    "#e0dbd5",
    white:     "#ffffff",
    error:     "#c0392b",
  };

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: C.offWhite, display: "flex", flexDirection: "column" }}>
      <Header
        showProgress={screen === "onboarding"}
        progress={progress}
        onLogoClick={() => transition(
          screen === "home" || screen === "delivery" ? "home" : "signin"
        )}
        onSignIn={screen === "landing" ? () => transition("signin") : undefined}
      />

      {/* ── Screen content ── */}
      <div
        className={`screen-wrap${visible ? "" : " fading"}`}
        style={{ flex: 1, padding: "24px 20px 32px", overflowY: "auto" }}
      >

        {/* ────────── LANDING ────────── */}
        {screen === "landing" && (
          <div style={{ display: "flex", flexDirection: "column", minHeight: "calc(100vh - 64px)" }}>

            {/* ── Hero band ── */}
            <div style={{
              margin: "-24px -20px 0", padding: "32px 24px 28px",
              background: C.primary, position: "relative", overflow: "hidden",
            }}>
              {/* Decorative circle */}
              <div style={{
                position: "absolute", top: -60, right: -60,
                width: 200, height: 200, borderRadius: "50%",
                background: "rgba(103,177,176,0.12)", pointerEvents: "none",
              }} />
              <p style={{
                fontSize: 11.5, color: C.teal, fontWeight: 700,
                letterSpacing: "0.1em", textTransform: "uppercase", margin: "0 0 12px",
              }}>
                Meal prep · Delivered
              </p>
              <h2 style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: 32, fontWeight: 600, lineHeight: 1.2,
                color: "#fff", margin: "0 0 14px",
              }}>
                Meal prep that<br />adapts to your life.
              </h2>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.68)", margin: 0, lineHeight: 1.7 }}>
                Order a single day or a full month. Skip a meal, drop a day, swap what you don&apos;t like — your plan bends around you, not the other way around.
              </p>
            </div>

            {/* ── Feature cards ── */}
            <div style={{ flex: 1, paddingTop: 24, display: "flex", flexDirection: "column", gap: 12 }}>

              {/* Flexibility card */}
              <div style={{
                background: C.white, border: `1px solid ${C.border}`,
                borderRadius: 14, padding: "16px 18px",
                display: "flex", gap: 14, alignItems: "flex-start",
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 11, background: "#f0f7f7",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  <IconCalendarEvent size={19} color={C.tealDark} />
                </div>
                <div>
                  <p style={{ fontSize: 13.5, fontWeight: 700, color: C.primary, margin: "0 0 4px" }}>
                    One day or one month
                  </p>
                  <p style={{ fontSize: 12.5, color: C.muted, margin: 0, lineHeight: 1.6 }}>
                    Pick any range of days. No subscription, no lock-in. Order what fits your week.
                  </p>
                </div>
              </div>

              {/* Customise card */}
              <div style={{
                background: C.white, border: `1px solid ${C.border}`,
                borderRadius: 14, padding: "16px 18px",
                display: "flex", gap: 14, alignItems: "flex-start",
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 11, background: "#f0f7f7",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  <IconAdjustments size={19} color={C.tealDark} />
                </div>
                <div>
                  <p style={{ fontSize: 13.5, fontWeight: 700, color: C.primary, margin: "0 0 4px" }}>
                    Fully customisable
                  </p>
                  <p style={{ fontSize: 12.5, color: C.muted, margin: 0, lineHeight: 1.6 }}>
                    Skip breakfast, remove a meal, mark what you love or hate — the plan adjusts automatically.
                  </p>
                </div>
              </div>

              {/* Macros card */}
              <div style={{
                background: C.white, border: `1px solid ${C.border}`,
                borderRadius: 14, padding: "16px 18px",
                display: "flex", gap: 14, alignItems: "flex-start",
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 11, background: "#f0f7f7",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  <IconChartBar size={19} color={C.tealDark} />
                </div>
                <div>
                  <p style={{ fontSize: 13.5, fontWeight: 700, color: C.primary, margin: "0 0 4px" }}>
                    Built around your numbers
                  </p>
                  <p style={{ fontSize: 12.5, color: C.muted, margin: 0, lineHeight: 1.6 }}>
                    Every meal is calculated to hit your daily protein, carbs & fat targets — not just a rough estimate.
                  </p>
                </div>
              </div>

              {/* Delivery strip */}
              <div style={{
                background: "#f5f2ef", borderRadius: 12,
                padding: "12px 16px", display: "flex",
                alignItems: "center", gap: 10,
              }}>
                <IconTruck size={16} color={C.tealDark} />
                <p style={{ fontSize: 12.5, color: C.muted, margin: 0 }}>Free delivery on orders over $25</p>
              </div>
            </div>

            {/* ── CTA ── */}
            <div style={{ paddingTop: 24, paddingBottom: 4 }}>
              <button className="btn-primary" style={{ marginBottom: 12 }} onClick={startOnboarding}>
                Build my plan
              </button>
              <p style={{ fontSize: 12.5, textAlign: "center", margin: 0 }}>
                Already have an account?{" "}
                <a
                  href="#"
                  onClick={e => { e.preventDefault(); transition("signin"); }}
                  style={{ color: C.teal, fontWeight: 500, textDecoration: "none" }}
                >
                  Sign in
                </a>
              </p>
            </div>

          </div>
        )}

        {/* ────────── SIGN IN ────────── */}
        {screen === "signin" && (
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: 22 }}>Welcome back</h3>
            <p style={{ fontSize: 13, color: C.muted, margin: "0 0 22px" }}>Sign in to continue your journey.</p>

            <form onSubmit={handleSignIn} noValidate>
              <div style={{ marginBottom: 10 }}>
                <input type="email" placeholder="Email address" autoComplete="email"
                  value={siEmail} onChange={e => setSiEmail(e.target.value)} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <input type="password" placeholder="Password" autoComplete="current-password"
                  value={siPassword} onChange={e => setSiPassword(e.target.value)} />
              </div>
              {siError && (
                <div style={{ fontSize: 12.5, color: C.error, background: "#fdf0ef", padding: "8px 12px", borderRadius: 7, marginBottom: 12 }}>
                  {siError}
                </div>
              )}
              <button type="submit" className="btn-primary" style={{ marginBottom: 14 }} disabled={siLoading}>
                {siLoading ? "Signing in…" : "Sign in"}
              </button>
            </form>

            <p style={{ fontSize: 12.5, textAlign: "center", margin: 0 }}>
              New here?{" "}
              <a href="#" onClick={e => { e.preventDefault(); startOnboarding(); }}
                style={{ color: C.teal, fontWeight: 500, textDecoration: "none" }}>
                Get started
              </a>
            </p>
          </div>
        )}

        {/* ────────── ONBOARDING ────────── */}
        {screen === "onboarding" && (
          <div>

            {/* GOAL */}
            {step === "goal" && (
              <div>
                <h3 style={{ margin: "0 0 4px", fontSize: 20 }}>What brings you to Akli?</h3>
                <p style={{ fontSize: 13, color: C.muted, margin: "0 0 18px" }}>Pick what fits best. You can change this later.</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
                  {([
                    { id: "lose",     label: "Lose weight",    Icon: IconTrendingDown },
                    { id: "maintain", label: "Maintain weight", Icon: IconScale },
                    { id: "build",    label: "Build muscle",   Icon: IconTrendingUp },
                    { id: "health",   label: "General health", Icon: IconHeart },
                  ] as { id: Goal; label: string; Icon: React.ElementType }[]).map(({ id, label, Icon }) => (
                    <button key={id} className={`opt-card${goal === id ? " selected" : ""}`}
                      onClick={() => setGoal(id)}>
                      <Icon size={18} color={goal === id ? C.teal : C.light} />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
                <button onClick={handleSkip}
                  style={{ width: "100%", borderStyle: "dashed", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 13, color: C.muted }}>
                  <IconBolt size={15} />
                  Skip — I already know my numbers
                </button>
                <p style={{ fontSize: 12, textAlign: "center", marginTop: 16, color: C.light }}>
                  Have an account?{" "}
                  <a href="#" onClick={e => { e.preventDefault(); transition("signin"); }}
                    style={{ color: C.teal, textDecoration: "none" }}>Sign in</a>
                </p>
              </div>
            )}

            {/* BASICS */}
            {step === "basics" && (
              <div>
                <h3 style={{ margin: "0 0 4px", fontSize: 20 }}>A few basics</h3>
                <p style={{ fontSize: 13, color: C.muted, margin: "0 0 18px" }}>Used only to set your starting point.</p>

                {/* Sex */}
                <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
                  {(["female", "male"] as Sex[]).map(s => (
                    <button key={s} className={`pill-toggle${sex === s ? " selected" : ""}`}
                      onClick={() => setSex(s)}>
                      {s === "female" ? "Female" : "Male"}
                    </button>
                  ))}
                </div>

                {/* Date of birth — 3 dropdowns (works on all mobile browsers) */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 12.5, color: C.muted, display: "block", marginBottom: 8 }}>
                    Date of birth <span style={{ color: C.error }}>*</span>
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1.2fr", gap: 8 }}>
                    {/* Day */}
                    <select
                      value={dobDay}
                      onChange={e => {
                        const d = e.target.value;
                        setDobDay(d);
                        if (d && dobMonth && dobYear) {
                          const built = `${dobYear}-${dobMonth.padStart(2,"0")}-${d.padStart(2,"0")}`;
                          setDob(built);
                          setSaveErrors(p => ({ ...p, dob: "" }));
                        }
                      }}
                      style={{ fontSize: 16, minHeight: 48, color: dobDay ? "#1a1a1a" : C.light, borderColor: saveErrors.dob ? C.error : undefined }}
                    >
                      <option value="">Day</option>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                        <option key={d} value={String(d)}>{d}</option>
                      ))}
                    </select>
                    {/* Month */}
                    <select
                      value={dobMonth}
                      onChange={e => {
                        const m = e.target.value;
                        setDobMonth(m);
                        if (dobDay && m && dobYear) {
                          const built = `${dobYear}-${m.padStart(2,"0")}-${dobDay.padStart(2,"0")}`;
                          setDob(built);
                          setSaveErrors(p => ({ ...p, dob: "" }));
                        }
                      }}
                      style={{ fontSize: 16, minHeight: 48, color: dobMonth ? "#1a1a1a" : C.light, borderColor: saveErrors.dob ? C.error : undefined }}
                    >
                      <option value="">Month</option>
                      {["January","February","March","April","May","June","July","August","September","October","November","December"].map((name, i) => (
                        <option key={i} value={String(i + 1)}>{name}</option>
                      ))}
                    </select>
                    {/* Year */}
                    <select
                      value={dobYear}
                      onChange={e => {
                        const y = e.target.value;
                        setDobYear(y);
                        if (dobDay && dobMonth && y) {
                          const built = `${y}-${dobMonth.padStart(2,"0")}-${dobDay.padStart(2,"0")}`;
                          setDob(built);
                          setSaveErrors(p => ({ ...p, dob: "" }));
                        }
                      }}
                      style={{ fontSize: 16, minHeight: 48, color: dobYear ? "#1a1a1a" : C.light, borderColor: saveErrors.dob ? C.error : undefined }}
                    >
                      <option value="">Year</option>
                      {Array.from({ length: 80 }, (_, i) => new Date().getFullYear() - 10 - i).map(y => (
                        <option key={y} value={String(y)}>{y}</option>
                      ))}
                    </select>
                  </div>
                  {dob
                    ? <p style={{ fontSize: 11.5, color: C.light, margin: "5px 0 0 2px" }}>Age: {ageFromDob(dob)} years</p>
                    : saveErrors.dob
                      ? <p className="field-error">{saveErrors.dob}</p>
                      : null
                  }
                </div>

                {/* Height */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: C.muted, marginBottom: 5 }}>
                    <span>Height</span><span style={{ fontWeight: 500, color: "#1a1a1a" }}>{height} cm</span>
                  </div>
                  <input type="range" min={140} max={210} value={height} step={1}
                    onChange={e => setHeight(Number(e.target.value))} />
                </div>

                {/* Weight */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: C.muted, marginBottom: 5 }}>
                    <span>Weight</span><span style={{ fontWeight: 500, color: "#1a1a1a" }}>{weight} kg</span>
                  </div>
                  <input type="range" min={40} max={150} value={weight} step={1}
                    onChange={e => setWeight(Number(e.target.value))} />
                </div>
              </div>
            )}

            {/* ACTIVITY */}
            {step === "activity" && (
              <div>
                <h3 style={{ margin: "0 0 4px", fontSize: 20 }}>How active are you?</h3>
                <p style={{ fontSize: 13, color: C.muted, margin: "0 0 18px" }}>Outside of meal prep, day to day.</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    { val: 1.2,   label: "Sedentary",         sub: "Desk job, little exercise" },
                    { val: 1.375, label: "Lightly active",    sub: "1 to 3 light sessions a week" },
                    { val: 1.55,  label: "Moderately active", sub: "3 to 5 sessions a week" },
                    { val: 1.725, label: "Very active",       sub: "6 to 7 sessions a week" },
                  ].map(({ val, label, sub }) => (
                    <button key={val} className={`opt-row${activity === val ? " selected" : ""}`}
                      onClick={() => setActivity(val)}>
                      <span>{label}</span><span className="sub">{sub}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* MANUAL */}
            {step === "manual" && (() => {
              const m = macrosFromDiet(kcalIn, dietType);
              return (
                <div>
                  <h3 style={{ margin: "0 0 4px", fontSize: 20 }}>Set your daily target</h3>
                  <p style={{ fontSize: 13, color: C.muted, margin: "0 0 20px" }}>Pick a calorie goal and a style that fits your life.</p>

                  {/* Calorie tuner */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
                    <button
                      aria-label="Decrease"
                      onClick={() => setKcalIn(k => Math.max(KCAL_FLOOR, k - KCAL_STEP))}
                      style={{ width: 42, height: 42, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", flexShrink: 0 }}
                      disabled={kcalIn <= KCAL_FLOOR}
                    >
                      <IconMinus size={18} />
                    </button>
                    <div style={{ textAlign: "center" }}>
                      <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 36, fontWeight: 500, margin: 0, lineHeight: 1 }}>
                        {kcalIn.toLocaleString("en-US")}
                      </p>
                      <p style={{ fontSize: 12, color: C.light, margin: "4px 0 0" }}>kcal / day</p>
                    </div>
                    <button
                      aria-label="Increase"
                      onClick={() => setKcalIn(k => Math.min(KCAL_CEIL, k + KCAL_STEP))}
                      style={{ width: 42, height: 42, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", flexShrink: 0 }}
                      disabled={kcalIn >= KCAL_CEIL}
                    >
                      <IconPlus size={18} />
                    </button>
                  </div>

                  {/* Style selector — compact pills */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
                    {DIET_OPTIONS.map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => setDietType(opt.id)}
                        style={{
                          padding: "10px 8px",
                          borderRadius: 10,
                          border: `2px solid ${dietType === opt.id ? C.tealDark : C.border}`,
                          background: dietType === opt.id ? "#f0f7f7" : C.white,
                          fontSize: 13, fontWeight: 600,
                          color: dietType === opt.id ? C.tealDark : "#1a1a1a",
                          transition: "border-color 0.15s, background 0.15s",
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                        }}
                      >
                        <span>{opt.emoji}</span>
                        <span>{opt.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* Detail panel — updates live */}
                  <div className="info-card" style={{ marginBottom: 14 }}>
                    {/* For who */}
                    <p style={{ fontSize: 12.5, color: C.muted, margin: "0 0 14px", lineHeight: 1.5 }}>
                      {DIET_OPTIONS.find(o => o.id === dietType)!.forWho}
                    </p>

                    {/* Macro bar */}
                    <div style={{ display: "flex", height: 8, borderRadius: 6, overflow: "hidden", marginBottom: 10 }}>
                      <div style={{ width: `${m.split.p}%`, background: C.tealDark, transition: "width 0.3s" }} />
                      <div style={{ width: `${m.split.c}%`, background: C.sand,     transition: "width 0.3s" }} />
                      <div style={{ width: `${m.split.f}%`, background: C.cream,    transition: "width 0.3s" }} />
                    </div>

                    {/* Macro values */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                      {[
                        { label: "Protein", val: m.protein, pct: m.split.p, color: C.tealDark },
                        { label: "Carbs",   val: m.carbs,   pct: m.split.c, color: C.sand },
                        { label: "Fat",     val: m.fat,     pct: m.split.f, color: "#b0a070" },
                      ].map(({ label, val, pct, color }) => (
                        <div key={label} style={{ textAlign: "center", padding: "8px 4px", background: C.offWhite, borderRadius: 8 }}>
                          <p style={{ fontSize: 16, fontWeight: 600, color, margin: "0 0 1px" }}>{val}g</p>
                          <p style={{ fontSize: 11, color: C.light, margin: "0 0 1px" }}>{label}</p>
                          <p style={{ fontSize: 10, color: C.light, margin: 0 }}>{pct}%</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <p style={{ fontSize: 12, color: C.light, textAlign: "center", margin: 0, lineHeight: 1.5 }}>
                    Need something more tailored? An Akli team member will reach out on WhatsApp.
                  </p>
                </div>
              );
            })()}

            {/* RESULT */}
            {step === "result" && (
              <div>
                <h3 style={{ margin: "0 0 4px", fontSize: 20 }}>Here&apos;s your plan</h3>
                <p style={{ fontSize: 13, color: C.muted, margin: "0 0 16px" }}>{resultSubtitle}</p>

                {/* Kcal tuner */}
                <div className="info-card" style={{ textAlign: "center", marginBottom: 6 }}>
                  <p style={{ fontSize: 12, color: C.light, margin: "0 0 8px" }}>Daily target</p>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
                    <button aria-label="Decrease"
                      style={{ width: 34, height: 34, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%" }}
                      onClick={() => nudgeKcal(-KCAL_STEP)} disabled={kcalFixed <= KCAL_FLOOR}>
                      <IconMinus size={16} />
                    </button>
                    <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, fontWeight: 500, margin: 0, minWidth: 140, textAlign: "center" }}>
                      {kcalFixed.toLocaleString("en-US")} kcal
                    </p>
                    <button aria-label="Increase"
                      style={{ width: 34, height: 34, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%" }}
                      onClick={() => nudgeKcal(KCAL_STEP)} disabled={kcalFixed >= KCAL_CEIL}>
                      <IconPlus size={16} />
                    </button>
                  </div>
                </div>

                {/* Method note — shown only on the calculated path, not manual */}
                {path !== SKIP_PATH && (
                  <p style={{ fontSize: 10.5, color: C.light, textAlign: "center", margin: "6px 0 2px", letterSpacing: "0.01em" }}>
                    Estimated using the Mifflin-St Jeor equation
                  </p>
                )}

                {finetuneNote && (
                  <p style={{ fontSize: 11.5, color: C.sand, textAlign: "center", margin: "4px 0 2px" }}>{finetuneNote}</p>
                )}
                <p style={{ fontSize: 12, textAlign: "center", margin: "2px 0 12px", minHeight: 18 }}>
                  {kcalFixed !== kcalDefault && (
                    <a href="#" onClick={e => { e.preventDefault(); resetKcal(); }}
                      style={{ color: C.muted, textDecoration: "underline" }}>
                      Reset to recommended
                    </a>
                  )}
                </p>

                {/* Diet chips */}
                <div style={{ marginBottom: 12 }}>
                  <p style={{ fontSize: 12, color: C.muted, margin: "0 0 6px" }}>Macro split</p>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {(["high-protein", "balanced", "low-carb", "low-fat"] as DietType[]).map(d => (
                      <button key={d} className={`diet-chip${dietType === d ? " selected" : ""}`}
                        style={{ flex: "1 1 auto" }}
                        onClick={() => changeDiet(d)}>
                        {d === "high-protein" ? "High protein" : d === "low-fat" ? "Low fat" : d === "low-carb" ? "Low carb" : "Balanced"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Macro grid */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12, position: "relative" }}>
                  <span style={{
                    position: "absolute", top: -18, right: 0, fontSize: 11,
                    color: C.teal, opacity: showUpdated ? 1 : 0, transition: "opacity 0.3s",
                  }}>Updated</span>
                  {[
                    { label: "Protein", val: lastMacros.p },
                    { label: "Carbs",   val: lastMacros.c },
                    { label: "Fat",     val: lastMacros.f },
                  ].map(({ label, val }) => (
                    <div key={label} className="info-card" style={{ textAlign: "center", padding: "10px 8px" }}>
                      <p style={{ fontSize: 11, color: C.light, margin: "0 0 2px" }}>{label}</p>
                      <p style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>{Math.round(val)}g</p>
                    </div>
                  ))}
                </div>

                {/* Price */}
                <div style={{ display: "flex", alignItems: "baseline", gap: 5, justifyContent: "center", marginBottom: 16 }}>
                  <span style={{ fontSize: 13, color: C.muted }}>Around</span>
                  <span style={{ fontSize: 17, fontWeight: 500, fontFamily: "'Playfair Display', serif" }}>{formatPrice(dayPrice, lastMacros.p, lastMacros.c, lastMacros.f)}</span>
                  <span style={{ fontSize: 13, color: C.muted }}>a day</span>
                </div>

                {/* WhatsApp note */}
                <div style={{ border: `1px solid ${C.border}`, borderRadius: 9, padding: "12px 14px", display: "flex", gap: 10, alignItems: "flex-start", background: C.white }}>
                  <IconBrandWhatsapp size={17} style={{ color: C.light, marginTop: 2, flexShrink: 0 }} />
                  <p style={{ fontSize: 12.5, color: C.muted, margin: 0, lineHeight: 1.55 }}>
                    Not sure this is right? Akli will check in over WhatsApp within 24 hours to fine-tune it together.
                  </p>
                </div>
              </div>
            )}

            {/* SAVE */}
            {step === "save" && (
              <div>
                <h3 style={{ margin: "0 0 4px", fontSize: 20 }}>Save this plan</h3>
                <p style={{ fontSize: 13, color: C.muted, margin: "0 0 18px" }}>Create an account to keep it and start ordering.</p>

                {/* Name */}
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <input type="text" placeholder="First name" autoComplete="given-name"
                      value={fname} onChange={e => { setFname(e.target.value); setSaveErrors(p => ({ ...p, fname: "" })); }} />
                    {saveErrors.fname && <p className="field-error">{saveErrors.fname}</p>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <input type="text" placeholder="Last name" autoComplete="family-name"
                      value={lname} onChange={e => { setLname(e.target.value); setSaveErrors(p => ({ ...p, lname: "" })); }} />
                    {saveErrors.lname && <p className="field-error">{saveErrors.lname}</p>}
                  </div>
                </div>

                {/* Phone with country code */}
                <div style={{ marginBottom: 4 }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    {/* Country selector */}
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
                    {/* Phone number */}
                    <div style={{ position: "relative", flex: 1 }}>
                      <input
                        type="tel"
                        inputMode="numeric"
                        placeholder="Phone number"
                        autoComplete="tel-national"
                        value={phone}
                        onChange={e => {
                          const digits = e.target.value.replace(/\D/g, "");
                          setPhone(digits);
                          setSaveErrors(p => ({ ...p, phone: "" }));
                        }}
                        style={{ paddingLeft: 36 }}
                      />
                      <IconBrandWhatsapp size={15} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.light }} />
                    </div>
                  </div>
                  {saveErrors.phone && <p className="field-error">{saveErrors.phone}</p>}
                </div>
                <p style={{ fontSize: 11.5, color: C.light, margin: "0 0 12px 2px" }}>So Akli can reach you directly over WhatsApp.</p>

                {/* Email */}
                <div style={{ marginBottom: 10 }}>
                  <input type="email" placeholder="Email address" autoComplete="email"
                    value={email} onChange={e => { setEmail(e.target.value); setSaveErrors(p => ({ ...p, email: "" })); }} />
                  {saveErrors.email && <p className="field-error">{saveErrors.email}</p>}
                </div>

                {/* Password */}
                <div style={{ marginBottom: 10 }}>
                  <input type="password" placeholder="Password (min. 8 characters)" autoComplete="new-password"
                    value={password} onChange={e => { setPassword(e.target.value); setSaveErrors(p => ({ ...p, password: "" })); }} />
                  {saveErrors.password && <p className="field-error">{saveErrors.password}</p>}
                </div>

                {/* Confirm password */}
                <div style={{ marginBottom: 6 }}>
                  <input type="password" placeholder="Confirm password" autoComplete="new-password"
                    value={confirmPassword}
                    onChange={e => { setConfirmPassword(e.target.value); setSaveErrors(p => ({ ...p, confirmPassword: "" })); }}
                    style={{ borderColor: saveErrors.confirmPassword ? C.error : undefined }}
                  />
                  {saveErrors.confirmPassword && <p className="field-error">{saveErrors.confirmPassword}</p>}
                </div>

                {saveError && (
                  <div style={{ fontSize: 12.5, color: C.error, background: "#fdf0ef", padding: "9px 12px", borderRadius: 7, marginBottom: 8 }}>
                    {saveError}
                    {saveError.toLowerCase().includes("confirm") && (
                      <p style={{ marginTop: 6, fontSize: 11.5, color: C.muted }}>
                        Tip: if email confirmation is enabled in Supabase, go to Authentication → Settings and disable &ldquo;Confirm email&rdquo; for now.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

          </div>
        )}

        {/* ────────── HOME ────────── */}
        {screen === "home" && (
          <div>
            <p style={{ fontSize: 13, color: C.muted, margin: "0 0 4px" }}>
              {homeName ? `Hi ${homeName},` : "Welcome back"}
            </p>
            <h3 style={{ margin: "0 0 18px", fontSize: 22 }}>Your plan today</h3>

            <div className="info-card" style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 500, margin: 0 }}>
                  {homeKcal ? `${Math.round(homeKcal).toLocaleString("en-US")} kcal` : "—"}
                </p>
                <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
                  {homeKcal ? `${formatPrice(dayPrice, homeP ?? 0, homeC ?? 0, homeF ?? 0)} / day` : ""}
                </p>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                {[
                  { label: "Protein", val: homeP },
                  { label: "Carbs",   val: homeC },
                  { label: "Fat",     val: homeF },
                ].map(({ label, val }) => (
                  <div key={label} style={{ textAlign: "center", background: C.offWhite, borderRadius: 7, padding: "8px 4px" }}>
                    <p style={{ fontSize: 11, color: C.light, margin: "0 0 2px" }}>{label}</p>
                    <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>
                      {val != null ? `${Math.round(val)}g` : "—"}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <button className="btn-primary" style={{ marginBottom: 16 }}
              onClick={() => transition("delivery")}>
              Start an order
            </button>

            <p style={{ fontSize: 12.5, textAlign: "center", margin: 0 }}>
              <a href="#" onClick={handleSignOut} style={{ color: C.light, textDecoration: "none" }}>Sign out</a>
            </p>
          </div>
        )}

        {/* ────────── DELIVERY ────────── */}
        {screen === "delivery" && (
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: 22 }}>Where should this go?</h3>
            <p style={{ fontSize: 13, color: C.muted, margin: "0 0 18px" }}>We only need this when you&apos;re ready to order.</p>

            <div style={{ marginBottom: 6 }}>
              <label style={{ fontSize: 12.5, color: C.muted, display: "block", marginBottom: 5 }}>Delivery address</label>
              <textarea rows={3} placeholder="Building, street, area" style={{ resize: "none" }}
                value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} />
            </div>
            <p style={{ fontSize: 11.5, color: C.light, margin: "0 0 18px" }}>
              We already have your WhatsApp number from sign up.
            </p>

            <button className="btn-primary" style={{ marginBottom: 10 }}
              onClick={() => setDeliverySaved(true)}>
              Continue to checkout
            </button>

            {deliverySaved && (
              <p style={{ fontSize: 12.5, color: C.teal, textAlign: "center", margin: "0 0 12px", transition: "opacity 0.3s" }}>
                Saved — we&apos;ll use this for delivery.
              </p>
            )}

            <p style={{ fontSize: 12.5, textAlign: "center", margin: 0 }}>
              <a href="#" onClick={e => { e.preventDefault(); transition("home"); }}
                style={{ color: C.light, textDecoration: "none" }}>Back to home</a>
            </p>
          </div>
        )}

      </div>

      {/* ────────── ONBOARDING FOOTER ────────── */}
      {screen === "onboarding" && (
        <div style={{
          display: "flex", gap: 10, padding: "14px 20px",
          borderTop: `1px solid ${C.border}`, background: C.white, flexShrink: 0,
        }}>
          {idx > 0 && (
            <button style={{ flex: "0 0 76px" }} onClick={handleBack}>Back</button>
          )}
          <button className="btn-primary" style={{ flex: 1 }} onClick={handleNext} disabled={saveLoading}>
            {nextLabel()}
          </button>
        </div>
      )}
    </div>
  );
}
