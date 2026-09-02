"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const C = { primary: "#063330", offWhite: "#eee9e6" };

// Shared by HomeDashboard and LogFood — lets a user flip between the two
// top-level views at any time. Whichever one they land on becomes their
// saved default landing screen going forward (this IS the preference
// control now — there's no separate setting in /profile). ?dashboard=1
// bypasses the log_food default redirect on /home, same escape hatch used
// elsewhere so this never loops back on itself.
export default function ViewToggle({ active, userId }: { active: "home" | "food_diary"; userId: string | null }) {
  const router = useRouter();

  function choose(next: "home" | "food_diary") {
    if (next === active) return;
    router.push(next === "home" ? "/home?dashboard=1" : "/log-food");
    if (!userId) return;
    const supabase = createClient();
    // Fire-and-forget — this is a low-stakes preference, not worth blocking
    // navigation on, and there's nothing useful to show if it fails beyond
    // logging it (the toggle itself already reflects the current view).
    (supabase.from("user") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      .update({ home_screen_default: next === "home" ? "dashboard" : "log_food" })
      .eq("id", userId)
      .then(({ error }: { error: { message: string } | null }) => {
        if (error) console.error("Failed to save home screen preference:", error.message);
      });
  }

  const segStyle = (isActive: boolean): React.CSSProperties => ({
    flex: 1, padding: "8px 0", borderRadius: 8, border: "none",
    background: isActive ? C.offWhite : "transparent",
    color: isActive ? C.primary : "rgba(255,255,255,0.7)",
    fontSize: 12.5, fontWeight: 600, cursor: "pointer",
  });

  return (
    <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.08)", borderRadius: 12, padding: 4, marginBottom: 16 }}>
      <button style={segStyle(active === "home")} onClick={() => choose("home")}>
        Home Screen
      </button>
      <button style={segStyle(active === "food_diary")} onClick={() => choose("food_diary")}>
        Food Diary
      </button>
    </div>
  );
}
