"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const C = {
  primary: "#063330", teal: "#67b1b0", tealDark: "#437b7b",
  offWhite: "#eee9e6", muted: "#5c5c5c", light: "#9a9a9a",
  border: "#e0dbd5", white: "#ffffff", error: "#c0392b",
};

const DIET_OPTIONS = [
  { id: "high-protein",  label: "💪 High Protein",       description: "More protein, less fat — great for active clients" },
  { id: "balanced",      label: "⚖️ Balanced",            description: "Everyday maintenance, no strong restriction" },
  { id: "low-fat",       label: "🥗 Light & Clean",       description: "Lower fat, higher carbs — calorie-conscious" },
  { id: "personalized",  label: "✨ Personalized Macros", description: "Custom targets set by Akli based on your specific needs" },
] as const;

type DietType = typeof DIET_OPTIONS[number]["id"];

type MacroRow = {
  id: number;
  created_at: string;
  kcal_target: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  diet_type: string | null;
  goal: string | null;
  source: string | null;
  method: string | null;
  sex: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  activity_level: number | null;
};

// kcal per gram
const KCAL = { protein: 4, carbs: 4, fat: 9 };

function pct(macro_g: number, kcal: number, type: "protein" | "carbs" | "fat") {
  if (!kcal) return 0;
  return Math.round((macro_g * KCAL[type] / kcal) * 100);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

type Mode = "kcal_pct" | "macros";

export default function AdminMacroEditor({ userId, history, onSaved }: {
  userId: string;
  history: MacroRow[];
  onSaved: (row: MacroRow) => void;
}) {
  const [mode, setMode] = useState<Mode>("kcal_pct");

  const prev = history[0] ?? null;
  const inheritedDiet = (DIET_OPTIONS.find(o => o.id === prev?.diet_type) ? prev!.diet_type : null) as DietType | null;
  const [dietType, setDietType] = useState<DietType>(inheritedDiet ?? "balanced");

  // kcal + % mode
  const [kcal, setKcal]       = useState("");
  const [protPct, setProtPct] = useState("30");
  const [carbPct, setCarbPct] = useState("40");
  const [fatPct, setFatPct]   = useState("30");

  // macros mode
  const [protG, setProtG] = useState("");
  const [carbG, setCarbG] = useState("");
  const [fatG, setFatG]   = useState("");

  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // ── Derived preview ───────────────────────────────────────────────────────────

  const kcalNum     = parseFloat(kcal)   || 0;
  const protPctNum  = parseFloat(protPct) || 0;
  const carbPctNum  = parseFloat(carbPct) || 0;
  const fatPctNum   = parseFloat(fatPct)  || 0;
  const pctSum      = protPctNum + carbPctNum + fatPctNum;

  const protGNum = parseFloat(protG) || 0;
  const carbGNum = parseFloat(carbG) || 0;
  const fatGNum  = parseFloat(fatG)  || 0;

  let preview: { kcal: number; protein_g: number; carbs_g: number; fat_g: number;
                  protPct: number; carbPct: number; fatPct: number } | null = null;

  if (mode === "kcal_pct" && kcalNum > 0 && pctSum > 0) {
    const p = Math.round((kcalNum * protPctNum / 100) / KCAL.protein);
    const c = Math.round((kcalNum * carbPctNum / 100) / KCAL.carbs);
    const f = Math.round((kcalNum * fatPctNum  / 100) / KCAL.fat);
    preview = { kcal: kcalNum, protein_g: p, carbs_g: c, fat_g: f,
                protPct: protPctNum, carbPct: carbPctNum, fatPct: fatPctNum };
  } else if (mode === "macros" && (protGNum + carbGNum + fatGNum) > 0) {
    const totalKcal = Math.round(protGNum * KCAL.protein + carbGNum * KCAL.carbs + fatGNum * KCAL.fat);
    preview = {
      kcal: totalKcal,
      protein_g: Math.round(protGNum), carbs_g: Math.round(carbGNum), fat_g: Math.round(fatGNum),
      protPct: pct(protGNum, totalKcal, "protein"),
      carbPct: pct(carbGNum, totalKcal, "carbs"),
      fatPct:  pct(fatGNum,  totalKcal, "fat"),
    };
  }

  const pctOk = mode === "macros" || Math.abs(pctSum - 100) < 0.5;

  async function handleSave() {
    if (!preview) return;
    setSaving(true); setErr(null); setSuccess(false);
    try {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("daily_macro_target") as any)
        .insert({
          user_id:        userId,
          tenant_id:      1,
          kcal_target:    preview.kcal,
          protein_g:      preview.protein_g,
          carbs_g:        preview.carbs_g,
          fat_g:          preview.fat_g,
          source:         "admin",
          method:         mode === "kcal_pct" ? "kcal_pct" : "manual_macros",
          diet_type:      dietType,
          // Inherited from previous record
          goal:           prev?.goal           ?? null,
          sex:            prev?.sex            ?? null,
          height_cm:      prev?.height_cm      ?? null,
          weight_kg:      prev?.weight_kg      ?? null,
          activity_level: prev?.activity_level ?? null,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      setSuccess(true);
      onSaved(data as MacroRow);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
    } finally { setSaving(false); }
  }

  return (
    <div>
      {/* ── History ────────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 12, color: C.light, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 10px" }}>
          Diet history
        </p>
        {history.length === 0 ? (
          <div style={{ padding: "12px 14px", borderRadius: 10, background: "#fff8f0", border: `1px solid #f0b87a`, fontSize: 13 }}>
            <p style={{ margin: "0 0 4px", fontWeight: 600, color: "#c45f00" }}>No history — first time setting this client&apos;s diet</p>
            <p style={{ margin: 0, color: C.muted, fontSize: 12 }}>
              Physical stats (height, weight, sex) won&apos;t be set — the client will see defaults in their Diet Wizard until they complete onboarding.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {history.map((row, i) => {
              const k = row.kcal_target ?? 0;
              const p = row.protein_g ?? 0;
              const cb = row.carbs_g ?? 0;
              const f = row.fat_g ?? 0;
              const isLatest = i === 0;
              const dietLabel = DIET_OPTIONS.find(o => o.id === row.diet_type)?.label ?? row.diet_type;
              return (
                <div
                  key={row.id}
                  style={{
                    padding: "12px 14px", borderRadius: 10,
                    border: `1.5px solid ${isLatest ? C.tealDark : C.border}`,
                    background: isLatest ? "#f0f7f7" : C.white,
                    fontSize: 13,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {isLatest && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: C.tealDark, background: "#d0eaea", borderRadius: 5, padding: "2px 7px", textTransform: "uppercase" }}>
                          Active
                        </span>
                      )}
                      {dietLabel && (
                        <span style={{ fontSize: 11, color: C.muted }}>{dietLabel}</span>
                      )}
                      {row.source === "admin" && (
                        <span style={{ fontSize: 10, color: C.light, fontStyle: "italic" }}>admin-set</span>
                      )}
                    </div>
                    <span style={{ fontSize: 11.5, color: C.light }}>{fmtDate(row.created_at)}</span>
                  </div>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <span><strong>{Math.round(k)}</strong> <span style={{ color: C.light }}>kcal</span></span>
                    <span><strong>{Math.round(p)}g</strong> <span style={{ color: C.light }}>protein ({pct(p, k, "protein")}%)</span></span>
                    <span><strong>{Math.round(cb)}g</strong> <span style={{ color: C.light }}>carbs ({pct(cb, k, "carbs")}%)</span></span>
                    <span><strong>{Math.round(f)}g</strong> <span style={{ color: C.light }}>fat ({pct(f, k, "fat")}%)</span></span>
                  </div>
                  {(row.goal || row.weight_kg || row.height_cm || row.sex) && (
                    <p style={{ margin: "4px 0 0", fontSize: 11.5, color: C.muted }}>
                      {[
                        row.goal && `Goal: ${row.goal}`,
                        row.sex,
                        row.weight_kg && `${row.weight_kg}kg`,
                        row.height_cm && `${row.height_cm}cm`,
                        row.activity_level && `activity ×${row.activity_level}`,
                      ].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Editor ─────────────────────────────────────────────────────────────── */}
      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 20 }}>
        <p style={{ fontSize: 12, color: C.light, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 14px" }}>
          Set new target
        </p>

        {/* Diet type picker */}
        <div style={{ marginBottom: 18 }}>
          <p style={{ fontSize: 11.5, color: C.muted, margin: "0 0 8px" }}>Diet style — shown to the client on their profile</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {DIET_OPTIONS.map(opt => (
              <button
                key={opt.id}
                onClick={() => setDietType(opt.id)}
                title={opt.description}
                style={{
                  padding: "8px 14px", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer",
                  border: `2px solid ${dietType === opt.id ? C.tealDark : C.border}`,
                  background: dietType === opt.id ? "#f0f7f7" : C.white,
                  color: dietType === opt.id ? C.tealDark : C.muted,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 11, color: C.light, margin: "6px 0 0" }}>
            {DIET_OPTIONS.find(o => o.id === dietType)?.description}
          </p>
        </div>

        {/* Mode toggle */}
        <div style={{ display: "flex", gap: 0, marginBottom: 18, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", width: "fit-content" }}>
          {([["kcal_pct", "Kcal + %"], ["macros", "Macros → Kcal"]] as [Mode, string][]).map(([m, label]) => (
            <button
              key={m}
              onClick={() => { setMode(m); setErr(null); setSuccess(false); }}
              style={{
                padding: "8px 18px", border: "none", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                background: mode === m ? C.primary : C.white,
                color: mode === m ? C.white : C.muted,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "kcal_pct" ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <Field label="Total Kcal" value={kcal} onChange={setKcal} unit="kcal" />
            <Field label="Protein %" value={protPct} onChange={setProtPct} unit="%" />
            <Field label="Carbs %" value={carbPct} onChange={setCarbPct} unit="%" />
            <Field label="Fat %" value={fatPct} onChange={setFatPct} unit="%" />
            {pctSum > 0 && !pctOk && (
              <p style={{ width: "100%", fontSize: 12, color: C.error, margin: 0 }}>
                Percentages add up to {Math.round(pctSum)}% — they must total 100%.
              </p>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <Field label="Protein" value={protG} onChange={setProtG} unit="g" />
            <Field label="Carbs" value={carbG} onChange={setCarbG} unit="g" />
            <Field label="Fat" value={fatG} onChange={setFatG} unit="g" />
          </div>
        )}

        {/* Preview */}
        {preview && (
          <div style={{
            marginTop: 16, padding: "12px 14px", borderRadius: 10,
            background: "#f0f7f7", border: `1px solid ${C.teal}`,
          }}>
            <p style={{ fontSize: 11, color: C.tealDark, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px", fontWeight: 700 }}>
              Preview
            </p>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
              <span><strong>{preview.kcal.toLocaleString()}</strong> <span style={{ color: C.muted }}>kcal</span></span>
              <span><strong>{preview.protein_g}g</strong> <span style={{ color: C.muted }}>protein ({preview.protPct}%)</span></span>
              <span><strong>{preview.carbs_g}g</strong> <span style={{ color: C.muted }}>carbs ({preview.carbPct}%)</span></span>
              <span><strong>{preview.fat_g}g</strong> <span style={{ color: C.muted }}>fat ({preview.fatPct}%)</span></span>
            </div>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 16 }}>
          <button
            onClick={handleSave}
            disabled={saving || !preview || (mode === "kcal_pct" && !pctOk)}
            style={{
              padding: "10px 24px", borderRadius: 9, border: "none", fontSize: 13.5, fontWeight: 700,
              background: preview && (mode !== "kcal_pct" || pctOk) ? C.primary : C.border,
              color: C.white, cursor: preview && (mode !== "kcal_pct" || pctOk) ? "pointer" : "default",
            }}
          >
            {saving ? "Saving…" : "Save as new target"}
          </button>
          {success && <span style={{ fontSize: 13, color: C.tealDark, fontWeight: 600 }}>✓ Saved</span>}
          {err && <span style={{ fontSize: 12, color: C.error }}>{err}</span>}
        </div>
        <p style={{ fontSize: 11.5, color: C.light, margin: "8px 0 0" }}>
          This inserts a new record — the client&apos;s previous targets are preserved in history.
        </p>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, unit }: {
  label: string; value: string; onChange: (v: string) => void; unit: string;
}) {
  return (
    <div style={{ flex: "1 1 100px", minWidth: 90 }}>
      <label style={{ fontSize: 11.5, color: C.muted, display: "block", marginBottom: 4 }}>{label}</label>
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <input
          type="number"
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{
            width: "100%", padding: "9px 32px 9px 11px", borderRadius: 8,
            border: `1px solid ${C.border}`, fontSize: 14, fontWeight: 600,
            outline: "none", background: C.white, color: C.primary,
          }}
        />
        <span style={{ position: "absolute", right: 10, fontSize: 11.5, color: C.light, pointerEvents: "none" }}>
          {unit}
        </span>
      </div>
    </div>
  );
}
