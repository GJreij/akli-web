"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const C = { primary: "#063330", offWhite: "#eee9e6" };

// Shared by HomeDashboard and LogFood — lets a user flip between the two
// top-level views at any time. Whichever one they land on becomes their
// saved default landing screen going forward (this IS the preference
// control now — there's no separate setting in /profile). ?dashboard=1
// bypasses the log_food default redirect on /home, same escape hatch used
// elsewhere so this never loops back on itself.
export default function ViewToggle({ active, userId }: { active: "home" | "food_diary"; userId: string | null }) {
  // Flip the highlight on tap, not only once the other page has rendered —
  // the old screen stays up while the new one loads behind the skeleton.
  const [shown, setShown] = useState(active);

  // Navigation itself is the <Link> below (prefetched, so it's near-instant);
  // this only saves the preference.
  function choose(next: "home" | "food_diary") {
    if (next === active) return;
    setShown(next);
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
    textAlign: "center", textDecoration: "none",
    flex: 1, padding: "8px 0", borderRadius: 8, border: "none",
    background: isActive ? C.offWhite : "transparent",
    color: isActive ? C.primary : "rgba(255,255,255,0.7)",
    fontSize: 12.5, fontWeight: 600, cursor: "pointer",
  });

  return (
    <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.08)", borderRadius: 12, padding: 4, marginBottom: 16 }}>
      <Link href="/home?dashboard=1" style={segStyle(shown === "home")} onClick={() => choose("home")}>
        Home Screen
      </Link>
      <Link href="/log-food" style={segStyle(shown === "food_diary")} onClick={() => choose("food_diary")}>
        Food Diary
      </Link>
    </div>
  );
}
