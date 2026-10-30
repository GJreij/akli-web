"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { KitchenComment, KitchenIngredient } from "@/lib/flask";
import { setCommentHandling } from "@/app/admin/kitchen/actions";
import { C } from "../ui";

export type Handling = "assembly" | "separate_pot" | "ignore";

const LABEL: Record<Handling, string> = {
  assembly: "Leave out when assembling",
  separate_pot: "Separate pot",
  ignore: "Not this part",
};

const chip = (active: boolean, color: string) => ({
  fontSize: 10.5, fontWeight: 700, padding: "3px 8px", borderRadius: 20, cursor: "pointer",
  border: `1px solid ${active ? color : C.border}`, background: active ? color : C.white, color: active ? C.white : C.muted,
});

function qty(i: { quantity: number; unit: string | null }) {
  const q = i.unit === "g" || i.unit === "ml" ? Math.round(i.quantity) : Math.round(i.quantity * 10) / 10;
  return `${q} ${i.unit ?? ""}`.trim();
}

// One client comment on one subrecipe card. Unsorted comments show in red;
// "Not this part" ones fade (they matter for another subrecipe of the dish).
export function CommentLine({ c, subrecipeId, dayLabel }: { c: KitchenComment; subrecipeId: number; dayLabel: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [local, setLocal] = useState<Handling | null>(c.handling);
  const [error, setError] = useState<string | null>(null);

  function choose(h: Handling) {
    const prev = local;
    setLocal(h);
    setError(null);
    startTransition(async () => {
      try {
        await setCommentHandling({
          userId: c.user_id, recipeId: c.recipe_id, subrecipeId, comment: c.comment,
          handling: h, instruction: c.instruction,
        });
        router.refresh();
      } catch (e) {
        setLocal(prev);
        setError(e instanceof Error ? e.message : "Couldn't save.");
      }
    });
  }

  const faded = local === "ignore";
  return (
    <div style={{ margin: "0 0 6px", opacity: faded ? 0.5 : 1 }}>
      <p style={{ margin: 0, fontSize: 12, color: local ? C.primary : C.error }}>
        <strong>{c.name}</strong> ({dayLabel}, {Math.round(c.servings * 100) / 100}): {c.comment}
        {c.recipe_name && <span style={{ color: C.light }}> · on {c.recipe_name}</span>}
        {c.decided_by === "ai" && <span style={{ color: C.light }}> · sorted by AI</span>}
      </p>
      {c.instruction && <p style={{ margin: "1px 0 0", fontSize: 11.5, color: C.muted }}>→ {c.instruction}</p>}
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 3 }}>
        {(Object.keys(LABEL) as Handling[]).map(h => (
          <button key={h} disabled={pending} onClick={() => choose(h)}
            style={chip(local === h, h === "separate_pot" ? "#b45309" : h === "assembly" ? C.tealDark : C.light)}>
            {LABEL[h]}
          </button>
        ))}
      </div>
      {error && <p style={{ margin: "2px 0 0", fontSize: 11.5, color: C.error }}>{error}</p>}
    </div>
  );
}

// An ingredient the client's comment names ("no garlic") is dropped from that
// pot, or flagged "(less)" when they ask for less of it. Only the client's
// words: the cook instruction names kept ingredients too ("Roast potatoes
// without garlic").
function potIngredients(perServing: KitchenIngredient[], c: KitchenComment) {
  const text = c.comment.toLowerCase();
  const less = /\bless\b|\bmoins\b|\bshway\b/.test(text);
  return perServing.flatMap(i => {
    const word = i.name.toLowerCase().split(/[\s,(]+/)[0];
    const named = word.length > 2 && text.includes(word);
    if (!named) return [{ ...i, less: false }];
    return less ? [{ ...i, less: true }] : [];
  });
}

// Separate pots for "separate pot" comments: each client's servings at the
// amount picked on the card, with ingredients scaled per serving. The main
// pot is the rest.
export function SeparatePots({ pots, totalServings, perServing }: {
  pots: { c: KitchenComment; servings: number }[];
  totalServings: number;
  perServing: KitchenIngredient[];
}) {
  const live = pots.filter(p => p.servings > 0);
  if (live.length === 0) return null;
  const separate = live.reduce((sum, p) => sum + p.servings, 0);
  const main = Math.max(0, Math.round((totalServings - separate) * 100) / 100);
  return (
    <div style={{ margin: "8px 0 0", background: "#fff8e6", border: "1px solid #f5d48a", borderRadius: 10, padding: "8px 11px" }}>
      <p style={{ margin: "0 0 4px", fontSize: 12.5, fontWeight: 700, color: "#b45309" }}>
        Main pot {main} servings + {live.length} separate pot{live.length === 1 ? "" : "s"}
      </p>
      {live.map(({ c, servings }) => (
        <div key={`${c.user_id}-${c.recipe_id}`} style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>
          <strong style={{ color: C.primary }}>{c.name}: {Math.round(servings * 100) / 100} servings</strong>
          {" "}({c.instruction || c.comment})
          <div style={{ fontSize: 11.5 }}>
            {potIngredients(perServing, c).map(i =>
              `${i.name} ${i.less ? "(less)" : qty({ quantity: i.quantity * servings, unit: i.unit })}`).join(" · ")}
          </div>
        </div>
      ))}
    </div>
  );
}
