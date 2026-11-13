"use client";

import { useEffect, useMemo, useState } from "react";
import { patchItem, patchStep, useKitchen, useRun } from "./live";
import { unwrap, weekTotal, type Equipment, type Person, type PlanItem, type PlanRow, type PlanStep } from "@/lib/kitchenSimple";
import { addEquipment, setItemAssignee, setItemDone, setItemPortioned, updateStep } from "@/app/admin/kitchen/simple-actions";
import PortioningPanel from "../cooking/PortioningPanel";
import { C } from "../ui";
import { bigBtn, byName, ClientNotes, decimalInput, fmt, linkBtn, ListTools, matchesQuery, qty, r2, usePref, weekday, WhoChip, type Sort } from "./shared";

const now = () => new Date().toISOString();
const cookPatch = (sid: number, done: boolean, cooked: number | null = null) =>
  patchItem(sid, done ? { done_at: now(), cooked } : { done_at: null, cooked: null });
const portionPatch = (sid: number, done: boolean, need: number) => patchItem(sid, done ? { portioned_at: now(), need } : { portioned_at: null });

type Task =
  | { key: string; kind: "item"; name: string; who: Person; row: PlanRow; item: PlanItem }
  | { key: string; kind: "step"; name: string; who: Person; step: PlanStep };

const cookDone = (i: PlanItem) => i.cook <= 0 || i.done_at != null;
const portionDone = (i: PlanItem) => i.need <= 0 || i.portioned_at != null;
const isDone = (t: Task) => (t.kind === "step" ? t.step.done_at != null : cookDone(t.item) && portionDone(t.item));
const cookedAmount = (i: PlanItem) => i.cooked ?? i.cook;

// A tick that's either a big ✓ or the label of what's left to do. It flips
// at once (the screen changes before the save comes back).
function Pill({ done, label, onClick }: { done: boolean; label: string; onClick: () => void }) {
  return (
    <button onClick={e => { e.stopPropagation(); onClick(); }} style={{
      minHeight: 40, padding: "0 12px", borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
      background: done ? "#e3f1ec" : C.white, color: done ? "#1f6f50" : C.primary, border: `1.5px solid ${done ? "#9fd0bd" : C.primary}`,
    }}>
      {done ? "✓ " : "○ "}{label}
    </button>
  );
}

