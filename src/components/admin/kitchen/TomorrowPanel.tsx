"use client";

import { useEffect, useRef, useState } from "react";
import type { KitchenDay, KitchenIngredient, KitchenSubrecipe } from "@/lib/flask";
import type { DayPlan, NoteTurn } from "@/lib/kitchenPlan";
import { saveDayNote } from "@/app/admin/kitchen/actions";
import CopyListButton from "../CopyListButton";
import { C } from "../ui";
import { buildPrepLines } from "./PrepList";
import { choiceCustom, defaultChoice, fmtDay, fmtQty, fmtServings, planIngredients, planServings, smallBtn } from "./format";

const row = { display: "flex", justifyContent: "space-between", gap: 8, padding: "7px 0", borderTop: `1px solid ${C.offWhite}`, fontSize: 13 } as const;
const h = { margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: C.primary } as const;

// Writes the WhatsApp note with the assistant: it drafts from the lists,
// the cook asks for changes or edits by hand, then finishes it to send.
function NoteChat({ cookDate, facts, plan }: { cookDate: string; facts: string; plan: DayPlan }) {
  const [draft, setDraft] = useState(plan.note ?? facts);
  const [chat, setChat] = useState<NoteTurn[]>(plan.note_chat ?? []);
  const [final, setFinal] = useState(plan.note_final);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [chat, busy]);

  async function save(note: string, turns: NoteTurn[], isFinal: boolean) {
    try {
      await saveDayNote(cookDate, note, turns, isFinal);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save the note.");
    }
  }

  async function ask(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const turns: NoteTurn[] = [...chat, { role: "user", content }];
    setChat(turns);
    setInput("");
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/kitchen/note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ facts, note: draft, history: turns }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) throw new Error(data?.error ?? `Assistant error ${res.status}`);
      const next: NoteTurn[] = [...turns, { role: "assistant", content: data.reply }];
      setDraft(data.note);
      setChat(next);
      await save(data.note, next, false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't reach the assistant.");
    } finally {
      setBusy(false);
    }
  }

  const bubble = { background: "#dcf8c6", borderRadius: "10px 10px 2px 10px", padding: "10px 12px", fontSize: 13.5, lineHeight: 1.5, color: "#111b21" } as const;
  const btn = (primary: boolean) => ({
    minHeight: 44, padding: "0 14px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer",
    border: primary ? "none" : `1px solid ${C.border}`, background: primary ? C.primary : C.white, color: primary ? C.white : C.primary,
  });

  if (final) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ ...bubble, whiteSpace: "pre-wrap" }}>{draft}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <CopyListButton label="Copy note" text={draft} />
          <a href={`https://wa.me/?text=${encodeURIComponent(draft)}`} target="_blank" rel="noreferrer"
            style={{ ...btn(true), background: "#1e8e4a", textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
            Send on WhatsApp
          </a>
          <button onClick={() => { setFinal(false); void save(draft, chat, false); }} style={btn(false)}>Edit again</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <textarea
        value={draft} onChange={e => setDraft(e.target.value)} onBlur={() => void save(draft, chat, false)}
        rows={Math.min(16, Math.max(6, draft.split("\n").length + 1))}
        style={{ ...bubble, border: "1px solid #b5e19b", fontFamily: "inherit", resize: "vertical", width: "100%", boxSizing: "border-box" }}
      />
      <span style={{ fontSize: 11.5, color: C.light, marginTop: -6 }}>You can edit the text directly too.</span>
      {chat.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto" }}>
          {chat.map((m, i) => (
            <div key={i} style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "85%", borderRadius: 10, padding: "7px 11px", fontSize: 12.5,
              background: m.role === "user" ? C.primary : C.white, color: m.role === "user" ? C.white : C.primary,
              border: m.role === "user" ? "none" : `1px solid ${C.border}`,
            }}>{m.content}</div>
          ))}
          <div ref={endRef} />
        </div>
      )}
      {busy && <span style={{ fontSize: 12, color: C.light }}>Rewriting the note…</span>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {["Make it shorter", "In Lebanese", "Add a start time", "Friendlier"].map(q => (
          <button key={q} disabled={busy} onClick={() => ask(q === "Add a start time" ? "Add: start tomorrow at 8" : q)}
            style={{ minHeight: 36, padding: "0 11px", borderRadius: 20, border: "1px solid #b9d9d8", background: C.white, fontSize: 12, fontWeight: 600, color: C.primary, cursor: "pointer" }}>
            {q}
          </button>
        ))}
      </div>
      <form onSubmit={e => { e.preventDefault(); void ask(input); }} style={{ display: "flex", gap: 6 }}>
        <input value={input} onChange={e => setInput(e.target.value)} placeholder="e.g. remind them to clean the oven, add buy parsley"
          style={{ flex: 1, minWidth: 0, height: 44, padding: "0 12px", border: "1px solid #b9d9d8", borderRadius: 10, fontSize: 14 }} />
        <button type="submit" disabled={busy || !input.trim()} style={{ ...btn(true), opacity: busy || !input.trim() ? 0.5 : 1 }}>Ask</button>
      </form>
      {err && <span style={{ fontSize: 12, color: C.error }}>{err}</span>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={() => { setFinal(true); void save(draft, chat, true); }} style={btn(true)}>✓ Finish note</button>
        {draft !== facts && (
          <button onClick={() => { setDraft(facts); setChat([]); void save(facts, [], false); }} style={{ ...smallBtn, background: "transparent", border: "none", color: C.muted, textDecoration: "underline" }}>
            Start over from the lists
          </button>
        )}
      </div>
    </div>
  );
}

