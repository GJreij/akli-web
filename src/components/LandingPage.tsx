"use client";

import Link from "next/link";
import { useState } from "react";
import { calculateBMR, calculateTDEE, calculateKcalTarget, calculateMacrosByWeight, type ActivityLevel, type Goal } from "@/lib/macros";

export default function LandingPage() {
  const [kcal, setKcal] = useState(2000);
  const [showCalc, setShowCalc] = useState(false);
  const [calcInputs, setCalcInputs] = useState({
    sex: "male" as "male" | "female",
    age: 28,
    weight: 75,
    height: 175,
    activity: "moderate" as ActivityLevel,
    goal: "maintain" as Goal,
  });

  function runCalc() {
    const bmr = calculateBMR(
      calcInputs.sex,
      calcInputs.weight,
      calcInputs.height,
      calcInputs.age
    );
    const tdee = calculateTDEE(bmr, calcInputs.activity);
    const target = calculateKcalTarget(tdee, calcInputs.goal);
    setKcal(target);
  }

  const macros = calculateMacrosByWeight(kcal, calcInputs.weight, "balanced");
  const estimatedPrice = ((macros.protein_g * 0.05 + macros.carbs_g * 0.015 + macros.fat_g * 0.04 + 3.5)).toFixed(2);

  return (
    <div className="min-h-screen bg-akli-cream">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-5xl mx-auto">
        <span className="text-2xl font-bold text-akli-green">akli</span>
        <div className="flex gap-3">
          <Link href="/sign-in" className="btn-secondary text-sm py-2 px-4">
            Sign in
          </Link>
          <Link href="/onboarding/goal" className="btn-primary text-sm py-2 px-4">
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-16 pb-12 text-center">
        <h1 className="text-5xl font-bold text-akli-charcoal leading-tight mb-4">
          Eat right.<br />
          <span className="text-akli-green">No guessing.</span>
        </h1>
        <p className="text-lg text-akli-muted max-w-xl mx-auto mb-8">
          Macro-optimised meals, built around your body, delivered fresh to your door in Lebanon.
        </p>
        <Link href="/onboarding/goal" className="btn-primary inline-block text-base px-8 py-4">
          Calculate my plan — it&apos;s free
        </Link>
      </section>

      {/* Live calculator preview */}
      <section className="max-w-lg mx-auto px-6 pb-16">
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-akli-charcoal">Your daily target</h2>
            <button
              onClick={() => setShowCalc(!showCalc)}
              className="text-sm text-akli-green underline"
            >
              {showCalc ? "Hide inputs" : "Adjust"}
            </button>
          </div>

          {showCalc && (
            <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
              <div>
                <label className="block text-akli-muted mb-1">Sex</label>
                <select
                  className="input-field text-sm py-2"
                  value={calcInputs.sex}
                  onChange={(e) => {
                    setCalcInputs((p) => ({ ...p, sex: e.target.value as "male" | "female" }));
                    runCalc();
                  }}
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>
              <div>
                <label className="block text-akli-muted mb-1">Age</label>
                <input
                  type="number"
                  className="input-field text-sm py-2"
                  value={calcInputs.age}
                  onChange={(e) => {
                    setCalcInputs((p) => ({ ...p, age: Number(e.target.value) }));
                    runCalc();
                  }}
                />
              </div>
              <div>
                <label className="block text-akli-muted mb-1">Weight (kg)</label>
                <input
                  type="number"
                  className="input-field text-sm py-2"
                  value={calcInputs.weight}
                  onChange={(e) => {
                    setCalcInputs((p) => ({ ...p, weight: Number(e.target.value) }));
                    runCalc();
                  }}
                />
              </div>
              <div>
                <label className="block text-akli-muted mb-1">Height (cm)</label>
                <input
                  type="number"
                  className="input-field text-sm py-2"
                  value={calcInputs.height}
                  onChange={(e) => {
                    setCalcInputs((p) => ({ ...p, height: Number(e.target.value) }));
                    runCalc();
                  }}
                />
              </div>
              <div className="col-span-2">
                <label className="block text-akli-muted mb-1">Goal</label>
                <select
                  className="input-field text-sm py-2"
                  value={calcInputs.goal}
                  onChange={(e) => {
                    setCalcInputs((p) => ({ ...p, goal: e.target.value as Goal }));
                    runCalc();
                  }}
                >
                  <option value="lose_weight">Lose weight</option>
                  <option value="maintain">Maintain</option>
                  <option value="build_muscle">Build muscle</option>
                  <option value="general_health">General health</option>
                </select>
              </div>
            </div>
          )}

          <div className="flex items-end justify-between mb-4">
            <div>
              <div className="text-4xl font-bold text-akli-charcoal">{kcal}</div>
              <div className="text-akli-muted text-sm">kcal / day</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-akli-green">${estimatedPrice}</div>
              <div className="text-akli-muted text-sm">/ day est.</div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-5">
            {[
              { label: "Protein", value: macros.protein_g, unit: "g", color: "bg-blue-50 text-blue-700" },
              { label: "Carbs", value: macros.carbs_g, unit: "g", color: "bg-yellow-50 text-yellow-700" },
              { label: "Fat", value: macros.fat_g, unit: "g", color: "bg-orange-50 text-orange-700" },
            ].map((m) => (
              <div key={m.label} className={`rounded-xl p-3 text-center ${m.color}`}>
                <div className="font-bold text-lg">{m.value}g</div>
                <div className="text-xs">{m.label}</div>
              </div>
            ))}
          </div>

          <Link href="/onboarding/goal" className="btn-primary block text-center">
            Build my plan
          </Link>
          <p className="text-center text-xs text-akli-muted mt-3">
            Akli will check in over WhatsApp within 24 hours to fine-tune it together.
          </p>
        </div>
      </section>
    </div>
  );
}
