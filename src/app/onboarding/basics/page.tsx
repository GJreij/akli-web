"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";

function BasicsForm() {
  const router = useRouter();
  const params = useSearchParams();
  const goal = params.get("goal") ?? "maintain";

  const [sex, setSex] = useState<"male" | "female">("male");
  const [age, setAge] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate() {
    const e: Record<string, string> = {};
    const ageN = Number(age);
    const hN = Number(heightCm);
    const wN = Number(weightKg);
    if (!age || ageN < 10 || ageN > 120) e.age = "Enter a valid age (10–120)";
    if (!heightCm || hN < 100 || hN > 250) e.height = "Enter height in cm (100–250)";
    if (!weightKg || wN < 30 || wN > 300) e.weight = "Enter weight in kg (30–300)";
    return e;
  }

  function handleNext(e: React.FormEvent) {
    e.preventDefault();
    const e2 = validate();
    if (Object.keys(e2).length) { setErrors(e2); return; }
    router.push(
      `/onboarding/activity?goal=${goal}&sex=${sex}&age=${age}&height=${heightCm}&weight=${weightKg}`
    );
  }

  return (
    <div className="flex-1 flex flex-col pt-8">
      <div className="mb-8">
        <div className="text-sm font-medium text-akli-green mb-2">Step 2 of 4</div>
        <h1 className="text-2xl font-bold text-akli-charcoal">About you</h1>
        <p className="text-akli-muted text-sm mt-1">Used to calculate your calorie needs.</p>
      </div>

      <form onSubmit={handleNext} noValidate className="space-y-5 flex-1">
        <div>
          <label className="block text-sm font-medium text-akli-charcoal mb-2">Sex</label>
          <div className="grid grid-cols-2 gap-3">
            {(["male", "female"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSex(s)}
                className={`py-3 rounded-xl border-2 font-medium capitalize transition-all ${
                  sex === s
                    ? "border-akli-green bg-akli-green-pale text-akli-green"
                    : "border-gray-200 bg-white text-akli-charcoal"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-akli-charcoal mb-1.5">Age</label>
          <input
            type="number"
            inputMode="numeric"
            className="input-field"
            placeholder="28"
            value={age}
            onChange={(e) => { setAge(e.target.value); setErrors((p) => ({ ...p, age: "" })); }}
          />
          {errors.age && <p className="text-red-600 text-xs mt-1">{errors.age}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-akli-charcoal mb-1.5">
            Height (cm)
          </label>
          <input
            type="number"
            inputMode="decimal"
            className="input-field"
            placeholder="175"
            value={heightCm}
            onChange={(e) => { setHeightCm(e.target.value); setErrors((p) => ({ ...p, height: "" })); }}
          />
          {errors.height && <p className="text-red-600 text-xs mt-1">{errors.height}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-akli-charcoal mb-1.5">
            Weight (kg)
          </label>
          <input
            type="number"
            inputMode="decimal"
            className="input-field"
            placeholder="75"
            value={weightKg}
            onChange={(e) => { setWeightKg(e.target.value); setErrors((p) => ({ ...p, weight: "" })); }}
          />
          {errors.weight && <p className="text-red-600 text-xs mt-1">{errors.weight}</p>}
        </div>

        <div className="pt-4">
          <button type="submit" className="btn-primary w-full">
            Continue
          </button>
        </div>
      </form>
    </div>
  );
}

export default function BasicsPage() {
  return (
    <Suspense>
      <BasicsForm />
    </Suspense>
  );
}
