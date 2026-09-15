"use client";

import { useEffect } from "react";
import { C } from "@/components/admin/ui";

// Catches any error thrown while rendering an admin page (including a Flask
// gateway timeout — analytics_event shows repeated 504s on
// /available_recipes_for_date, /confirm_order, etc.) so it doesn't fall
// through to Next's bare crash screen, which otherwise forces a full manual
// refresh to recover. "Try again" re-renders just this segment.
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[admin]", error);
  }, [error]);

  return (
    <div style={{ padding: "40px 20px", maxWidth: 480, margin: "0 auto", textAlign: "center" }}>
      <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 19, color: C.primary, margin: "0 0 8px" }}>
        Something went wrong loading this page
      </p>
      <p style={{ fontSize: 13, color: C.muted, margin: "0 0 20px" }}>
        {error.message || "Unexpected error."}
      </p>
      <button
        onClick={() => reset()}
        style={{
          background: C.primary, color: C.white, border: "none", borderRadius: 8,
          padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer",
        }}
      >
        Try again
      </button>
    </div>
  );
}