function TaskRow({ t, cookDate, pinned, onPin }: { t: Task; cookDate: string; pinned: boolean; onPin: () => void }) {
  const { run, err } = useRun();
  const done = isDone(t);
  return (
    <div onClick={onPin} style={{
      display: "flex", flexDirection: "column", gap: 6, padding: "10px 12px", borderRadius: 12, cursor: "pointer",
      background: pinned ? "#fff8e6" : done ? "#f6faf8" : C.white, border: `1.5px solid ${pinned ? "#e8c46a" : C.border}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 700, color: done ? C.light : C.primary, textDecoration: done ? "line-through" : "none" }}>
          {pinned && "📌 "}{t.name}
        </span>
        <WhoChip who={t.who} onChange={p => (t.kind === "item"
          ? run(() => setItemAssignee(cookDate, t.item.subrecipe_id, p), patchItem(t.item.subrecipe_id, { assignee: p }))
          : run(() => updateStep(t.step.id, { assignee: p }), patchStep(t.step.id, { assignee: p })))} />
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {t.kind === "step" ? (
          <Pill done={t.step.done_at != null} label="Done"
            onClick={() => run(() => updateStep(t.step.id, { done: t.step.done_at == null }), patchStep(t.step.id, { done_at: t.step.done_at ? null : now() }))} />
        ) : (
          <>
            {t.item.cook > 0 && (
              <Pill done={cookDone(t.item)} label={`Cook ${fmt(cookedAmount(t.item))}`}
                onClick={() => run(() => setItemDone(cookDate, t.item.subrecipe_id, !t.item.done_at), cookPatch(t.item.subrecipe_id, !t.item.done_at))} />
            )}
            {t.item.need > 0 && (
              <Pill done={portionDone(t.item)} label={`Portion ${fmt(t.item.need)}`}
                onClick={() => run(() => setItemPortioned(cookDate, t.item.subrecipe_id, !t.item.portioned_at, t.item.need), portionPatch(t.item.subrecipe_id, !t.item.portioned_at, t.item.need))} />
            )}
            <span style={{ fontSize: 12, color: C.muted }}>
              {t.item.have > 0 ? `have ${fmt(t.item.have)} · ` : ""}week {fmt(weekTotal(t.row))}
            </span>
          </>
        )}
      </div>
      {t.kind === "item" && <ClientNotes row={t.row} cookDate={cookDate} total={potTotal(t.item)} />}
      {err && <span style={{ fontSize: 12, color: C.error }}>{err}</span>}
    </div>
  );
}

// Servings in today's pot: what I had + what I cook(ed).
const potTotal = (i: PlanItem) => r2(i.have + (i.cook > 0 ? cookedAmount(i) : 0));

// What's open in the working window for one dish.
function ItemDetail({ t, cookDate, equipment }: { t: Extract<Task, { kind: "item" }>; cookDate: string; equipment: Equipment[] }) {
  const { run, err } = useRun();
  const { row, item } = t;
  const sid = item.subrecipe_id;
  const [diff, setDiff] = useState(false);
  const [made, setMade] = useState(fmt(item.cook));
  const [weighing, setWeighing] = useState(false);
  const cooked = cookedAmount(item);
  const total = r2(item.have + (item.cook > 0 ? cooked : 0));
  const aside = r2(total - item.need);
  const potServings = item.cook > 0 ? cooked : item.have;
  const ingredients = [...row.ingredients_per_serving].sort((a, b) => a.name.localeCompare(b.name));
  // Stable, or the portioning window reloads on every render.
  const targets = useMemo(
    () => [{ subrecipeId: row.subrecipe_id, name: row.name, mpdrIds: row.mpdr_ids }],
    [row.subrecipe_id, row.name, row.mpdr_ids],
  );
  // Days this dish can be portioned for: today first, then later days with orders.
  const days = useMemo(() => Object.keys(row.by_date).sort()
    .filter(d => d >= cookDate && (row.by_date[d] ?? 0) > 0 && (row.mpdr_ids_by_date[d]?.length ?? 0) > 0)
    .map(d => ({ date: d, label: d === cookDate ? "Today" : weekday(d), mpdrIds: row.mpdr_ids_by_date[d], servings: row.by_date[d] })),
  [row.by_date, row.mpdr_ids_by_date, cookDate]);
  // Notes per client, shown next to their name while weighing.
  const notes = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const c of [...row.comments, ...row.upcoming_comments]) {
      const text = c.instruction || c.comment;
      if (!(m[c.user_id] ??= []).includes(text)) m[c.user_id].push(text);
    }
    return m;
  }, [row.comments, row.upcoming_comments]);

  const box = (label: string, value: string, strong = false, color: string = C.primary) => (
    <div style={{ flex: "1 1 80px", background: strong ? "#f1f8f8" : "#f7f4f2", borderRadius: 10, padding: "8px 10px" }}>
      <span style={{ display: "block", fontSize: 11, color: C.muted, fontWeight: 600 }}>{label}</span>
      <span style={{ display: "block", fontSize: 22, fontWeight: 800, color, lineHeight: 1.15 }}>{value}</span>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {item.have > 0 && box("I have", fmt(item.have))}
        {item.cook > 0 && box(item.done_at ? "Cooked" : "To cook", fmt(cooked))}
        {box("Portion today", fmt(item.need), true)}
        {box(aside >= 0 ? "Put aside" : "Short", fmt(Math.abs(aside)), true, aside >= 0 ? C.primary : C.error)}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {item.cook > 0 && !item.done_at && (
          <>
            <button onClick={() => run(() => setItemDone(cookDate, sid, true), cookPatch(sid, true))} style={bigBtn(true)}>✓ Cooked {fmt(item.cook)}</button>
            <button onClick={() => setDiff(v => !v)} style={bigBtn(false)}>Different amount</button>
          </>
        )}
        {item.cook > 0 && item.done_at && (
          <span style={{ fontSize: 13.5, color: "#1f6f50", fontWeight: 700 }}>
            ✓ Cooked {fmt(cooked)} · <button onClick={() => run(() => setItemDone(cookDate, sid, false), cookPatch(sid, false))} style={linkBtn}>undo</button>
          </span>
        )}
        {days.length > 0 && !(item.need > 0 && item.portioned_at) && (
          <button onClick={() => setWeighing(true)} style={{ ...bigBtn(!(item.cook > 0 && !item.done_at)), background: item.cook > 0 && !item.done_at ? C.white : "#1f6f50" }}>
            ⚖️ Weigh &amp; portion {item.need > 0 ? fmt(item.need) : `for ${days[0].label}`}
          </button>
        )}
        {item.need > 0 && item.portioned_at && days.length > 1 && (
          <button onClick={() => setWeighing(true)} style={linkBtn}>⚖️ Portion later days too</button>
        )}
        {item.need > 0 && (item.portioned_at
          ? <span style={{ fontSize: 13.5, color: "#1f6f50", fontWeight: 700 }}>✓ Portioned · <button onClick={() => run(() => setItemPortioned(cookDate, sid, false), portionPatch(sid, false, item.need))} style={linkBtn}>undo</button></span>
          : <button onClick={() => run(() => setItemPortioned(cookDate, sid, true, item.need), portionPatch(sid, true, item.need))} style={linkBtn}>Portioned by eye ✓</button>)}
      </div>
      {diff && !item.done_at && (
        <form onSubmit={e => {
          e.preventDefault();
          const n = parseFloat(made);
          if (!Number.isFinite(n) || n < 0) return;
          void run(() => setItemDone(cookDate, sid, true, n), cookPatch(sid, true, n));
          setDiff(false);
        }}
          style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 14, color: C.muted }}>
          I cooked
          <input type="text" inputMode="decimal" value={made} onChange={e => setMade(decimalInput(e.target.value))} onFocus={e => e.target.select()}
            style={{ width: 80, height: 44, padding: "0 10px", border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 16, fontWeight: 700 }} />
          servings
          <button type="submit" disabled={!(parseFloat(made) >= 0)} style={{ ...bigBtn(true), opacity: parseFloat(made) >= 0 ? 1 : 0.5 }}>Save</button>
        </form>
      )}
      {err && <span style={{ fontSize: 12.5, color: C.error }}>{err}</span>}

<ClientNotes row={row} cookDate={cookDate} total={total} />

      {item.cook > 0 && ingredients.length > 0 && (
        <div>
          <strong style={{ fontSize: 13, color: C.primary }}>Ingredients for {fmt(item.cook)} servings</strong>
          {ingredients.map(i => (
            <div key={i.ingredient_id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "6px 0", borderTop: `1px solid ${C.offWhite}`, fontSize: 14 }}>
              <span style={{ color: C.primary }}>{i.name}</span>
              <strong style={{ color: C.primary }}>{qty(i.quantity * item.cook, i.unit)}</strong>
            </div>
          ))}
        </div>
      )}
      {item.cook <= 0 && ingredients.length > 0 && (
        <span style={{ fontSize: 12.5, color: C.muted }}>One portion: {ingredients.map(i => `${qty(i.quantity, i.unit)} ${i.name}`).join(" + ")}</span>
      )}
      {row.instructions && <p style={{ margin: 0, fontSize: 13, color: "#3d3d3d", whiteSpace: "pre-wrap" }}>{row.instructions}</p>}

      {weighing && (
        <PortioningPanel
          targets={targets}
          days={days}
          notes={notes}
          potServings={potServings}
          pots={equipment}
          onAddPot={async (n, w) => unwrap(await addEquipment(n, w))}
          onClose={() => setWeighing(false)}
          onSaved={({ complete, dates }) => {
            // Ticks today's "Portion" only once all of today's boxes are done
            // (not while someone is still left out for their own pot).
            if (complete && dates.includes(cookDate)) void run(() => setItemPortioned(cookDate, sid, true, item.need), portionPatch(sid, true, item.need));
          }}
        />
      )}
    </div>
  );
}

function StepDetail({ t }: { t: Extract<Task, { kind: "step" }> }) {
  const { run, err } = useRun();
  const id = t.step.id;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p style={{ margin: 0, fontSize: 15, color: C.primary }}>{t.step.text}</p>
      {t.step.done_at
        ? <span style={{ fontSize: 13.5, color: "#1f6f50", fontWeight: 700 }}>✓ Done · <button onClick={() => run(() => updateStep(id, { done: false }), patchStep(id, { done_at: null }))} style={linkBtn}>undo</button></span>
        : <button onClick={() => run(() => updateStep(id, { done: true }), patchStep(id, { done_at: now() }))} style={{ ...bigBtn(true), alignSelf: "flex-start" }}>✓ Done</button>}
      {err && <span style={{ fontSize: 12.5, color: C.error }}>{err}</span>}
    </div>
  );
}

// Fixed at the bottom of the screen: the dishes I'm on right now.
function WorkingWindow({ tasks, pins, active, setActive, unpin, open, setOpen, cookDate, equipment }: {
  tasks: Map<string, Task>; pins: string[]; active: string | null; setActive: (k: string) => void; unpin: (k: string) => void;
  open: boolean; setOpen: (v: boolean) => void; cookDate: string; equipment: Equipment[];
}) {
  const shown = pins.map(k => tasks.get(k)).filter((t): t is Task => !!t);
  const current = (active && tasks.get(active)) || shown[0];
  return (
    <div style={{
      position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 30, background: C.white,
      borderTop: `2px solid ${C.primary}`, boxShadow: "0 -6px 24px rgba(0,0,0,0.12)", borderRadius: "16px 16px 0 0",
      paddingBottom: "env(safe-area-inset-bottom)",
    }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px" }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6, overflowX: "auto", scrollbarWidth: "none" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.muted, flexShrink: 0 }}>Working on</span>
          {shown.length === 0 && <span style={{ fontSize: 12.5, color: C.light }}>tap a task to put it here</span>}
          {shown.map(t => {
            const on = current?.key === t.key && open;
            return (
              <span key={t.key} style={{
                display: "inline-flex", alignItems: "center", flexShrink: 0, borderRadius: 20, height: 38,
                background: on ? C.primary : C.offWhite, color: on ? C.white : C.primary,
              }}>
                <button onClick={() => { setActive(t.key); setOpen(true); }} style={{ background: "none", border: "none", color: "inherit", fontSize: 13, fontWeight: 700, padding: "0 4px 0 12px", cursor: "pointer", height: "100%", whiteSpace: "nowrap", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {isDone(t) ? "✓ " : ""}{t.name}
                </button>
                <button onClick={() => unpin(t.key)} aria-label={`Remove ${t.name}`} style={{ background: "none", border: "none", color: "inherit", opacity: 0.7, fontSize: 17, padding: "0 10px 0 4px", cursor: "pointer", height: "100%" }}>×</button>
              </span>
            );
          })}
        </div>
          {shown.length > 0 && (
            <button onClick={() => setOpen(!open)} aria-label={open ? "Hide" : "Show"} style={{
              flexShrink: 0, width: 40, height: 38, borderRadius: 10, border: `1px solid ${C.border}`, background: C.white, fontSize: 16, cursor: "pointer", color: C.primary,
            }}>{open ? "▾" : "▴"}</button>
          )}
        </div>
        {open && current && (
          <div style={{ maxHeight: "58dvh", overflowY: "auto", padding: "4px 14px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 21, color: C.primary }}>{current.name}</span>
            </div>
            {current.kind === "item"
              ? <ItemDetail key={current.key} t={current} cookDate={cookDate} equipment={equipment} />
              : <StepDetail key={current.key} t={current} />}
          </div>
        )}
      </div>
    </div>
  );
}

// Everything that goes into today's pots, added up per ingredient, with
// what each part is for: "Chicken breast 5 kg = 2 kg Tawouk + 3 kg Fajita".
function IngredientsToday({ tasks, open, setOpen }: { tasks: Task[]; open: boolean; setOpen: (v: boolean) => void }) {
  const [query, setQuery] = useState("");
  const list = useMemo(() => {
    const by = new Map<number, { id: number; name: string; unit: string | null; staple: boolean; total: number; uses: { name: string; servings: number; qty: number }[] }>();
    for (const t of tasks) {
      if (t.kind !== "item" || t.item.cook <= 0) continue;
      const servings = cookedAmount(t.item);
      if (servings <= 0) continue;
      for (const ing of t.row.ingredients_per_serving) {
        const q = ing.quantity * servings;
        if (!(q > 0)) continue;
        const e = by.get(ing.ingredient_id) ?? { id: ing.ingredient_id, name: ing.name, unit: ing.unit, staple: ing.is_staple, total: 0, uses: [] };
        e.total += q;
        e.uses.push({ name: t.name, servings, qty: q });
        by.set(ing.ingredient_id, e);
      }
    }
    return [...by.values()]
      .map(e => ({ ...e, uses: e.uses.sort((a, b) => b.qty - a.qty) }))
      .sort((a, b) => Number(a.staple) - Number(b.staple) || a.name.localeCompare(b.name));
  }, [tasks]);
  if (list.length === 0) return null;
  const shown = list.filter(e => matchesQuery(e.name, query));

  return (
    <section style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: "4px 14px", marginBottom: 10 }}>
      <button onClick={() => setOpen(!open)} style={{
        width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 48,
        background: "none", border: "none", padding: 0, cursor: "pointer", color: C.primary, textAlign: "left",
      }}>
        <span>
          <span style={{ fontSize: 15, fontWeight: 700 }}>🧺 Ingredients for today ({list.length})</span>
          <span style={{ display: "block", fontSize: 12, color: C.muted }}>Total of each, and what it&apos;s for</span>
        </span>
        <span style={{ fontSize: 18, color: C.muted }}>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div style={{ paddingBottom: 10 }}>
          {list.length > 8 && (
            <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Find an ingredient…"
              style={{ width: "100%", boxSizing: "border-box", height: 40, padding: "0 12px", border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 14, color: C.primary, marginBottom: 4 }} />
          )}
          {shown.map((e, i) => (
            <div key={e.id} style={{ padding: "8px 0", borderTop: i === 0 ? "none" : `1px solid ${C.offWhite}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 14.5 }}>
                <span style={{ color: C.primary, fontWeight: 700 }}>{e.name}{e.staple && <span style={{ fontWeight: 400, fontSize: 11.5, color: C.light }}> · staple</span>}</span>
                <strong style={{ color: C.primary, whiteSpace: "nowrap" }}>{qty(e.total, e.unit)}</strong>
              </div>
              {e.uses.map(u => (
                <div key={u.name} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12.5, color: C.muted, paddingLeft: 10, marginTop: 2 }}>
                  <span>{u.name} <span style={{ color: C.light }}>({fmt(u.servings)} serv.)</span></span>
                  <span style={{ whiteSpace: "nowrap" }}>{qty(u.qty, e.unit)}</span>
                </div>
              ))}
            </div>
          ))}
          {shown.length === 0 && <p style={{ margin: "6px 0", fontSize: 13, color: C.muted }}>No match.</p>}
        </div>
      )}
    </section>
  );
}

