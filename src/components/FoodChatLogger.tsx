"use client";

import { useEffect, useRef, useState } from "react";
import {
  IconMessageCircle2, IconChevronDown, IconChevronUp, IconSend2, IconX, IconLoader2, IconBarcode,
  IconPlus, IconMinus,
} from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import { track } from "@/lib/analytics";
import type { ProposedEntry, QuickEntry, ChatStatus } from "@/app/api/food/chat/route";

const C = {
  primary: "#063330",
  teal: "#67b1b0",
  tealDark: "#437b7b",
  offWhite: "#eee9e6",
  muted: "#5c5c5c",
  light: "#9a9a9a",
  border: "#e0dbd5",
  white: "#ffffff",
  error: "#c0392b",
};

const MEAL_TYPES = ["breakfast", "lunch", "snack", "dinner"] as const;
type MealType = (typeof MEAL_TYPES)[number];
const MEAL_LABEL: Record<MealType, string> = { breakfast: "Breakfast", lunch: "Lunch", snack: "Snack", dinner: "Dinner" };
const MEAL_EMOJI: Record<MealType, string> = { breakfast: "🌅", lunch: "☀️", snack: "🍎", dinner: "🌙" };

// Sent to the model to start the slower, question-asking flow — people see a friendlier label.
const REFINE_SENTENCE = "Ask me a couple of quick questions to make these estimates more accurate.";

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

type MacroField = "kcal" | "protein_g" | "carbs_g" | "fat_g";
type Macros = Record<MacroField, number>;

// Small / Medium / Large are simple multipliers on the "medium" estimate the assistant
// gives. Everything on the card (count, size, grams) is rescaled right here on the
// phone — instant, no AI call — which is what makes the first answer feel immediate.
type Size = "S" | "M" | "L";
const SIZE_FACTOR: Record<Size, number> = { S: 0.7, M: 1, L: 1.4 };
const SIZE_WORD: Record<Size, string> = { S: "small ", M: "", L: "large " };

// One card on the confirm screen. `per_unit` is the macros of ONE medium unit;
// what is shown and saved is per_unit × factor.
interface PendingEntry {
  _id: string;
  meal_type: MealType;
  name: string;
  unit_label: string;
  // true when unit_label is a full phrase ("1 plate") rather than a singular noun ("sfiha")
  labelIsPhrase: boolean;
  unit_grams: number;
  per_unit: Macros;
  count: number;
  size: Size;
  sizeable: boolean;
  useGrams: boolean;
  gramsValue: number;
  confidence: "confirmed" | "estimated";
  suggest_scan: boolean;
  catalog_item_id: number | null;
  components: string | null;
  quick: boolean;
}

function round(n: number) {
  return Math.round(n);
}
function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function factorOf(e: PendingEntry) {
  return e.useGrams && e.unit_grams > 0 ? e.gramsValue / e.unit_grams : e.count * SIZE_FACTOR[e.size];
}
function totalsOf(e: PendingEntry): Macros {
  const f = factorOf(e);
  return {
    kcal: e.per_unit.kcal * f,
    protein_g: e.per_unit.protein_g * f,
    carbs_g: e.per_unit.carbs_g * f,
    fat_g: e.per_unit.fat_g * f,
  };
}
function gramsOf(e: PendingEntry) {
  return e.unit_grams > 0 ? e.unit_grams * factorOf(e) : 0;
}
function fmtCount(c: number) {
  const whole = Math.floor(c);
  const frac = c - whole;
  if (Math.abs(frac - 0.5) < 0.01) return whole === 0 ? "½" : `${whole}½`;
  return String(round1(c));
}
function quantityLabelOf(e: PendingEntry) {
  if (e.useGrams) return `${round(e.gramsValue)}g`;
  const g = gramsOf(e);
  const approx = g > 0 ? ` (~${round(g)}g)` : "";
  if (e.labelIsPhrase) {
    const f = factorOf(e);
    return Math.abs(f - 1) < 0.01 ? e.unit_label : `${fmtCount(f)} × ${e.unit_label}`;
  }
  return `${fmtCount(e.count)} ${SIZE_WORD[e.size]}${e.unit_label}${approx}`;
}

