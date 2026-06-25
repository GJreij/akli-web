"use client";

import { useState, useRef } from "react";
import {
  IconTrendingDown, IconScale, IconTrendingUp, IconHeart,
  IconMinus, IconPlus, IconBrandWhatsapp, IconX, IconCalculator, IconChecklist,
  IconChevronRight,
} from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import { simplePriceSimulator } from "@/lib/flask";
import type { Database } from "@/lib/supabase/types";
import { ageFromDob, byWeight, byPercent, macrosFromDiet, formatPrice, formatPricePerMeal, priceComparison, DIET_OPTIONS, KCAL_FLOOR, KCAL_CEIL, KCAL_STEP } from "@/lib/macros";
import type { DietType } from "@/lib/macros";

type MacroRow = Database["public"]["Tables"]["daily_macro_target"]["Row"];
type UserRow  = Database["public"]["Tables"]["user"]["Row"];

// ─── Same calculation model as the original onboarding flow ──────────────────

type Step     = "choice" | "goal" | "basics" | "activity" | "manual" | "result";
type Goal     = "lose" | "maintain" | "build" | "health";
type Sex      = "female" | "male";

const CHOICE_PATH: Step[] = ["choice"];
const FULL_PATH: Step[] = ["choice", "goal", "basics", "activity", "result"];
const MANUAL_PATH: Step[] = ["choice", "manual", "result"];
const VALID_DIETS: DietType[] = ["high-protein", "balanced", "low-carb", "low-fat"];
const TENANT_ID = 1;
const DEFAULT_DIET: Record<Goal, DietType> = {
  lose: "high-protein", build: "high-protein", maintain: "balanced", health: "balanced",
};

// After the simulator produces an estimate, the client may only fine-tune
// by +/-15% of that estimate — never below KCAL_FLOOR. Going further means
// they don't trust the estimate at all, in which case they should enter
// their own numbers in the manual ("I know my numbers") flow instead of
// dragging the simulator result somewhere it was never designed to reach.
const WIZARD_ADJUST_PCT = 0.15;

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
  error:    "#c0392b",
};

