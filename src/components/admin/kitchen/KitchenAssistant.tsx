"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { KitchenDay } from "@/lib/flask";
import { closeBatch, correctBatchRemaining, forgetKitchenMemory, listKitchenMemory, saveKitchenSettings } from "@/app/admin/kitchen/actions";
import { C } from "../ui";
import type { ScheduleItem } from "@/lib/kitchenPlan";
import type { Choice } from "./format";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Turn = { role: "user" | "assistant"; content: string };
type DayPlan = {
  summary: string;
  choices: { subrecipe_id: number; option: "today_only" | "through" | "freeze" | "custom"; servings?: number; reason?: string }[];
  schedule: { time: string; who: string; station: string; task: string }[];
};
type StockChanges = { changes: { batch_id: number; action: "set_left" | "used_up" | "thrown_away"; servings_left?: number; reason?: string }[] };
type SettingsProposal = { cook_days?: number[]; late_order_buffer_pct?: number; reason?: string };
type Proposal =
  | { type: "day_plan"; input: DayPlan }
  | { type: "stock_changes"; input: StockChanges }
  | { type: "settings"; input: SettingsProposal };
type Message = Turn & { proposals?: Proposal[] };

const OPTION_TO_PLAN = { today_only: "must", through: "suggested", freeze: "freeze", custom: "custom" } as const;

const btn = {
  background: C.primary, color: C.white, border: "none", borderRadius: 8, padding: "6px 12px",
  fontSize: 12, fontWeight: 600, cursor: "pointer",
} as const;
const ghost = { ...btn, background: C.offWhite, color: C.primary, border: `1px solid ${C.border}` } as const;

// Text kept in the conversation history for a proposal, so the model knows
// what it already showed (proposals themselves only live in this panel).
function describe(p: Proposal) {
  if (p.type === "day_plan") return `[Proposed a day plan: ${p.input.summary}]`;
  if (p.type === "stock_changes") return `[Proposed ${p.input.changes.length} stock change(s)]`;
  return "[Proposed new kitchen settings]";
}

type ApplyPlan = (choices: Map<number, Choice>, schedule: ScheduleItem[]) => Promise<void>;