function fromQuick(q: QuickEntry, i: number): PendingEntry {
  return {
    _id: `${Date.now()}-${i}`,
    meal_type: q.meal_type, name: q.name, unit_label: q.unit_label, labelIsPhrase: false,
    unit_grams: q.unit_grams, per_unit: q.per_unit, count: q.count, size: "M", sizeable: q.sizeable,
    useGrams: false, gramsValue: round(q.unit_grams * q.count),
    confidence: "estimated", suggest_scan: q.suggest_scan, catalog_item_id: null, components: null, quick: true,
  };
}
// The slower "accurate" flow returns finished totals — wrap them so the same
// count / grams controls still work (they just scale the totals proportionally).
function fromProposed(p: ProposedEntry, i: number): PendingEntry {
  return {
    _id: `${Date.now()}-${i}`,
    meal_type: p.meal_type, name: p.name, unit_label: p.quantity_label, labelIsPhrase: true,
    unit_grams: p.grams, per_unit: { kcal: p.kcal, protein_g: p.protein_g, carbs_g: p.carbs_g, fat_g: p.fat_g },
    count: 1, size: "M", sizeable: false, useGrams: false, gramsValue: round(p.grams),
    confidence: p.confidence, suggest_scan: p.suggest_scan, catalog_item_id: p.catalog_item_id,
    components: p.components, quick: false,
  };
}

// Plain-text stand-in for the proposal, recorded into the history sent back to the
// model — it never sees its own structured tool output otherwise, so without this a
// follow-up correction ("make it smaller", "actually 2 spoons") would get resolved as
// a brand new, independent estimate rather than an adjustment to what it already said.
function summarizeEntriesForHistory(entries: PendingEntry[]): string {
  const lines = entries.map((e) => {
    const t = totalsOf(e);
    return `- ${e.name} (${e.meal_type}): ${quantityLabelOf(e)}, ${round(t.kcal)} kcal, P ${round(t.protein_g)}g, C ${round(t.carbs_g)}g, F ${round(t.fat_g)}g [${e.confidence}]${e.components ? ` [assumed: ${e.components}]` : ""}`;
  });
  return `[Proposed to the user:\n${lines.join("\n")}]`;
}

// ── Waiting lines ────────────────────────────────────────────────────────────
// While the assistant works, say what is actually happening, in a friendly voice.
// Lines rotate so a longer wait never shows the same sentence twice in a row.
function waitingLines(status: ChatStatus | null): { emoji: string; lines: string[] } {
  if (status?.phase === "searching") {
    const items = Array.from(new Set(status.items.map((s) => s.trim().toLowerCase()).filter(Boolean)));
    const list = items.slice(0, 3).join(", ");
    return {
      emoji: "🔎",
      lines: [
        list ? `Hunting down ${list}…` : "Hunting down the ingredients…",
        "Raiding the food database…",
        "Reading the nutrition labels so you don't have to…",
        "Weighing everything (generously)…",
      ],
    };
  }
  if (status?.phase === "adding_up") {
    return {
      emoji: "🧮",
      lines: ["Adding up the macros…", "Convincing the numbers to behave…", "Final tally… drumroll…", "Making it all add up…"],
    };
  }
  return {
    emoji: "🍽️",
    lines: ["Reading your plate…", "Sizing up the portion…", "Doing the maths so you don't have to…", "Nearly there…"],
  };
}

function ThinkingLine({ status }: { status: ChatStatus | null }) {
  const { emoji, lines } = waitingLines(status);
  const [i, setI] = useState(0);
  useEffect(() => {
    setI(0);
    const t = setInterval(() => setI((v) => v + 1), 1700);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.phase, status?.phase === "searching" ? status.items.join("|") : ""]);
  return (
    <div style={{ alignSelf: "flex-start", maxWidth: "92%", background: C.offWhite, borderRadius: 12, padding: "10px 14px", marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.primary, fontWeight: 600 }}>
        <span className="akli-chat-wiggle" style={{ fontSize: 16 }}>{emoji}</span>
        <span key={`${status?.phase ?? "estimating"}-${i % lines.length}`} className="akli-chat-fade">{lines[i % lines.length]}</span>
      </div>
      <div className="akli-chat-bar" />
    </div>
  );
}

