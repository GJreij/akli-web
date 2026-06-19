"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { validateMacroCalories, calculateMacrosByPercent, type DietType } from "@/lib/macros";

type Mode = "macros" | "calories";

export default function ManualPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("macros");

  // Macros mode
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [declaredKcal, setDeclaredKcal] = useState("");

  // Calories mode
  const [kcalOnly, setKcalOnly] = useState("");
  const [dietType, setDietType] = useState<DietType>("balanced");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [macroWarning, setMacroWarning] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    setMacroWarning(null);

    if (mode === "macros") {
      const p = Number(protein);
      const c = Number(carbs);
      const f = Number(fat);
      const dk = Number(declaredKcal);

      if (!protein || p < 0) errs.protein = "Required";
      if (!carbs || c < 0) errs.carbs = "Required";
      if (!fat || f < 0) errs.fat = "Required";
      if (!declaredKcal || dk < 800) errs.kcal = "Enter calories (min 800)";

      if (Object.keys(errs).length) { setErrors(errs); return; }

      const check = validateMacroCalories(p, c, f, dk);
      if (!check.valid) {
        setMacroWarning(
          `Your macros add up to ~${check.computed_kcal} kcal but you entered ${dk} kcal (${check.delta} kcal gap). Double-check your numbers.`
        );
        // Don't block — let them continue if they're sure
      }

      const qs = new URLSearchParams({
        kcal: String(dk),
        protein: String(p),
        carbs: String(c),
        fat: String(f),
        diet_type: "balanced",
        weight: "0",
      });
      router.push(`/onboarding/save?${qs}`);
    } else {
      const k = Number(kcalOnly);
      if (!kcalOnly || k < 800 || k > 5000) {
        setErrors({ kcal: "Enter calories between 800 and 5000" });
        return;
      }
      const m = calculateMacrosByPercent(k, dietType);
      const qs = new URLSearchParams({
        kcal: String(k),
        protein: String(m.protein_g),
        carbs: String(m.carbs_g),
        fat: String(m.fat_g),
        diet_type: dietType,
        weight: "0",
      });
      router.push(`/onboarding/save?${qs}`);
    }
  }

  return (
    <div className="flex-1 flex flex-col pt-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-akli-charcoal">Enter your numbers</h1>
        <p className="text-akli-muted text-sm mt-1">Skip the calculator — put in what you know.</p>
      </div>

      {/* Mode toggle */}
      <div className="flex rounded-xl border border-gray-200 bg-white p-1 mb-6">
        {(["macros", "calories"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
              mode === m
                ? "bg-akli-green text-white shadow-sm"
                : "text-akli-muted hover:text-akli-charcoal"
            }`}
          >
            {m === "macros" ? "I know my macros" : "Just calories"}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4 flex-1">
        {mode === "macros" ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Protein (g)", key: "protein", val: protein, set: setProtein },
                { label: "Carbs (g)", key: "carbs", val: carbs, set: setCarbs },
                { label: "Fat (g)", key: "fat", val: fat, set: setFat },
              ].map((f) => (
                <div key={f.key}>
                  <label className="block text-xs font-medium text-akli-charcoal mb-1">
                    {f.label}
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    className="input-field text-sm py-2.5"
                    value={f.val}
                    onChange={(e) => {
                      f.set(e.target.value);
                      setErrors((p) => ({ ...p, [f.key]: "" }));
                      setMacroWarning(null);
                    }}
                  />
                  {errors[f.key] && (
                    <p className="text-red-600 text-xs mt-0.5">{errors[f.key]}</p>
                  )}
                </div>
              ))}
            </div>

            <div>
              <label className="block text-sm font-medium text-akli-charcoal mb-1.5">
                Daily calories (kcal)
              </label>
              <input
                type="number"
                inputMode="numeric"
                className="input-field"
                placeholder="2000"
                value={declaredKcal}
                onChange={(e) => {
                  setDeclaredKcal(e.target.value);
                  setErrors((p) => ({ ...p, kcal: "" }));
                  setMacroWarning(null);
                }}
              />
              {errors.kcal && <p className="text-red-600 text-xs mt-1">{errors.kcal}</p>}
            </div>

            {macroWarning && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                {macroWarning}
              </div>
            )}
          </>
        ) : (
          <>
            <div>
              <label className="block text-sm font-medium text-akli-charcoal mb-1.5">
                Daily calories (kcal)
              </label>
              <input
                type="number"
                inputMode="numeric"
                className="input-field"
                placeholder="2000"
                value={kcalOnly}
                onChange={(e) => {
                  setKcalOnly(e.target.value);
                  setErrors({});
                }}
              />
              {errors.kcal && <p className="text-red-600 text-xs mt-1">{errors.kcal}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-akli-charcoal mb-2">
                Diet style (we split it for you)
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(["high_protein", "balanced", "low_fat"] as DietType[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDietType(d)}
                    className={`py-2.5 rounded-xl border-2 text-xs font-medium capitalize transition-all ${
                      dietType === d
                        ? "border-akli-green bg-akli-green-pale text-akli-green"
                        : "border-gray-200 bg-white text-akli-charcoal"
                    }`}
                  >
                    {d.replace("_", " ")}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="pt-2">
          <button type="submit" className="btn-primary w-full">
            Continue
          </button>
        </div>
      </form>
    </div>
  );
}