function ProposalCard({ p, day, confirmed, onApplyPlan }: { p: Proposal; day: KitchenDay; confirmed: boolean; onApplyPlan: ApplyPlan }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameOf = new Map(day.subrecipes.map(s => [s.subrecipe_id, s]));
  const batchOf = new Map(day.subrecipes.flatMap(s => s.stock.map(b => [b.batch_id, { b, s }] as const)));

  function run(fn: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        setDone(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't apply it.");
      }
    });
  }

  const box = { background: C.white, border: `1px solid ${C.teal}`, borderRadius: 10, padding: "8px 10px", marginTop: 6, fontSize: 12, color: C.muted } as const;

  if (p.type === "day_plan") {
    const plan = p.input;
    return (
      <div style={box}>
        <p style={{ margin: "0 0 4px", fontWeight: 700, color: C.primary }}>Day plan</p>
        <p style={{ margin: "0 0 6px" }}>{plan.summary}</p>
        {plan.choices.map(c => {
          const s = nameOf.get(c.subrecipe_id);
          if (!s) return null;
          const n = c.option === "custom" ? c.servings : c.option === "today_only" ? s.must_cook.servings
            : c.option === "through" ? s.suggested.servings : s.suggested.servings + (s.freeze?.servings ?? 0);
          return (
            <div key={c.subrecipe_id} style={{ display: "flex", justifyContent: "space-between", gap: 6, borderTop: `1px solid ${C.offWhite}`, padding: "3px 0" }}>
              <span style={{ color: C.primary }}>{s.name}<span style={{ color: C.light }}>{c.reason ? ` · ${c.reason}` : ""}</span></span>
              <strong style={{ color: C.primary, whiteSpace: "nowrap" }}>{n != null ? Math.round(n * 100) / 100 : "?"} · {c.option.replace("_", " ")}</strong>
            </div>
          );
        })}
        {plan.schedule.length > 0 && (
          <div style={{ marginTop: 6 }}>
            {plan.schedule.map((t, i) => (
              <div key={i} style={{ display: "flex", gap: 8, padding: "2px 0" }}>
                <strong style={{ color: C.primary, width: 42, flexShrink: 0 }}>{t.time}</strong>
                <span style={{ width: 64, flexShrink: 0, color: C.tealDark, overflow: "hidden", textOverflow: "ellipsis" }}>{t.who}</span>
                <span style={{ width: 44, flexShrink: 0, color: C.light }}>{t.station}</span>
                <span>{t.task}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <button style={btn} disabled={done || pending} onClick={() => run(async () => {
            const choices = new Map<number, Choice>();
            for (const c of plan.choices) {
              if (!nameOf.has(c.subrecipe_id)) continue;
              const planKey = OPTION_TO_PLAN[c.option];
              choices.set(c.subrecipe_id, { plan: planKey, customText: c.option === "custom" ? String(c.servings ?? 0) : String(nameOf.get(c.subrecipe_id)!.suggested.servings || 1) });
            }
            await onApplyPlan(choices, plan.schedule);
          })}>{done ? "Applied ✓" : pending ? "Saving…" : confirmed ? "Use this order of work" : "Apply amounts + order of work"}</button>
        </div>
        {confirmed && plan.choices.length > 0 && (
          <p style={{ margin: "4px 0 0", color: C.light }}>Your plan is confirmed, so only the order of work is saved. To change amounts, tap Change plan in step 1.</p>
        )}
        {error && <p style={{ margin: "4px 0 0", color: C.error }}>{error}</p>}
      </div>
    );
  }

  if (p.type === "stock_changes") {
    return (
      <div style={box}>
        <p style={{ margin: "0 0 4px", fontWeight: 700, color: C.primary }}>Stock changes</p>
        {p.input.changes.map((c, i) => {
          const hit = batchOf.get(c.batch_id);
          return (
            <div key={i} style={{ borderTop: `1px solid ${C.offWhite}`, padding: "3px 0" }}>
              <span style={{ color: C.primary }}>{hit ? `${hit.s.name} (${hit.b.storage}, cooked ${hit.b.cooked_on})` : `Batch #${c.batch_id} (not on this day)`}</span>
              {": "}
              {c.action === "set_left" ? `${hit ? Math.round(hit.b.remaining * 100) / 100 : "?"} → ${c.servings_left} left` : c.action === "used_up" ? "used up" : "thrown away"}
              {c.reason && <span style={{ color: C.light }}> · {c.reason}</span>}
            </div>
          );
        })}
        <button style={{ ...btn, marginTop: 8 }} disabled={pending || done} onClick={() => run(async () => {
          for (const c of p.input.changes) {
            const hit = batchOf.get(c.batch_id);
            if (!hit) continue;
            if (c.action === "set_left") await correctBatchRemaining(c.batch_id, hit.b.remaining, Number(c.servings_left ?? 0));
            else await closeBatch(c.batch_id, c.action === "used_up" ? "finished" : "discarded", c.action === "thrown_away" ? Math.max(hit.b.remaining, 0) : undefined);
          }
          router.refresh();
        })}>{done ? "Applied ✓" : pending ? "Applying…" : "Apply these changes"}</button>
        {error && <p style={{ margin: "4px 0 0", color: C.error }}>{error}</p>}
      </div>
    );
  }

  const s = p.input;
  const days = s.cook_days ?? day.settings.cook_days;
  const pct = s.late_order_buffer_pct ?? day.settings.late_order_buffer_pct;
  return (
    <div style={box}>
      <p style={{ margin: "0 0 4px", fontWeight: 700, color: C.primary }}>Kitchen settings</p>
      <p style={{ margin: 0 }}>Cook days: {days.length ? days.map(d => DAYS[d]).join(", ") : "every delivery day"} · late-order margin {pct}%</p>
      {s.reason && <p style={{ margin: "2px 0 0", color: C.light }}>{s.reason}</p>}
      <button style={{ ...btn, marginTop: 8 }} disabled={pending || done} onClick={() => run(async () => {
        await saveKitchenSettings({ cookDays: days, lateOrderBufferPct: pct });
        router.refresh();
      })}>{done ? "Saved ✓" : pending ? "Saving…" : "Use these settings"}</button>
      {error && <p style={{ margin: "4px 0 0", color: C.error }}>{error}</p>}
    </div>
  );
}

export default function KitchenAssistant({ day, request, confirmed, onApplyPlan }: {
  day: KitchenDay;
  // Set by "Organise my day": opens the panel and sends this text.
  request: { text: string; id: number } | null;
  confirmed: boolean;
  onApplyPlan: ApplyPlan;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memory, setMemory] = useState<{ id: number; content: string }[] | null>(null);
  const [showMemory, setShowMemory] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages, busy]);

  const handled = useRef<number | null>(null);
  useEffect(() => {
    if (!request || handled.current === request.id) return;
    handled.current = request.id;
    setOpen(true);
    void send(request.text);
  }, [request]); // eslint-disable-line react-hooks/exhaustive-deps

  async function refreshMemory() {
    try { setMemory(await listKitchenMemory()); } catch { /* panel still works without it */ }
  }
  useEffect(() => { if (open && memory == null) void refreshMemory(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const next: Message[] = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    setBusy(true);
    setError(null);
    try {
      const history: Turn[] = next.map(m => ({
        role: m.role,
        content: m.role === "assistant" && m.proposals?.length ? `${m.content}\n${m.proposals.map(describe).join("\n")}` : m.content,
      }));
      const res = await fetch("/api/admin/kitchen/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: day.cook_date, history }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) throw new Error(data?.error ?? `Assistant error ${res.status}`);
      setMessages(prev => [...prev, { role: "assistant", content: data.text, proposals: data.proposals }]);
      void refreshMemory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't reach the assistant.");
    } finally {
      setBusy(false);
    }
  }

  const quick = [
    { label: confirmed ? "Organise my day" : "Help me decide", text: confirmed
      ? "Organise my day from my confirmed plan: a timed order of work for the oven, the burners and each person in today’s team."
      : `Help me decide how much to cook on ${day.cook_date}.` },
    { label: "Fix my stock", text: "I want to tell you what's really left in the fridge and freezer." },
    { label: "Plan my week", text: `Help me plan my cook days for the week starting ${day.cook_date}.` },
  ];

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{
        position: "fixed", right: 18, bottom: 18, zIndex: 60, ...btn, borderRadius: 24, padding: "11px 16px", fontSize: 13,
        boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
      }}>✨ Kitchen assistant</button>
    );
  }

  return (
    <div style={{
      position: "fixed", right: 12, bottom: 12, zIndex: 60, width: "min(420px, calc(100vw - 24px))", height: "min(640px, calc(100dvh - 24px))",
      background: C.offWhite, border: `1px solid ${C.border}`, borderRadius: 16, boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: C.primary, color: C.white }}>
        <strong style={{ fontSize: 13.5 }}>✨ Kitchen assistant</strong>
        <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button onClick={() => setShowMemory(v => !v)} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.8)", fontSize: 11.5, cursor: "pointer", textDecoration: "underline" }}>
            Memory ({memory?.length ?? 0})
          </button>
          {messages.length > 0 && (
            <button onClick={() => { setMessages([]); setError(null); }} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.8)", fontSize: 11.5, cursor: "pointer", textDecoration: "underline" }}>New chat</button>
          )}
          <button onClick={() => setOpen(false)} style={{ background: "transparent", border: "none", color: C.white, fontSize: 16, cursor: "pointer" }}>×</button>
        </span>
      </div>

      {showMemory && (
        <div style={{ background: C.white, borderBottom: `1px solid ${C.border}`, padding: "8px 12px", maxHeight: 180, overflowY: "auto" }}>
          <p style={{ margin: "0 0 4px", fontSize: 11.5, color: C.light }}>What the assistant remembers between chats. Tell it to remember or forget things, or remove them here.</p>
          {(memory ?? []).length === 0 && <p style={{ margin: 0, fontSize: 12, color: C.muted }}>Nothing yet.</p>}
          {(memory ?? []).map(m => (
            <div key={m.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, color: C.primary, padding: "3px 0", borderTop: `1px solid ${C.offWhite}` }}>
              <span>{m.content}</span>
              <button onClick={async () => { await forgetKitchenMemory(m.id); void refreshMemory(); }} style={{ background: "transparent", border: "none", color: C.error, fontSize: 11.5, cursor: "pointer" }}>Remove</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px" }}>
        {messages.length === 0 && (
          <div style={{ fontSize: 12.5, color: C.muted }}>
            <p style={{ margin: "0 0 8px" }}>
              I read today&apos;s orders, the plan you confirmed in step 1, what&apos;s already cooked and your settings. I can organise the day (a timed order of work for your burners, oven and team), help you decide amounts, fix stock from what you tell me, or help pick cook days. Nothing changes until you tap Apply.
            </p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {quick.map(q => <button key={q.label} style={ghost} onClick={() => send(q.text)}>{q.label}</button>)}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 8 }}>
            <div style={{
              maxWidth: "88%", whiteSpace: "pre-wrap", fontSize: 12.5, lineHeight: 1.45, padding: "7px 10px", borderRadius: 12,
              background: m.role === "user" ? C.primary : C.white, color: m.role === "user" ? C.white : C.primary,
              border: m.role === "user" ? "none" : `1px solid ${C.border}`,
            }}>{m.content}</div>
            {m.proposals?.map((p, j) => (
              <div key={j} style={{ width: "100%" }}><ProposalCard p={p} day={day} confirmed={confirmed} onApplyPlan={onApplyPlan} /></div>
            ))}
          </div>
        ))}
        {busy && <p style={{ fontSize: 12, color: C.light, margin: "4px 0" }}>Thinking… (checking orders and stock)</p>}
        {error && <p style={{ fontSize: 12, color: C.error, margin: "4px 0" }}>{error}</p>}
        <div ref={endRef} />
      </div>

      <form onSubmit={e => { e.preventDefault(); void send(input); }} style={{ display: "flex", gap: 6, padding: 10, borderTop: `1px solid ${C.border}`, background: C.white }}>
        <textarea
          value={input} onChange={e => setInput(e.target.value)} rows={2} placeholder="e.g. Rami leaves at 1 today, I start at 8"
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } }}
          style={{ flex: 1, resize: "none", padding: "7px 9px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: "inherit" }}
        />
        <button type="submit" disabled={busy || !input.trim()} style={{ ...btn, opacity: busy || !input.trim() ? 0.5 : 1 }}>Send</button>
      </form>
    </div>
  );
}
