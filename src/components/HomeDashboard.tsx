"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

type UserRow = Database["public"]["Tables"]["user"]["Row"];
type MacroRow = Database["public"]["Tables"]["daily_macro_target"]["Row"];

export default function HomeDashboard({
  profile,
  macroTarget,
}: {
  profile: UserRow | null;
  macroTarget: MacroRow | null;
}) {
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  const name = profile?.name ?? "there";
  const kcal = macroTarget?.kcal_target ?? null;
  const protein = macroTarget?.protein_g ?? null;
  const carbs = macroTarget?.carbs_g ?? null;
  const fat = macroTarget?.fat_g ?? null;

  return (
    <div className="min-h-screen bg-akli-cream">
      {/* Top bar */}
      <header className="px-6 py-4 flex items-center justify-between max-w-lg mx-auto">
        <span className="text-2xl font-bold text-akli-green">akli</span>
        <button onClick={signOut} className="text-sm text-akli-muted underline">
          Sign out
        </button>
      </header>

      <main className="max-w-lg mx-auto px-6 pb-10">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-akli-charcoal">
            Hey {name} 👋
          </h1>
          <p className="text-akli-muted text-sm mt-1">
            {new Date().toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
        </div>

        {/* Today's plan card */}
        {kcal ? (
          <div className="card mb-5">
            <div className="text-sm font-medium text-akli-muted mb-3">Today&apos;s target</div>
            <div className="text-4xl font-bold text-akli-charcoal mb-4">{kcal} kcal</div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: "Protein", value: protein, color: "text-blue-600 bg-blue-50" },
                { label: "Carbs", value: carbs, color: "text-yellow-700 bg-yellow-50" },
                { label: "Fat", value: fat, color: "text-orange-600 bg-orange-50" },
              ].map((m) => (
                <div key={m.label} className={`rounded-xl p-3 text-center ${m.color}`}>
                  <div className="font-bold text-lg">{m.value ? `${Math.round(m.value)}g` : "—"}</div>
                  <div className="text-xs">{m.label}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="card mb-5 text-center py-8">
            <p className="text-akli-muted mb-3">No macro plan set yet.</p>
            <a href="/onboarding/goal" className="text-akli-green underline text-sm">
              Set up your plan
            </a>
          </div>
        )}

        {/* Start an order CTA */}
        <button
          onClick={() => router.push("/order/new")}
          className="btn-primary w-full text-base py-4 mb-4"
        >
          Start an order
        </button>

        <p className="text-center text-xs text-akli-muted">
          Questions? Message us on WhatsApp.
        </p>
      </main>
    </div>
  );
}