type Who = Person | "all";

export default function TodayTab({ cookDate, rows, items, steps, equipment, onPlan }: {
  cookDate: string; rows: PlanRow[]; items: PlanItem[]; steps: PlanStep[]; equipment: Equipment[]; onPlan: () => void;
}) {
  const { people } = useKitchen();
  const [whoPref, pickWho] = usePref<string>("akli-kitchen-who", "all");
  const [sort, setSort] = usePref<Sort>("akli-kitchen-sort", "amount");
  const [hideDone, setHideDone] = usePref<boolean>("akli-kitchen-today-hide-done", true);
  const [ingOpen, setIngOpen] = usePref<boolean>("akli-kitchen-ingredients-open", false);
  const [query, setQuery] = useState("");
  const [pins, setPins] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const pinKey = `akli-kitchen-pins-${cookDate}`;
  const who: Who = whoPref === "all" || people.some(p => p.id === whoPref) ? whoPref : "all";

  // Per phone: what's in the working window.
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(pinKey) ?? "[]");
      if (Array.isArray(p)) setPins(p.filter(x => typeof x === "string"));
    } catch { /* storage unavailable */ }
  }, [pinKey]);
  const savePins = (next: string[]) => {
    setPins(next);
    try { localStorage.setItem(pinKey, JSON.stringify(next)); } catch { /* ignore */ }
  };

  const rowBy = new Map(rows.map(r => [r.subrecipe_id, r]));
  const order = new Map(rows.map((r, i) => [r.subrecipe_id, i]));
  // Portion amounts follow today's orders as they are now (an order may have
  // come in after the plan was saved), not the number saved with the plan.
  const tasks: Task[] = [
    ...items
      .flatMap(i => {
        const row = rowBy.get(i.subrecipe_id);
        const item = row ? { ...i, need: row.need } : null;
        return row && item && (item.cook > 0 || item.need > 0)
          ? [{ key: `item:${i.subrecipe_id}`, kind: "item" as const, name: row.name, who: i.assignee, row, item }] : [];
      })
      .sort((a, b) => (order.get(a.item.subrecipe_id) ?? 999) - (order.get(b.item.subrecipe_id) ?? 999)),
    ...steps.map(s => ({ key: `step:${s.id}`, kind: "step" as const, name: s.text, who: s.assignee, step: s })),
  ];
  const byKey = new Map(tasks.map(t => [t.key, t]));
  const mine = tasks.filter(t => (who === "all" || t.who === who) && matchesQuery(t.name, query));
  const sorted = sort === "az" ? [...mine].sort(byName) : mine;
  const todo = sorted.filter(t => !isDone(t));
  const done = sorted.filter(t => isDone(t));
  const doneCount = tasks.filter(t => (who === "all" || t.who === who) && isDone(t)).length;

  function pin(k: string) {
    if (!pins.includes(k)) savePins([...pins, k]);
    setActive(k);
    setOpen(true);
  }
  function unpin(k: string) {
    const next = pins.filter(x => x !== k);
    savePins(next);
    if (active === k) setActive(next[next.length - 1] ?? null);
  }

  if (items.length === 0 && steps.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "30px 0" }}>
        <p style={{ fontSize: 14, color: C.muted }}>No plan saved for this day yet.</p>
        <button onClick={onPlan} style={bigBtn(true)}>Make the plan →</button>
      </div>
    );
  }

  const chip = (w: Who, label: string) => (
    <button key={w} onClick={() => pickWho(w)} style={{
      flex: "1 0 auto", minHeight: 40, padding: "0 12px", borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: "pointer",
      background: who === w ? C.primary : C.white, color: who === w ? C.white : C.primary, border: `1px solid ${who === w ? C.primary : C.border}`,
    }}>{label} ({(w === "all" ? tasks : tasks.filter(t => t.who === w)).filter(t => !isDone(t)).length})</button>
  );

  return (
    <div style={{ paddingBottom: open && pins.length ? "62dvh" : 90 }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
        {people.filter(p => p.active || tasks.some(t => t.who === p.id)).map(p => chip(p.id, p.name))}
        {chip("all", "Everyone")}
      </div>

      <IngredientsToday tasks={tasks.filter(t => who === "all" || t.who === who)} open={ingOpen} setOpen={setIngOpen} />

      <ListTools query={query} setQuery={setQuery} sort={sort} setSort={setSort} hideDone={hideDone} setHideDone={setHideDone} doneCount={doneCount} />

      <p style={{ margin: "0 0 8px", fontSize: 12.5, color: C.muted }}>
        Tap a task to put it in the working window. Tap ○ to tick it off.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {todo.map(t => <TaskRow key={t.key} t={t} cookDate={cookDate} pinned={pins.includes(t.key)} onPin={() => pin(t.key)} />)}
        {todo.length === 0 && (query.trim()
          ? <p style={{ margin: "8px 0", fontSize: 14, color: C.muted }}>Nothing left to do matches “{query}”.</p>
          : <p style={{ margin: "8px 0", fontSize: 14, color: "#1f6f50", fontWeight: 700 }}>All done 🎉</p>)}
      </div>

      {!hideDone && done.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.muted }}>Done ({done.length})</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {done.map(t => <TaskRow key={t.key} t={t} cookDate={cookDate} pinned={pins.includes(t.key)} onPin={() => pin(t.key)} />)}
          </div>
        </div>
      )}

      <WorkingWindow tasks={byKey} pins={pins} active={active} setActive={setActive} unpin={unpin}
        open={open} setOpen={setOpen} cookDate={cookDate} equipment={equipment} />
    </div>
  );
}
