"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import {
  calculateBMR,
  calculateTDEE,
  calculateKcalTarget,
  calculateMacrosByWeight,
  calculateMacrosByPercent,
  type ActivityLevel,
  type Goal,
  type DietType,
  type MacroTargets,
} from "@/lib/macros";

const DIET_TYPES: { id: DietType; label: string; desc: string }[] = [
  { id: "high_protein", label: "High protein", desc: "More protein, less carbs" },
  { id: "balanced", label: "Balanced", desc: "Even split across macros" },
  { id: "low_fat", label: "Low fat", desc: "Higher carbs, leaner profile" },
];

function ResultsInner() {
  const params = useSearchParams();
  const router = useRouter();

  const goal = (params.get("goal") ?? "maintain") as Goal;
  const sex = (params.get("sex") ?? "male") as "male" | "female";
  const age = Number(params.get("age") ?? 28);
  const height = Number(params.get("height") ?? 175);
  const weight = Number(params.get("weight") ?? 0);
  const activity = (params.get("activity") ?? "moderate") as ActivityLevel;

  const hasWeight = weight > 0;

  const bmr = hasWeight ? calculateBMR(sex, weight, height, age) : 0;
  const tdee = hasWeight ? calculateTDEE(bmr, activity) : 0;
  const recommended = hasWeight ? calculateKcalTarget(tdee, goal) : 2000;

  const [kcal, setKcal] = useState(recommended);
  const [dietType, setDietType] = useState<DietType>("balanced");
  const [updated, setUpdated] = useState(false);
  const [macros, setMacros] = useState<MacroTargets | null>(null);
  const [pricePerDay, setPricePerDay] = useState<number | null>(null);

  useEffect(() => {
    const m = hasWeight
      ? calculateMacrosByWeight(kcal, weight, dietType)
      : calculateMacrosByPercent(kcal, dietType);
    setMacros(m);
    // Temporary estimate until macro_price is fetched
    const p = (m.protein_g * 0.05 + m.carbs_g * 0.015 + m.fat_g * 0.04 + 3.5);
    setPricePerDay(parseFloat(p.toFixed(2)));
  }, [kcal, dietType, weight, hasWeight]);

  function nudgeKcal(delta: number) {
    setKcal((prev) => {
      const next = prev + delta;
      if (next < 1200) return 1200;
      if (next > 4000) return 4000;
      return next;
    });
    setUpdated(true);
    setTimeout(() => setUpdated(false), 1500);
  }

  function resetKcal() {
    setKcal(recommended);
    setUpdated(true);
    setTimeout(() => setUpdated(false), 1500);
  }

  function handleSave() {
    if (!macros) return;
    const qs = new URLSearchParams({
      kcal: String(kcal),
      protein: String(macros.protein_g),
      carbs: String(macros.carbs_g),
      fat: String(macros.fat_g),
      diet_type: dietType,
      weight: String(weight),
    });
    router.push(`/onboarding/save?${qs}`);
  }

  if (!macros) return null;

  return (
    <div className="flex-1 flex flex-col pt-8">
      <div className="mb-6">
        <div className="text-sm font-medium text-akli-green mb-2">Step 4 of 4</div>
        <h1 className="text-2xl font-bold text-akli-charcoal">Your daily target</h1>
      </div>

      {/* Kcal tuner */}
      <div className="card mb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-akli-muted text-sm">Daily calories</span>
          <span
            className={`text-xs font-medium transition-opacity duration-300 ${
              updated ? "opacity-100 text-akli-green" : "opacity-0"
            }`}
          >
            Updated
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <button
            onClick={() => nudgeKcal(-50)}
            disabled={kcal <= 1200}
            className="w-10 h-10 rounded-xl border-2 border-gray-200 text-xl font-bold disabled:opacity-30 hover:border-akli-green transition-colors"
          >
            −
          </button>
          <div className="text-center">
            <div className="text-4xl font-bold text-akli-charcoal">{kcal}</div>
            <div className="text-akli-muted text-sm">kcal</div>
          </div>
          <button
            onClick={() => nudgeKcal(50)}
            disabled={kcal >= 4000}
            className="w-10 h-10 rounded-xl border-2 border-gray-200 text-xl font-bold disabled:opacity-30 hover:border-akli-green transition-colors"
          >
            +
          </button>
        </div>

        {kcal <= 1200 && (
          <p className="text-amber-600 text-xs mt-2 text-center">
            We recommend consulting a doctor before eating below 1200 kcal.
          </p>
        )}

        {hasWeight && kcal !== recommended && (
          <button
            onClick={resetKcal}
            className="text-xs text-akli-green underline mt-2 mx-auto block"
          >
            Reset to recommended ({recommended} kcal)
          </button>
        )}
      </div>

      {/* Diet type toggle */}
      <div className="card mb-4">
        <div className="text-sm font-medium text-akli-charcoal mb-3">Diet style</div>
        <div className="grid grid-cols-3 gap-2">
          {DIET_TYPES.map((d) => (
            <button
              key={d.id}
              onClick={() => {
                setDietType(d.id);
                setUpdated(true);
                setTimeout(() => setUpdated(false), 1500);
              }}
              className={`py-2 px-1 rounded-xl border-2 text-xs font-medium text-center transition-all ${
                dietType === d.id
                  ? "border-akli-green bg-akli-green-pale text-akli-green"
                  : "border-gray-200 bg-white text-akli-charcoal"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Macro breakdown */}
      <div className="card mb-4">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Protein", value: macros.protein_g, color: "text-blue-600 bg-blue-50" },
            { label: "Carbs", value: macros.carbs_g, color: "text-yellow-700 bg-yellow-50" },
            { label: "Fat", value: macros.fat_g, color: "text-orange-600 bg-orange-50" },
          ].map((m) => (
            <div key={m.label} className={`rounded-xl p-3 text-center ${m.color}`}>
              <div className="font-bold text-xl">{m.value}g</div>
              <div className="text-xs">{m.label}</div>
            </div>
          ))}
        </div>

        <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between items-center">
          <span className="text-sm text-akli-muted">Estimated daily cost</span>
          <span className="text-lg font-bold text-akli-green">
            {pricePerDay != null ? `$${pricePerDay}` : "—"}
          </span>
        </div>
      </div>

      <p className="text-xs text-akli-muted text-center mb-6">
        Akli will check in over WhatsApp within 24 hours to fine-tune it together.
      </p>

      <button onClick={handleSave} className="btn-primary">
        Save this plan
      </button>
    </div>
  );
}

export default function ResultsPage() {
  return (
    <Suspense>
      <ResultsInner />
    </Suspense>
  );
}