export default function DietWizard({ userId, currentMacro, profile, onClose, onSaved }: {
  userId: string;
  currentMacro?: MacroRow | null;
  profile?: UserRow | null;
  onClose: () => void;
  onSaved: (macro: MacroRow) => void;
}) {
  const [path, setPath] = useState<Step[]>(CHOICE_PATH);
  const [idx, setIdx]   = useState(0);
  const step = path[idx];
  const progress = Math.round(((idx + 1) / path.length) * 100);

  const initialDiet: DietType = VALID_DIETS.includes(currentMacro?.diet_type as DietType)
    ? (currentMacro!.diet_type as DietType)
    : "balanced";

  const initialDob = profile?.DoB ?? "";
  const [initDobY = "", initDobM = "", initDobD = ""] = initialDob ? initialDob.split("-") : [];

  const [goal, setGoal] = useState<Goal>(
    (currentMacro?.goal as Goal) && ["lose","maintain","build","health"].includes(currentMacro?.goal ?? "")
      ? (currentMacro!.goal as Goal)
      : "maintain"
  );
  const [sex, setSex]   = useState<Sex>(currentMacro?.sex === "male" ? "male" : "female");
  const [dob, setDob]   = useState(initialDob);
  const [dobDay, setDobDay]     = useState(initDobD ? String(Number(initDobD)) : "");
  const [dobMonth, setDobMonth] = useState(initDobM ? String(Number(initDobM)) : "");
  const [dobYear, setDobYear]   = useState(initDobY);
  const [height, setHeight] = useState(Math.round(currentMacro?.height_cm ?? 170));
  const [weight, setWeight] = useState(Math.round(currentMacro?.weight_kg ?? 70));
  const [activity, setActivity] = useState(currentMacro?.activity_level ?? 1.3);
  const [kcalIn, setKcalIn] = useState(Math.round(currentMacro?.kcal_target ?? 2000));
  const [dietType, setDietType] = useState<DietType>(initialDiet);
  const [kcalFixed, setKcalFixed]     = useState(Math.round(currentMacro?.kcal_target ?? 2100));
  const [kcalDefault, setKcalDefault] = useState(Math.round(currentMacro?.kcal_target ?? 2100));
  const [weightKnown, setWeightKnown] = useState(false);
  const [lastMacros, setLastMacros] = useState({
    p: currentMacro?.protein_g ?? 126,
    c: currentMacro?.carbs_g   ?? 220,
    f: currentMacro?.fat_g     ?? 62,
  });
  const [dobErr, setDobErr] = useState<string | null>(null);
  const [finetuneNote, setFinetuneNote] = useState("");
  const [showEstimateLimitMsg, setShowEstimateLimitMsg] = useState(false);
  const [resultSubtitle, setResultSubtitle] = useState("Not a verdict. Adjust anytime.");
  const [dayPrice, setDayPrice] = useState<number | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const priceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  function setNote(kcal: number) {
    if (kcal <= KCAL_FLOOR) setFinetuneNote("This is about as low as we would set without guidance from a professional.");
    else if (kcal >= KCAL_CEIL) setFinetuneNote("That is well above a typical default.");
    else setFinetuneNote("");
  }

  function getMacros(kcal: number, diet: DietType) {
    return weightKnown ? byWeight(kcal, weight, diet) : byPercent(kcal, diet);
  }

  function fetchPrice(p: number, c: number, f: number) {
    if (priceTimer.current) clearTimeout(priceTimer.current);
    setPriceLoading(true);
    priceTimer.current = setTimeout(async () => {
      try {
        const res = await simplePriceSimulator({
          protein_g: Math.round(p), carbs_g: Math.round(c), fat_g: Math.round(f),
          meals_per_day: 3, avg_subrecipes_per_meal: 1.5, apply_kcal_discount: true,
        });
        setDayPrice(res.avg_day_price);
      } catch { setDayPrice(null); }
      finally { setPriceLoading(false); }
    }, 400);
  }

  function repaint(kcal: number, diet: DietType) {
    const m = getMacros(kcal, diet);
    setLastMacros({ p: m.protein, c: m.carbs, f: m.fat });
    fetchPrice(m.protein, m.carbs, m.fat);
  }

  // Only the GUIDED/simulator path (weightKnown=true) is capped to +/-15%
  // of its own estimate. The manual path (weightKnown=false) is the client
  // entering their own numbers already, so it keeps the full
  // [KCAL_FLOOR, KCAL_CEIL] range it always had.
  function simulatorBounds() {
    if (!weightKnown) return { low: KCAL_FLOOR, high: KCAL_CEIL };
    return {
      low: Math.max(KCAL_FLOOR, Math.round(kcalDefault * (1 - WIZARD_ADJUST_PCT))),
      high: Math.round(kcalDefault * (1 + WIZARD_ADJUST_PCT)),
    };
  }

  function nudgeKcal(delta: number) {
    const { low, high } = simulatorBounds();
    setKcalFixed(prev => {
      const next = prev + delta;
      if (next < low || next > high) {
        setShowEstimateLimitMsg(true);
        return prev;
      }
      setShowEstimateLimitMsg(false);
      setNote(next);
      const m = getMacros(next, dietType);
      setLastMacros({ p: m.protein, c: m.carbs, f: m.fat });
      fetchPrice(m.protein, m.carbs, m.fat);
      return next;
    });
  }

  function resetKcal() {
    setShowEstimateLimitMsg(false);
    setKcalFixed(kcalDefault);
    setNote(kcalDefault);
    repaint(kcalDefault, dietType);
  }

  function redirectToManualEntry() {
    setKcalIn(kcalFixed);
    setShowEstimateLimitMsg(false);
    setPath(MANUAL_PATH);
    setIdx(1);
  }

  function changeDiet(d: DietType) {
    setDietType(d);
    repaint(kcalFixed, d);
  }

  function chooseGuided() { setPath(FULL_PATH); setIdx(1); }
  function chooseManual() { setPath(MANUAL_PATH); setIdx(1); }

  function handleBack() {
    if (idx > 0) {
      const newIdx = idx - 1;
      if (newIdx === 0) setPath(CHOICE_PATH);
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

  async function handleSaveDiet() {
    setSaving(true);
    setSaveErr(null);
    try {
      const supabase = createClient();
      const { data, error } = await (supabase.from("daily_macro_target") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
        .insert({
          user_id: userId,
          tenant_id: TENANT_ID,
          kcal_target: kcalFixed,
          protein_g: Math.round(lastMacros.p),
          carbs_g: Math.round(lastMacros.c),
          fat_g: Math.round(lastMacros.f),
          diet_type: dietType,
          goal: weightKnown ? goal : null,
          sex: weightKnown ? sex : null,
          height_cm: weightKnown ? height : null,
          weight_kg: weightKnown ? weight : null,
          activity_level: weightKnown ? activity : null,
          method: weightKnown ? "guided" : "manual",
          source: "diet_update",
        }).select().single();
      if (error || !data) throw new Error(error?.message ?? "Could not save your diet.");
      onSaved(data as MacroRow);
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Could not save your diet.");
    } finally { setSaving(false); }
  }

  function handleNext() {
    if (step === "basics" && !dob) { setDobErr("Please enter your date of birth"); return; }
    if (step === "activity") { fillResultFromBasics(); setIdx(i => i + 1); return; }
    if (step === "manual")   { fillResultFromManual(); setIdx(i => i + 1); return; }
    if (step === "result")   { handleSaveDiet(); return; }
    setDobErr(null);
    setIdx(i => i + 1);
  }

  function nextLabel() {
    if (step === "activity" || step === "manual") return "Build my plan";
    if (step === "result") return saving ? "Saving…" : "Save my plan";
    return "Continue";
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, background: C.offWhite, display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ background: C.primary, padding: "14px 20px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 20, color: C.white, fontWeight: 500 }}>
            Update your diet
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", padding: 0, color: "rgba(255,255,255,0.6)", cursor: "pointer", display: "flex" }}>
            <IconX size={20} />
          </button>
        </div>
        <div style={{ height: 2, background: "rgba(255,255,255,0.2)", borderRadius: 2, marginTop: 12 }}>
          <div style={{ height: 2, width: `${progress}%`, background: C.teal, borderRadius: 2, transition: "width 0.3s ease" }} />
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: "24px 20px 32px", overflowY: "auto" }}>

        {step === "choice" && (
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: 20 }}>How do you want to do this?</h3>
            <p style={{ fontSize: 13, color: C.muted, margin: "0 0 20px" }}>Pick whichever feels easier — you can always come back and change it.</p>

            <button onClick={chooseManual} style={{
              width: "100%", display: "flex", alignItems: "center", gap: 14, textAlign: "left",
              padding: "16px", borderRadius: 14, border: `1px solid ${C.border}`, background: C.white,
              cursor: "pointer", marginBottom: 12,
            }}>
              <div style={{ width: 42, height: 42, borderRadius: 11, background: C.offWhite, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <IconCalculator size={20} color={C.tealDark} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: "0 0 2px", fontSize: 14.5, fontWeight: 600 }}>I already know my numbers</p>
                <p style={{ margin: 0, fontSize: 12, color: C.muted, lineHeight: 1.5 }}>Punch in your calories and pick a macro style directly.</p>
              </div>
              <IconChevronRight size={16} color={C.light} style={{ flexShrink: 0 }} />
            </button>

            <button onClick={chooseGuided} style={{
              width: "100%", display: "flex", alignItems: "center", gap: 14, textAlign: "left",
              padding: "16px", borderRadius: 14, border: `1px solid ${C.border}`, background: C.white,
              cursor: "pointer",
            }}>
              <div style={{ width: 42, height: 42, borderRadius: 11, background: C.offWhite, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <IconChecklist size={20} color={C.tealDark} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: "0 0 2px", fontSize: 14.5, fontWeight: 600 }}>Help me figure it out</p>
                <p style={{ margin: 0, fontSize: 12, color: C.muted, lineHeight: 1.5 }}>Answer a few quick questions about you and we&apos;ll work it out together.</p>
              </div>
              <IconChevronRight size={16} color={C.light} style={{ flexShrink: 0 }} />
            </button>
          </div>
        )}

        {step === "goal" && (
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: 20 }}>What&apos;s the goal now?</h3>
            <p style={{ fontSize: 13, color: C.muted, margin: "0 0 18px" }}>Pick what fits best. You can change this later.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
              {([
                { id: "lose",     label: "Lose weight",     Icon: IconTrendingDown },
                { id: "maintain", label: "Maintain weight", Icon: IconScale },
                { id: "build",    label: "Build muscle",    Icon: IconTrendingUp },
                { id: "health",   label: "General health",  Icon: IconHeart },
              ] as { id: Goal; label: string; Icon: React.ElementType }[]).map(({ id, label, Icon }) => (
                <button key={id} className={`opt-card${goal === id ? " selected" : ""}`} onClick={() => setGoal(id)}>
                  <Icon size={18} color={goal === id ? C.teal : C.light} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "basics" && (
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: 20 }}>A few basics</h3>
            <p style={{ fontSize: 13, color: C.muted, margin: "0 0 18px" }}>Used only to set your starting point.</p>

            <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
              {(["female", "male"] as Sex[]).map(s => (
                <button key={s} className={`pill-toggle${sex === s ? " selected" : ""}`} onClick={() => setSex(s)}>
                  {s === "female" ? "Female" : "Male"}
                </button>
              ))}
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12.5, color: C.muted, display: "block", marginBottom: 8 }}>
                Date of birth <span style={{ color: C.error }}>*</span>
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1.2fr", gap: 8 }}>
                <select value={dobDay} onChange={e => {
                  const d = e.target.value; setDobDay(d);
                  if (d && dobMonth && dobYear) { setDob(`${dobYear}-${dobMonth.padStart(2,"0")}-${d.padStart(2,"0")}`); setDobErr(null); }
                }} style={{ fontSize: 16, minHeight: 48, color: dobDay ? "#1a1a1a" : C.light, borderColor: dobErr ? C.error : undefined }}>
                  <option value="">Day</option>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={String(d)}>{d}</option>)}
                </select>
                <select value={dobMonth} onChange={e => {
                  const m = e.target.value; setDobMonth(m);
                  if (dobDay && m && dobYear) { setDob(`${dobYear}-${m.padStart(2,"0")}-${dobDay.padStart(2,"0")}`); setDobErr(null); }
                }} style={{ fontSize: 16, minHeight: 48, color: dobMonth ? "#1a1a1a" : C.light, borderColor: dobErr ? C.error : undefined }}>
                  <option value="">Month</option>
                  {["January","February","March","April","May","June","July","August","September","October","November","December"].map((name, i) => (
                    <option key={i} value={String(i + 1)}>{name}</option>
                  ))}
                </select>
                <select value={dobYear} onChange={e => {
                  const y = e.target.value; setDobYear(y);
                  if (dobDay && dobMonth && y) { setDob(`${y}-${dobMonth.padStart(2,"0")}-${dobDay.padStart(2,"0")}`); setDobErr(null); }
                }} style={{ fontSize: 16, minHeight: 48, color: dobYear ? "#1a1a1a" : C.light, borderColor: dobErr ? C.error : undefined }}>
                  <option value="">Year</option>
                  {Array.from({ length: 80 }, (_, i) => new Date().getFullYear() - 10 - i).map(y => <option key={y} value={String(y)}>{y}</option>)}
                </select>
              </div>
              {dob
                ? <p style={{ fontSize: 11.5, color: C.light, margin: "5px 0 0 2px" }}>Age: {ageFromDob(dob)} years</p>
                : dobErr ? <p style={{ fontSize: 11.5, color: C.error, margin: "5px 0 0 2px" }}>{dobErr}</p> : null
              }
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 12.5, color: C.muted, marginBottom: 5 }}>
                <span>Height</span>
                <span>
                  <input
                    type="number" inputMode="numeric" className="numeric-inline"
                    value={height}
                    onChange={e => { const v = e.target.value; if (v !== "") setHeight(Number(v)); }}
                    onBlur={e => setHeight(Math.min(210, Math.max(140, Number(e.target.value) || 170)))}
                    style={{ fontWeight: 500, color: "#1a1a1a", fontSize: 12.5 }}
                  /> cm
                </span>
              </div>
              <input type="range" min={140} max={210} value={height} step={1} onChange={e => setHeight(Number(e.target.value))} />
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 12.5, color: C.muted, marginBottom: 5 }}>
                <span>Weight</span>
                <span>
                  <input
                    type="number" inputMode="numeric" className="numeric-inline"
                    value={weight}
                    onChange={e => { const v = e.target.value; if (v !== "") setWeight(Number(v)); }}
                    onBlur={e => setWeight(Math.min(150, Math.max(40, Number(e.target.value) || 70)))}
                    style={{ fontWeight: 500, color: "#1a1a1a", fontSize: 12.5 }}
                  /> kg
                </span>
              </div>
              <input type="range" min={40} max={150} value={weight} step={1} onChange={e => setWeight(Number(e.target.value))} />
            </div>
          </div>
        )}

        {step === "activity" && (
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: 20 }}>How active are you?</h3>
            <p style={{ fontSize: 13, color: C.muted, margin: "0 0 18px" }}>Outside of meal prep, day to day.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { val: 1.2,  label: "Sedentary",         sub: "Desk job, no regular workouts" },
                { val: 1.3,  label: "Lightly active",    sub: "Desk job + 1 to 3 workouts a week, or an on-your-feet job (teaching, retail, nursing) with no workouts" },
                { val: 1.45, label: "Moderately active",  sub: "On-your-feet job + 1 to 3 workouts a week, or a desk job + 4 to 5 workouts a week" },
                { val: 1.6,  label: "Very active",        sub: "Physically demanding job (labor, delivery, serving) + regular training, or daily intense training" },
              ].map(({ val, label, sub }) => (
                <button key={val} className={`opt-row${activity === val ? " selected" : ""}`} onClick={() => setActivity(val)}>
                  <span>{label}</span><span className="sub">{sub}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "manual" && (() => {
          const m = macrosFromDiet(kcalIn, dietType);
          return (
            <div>
              <h3 style={{ margin: "0 0 4px", fontSize: 20 }}>Set your daily target</h3>
              <p style={{ fontSize: 13, color: C.muted, margin: "0 0 20px" }}>Pick a calorie goal and a style that fits your life.</p>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
                <button aria-label="Decrease" onClick={() => setKcalIn(k => Math.max(KCAL_FLOOR, k - KCAL_STEP))}
                  style={{ width: 42, height: 42, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", flexShrink: 0 }}
                  disabled={kcalIn <= KCAL_FLOOR}>
                  <IconMinus size={18} />
                </button>
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 36, fontWeight: 500, margin: 0, lineHeight: 1 }}>
                    {kcalIn.toLocaleString("en-US")}
                  </p>
                  <p style={{ fontSize: 12, color: C.light, margin: "4px 0 0" }}>kcal / day</p>
                </div>
                <button aria-label="Increase" onClick={() => setKcalIn(k => Math.min(KCAL_CEIL, k + KCAL_STEP))}
                  style={{ width: 42, height: 42, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", flexShrink: 0 }}
                  disabled={kcalIn >= KCAL_CEIL}>
                  <IconPlus size={18} />
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
                {DIET_OPTIONS.map(opt => (
                  <button key={opt.id} onClick={() => setDietType(opt.id)} style={{
                    padding: "10px 8px", borderRadius: 10,
                    border: `2px solid ${dietType === opt.id ? C.tealDark : C.border}`,
                    background: dietType === opt.id ? "#f0f7f7" : C.white,
                    fontSize: 13, fontWeight: 600, color: dietType === opt.id ? C.tealDark : "#1a1a1a",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }}>
                    <span>{opt.emoji}</span><span>{opt.label}</span>
                  </button>
                ))}
              </div>

              <div className="info-card" style={{ marginBottom: 14 }}>
                <p style={{ fontSize: 12.5, color: C.muted, margin: "0 0 14px", lineHeight: 1.5 }}>
                  {DIET_OPTIONS.find(o => o.id === dietType)!.forWho}
                </p>
                <div style={{ display: "flex", height: 8, borderRadius: 6, overflow: "hidden", marginBottom: 10 }}>
                  <div style={{ width: `${m.split.p}%`, background: C.tealDark }} />
                  <div style={{ width: `${m.split.c}%`, background: C.sand }} />
                  <div style={{ width: `${m.split.f}%`, background: C.cream }} />
                </div>
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
            </div>
          );
        })()}

        {step === "result" && (
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: 20 }}>Here&apos;s your updated plan</h3>
            <p style={{ fontSize: 13, color: C.muted, margin: "0 0 16px" }}>{resultSubtitle}</p>

            <div className="info-card" style={{ textAlign: "center", marginBottom: 6 }}>
              <p style={{ fontSize: 12, color: C.light, margin: "0 0 8px" }}>Daily target</p>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
                <button aria-label="Decrease" style={{ width: 34, height: 34, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%" }}
                  onClick={() => nudgeKcal(-KCAL_STEP)} disabled={kcalFixed <= simulatorBounds().low}>
                  <IconMinus size={16} />
                </button>
                <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, fontWeight: 500, margin: 0, minWidth: 140, textAlign: "center" }}>
                  {kcalFixed.toLocaleString("en-US")} kcal
                </p>
                <button aria-label="Increase" style={{ width: 34, height: 34, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%" }}
                  onClick={() => nudgeKcal(KCAL_STEP)} disabled={kcalFixed >= simulatorBounds().high}>
                  <IconPlus size={16} />
                </button>
              </div>
            </div>

            {path === FULL_PATH && (
              <p style={{ fontSize: 10.5, color: C.light, textAlign: "center", margin: "6px 0 2px" }}>
                Estimated using the Mifflin-St Jeor equation
              </p>
            )}
            {finetuneNote && <p style={{ fontSize: 11.5, color: C.sand, textAlign: "center", margin: "4px 0 2px" }}>{finetuneNote}</p>}
            <p style={{ fontSize: 12, textAlign: "center", margin: "2px 0 12px", minHeight: 18 }}>
              {kcalFixed !== kcalDefault && (
                <a href="#" onClick={e => { e.preventDefault(); resetKcal(); }} style={{ color: C.muted, textDecoration: "underline" }}>
                  Reset to recommended
                </a>
              )}
            </p>

            {showEstimateLimitMsg && weightKnown && (
              <div className="info-card" style={{ textAlign: "center", marginBottom: 14, padding: "12px 14px", background: "#fdf6ec" }}>
                <p style={{ fontSize: 12.5, color: C.muted, margin: "0 0 8px", lineHeight: 1.5 }}>
                  This is an estimation — we only let you fine-tune it by ±15%. If you know your exact numbers, you can enter them yourself instead.
                </p>
                <button onClick={redirectToManualEntry} style={{
                  fontSize: 12.5, fontWeight: 600, color: C.tealDark, background: "none",
                  border: `1.5px solid ${C.tealDark}`, borderRadius: 8, padding: "6px 12px", cursor: "pointer",
                }}>
                  Enter my own numbers
                </button>
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <p style={{ fontSize: 12, color: C.muted, margin: "0 0 6px" }}>Macro split</p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(["high-protein", "balanced", "low-carb", "low-fat"] as DietType[]).map(d => (
                  <button key={d} className={`diet-chip${dietType === d ? " selected" : ""}`} style={{ flex: "1 1 auto" }} onClick={() => changeDiet(d)}>
                    {d === "high-protein" ? "High protein" : d === "low-fat" ? "Low fat" : d === "low-carb" ? "Low carb" : "Balanced"}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
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

            <div style={{ textAlign: "center", marginBottom: 16, opacity: priceLoading ? 0.55 : 1, transition: "opacity 0.15s" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 5, justifyContent: "center" }}>
                <span style={{ fontSize: 13, color: C.muted }}>Around</span>
                <span style={priceLoading ? { fontSize: 13, color: C.muted } : { fontSize: 17, fontWeight: 500, fontFamily: "'Playfair Display', serif" }}>
                  {priceLoading ? "updating…" : formatPrice(dayPrice, lastMacros.p, lastMacros.c, lastMacros.f)}
                </span>
                <span style={{ fontSize: 13, color: C.muted }}>a day</span>
                <span style={{ fontSize: 12, color: C.light }}>
                  ({formatPricePerMeal(dayPrice, lastMacros.p, lastMacros.c, lastMacros.f)} / meal)
                </span>
              </div>
              <p style={{ fontSize: 11.5, color: C.teal, margin: "4px 0 0" }}>
                {priceComparison(dayPrice, lastMacros.p, lastMacros.c, lastMacros.f)}
              </p>
            </div>

            <div style={{ border: `1px solid ${C.border}`, borderRadius: 9, padding: "12px 14px", display: "flex", gap: 10, alignItems: "flex-start", background: C.white, marginBottom: 12 }}>
              <IconBrandWhatsapp size={17} style={{ color: C.light, marginTop: 2, flexShrink: 0 }} />
              <p style={{ fontSize: 12.5, color: C.muted, margin: 0, lineHeight: 1.55 }}>
                Not sure this is right? Akli will check in over WhatsApp within 24 hours to fine-tune it together.
              </p>
            </div>

            {saveErr && (
              <div style={{ background: "#fdf0ef", border: `1px solid ${C.error}`, borderRadius: 10, padding: "12px 14px", fontSize: 12.5, color: C.error }}>
                {saveErr}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer — the choice screen navigates via its own cards, no Continue button needed */}
      {step !== "choice" && (
        <div style={{ display: "flex", gap: 10, padding: "14px 20px", borderTop: `1px solid ${C.border}`, background: C.white, flexShrink: 0 }}>
          {idx > 0 && (
            <button style={{ flex: "0 0 76px" }} onClick={handleBack} disabled={saving}>Back</button>
          )}
          <button className="btn-primary" style={{ flex: 1 }} onClick={handleNext} disabled={saving}>
            {nextLabel()}
          </button>
        </div>
      )}
    </div>
  );
}