// The next delivery day, seen from today: what to pull from the freezer
// tonight, day-before jobs, and the note for the team. Cook amounts use each
// dish's default choice that day; log today's batches first so what they
// cover drops off.
export default function TomorrowPanel({ day, cookDate, plan }: { day: KitchenDay; cookDate: string; plan: DayPlan }) {
  // Dishes today's confirmed plan cooks ahead ("through" / "+ freeze") cover
  // the next day even before they're marked done, so they don't show here.
  const aheadToday = new Set(plan.confirmed_at
    ? Object.entries(plan.choices).filter(([, c]) => c.plan === "suggested" || c.plan === "freeze").map(([id]) => Number(id))
    : []);
  const coveredByPlan = day.subrecipes.filter(s => aheadToday.has(s.subrecipe_id) && s.must_cook.servings > 0.01);
  const toWork = day.subrecipes.filter(s => s.prep_type !== "ready" && s.must_cook.servings > 0.01 && !aheadToday.has(s.subrecipe_id));
  const ready = day.subrecipes.filter(s => s.prep_type === "ready" && s.today.servings > 0);

  const cookIngredients = (s: KitchenSubrecipe): KitchenIngredient[] => {
    const c = defaultChoice(s);
    return planIngredients(s, c.plan, choiceCustom(c));
  };
  const readyIngredients = (s: KitchenSubrecipe): KitchenIngredient[] =>
    s.ingredients_per_serving.map(i => ({ ...i, quantity: Math.round(i.quantity * s.today.servings * 10) / 10 }));

  const lines = buildPrepLines([...toWork, ...ready], s => s.prep_type === "ready" ? readyIngredients(s) : cookIngredients(s));
  const freezerPulls = day.subrecipes.flatMap(s => s.stock
    .filter(b => b.storage === "freezer" && b.allocated_today_servings > 0)
    .map(b => ({ s, b })));
  const thaw = lines.filter(l => l.stored_frozen);
  const jobs = toWork.filter(s => s.prep_ahead?.trim());

  const dayLabel = fmtDay(day.cook_date);
  const cookLines = toWork.filter(s => !s.is_side_salad).map(s => {
    const c = defaultChoice(s);
    return `• ${s.name}: ${fmtServings(planServings(s, c.plan, choiceCustom(c)))}`;
  });
  const freezerLines = [
    ...freezerPulls.map(({ s, b }) => `• ${s.name}: ${fmtServings(b.allocated_today_servings)} portions (made ${fmtDay(b.cooked_on)})`),
    ...thaw.map(l => `• ${l.name}: ${fmtQty(l)}${l.thaw_hours ? ` (${l.thaw_hours}h to thaw)` : ""}`),
  ];
  const jobLines = jobs.map(s => `• ${s.name}: ${s.prep_ahead}`);
  const facts = [
    `Akli kitchen · ${dayLabel}`,
    freezerLines.length ? ["", "Tonight: freezer → fridge", ...freezerLines].join("\n") : "",
    jobLines.length ? ["", "Tonight", ...jobLines].join("\n") : "",
    cookLines.length ? ["", "To cook / assemble", ...cookLines].join("\n") : "\nNothing to cook.",
  ].filter(Boolean).join("\n");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {coveredByPlan.length > 0 && (
        <p style={{ margin: 0, fontSize: 12, color: C.light }}>
          Covered by today&apos;s plan (cooked ahead today): {coveredByPlan.map(s => s.name).join(", ")}.
        </p>
      )}
      <div>
        <h3 style={h}>❄️ Take out of the freezer tonight</h3>
        {freezerPulls.length === 0 && thaw.length === 0 && <p style={{ margin: 0, fontSize: 13, color: C.muted }}>Nothing frozen is needed.</p>}
        {freezerPulls.map(({ s, b }) => (
          <div key={`b${b.batch_id}`} style={row}>
            <span style={{ color: C.primary }}>{s.name} <span style={{ color: C.light, fontSize: 11.5 }}>· portions made {fmtDay(b.cooked_on)}</span></span>
            <strong style={{ color: C.primary }}>{fmtServings(b.allocated_today_servings)}</strong>
          </div>
        ))}
        {thaw.map(l => (
          <div key={`i${l.ingredient_id}`} style={row}>
            <span style={{ color: C.primary }}>{l.name} <span style={{ color: C.light, fontSize: 11.5 }}>· raw{l.thaw_hours ? `, ${l.thaw_hours}h to thaw` : ""}</span></span>
            <strong style={{ color: C.primary }}>{fmtQty(l)}</strong>
          </div>
        ))}
      </div>

      {jobs.length > 0 && (
        <div>
          <h3 style={h}>🌙 Tonight</h3>
          {jobs.map(s => (
            <div key={s.subrecipe_id} style={row}>
              <span style={{ color: C.primary }}>{s.name}</span>
              <span style={{ color: C.muted }}>{s.prep_ahead}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ border: "1px solid #b9d9d8", background: "#f1f8f8", borderRadius: 12, padding: 12 }}>
        <p style={{ margin: "0 0 8px", fontSize: 13.5, color: C.primary }}>
          <strong>WhatsApp note for {dayLabel}</strong>
          <span style={{ display: "block", fontSize: 12, color: "#3d5f5f" }}>Drafted from the lists above. Ask the assistant to change it, then finish it to send.</span>
        </p>
        <NoteChat cookDate={cookDate} facts={facts} plan={plan} />
      </div>
    </div>
  );
}
