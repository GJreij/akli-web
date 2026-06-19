"use client";

import { useRouter } from "next/navigation";

const GOALS = [
  {
    id: "lose_weight",
    label: "Lose weight",
    emoji: "📉",
    desc: "Reduce body fat while preserving muscle",
  },
  {
    id: "maintain",
    label: "Maintain weight",
    emoji: "⚖️",
    desc: "Eat at maintenance to stay where you are",
  },
  {
    id: "build_muscle",
    label: "Build muscle",
    emoji: "💪",
    desc: "Caloric surplus to support muscle growth",
  },
  {
    id: "general_health",
    label: "General health",
    emoji: "🥗",
    desc: "Balanced nutrition for everyday wellbeing",
  },
];

export default function GoalPage() {
  const router = useRouter();

  function select(goal: string) {
    router.push(`/onboarding/basics?goal=${goal}`);
  }

  return (
    <div className="flex-1 flex flex-col pt-8">
      <div className="mb-8">
        <div className="text-sm font-medium text-akli-green mb-2">Step 1 of 4</div>
        <h1 className="text-2xl font-bold text-akli-charcoal">What&apos;s your goal?</h1>
        <p className="text-akli-muted text-sm mt-1">
          This sets your calorie target. You can fine-tune it next.
        </p>
      </div>

      <div className="space-y-3 flex-1">
        {GOALS.map((g) => (
          <button
            key={g.id}
            onClick={() => select(g.id)}
            className="w-full card flex items-center gap-4 text-left hover:border-akli-green hover:shadow-md transition-all duration-150 cursor-pointer border-2 border-transparent"
          >
            <span className="text-3xl">{g.emoji}</span>
            <div>
              <div className="font-semibold text-akli-charcoal">{g.label}</div>
              <div className="text-sm text-akli-muted">{g.desc}</div>
            </div>
          </button>
        ))}
      </div>

      <div className="mt-6 text-center">
        <button
          onClick={() => router.push("/onboarding/manual")}
          className="text-sm text-akli-muted underline"
        >
          Skip — I already know my numbers
        </button>
      </div>
    </div>
  );
}