export default function FoodChatLogger({ userId, date, onAdded }: {
  userId: string; date: string; onAdded: () => void;
}) {
  // Open by default — this is the whole point of the feature, it shouldn't
  // need a tap just to reveal itself. Auto-focus is handled separately in
  // toggleExpand rather than via an effect keyed on `expanded`, so it only
  // fires on a deliberate user tap — not on this default-open mount, where
  // popping the keyboard unprompted (especially on mobile) would be intrusive.
  const [expanded, setExpanded] = useState(true);
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<ChatStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingEntries, setPendingEntries] = useState<PendingEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingMacro, setEditingMacro] = useState<{ id: string; field: MacroField } | null>(null);
  const [editValue, setEditValue] = useState("");
  // "quick" = instant estimate (default). Switches to "accurate" once the user taps
  // "make this more accurate", so the follow-up answers continue the slower Q&A flow.
  const [flow, setFlow] = useState<"quick" | "accurate">("quick");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [history, pendingEntries]);

  function toggleExpand() {
    setExpanded((v) => {
      const next = !v;
      if (next && !pendingEntries) {
        setTimeout(() => textareaRef.current?.focus(), 50);
      }
      return next;
    });
  }

  function resetChat() {
    setHistory([]);
    setInputText("");
    setPendingEntries(null);
    setError(null);
    setFlow("quick");
    setExpanded(false);
  }

  async function sendMessage() {
    const text = inputText.trim();
    if (!text || sending) return;
    setInputText("");
    await sendText(text, flow);
  }

  // "Make this more accurate" is opt-in: the user chose to spend a little time for
  // precision. It runs the slower flow (ingredient lookups + a few questions). The
  // model recognizes the refine intent from this fixed sentence itself (see the system
  // prompt's refinement rule), so no separate code path is needed beyond the mode.
  // pendingEntries is cleared first so the resulting question shows in the chat view.
  async function requestRefinement() {
    if (sending || !pendingEntries) return;
    // Swap the stored proposal for what the user is looking at now (with their own
    // tweaks), so the questions start from the numbers on screen.
    const nextHistory: ChatTurn[] = [
      ...history.slice(0, history[history.length - 1]?.role === "assistant" ? -1 : history.length),
      { role: "assistant", content: summarizeEntriesForHistory(pendingEntries) },
    ];
    setPendingEntries(null);
    setFlow("accurate");
    track("food_chat_refine_requested", {}, "food_diary");
    await sendText(REFINE_SENTENCE, "accurate", nextHistory);
  }

  function updateEntry(id: string, patch: Partial<PendingEntry>) {
    setPendingEntries((prev) => prev?.map((e) => (e._id === id ? { ...e, ...patch } : e)) ?? null);
  }

  function stepCount(e: PendingEntry, dir: 1 | -1) {
    const step = e.count < 4 || (dir === -1 && e.count <= 4) ? 0.5 : 1;
    const next = Math.min(20, Math.max(0.5, e.count + dir * step));
    updateEntry(e._id, { count: next });
    track("food_chat_adjust", { how: "count" }, "food_diary");
  }

  function startEditingMacro(entry: PendingEntry, field: MacroField) {
    setEditingMacro({ id: entry._id, field });
    setEditValue(String(round(totalsOf(entry)[field])));
  }

  // Setting a number exactly is instant and local now (no AI round trip): the card's
  // underlying per-unit numbers are re-based so what the user typed is exactly what is
  // shown and saved. Calories scale every macro together (a label number); a macro
  // moves calories by its own energy (4 / 4 / 9 per gram) so the card stays consistent.
  function submitMacroEdit(entry: PendingEntry) {
    const value = Number(editValue);
    const field = editingMacro?.field;
    setEditingMacro(null);
    if (!field || !Number.isFinite(value) || value < 0) return;
    const t = totalsOf(entry);
    if (value === round(t[field])) return; // unchanged
    const next: Macros = { ...t };
    if (field === "kcal") {
      const k = t.kcal > 0 ? value / t.kcal : 1;
      next.kcal = value;
      next.protein_g = t.protein_g * k; next.carbs_g = t.carbs_g * k; next.fat_g = t.fat_g * k;
    } else {
      const perGram = field === "fat_g" ? 9 : 4;
      next[field] = value;
      next.kcal = Math.max(0, t.kcal + (value - t[field]) * perGram);
    }
    const f = factorOf(entry) || 1;
    updateEntry(entry._id, {
      per_unit: { kcal: next.kcal / f, protein_g: next.protein_g / f, carbs_g: next.carbs_g / f, fat_g: next.fat_g / f },
    });
    track("food_chat_macro_override", { field }, "food_diary");
  }

  async function sendText(text: string, mode: "quick" | "accurate", baseHistory?: ChatTurn[]) {
    const nextHistory: ChatTurn[] = [...(baseHistory ?? history), { role: "user", content: text }];
    setHistory(nextHistory);
    setSending(true);
    setStatus(null);
    setError(null);
    track("food_chat_message_sent", { turn: nextHistory.length, mode }, "food_diary");

    try {
      const res = await fetch("/api/food/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: nextHistory, userId, mode, stream: true }),
      });

      let result: { type: string; text?: string; message?: string; entries?: unknown[] } | null = null;
      const isStream = res.body && (res.headers.get("content-type") ?? "").includes("ndjson");
      if (isStream) {
        // One JSON object per line: progress updates, then the result.
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        const handle = (line: string) => {
          if (!line.trim()) return;
          try {
            const msg = JSON.parse(line);
            if (msg.t === "status") setStatus(msg as ChatStatus);
            else if (msg.t === "result") result = msg.result;
          } catch { /* ignore a malformed line */ }
        };
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            handle(buf.slice(0, nl));
            buf = buf.slice(nl + 1);
          }
        }
        handle(buf);
      } else {
        result = await res.json();
      }

      if (!result) {
        setError("Couldn't reach the assistant — try again.");
        track("food_log_error", { stage: "chat_empty" }, "food_diary");
      } else if (result.type === "question") {
        setHistory((h) => [...h, { role: "assistant", content: result!.text ?? "" }]);
      } else if (result.type === "estimate" || result.type === "entries") {
        const entries = result.type === "estimate"
          ? (result.entries as QuickEntry[]).map(fromQuick)
          : (result.entries as ProposedEntry[]).map(fromProposed);
        setPendingEntries(entries);
        // Recorded into history (not just local state) so a follow-up has the actual
        // proposal to negotiate against, instead of the model re-deriving a fresh,
        // independent estimate from scratch.
        setHistory((h) => [...h, { role: "assistant", content: summarizeEntriesForHistory(entries) }]);
        track("food_chat_entries_proposed", { count: entries.length, mode }, "food_diary");
      } else {
        setError(result.message || "Something went wrong.");
        track("food_log_error", { stage: "chat_response" }, "food_diary");
      }
    } catch {
      setError("Couldn't reach the assistant — try again.");
      track("food_log_error", { stage: "chat_network" }, "food_diary");
    } finally {
      setSending(false);
      setStatus(null);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function setEntryMeal(id: string, mealType: MealType) {
    updateEntry(id, { meal_type: mealType });
  }

  // Removing an item is a correction within the same exchange, not a
  // reset — history is left alone. "Start over" below is the explicit,
  // separate action for actually clearing the conversation.
  function removeEntry(id: string) {
    setPendingEntries((prev) => {
      const next = prev?.filter((e) => e._id !== id) ?? null;
      return next && next.length > 0 ? next : null;
    });
  }

  async function confirmAll() {
    if (!pendingEntries || pendingEntries.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const rows = pendingEntries.map((e) => {
        const t = totalsOf(e);
        return {
          user_id: userId, log_date: date, meal_type: e.meal_type,
          entry_source: e.catalog_item_id != null ? "catalog" : "quick_add",
          food_catalog_item_id: e.catalog_item_id ?? undefined,
          name_snapshot: e.name, quantity: 1, quantity_unit: quantityLabelOf(e),
          kcal: round(t.kcal), protein_g: round1(t.protein_g), carbs_g: round1(t.carbs_g), fat_g: round1(t.fat_g),
        };
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insertError } = await (supabase.from("food_log_entry") as any).insert(rows);
      if (insertError) throw new Error(insertError.message);

      for (const e of pendingEntries) {
        track("food_logged", {
          entry_source: e.catalog_item_id != null ? "catalog" : "quick_add",
          origin: "chat", meal_type: e.meal_type, confidence: e.confidence, quick: e.quick,
          adjusted: e.count !== 1 || e.size !== "M" || e.useGrams,
        }, "food_diary");
      }
      onAdded();
      resetChat();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Couldn't save these.";
      track("food_log_error", { stage: "chat_insert", message }, "food_diary");
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  // Tap a macro value to set it directly (e.g. "she knows this had 20g of protein").
  function renderMacroValue(entry: PendingEntry, field: MacroField, unit: string) {
    const isEditing = editingMacro?.id === entry._id && editingMacro.field === field;
    if (isEditing) {
      return (
        <input
          key={field}
          type="number"
          autoFocus
          value={editValue}
          onChange={(ev) => setEditValue(ev.target.value)}
          onFocus={(ev) => ev.target.select()}
          onKeyDown={(ev) => {
            if (ev.key === "Enter") { ev.preventDefault(); submitMacroEdit(entry); }
            if (ev.key === "Escape") { ev.preventDefault(); setEditingMacro(null); }
          }}
          onBlur={() => submitMacroEdit(entry)}
          style={{
            width: 44, fontSize: 11.5, padding: "0 2px", border: `1px solid ${C.tealDark}`, borderRadius: 4,
            font: "inherit", color: C.primary,
          }}
        />
      );
    }
    return (
      <span
        key={field}
        onClick={() => startEditingMacro(entry, field)}
        style={{ cursor: "pointer", borderBottom: `1px dotted ${C.light}` }}
        title="Tap to set this exactly"
      >
        {round(totalsOf(entry)[field])}{unit}
      </span>
    );
  }

  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: "5px 11px", borderRadius: 20, fontSize: 11.5, fontWeight: 700, cursor: "pointer",
    border: `1px solid ${active ? C.tealDark : C.border}`,
    background: active ? C.tealDark : C.white, color: active ? C.white : C.muted,
  });
  const roundBtn: React.CSSProperties = {
    width: 28, height: 28, borderRadius: "50%", border: `1px solid ${C.border}`, background: C.white,
    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.primary, padding: 0,
  };

  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, marginBottom: 18, overflow: "hidden" }}>
      <button
        onClick={toggleExpand}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 16px", background: "none", border: "none", cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <IconMessageCircle2 size={18} color={C.tealDark} />
          <span style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>Just tell us what you ate — we&apos;ll log it</span>
        </div>
        {expanded ? <IconChevronUp size={16} color={C.light} /> : <IconChevronDown size={16} color={C.light} />}
      </button>

      {expanded && (
        <div style={{ padding: "0 16px 16px" }}>
          {!pendingEntries && (
            <>
              {history.length > 0 && (
                <div ref={scrollRef} style={{ maxHeight: 220, overflowY: "auto", marginBottom: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                  {history.map((turn, i) => (
                    <div
                      key={i}
                      style={{
                        alignSelf: turn.role === "user" ? "flex-end" : "flex-start",
                        maxWidth: "85%",
                        background: turn.role === "user" ? C.tealDark : C.offWhite,
                        color: turn.role === "user" ? C.white : "#1a1a1a",
                        borderRadius: 12, padding: "8px 12px", fontSize: 13, lineHeight: 1.4,
                        // The stored proposal summary is for the model, not for people.
                        display: turn.role === "assistant" && turn.content.startsWith("[Proposed") ? "none" : undefined,
                      }}
                    >
                      {turn.content === REFINE_SENTENCE ? "✨ Make this more accurate" : turn.content}
                    </div>
                  ))}
                </div>
              )}
              {sending && <ThinkingLine status={status} />}

              <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <textarea
                  ref={textareaRef}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={sending}
                  rows={1}
                  placeholder={sending ? "Working on it…" : history.length === 0
                    ? "e.g. a sfiha, a mango, 2 eggs and toast"
                    : "Your answer…"}
                  style={{
                    flex: 1, resize: "none", padding: "10px 12px", borderRadius: 10,
                    border: `1px solid ${C.border}`, fontSize: 16, fontFamily: "inherit",
                    background: sending ? C.offWhite : C.white, opacity: sending ? 0.7 : 1,
                  }}
                />
                <button
                  onClick={sendMessage}
                  disabled={sending || !inputText.trim()}
                  style={{
                    flexShrink: 0, width: 40, height: 40, borderRadius: 10, border: "none",
                    background: C.tealDark, color: C.white, display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", opacity: sending || !inputText.trim() ? 0.5 : 1,
                  }}
                >
                  {sending ? <IconLoader2 size={17} className="akli-chat-spin" /> : <IconSend2 size={17} />}
                </button>
              </div>
              {history.length === 0 && !sending && (
                <p style={{ fontSize: 11.5, color: C.light, margin: "8px 2px 0" }}>
                  ⚡ You get a quick estimate in seconds, then tweak the amount, size or grams yourself.
                </p>
              )}
            </>
          )}

          <style>{`
            @keyframes akli-chat-spin { to { transform: rotate(360deg); } }
            .akli-chat-spin { animation: akli-chat-spin 0.8s linear infinite; }
            @keyframes akli-chat-fade { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: translateY(0); } }
            .akli-chat-fade { animation: akli-chat-fade 0.35s ease-out; }
            @keyframes akli-chat-wiggle { 0%,100% { transform: rotate(-8deg); } 50% { transform: rotate(8deg); } }
            .akli-chat-wiggle { display: inline-block; animation: akli-chat-wiggle 0.9s ease-in-out infinite; }
            @keyframes akli-chat-slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(260%); } }
            .akli-chat-bar { position: relative; height: 3px; border-radius: 3px; background: ${C.border}; margin-top: 9px; overflow: hidden; }
            .akli-chat-bar::after { content: ""; position: absolute; inset: 0; width: 38%; border-radius: 3px; background: ${C.teal}; animation: akli-chat-slide 1.3s ease-in-out infinite; }
          `}</style>

          {pendingEntries && (
            <div>
              <p style={{ fontSize: 11.5, color: C.light, margin: "6px 0 10px" }}>
                {pendingEntries.some((e) => e.quick)
                  ? "⚡ Quick estimate — change the amount, size or grams below, tap any number to set it exactly, or make it more accurate."
                  : "Here's what I got — tap a number to set it exactly, a meal to fix it, or ✕ to drop something."}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                {pendingEntries.map((e) => (
                  <div key={e._id} style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: "#1a1a1a" }}>{e.name}</p>
                          {e.confidence === "estimated" && (
                            <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", padding: "2px 6px", borderRadius: 20, background: "#fff8e6", color: "#b45309" }}>
                              {e.quick ? "Quick estimate" : "Estimated"}
                            </span>
                          )}
                        </div>
                        <p style={{ margin: "2px 0 0", fontSize: 11.5, color: C.light, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 0 }}>
                          <span>{quantityLabelOf(e)}&nbsp;·&nbsp;</span>
                          {renderMacroValue(e, "kcal", "kcal")}
                          <span>&nbsp;·&nbsp;P&nbsp;</span>
                          {renderMacroValue(e, "protein_g", "g")}
                          <span>&nbsp;·&nbsp;C&nbsp;</span>
                          {renderMacroValue(e, "carbs_g", "g")}
                          <span>&nbsp;·&nbsp;F&nbsp;</span>
                          {renderMacroValue(e, "fat_g", "g")}
                        </p>
                        {e.components && (
                          <p style={{ margin: "2px 0 0", fontSize: 11, color: C.light, fontStyle: "italic" }}>{e.components}</p>
                        )}
                        {e.suggest_scan && (
                          <p style={{ margin: "4px 0 0", fontSize: 11, color: "#2563eb" }}>
                            <IconBarcode size={12} style={{ verticalAlign: "-2px", marginRight: 3 }} />
                            Generic estimate for this product — for exact numbers, scan the barcode instead (✕ this, then use + Log food → Scan)
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => removeEntry(e._id)}
                        style={{ background: "none", border: "none", padding: 4, margin: -4, color: C.light, cursor: "pointer", flexShrink: 0 }}
                      >
                        <IconX size={14} />
                      </button>
                    </div>

                    {/* How much — instant, no AI call */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                      {e.useGrams ? (
                        <>
                          <input
                            type="number"
                            inputMode="decimal"
                            value={e.gramsValue || ""}
                            onChange={(ev) => updateEntry(e._id, { gramsValue: Math.max(0, Number(ev.target.value) || 0) })}
                            onFocus={(ev) => ev.target.select()}
                            style={{ width: 72, padding: "6px 8px", borderRadius: 8, border: `1px solid ${C.tealDark}`, fontSize: 14, fontWeight: 600, color: C.primary }}
                          />
                          <span style={{ fontSize: 12.5, color: C.muted }}>grams</span>
                          <button
                            onClick={() => updateEntry(e._id, { useGrams: false })}
                            style={{ ...chipStyle(false), marginLeft: "auto" }}
                          >
                            Use pieces
                          </button>
                        </>
                      ) : (
                        <>
                          <button aria-label="Less" onClick={() => stepCount(e, -1)} style={roundBtn}><IconMinus size={14} /></button>
                          <span style={{ minWidth: 26, textAlign: "center", fontSize: 15, fontWeight: 700, color: C.primary }}>{fmtCount(e.count)}</span>
                          <button aria-label="More" onClick={() => stepCount(e, 1)} style={roundBtn}><IconPlus size={14} /></button>
                          {e.sizeable && (
                            <div style={{ display: "flex", gap: 4, marginLeft: 4 }}>
                              {(["S", "M", "L"] as Size[]).map((sz) => (
                                <button
                                  key={sz}
                                  onClick={() => { updateEntry(e._id, { size: sz }); track("food_chat_adjust", { how: "size" }, "food_diary"); }}
                                  style={chipStyle(e.size === sz)}
                                >
                                  {sz}
                                </button>
                              ))}
                            </div>
                          )}
                          {e.unit_grams > 0 && (
                            <button
                              onClick={() => { updateEntry(e._id, { useGrams: true, gramsValue: round(gramsOf(e)) || round(e.unit_grams) }); track("food_chat_adjust", { how: "grams" }, "food_diary"); }}
                              style={{ ...chipStyle(false), marginLeft: "auto" }}
                            >
                              In grams
                            </button>
                          )}
                        </>
                      )}
                    </div>

                    <div style={{ display: "flex", gap: 5, marginTop: 8, flexWrap: "wrap" }}>
                      {MEAL_TYPES.map((mt) => (
                        <button
                          key={mt}
                          onClick={() => setEntryMeal(e._id, mt)}
                          style={{
                            padding: "4px 9px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer",
                            border: `1px solid ${e.meal_type === mt ? C.tealDark : C.border}`,
                            background: e.meal_type === mt ? C.tealDark : C.white,
                            color: e.meal_type === mt ? C.white : C.muted,
                          }}
                        >
                          {MEAL_EMOJI[mt]} {MEAL_LABEL[mt]}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {pendingEntries.some((e) => e.confidence === "estimated") && (
                <button
                  onClick={requestRefinement}
                  disabled={sending || saving}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                    padding: "11px 0", borderRadius: 10, fontSize: 13.5, fontWeight: 700, cursor: "pointer",
                    border: "1px solid #ffe4a3", background: "#fff8e6", color: "#8a5a00", marginBottom: 12,
                    opacity: sending || saving ? 0.6 : 1,
                  }}
                >
                  ✨ Make this more accurate
                </button>
              )}

              {error && <p style={{ color: C.error, fontSize: 12, marginBottom: 10 }}>{error}</p>}

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={resetChat}
                  disabled={saving}
                  style={{
                    padding: "12px 16px", borderRadius: 10, fontSize: 13.5, fontWeight: 600, cursor: "pointer",
                    border: `1px solid ${C.border}`, background: C.white, color: C.muted,
                  }}
                >
                  Start over
                </button>
                <button
                  className="btn-primary"
                  style={{ flex: 1, padding: "12px 0", fontSize: 14.5, opacity: saving ? 0.6 : 1 }}
                  onClick={confirmAll}
                  disabled={saving}
                >
                  {saving ? "Adding…" : `Add all ${pendingEntries.length} to diary`}
                </button>
              </div>
            </div>
          )}

          {!pendingEntries && error && <p style={{ color: C.error, fontSize: 12, marginTop: 10 }}>{error}</p>}
        </div>
      )}
    </div>
  );
}
