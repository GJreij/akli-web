"use client";

import { useRef, useState } from "react";
import { upsertRecipeComment } from "@/lib/preferences";

export default function RecipeComment({
  userId,
  recipeId,
  initialComment,
}: {
  userId: string;
  recipeId: number;
  initialComment: string;
}) {
  const [comment, setComment] = useState(initialComment);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const lastSaved = useRef(initialComment);

  async function handleBlur() {
    setExpanded(false);
    if (comment === lastSaved.current) return;
    setSaving(true);
    try {
      await upsertRecipeComment(userId, recipeId, comment);
      lastSaved.current = comment;
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        style={{
          marginTop: 6, padding: 0, background: "none", border: "none", cursor: "pointer",
          fontSize: 11, color: comment ? "#437b7b" : "#9a9a9a", textAlign: "left",
          maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}
      >
        {comment ? `📝 “${comment}”` : "+ Add a note for the kitchen"}
        {saved && <span style={{ marginLeft: 6, color: "#437b7b" }}>· Saved</span>}
      </button>
    );
  }

  return (
    <input
      type="text"
      autoFocus
      value={comment}
      onChange={e => setComment(e.target.value)}
      onBlur={handleBlur}
      placeholder="e.g. no onions"
      style={{
        width: "100%", marginTop: 6, fontSize: 12, padding: "6px 9px",
        border: "1px solid #e0dbd5", borderRadius: 8, background: "#fff",
        opacity: saving ? 0.7 : 1, transition: "opacity 0.15s",
      }}
    />
  );
}
