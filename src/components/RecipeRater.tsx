"use client";

import { useState } from "react";
import { upsertRecipePref, type PrefRating } from "@/lib/preferences";

const RATINGS: { value: PrefRating; emoji: string; label: string; active: { color: string; bg: string; border: string } }[] = [
  { value: "like",    emoji: "❤️", label: "Love it",      active: { color: "#b5461e", bg: "#fff0eb", border: "#f4a48a" } },
  { value: "dislike", emoji: "👎", label: "Prefer less",  active: { color: "#6b5800", bg: "#fffbe6", border: "#e6cf6e" } },
  { value: "skip",    emoji: "✕",  label: "Skip it",      active: { color: "#5c2a2a", bg: "#fdf0ef", border: "#e8a5a5" } },
];

export default function RecipeRater({
  userId,
  recipeId,
  initialRating,
}: {
  userId: string;
  recipeId: number;
  initialRating: PrefRating;
}) {
  const [rating, setRating] = useState<PrefRating>(initialRating);
  const [saving, setSaving] = useState(false);

  async function handleTap(value: PrefRating) {
    const next = rating === value ? null : value;
    setRating(next); // optimistic
    setSaving(true);
    try {
      await upsertRecipePref(userId, recipeId, next);
    } catch {
      setRating(rating); // revert on error
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 6, opacity: saving ? 0.7 : 1, transition: "opacity 0.15s" }}>
      {RATINGS.map(r => {
        const active = rating === r.value;
        return (
          <button
            key={r.value}
            onClick={() => handleTap(r.value)}
            title={r.label}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "5px 10px", borderRadius: 20, fontSize: 12,
              border: `1.5px solid ${active ? r.active.border : "#e0dbd5"}`,
              background: active ? r.active.bg : "#ffffff",
              color: active ? r.active.color : "#9a9a9a",
              fontWeight: active ? 600 : 400,
              cursor: "pointer", transition: "all 0.15s", flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 13 }}>{r.emoji}</span>
            {active && <span>{r.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
