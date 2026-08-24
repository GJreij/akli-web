"use client";

import { useEffect, useState } from "react";
import { upsertRecipeComment } from "@/lib/preferences";

export default function RecipeComment({
  userId,
  recipeId,
  comment,
  onCommentChange,
}: {
  userId: string;
  recipeId: number;
  // Controlled by the parent (TastesManager) rather than local state — the
  // same recipe can appear in more than one week's menu, each rendering its
  // own RecipeComment instance, and they all need to reflect one shared
  // value instead of drifting out of sync until a full page reload.
  comment: string;
  onCommentChange: (recipeId: number, comment: string) => void;
}) {
  // Local editing buffer so keystrokes don't propagate to sibling instances
  // mid-typing — only committed to the shared value on blur/save.
  const [draft, setDraft] = useState(comment);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!expanded) setDraft(comment);
  }, [comment, expanded]);

  async function handleBlur() {
    setExpanded(false);
    if (draft === comment) return;
    setSaving(true);
    try {
      await upsertRecipeComment(userId, recipeId, draft);
      onCommentChange(recipeId, draft);
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
      value={draft}
      onChange={e => setDraft(e.target.value)}
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
