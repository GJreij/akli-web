"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

const LEVELS = [
  {
    id: "sedentary",
    label: "Sedentary",
    desc: "Desk job, little or no exercise",
  },
  {
    id: "light",
    label: "Lightly active",
    desc: "Light exercise 1–3 days/week",
  },
  {
    id: "moderate",
    label: "Moderately active",
    desc: "Moderate exercise 3–5 days/week",
  },
  {
    id: "active",
    label: "Very active",
    desc: "Hard exercise 6–7 days/week",
  },
  {
    id: "very_active",
    label: "Extremely active",
    desc: "Physical job + hard training daily",
  },
];

function ActivityForm() {
  const router = useRouter();
  const params = useSearchParams();

  function select(activity: string) {
    const qs = new URLSearchParams({
      goal: params.get("goal") ?? "maintain",
      sex: params.get("sex") ?? "male",
      age: params.get("age") ?? "28",
      height: params.get("height") ?? "175",
      weight: params.get("weight") ?? "75",
      activity,
    });
    router.push(`/onboarding/results?${qs}`);
  }

  return (
    <div className="flex-1 flex flex-col pt-8">
      <div className="mb-8">
        <div className="text-sm font-medium text-akli-green mb-2">Step 3 of 4</div>
        <h1 className="text-2xl font-bold text-akli-charcoal">Activity level</h1>
        <p className="text-akli-muted text-sm mt-1">
          Honest answer gives you the best starting point.
        </p>
      </div>

      <div className="space-y-3 flex-1">
        {LEVELS.map((l) => (
          <button
            key={l.id}
            onClick={() => select(l.id)}
            className="w-full card flex items-start gap-4 text-left hover:border-akli-green hover:shadow-md transition-all duration-150 cursor-pointer border-2 border-transparent"
          >
            <div>
              <div className="font-semibold text-akli-charcoal">{l.label}</div>
              <div className="text-sm text-akli-muted">{l.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ActivityPage() {
  return (
    <Suspense>
      <ActivityForm />
    </Suspense>
  );
}
