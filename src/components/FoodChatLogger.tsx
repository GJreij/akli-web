"use client";

import { useEffect, useRef, useState } from "react";
import {
  IconMessageCircle2, IconChevronDown, IconChevronUp, IconSend2, IconX, IconLoader2, IconBarcode,
} from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import { track } from "@/lib/analytics";
import type { ProposedEntry } from "@/app/api/food/chat/route";

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

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

type PendingEntry = ProposedEntry & { _id: string };

function round(n: number) {
  return Math.round(n);
}

// Plain-text stand-in for a propose_entries tool turn, recorded into the
// history sent back to the model — it never sees its own structured tool
// output otherwise, so without this a follow-up correction ("make it
// smaller", "actually 2 spoons") would get resolved as a brand new,
// independent estimate rather than an adjustment to what it already said.
function summarizeEntriesForHistory(entries: ProposedEntry[]): string {
  const lines = entries.map((e) =>
    `- ${e.name} (${e.meal_type}): ${e.quantity_label}, ${round(e.kcal)} kcal, P ${round(e.protein_g)}g, C ${round(e.carbs_g)}g, F ${round(e.fat_g)}g [${e.confidence}]${e.components ? ` [assumed: ${e.components}]` : ""}`
  );
  return `[Proposed to the user:\n${lines.join("\n")}]`;
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
  const [saving, setSaving] = useState(false);
  const [pendingEntries, setPendingEntries] = useState<PendingEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
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
    setExpanded(false);
  }

  async function sendMessage() {
    const text = inputText.trim();
    if (!text || sending) return;
    setInputText("");
    await sendText(text);
  }

  // "Refine this" reuses the exact same request path as a normal typed
  // message — the model recognizes the refine intent from this fixed
  // sentence itself (see the system prompt's refinement rule), so no
  // separate API flag or code path is needed. It just needs pendingEntries
  // cleared first so the resulting question shows in the chat view instead
  // of sitting underneath the still-visible confirm cards.
  async function requestRefinement() {
    if (sending) return;
    setPendingEntries(null);
    track("food_chat_refine_requested", {}, "food_diary");
    await sendText("Ask me a couple of quick questions to make these estimates more accurate.");
  }

  async function sendText(text: string) {
    const nextHistory: ChatTurn[] = [...history, { role: "user", content: text }];
    setHistory(nextHistory);
    setSending(true);
    setError(null);
    track("food_chat_message_sent", { turn: nextHistory.length }, "food_diary");

    try {
      const res = await fetch("/api/food/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: nextHistory, userId }),
      });
      const json = await res.json();

      if (json.type === "question") {
        setHistory((h) => [...h, { role: "assistant", content: json.text }]);
      } else if (json.type === "entries") {
        const entries = (json.entries as ProposedEntry[]).map((e, i) => ({ ...e, _id: `${Date.now()}-${i}` }));
        setPendingEntries(entries);
        // Recorded into history (not just local state) so a follow-up like
        // "make it smaller" or removing one item and typing a correction
        // has the actual proposal to negotiate against, instead of the
        // model re-deriving a fresh, independent estimate from scratch.
        setHistory((h) => [...h, { role: "assistant", content: summarizeEntriesForHistory(entries) }]);
        track("food_chat_entries_proposed", { count: entries.length }, "food_diary");
      } else {
        setError(json.message || "Something went wrong.");
        track("food_log_error", { stage: "chat_response" }, "food_diary");
      }
    } catch {
      setError("Couldn't reach the assistant — try again.");
      track("food_log_error", { stage: "chat_network" }, "food_diary");
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function setEntryMeal(id: string, mealType: MealType) {
    setPendingEntries((prev) => prev?.map((e) => (e._id === id ? { ...e, meal_type: mealType } : e)) ?? null);
  }

  // Removing an item is a correction within the same exchange, not a
  // reset — history is left alone so a follow-up like "actually make it
  // smaller" still has the rejected estimate to work from. "Start over"
  // below is the explicit, separate action for actually clearing the
  // conversation.
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
      const rows = pendingEntries.map((e) => ({
        user_id: userId, log_date: date, meal_type: e.meal_type,
        entry_source: e.catalog_item_id != null ? "catalog" : "quick_add",
        food_catalog_item_id: e.catalog_item_id ?? undefined,
        name_snapshot: e.name, quantity: 1, quantity_unit: e.quantity_label,
        kcal: e.kcal, protein_g: e.protein_g, carbs_g: e.carbs_g, fat_g: e.fat_g,
      }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insertError } = await (supabase.from("food_log_entry") as any).insert(rows);
      if (insertError) throw new Error(insertError.message);

      for (const e of pendingEntries) {
        track("food_logged", {
          entry_source: e.catalog_item_id != null ? "catalog" : "quick_add",
          origin: "chat", meal_type: e.meal_type, confidence: e.confidence,
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
                      }}
                    >
                      {turn.content}
                    </div>
                  ))}
                  {sending && (
                    <div style={{
                      alignSelf: "flex-start", background: C.offWhite, borderRadius: 12,
                      padding: "10px 14px", display: "flex", gap: 4, alignItems: "center",
                    }}>
                      <span className="akli-chat-dot" style={{ animationDelay: "0ms" }} />
                      <span className="akli-chat-dot" style={{ animationDelay: "150ms" }} />
                      <span className="akli-chat-dot" style={{ animationDelay: "300ms" }} />
                    </div>
                  )}
                </div>
              )}
              {/* First message ever — history is empty until the response lands,
                  so the dots above (inside the history block) never mount. This
                  is the same indicator shown standalone for that one case. */}
              {sending && history.length === 0 && (
                <div style={{ display: "flex", gap: 4, alignItems: "center", padding: "4px 2px 10px" }}>
                  <span className="akli-chat-dot" style={{ animationDelay: "0ms" }} />
                  <span className="akli-chat-dot" style={{ animationDelay: "150ms" }} />
                  <span className="akli-chat-dot" style={{ animationDelay: "300ms" }} />
                </div>
              )}

              <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <textarea
                  ref={textareaRef}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={sending}
                  rows={2}
                  placeholder={sending ? "Thinking…" : history.length === 0
                    ? "e.g. breakfast was 2 eggs and toast, lunch was mjaddara with yogurt…"
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
              <style>{`
                @keyframes akli-chat-bounce {
                  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
                  30% { transform: translateY(-4px); opacity: 1; }
                }
                .akli-chat-dot {
                  width: 6px; height: 6px; border-radius: 50%; background: ${C.light};
                  animation: akli-chat-bounce 1.1s ease-in-out infinite;
                }
                @keyframes akli-chat-spin { to { transform: rotate(360deg); } }
                .akli-chat-spin { animation: akli-chat-spin 0.8s linear infinite; }
              `}</style>
            </>
          )}

          {pendingEntries && (
            <div>
              <p style={{ fontSize: 11.5, color: C.light, margin: "6px 0 10px" }}>
                Here&apos;s what I got — tap a meal to fix it, ✕ to drop something (you can still type a correction after), or Start over to clear everything.
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
                              Estimated
                            </span>
                          )}
                        </div>
                        <p style={{ margin: "2px 0 0", fontSize: 11.5, color: C.light }}>
                          {e.quantity_label} · {round(e.kcal)} kcal · P {round(e.protein_g)}g · C {round(e.carbs_g)}g · F {round(e.fat_g)}g
                        </p>
                        {e.components && (
                          <p style={{ margin: "2px 0 0", fontSize: 11, color: C.light, fontStyle: "italic" }}>{e.components}</p>
                        )}
                        {e.suggest_scan && (
                          <p style={{ margin: "4px 0 0", fontSize: 11, color: "#2563eb" }}>
                            <IconBarcode size={12} style={{ verticalAlign: "-2px", marginRight: 3 }} />
                            Couldn&apos;t find this exact product — for precise numbers, scan the barcode instead (✕ this, then use + Log food → Scan)
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
