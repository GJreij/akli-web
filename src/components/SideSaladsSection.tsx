"use client";

import { useState } from "react";
import {
  setNoSideSalad, upsertSideSaladComment, upsertSideSaladPref, type SaladRating,
} from "@/lib/preferences";

export type SideSalad = {
  id: number;
  name: string;
  ingredients: string; // short "lettuce, tomato, radish…" line
  isHouse: boolean;
};

const C = {
  primary:  "#063330",
  teal:     "#67b1b0",
  tealDark: "#437b7b",
  offWhite: "#eee9e6",
  muted:    "#5c5c5c",
  light:    "#9a9a9a",
  border:   "#e0dbd5",
  white:    "#ffffff",
};

const RATINGS: { value: Exclude<SaladRating, null>; emoji: string; label: string; active: { color: string; bg: string; border: string } }[] = [
  { value: "like",    emoji: "❤️", label: "Love it",    active: { color: "#b5461e", bg: "#fff0eb", border: "#f4a48a" } },
  { value: "dislike", emoji: "👎", label: "Don't like", active: { color: "#6b5800", bg: "#fffbe6", border: "#e6cf6e" } },
];

function SaladNote({ userId, saladId, note, onNoteChange }: {
  userId: string; saladId: number; note: string;
  onNoteChange: (saladId: number, note: string) => void;
}) {
  const [draft, setDraft] = useState(note);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleBlur() {
    setExpanded(false);
    if (draft === note) return;
    setSaving(true);
    try {
      await upsertSideSaladComment(userId, saladId, draft);
      onNoteChange(saladId, draft.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      setDraft(note);
    } finally {
      setSaving(false);
    }
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => { setDraft(note); setExpanded(true); }}
        style={{
          marginTop: 6, padding: 0, background: "none", border: "none", cursor: "pointer",
          fontSize: 11, color: note ? C.tealDark : C.light, textAlign: "left",
          maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}
      >
        {note ? `📝 “${note}”` : "+ Add a note for this salad"}
        {saved && <span style={{ marginLeft: 6, color: C.tealDark }}>· Saved</span>}
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
      placeholder="e.g. no tomatoes"
      maxLength={120}
      // 16px minimum — autoFocus at a smaller size makes iOS Safari zoom in.
      style={{
        width: "100%", marginTop: 6, fontSize: 16, padding: "6px 9px",
        border: `1px solid ${C.border}`, borderRadius: 8, background: C.white,
        opacity: saving ? 0.7 : 1, transition: "opacity 0.15s",
      }}
    />
  );
}

export default function SideSaladsSection({
  userId, salads, initialRatings, initialNotes, initialNever,
}: {
  userId: string;
  salads: SideSalad[];
  initialRatings: Record<number, SaladRating>;
  initialNotes: Record<number, string>;
  initialNever: boolean;
}) {
  const [ratings, setRatings] = useState(initialRatings);
  const [notes, setNotes] = useState(initialNotes);
  const [never, setNever] = useState(initialNever);
  const [savingNever, setSavingNever] = useState(false);

  if (salads.length === 0) return null;

  const house = salads.find(s => s.isHouse);
  const houseDisliked = house ? ratings[house.id] === "dislike" : true;

  async function handleRate(saladId: number, value: Exclude<SaladRating, null>) {
    const prev = ratings[saladId] ?? null;
    const next = prev === value ? null : value;
    setRatings(r => ({ ...r, [saladId]: next }));
    try {
      await upsertSideSaladPref(userId, saladId, next);
    } catch {
      setRatings(r => ({ ...r, [saladId]: prev }));
    }
  }

  async function handleNever() {
    const next = !never;
    setNever(next);
    setSavingNever(true);
    try {
      await setNoSideSalad(userId, next);
    } catch {
      setNever(!next);
    } finally {
      setSavingNever(false);
    }
  }

  function fallbackHint(salad: SideSalad) {
    if (ratings[salad.id] !== "dislike") return null;
    if (!salad.isHouse && !houseDisliked) return `You'll get the ${house!.name} instead.`;
    return "You'll get no salad — the rest of your plate gets bigger instead.";
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px 4px" }}>
        <p style={{ margin: "0 0 2px", fontFamily: "'Playfair Display', serif", fontSize: 15, fontWeight: 500, color: "#1a1a1a" }}>
          Side salads
        </p>
        <p style={{ margin: "0 0 12px", fontSize: 11.5, color: C.light, lineHeight: 1.5 }}>
          Most dishes come with a side salad. Tell us which ones you enjoy — your notes go to the kitchen for that salad only.
        </p>

        {/* Never-salad toggle */}
        <button
          type="button"
          role="switch"
          aria-checked={never}
          onClick={handleNever}
          disabled={savingNever}
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
            padding: "10px 12px", marginBottom: 6, borderRadius: 10, cursor: "pointer", textAlign: "left",
            background: never ? "#e8f3f3" : C.offWhite, border: `1px solid ${never ? C.teal : C.border}`,
          }}
        >
          <span>
            <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>Don&apos;t include any side salad</span>
            <span style={{ display: "block", fontSize: 11, color: C.muted, marginTop: 2 }}>
              Same calories — the rest of your plate gets bigger instead.
            </span>
          </span>
          <span aria-hidden style={{
            width: 38, height: 22, borderRadius: 11, flexShrink: 0, position: "relative",
            background: never ? C.tealDark : "#cfc9c3", transition: "background 0.15s",
          }}>
            <span style={{
              position: "absolute", top: 2, left: never ? 18 : 2, width: 18, height: 18, borderRadius: "50%",
              background: C.white, transition: "left 0.15s",
            }} />
          </span>
        </button>

        <div style={{ opacity: never ? 0.45 : 1, pointerEvents: never ? "none" : "auto", transition: "opacity 0.15s" }}>
          {salads.map((salad, i) => {
            const rating = ratings[salad.id] ?? null;
            const hint = fallbackHint(salad);
            return (
              <div key={salad.id} style={{ padding: "12px 0", borderBottom: i === salads.length - 1 ? "none" : `1px solid ${C.border}` }}>
                <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 2px" }}>
                  {salad.name}
                  {salad.isHouse && <span style={{ fontSize: 10.5, fontWeight: 500, color: C.tealDark, marginLeft: 6 }}>default</span>}
                </p>
                {salad.ingredients && (
                  <p style={{ fontSize: 11.5, color: C.light, margin: "0 0 7px" }}>{salad.ingredients}</p>
                )}
                <div style={{ display: "flex", gap: 6 }}>
                  {RATINGS.map(r => {
                    const active = rating === r.value;
                    return (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => handleRate(salad.id, r.value)}
                        title={r.label}
                        style={{
                          display: "flex", alignItems: "center", gap: 4,
                          padding: "5px 10px", borderRadius: 20, fontSize: 12,
                          border: `1.5px solid ${active ? r.active.border : C.border}`,
                          background: active ? r.active.bg : C.white,
                          color: active ? r.active.color : C.light,
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
                {hint && <p style={{ fontSize: 11, color: C.muted, margin: "6px 0 0" }}>{hint}</p>}
                {rating !== "dislike" && (
                  <SaladNote
                    userId={userId}
                    saladId={salad.id}
                    note={notes[salad.id] ?? ""}
                    onNoteChange={(id, note) => setNotes(n => ({ ...n, [id]: note }))}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
