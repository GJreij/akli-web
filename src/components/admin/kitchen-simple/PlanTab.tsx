"use client";

import { useMemo, useState, useTransition } from "react";
import { useKitchen, useRun, patchStep } from "./live";
import { coversThrough, defaultAssignee, saveError, unwrap, weekTotal, type KitchenPerson, type Person, type PlanItem, type PlanRow, type PlanStep } from "@/lib/kitchenSimple";
import { addPerson, addStep, deleteStep, removePerson, savePlan, updateStep } from "@/app/admin/kitchen/simple-actions";
import { C } from "../ui";
import {
  bigBtn, byName, fmt, linkBtn, ListTools, matchesQuery, NumberBox, personColor, r2, usePref, weekday, WhoChip, type Sort,
} from "./shared";

interface Line { have: string; cook: string; assignee: Person }

const num = (s: string) => {
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

function initialLine(row: PlanRow, item: PlanItem | undefined, people: KitchenPerson[]): Line {
  if (item) return { have: fmt(item.have), cook: fmt(item.cook), assignee: item.assignee };
  const have = row.suggested_have ?? 0;
  return { have: fmt(have), cook: fmt(Math.max(0, r2(row.need - have))), assignee: defaultAssignee(row, people) };
}

// A line counts as done once it's cooked (or portioned, when nothing was cooked).
const lineDone = (i: PlanItem | undefined) => !!i && (i.cook > 0 ? i.done_at != null : i.portioned_at != null);

function WeekStrip({ row, dates, cookDate }: { row: PlanRow; dates: string[]; cookDate: string }) {
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
      {dates.map(d => {
        const n = row.by_date[d] ?? 0;
        const today = d === cookDate;
        return (
          <span key={d} style={{
            minWidth: 44, textAlign: "center", padding: "3px 4px", borderRadius: 6, fontSize: 11.5, lineHeight: 1.25,
            background: today ? C.primary : n > 0 ? "#eef6f6" : "transparent",
            color: today ? C.white : n > 0 ? C.primary : C.border, border: today || n > 0 ? "none" : `1px dashed ${C.border}`,
          }}>
            <span style={{ display: "block", fontSize: 10, opacity: 0.8 }}>{weekday(d)}</span>
            <strong>{n > 0 ? fmt(n) : "–"}</strong>
          </span>
        );
      })}
      <span style={{
        minWidth: 52, textAlign: "center", padding: "3px 6px", borderRadius: 6, fontSize: 11.5, lineHeight: 1.25,
        background: "#fdf0dc", color: "#8a5a00",
      }}>
        <span style={{ display: "block", fontSize: 10, opacity: 0.9 }}>Week</span>
        <strong>{fmt(weekTotal(row))}</strong>
      </span>
    </div>
  );
}

function RowCard({ row, line, onLine, dates, cookDate, first, done }: {
  row: PlanRow; line: Line; onLine: (patch: Partial<Line>) => void; dates: string[]; cookDate: string; first: boolean; done: boolean;
}) {
  const have = num(line.have);
  const cook = num(line.cook);
  const total = r2(have + cook);
  const reach = coversThrough(row, dates, total);
  const shortToday = total + 0.01 < row.need;
  return (
    <div style={{ padding: "12px 0", borderTop: first ? "none" : `1px solid ${C.offWhite}`, opacity: done ? 0.6 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ flex: 1, fontSize: 15, fontWeight: 700, color: C.primary, minWidth: 0 }}>
          {done && <span style={{ color: "#1f6f50" }}>✓ </span>}{row.name}
        </span>
        <WhoChip who={line.assignee} onChange={p => onLine({ assignee: p })} />
      </div>
      <WeekStrip row={row} dates={dates} cookDate={cookDate} />
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginTop: 8 }}>
        <NumberBox label="I have" value={line.have} onChange={v => onLine({ have: v })} />
        <span style={{ fontSize: 18, color: C.light, paddingBottom: 10 }}>+</span>
        <NumberBox label="I cook" value={line.cook} onChange={v => onLine({ cook: v })} />
        <span style={{ fontSize: 12.5, color: shortToday ? C.error : C.muted, paddingBottom: 6, lineHeight: 1.35, flex: "1 1 160px" }}>
          = <strong style={{ color: shortToday ? C.error : C.primary }}>{fmt(total)}</strong>
          {shortToday
            ? <> · short {fmt(row.need - total)} for today</>
            : row.need > 0
              ? <> · today {fmt(row.need)}{reach.last && reach.last !== cookDate ? <>, covers to {weekday(reach.last)}</> : null}{reach.left > 0.01 ? <> · {fmt(reach.left)} spare</> : null}</>
              : reach.last ? <> · covers to {weekday(reach.last)}</> : null}
        </span>
      </div>
      {row.suggested_from && (
        <span style={{ display: "block", fontSize: 11.5, color: C.light, marginTop: 4 }}>
          Left from {weekday(row.suggested_from)}: {fmt(row.suggested_have ?? 0)}
          {num(line.have) !== (row.suggested_have ?? 0) && (
            <> · <button onClick={() => onLine({ have: fmt(row.suggested_have ?? 0) })} style={{ ...linkBtn, fontSize: 11.5 }}>use it</button></>
          )}
        </span>
      )}
    </div>
  );
}

function Group({ title, sub, count, open, onToggle, children }: {
  title: string; sub?: string; count: number; open: boolean; onToggle?: () => void; children: React.ReactNode;
}) {
  return (
    <section style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: "4px 14px 10px", marginBottom: 12 }}>
      <button onClick={onToggle} tabIndex={onToggle ? 0 : -1} style={{
        width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 48,
        background: "none", border: "none", padding: 0, cursor: onToggle ? "pointer" : "default", color: C.primary, textAlign: "left",
      }}>
        <span>
          <span style={{ fontSize: 16, fontWeight: 700 }}>{title} ({count})</span>
          {sub && <span style={{ display: "block", fontSize: 12, color: C.muted }}>{sub}</span>}
        </span>
        {onToggle && <span style={{ fontSize: 18, color: C.muted }}>{open ? "▾" : "▸"}</span>}
      </button>
      {open && children}
    </section>
  );
}

function Team() {
  const { people, setPeople } = useKitchen();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const active = people.filter(p => p.active);
  async function act(fn: () => Promise<KitchenPerson[]>) {
    setErr(null);
    setBusy(true);
    try { setPeople(await fn()); } catch (e) { setErr(saveError(e)); } finally { setBusy(false); }
  }
  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {active.map(p => {
          const col = personColor(people, p.id);
          return (
            <span key={p.id} style={{ display: "inline-flex", alignItems: "center", height: 36, borderRadius: 18, background: col.bg, color: col.fg, fontSize: 13, fontWeight: 700 }}>
              <span style={{ padding: "0 4px 0 12px" }}>{p.name}</span>
              <button disabled={busy} onClick={() => { if (confirm(`Remove ${p.name} from the team? Their tasks keep their name.`)) void act(async () => unwrap(await removePerson(p.id))); }}
                aria-label={`Remove ${p.name}`} style={{ background: "none", border: "none", color: "inherit", opacity: 0.6, fontSize: 17, padding: "0 10px 0 4px", cursor: "pointer", height: "100%" }}>×</button>
            </span>
          );
        })}
      </div>
      <form onSubmit={e => { e.preventDefault(); const n = name; void act(async () => { const next = unwrap(await addPerson(n)); setName(""); return next; }); }} style={{ display: "flex", gap: 6 }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Add someone, e.g. Rita"
          style={{ flex: 1, minWidth: 0, height: 44, padding: "0 12px", border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 14 }} />
        <button type="submit" disabled={busy || !name.trim()} style={{ ...bigBtn(true), opacity: busy || !name.trim() ? 0.5 : 1 }}>Add</button>
      </form>
      {err && <p style={{ margin: "6px 0 0", fontSize: 12.5, color: C.error }}>{err}</p>}
    </div>
  );
}

function Steps({ cookDate, steps }: { cookDate: string; steps: PlanStep[] }) {
  const { people, patch } = useKitchen();
  const [text, setText] = useState("");
  const [who, setWho] = useState<Person>(() => people.find(p => p.active)?.id ?? "georges");
  const { run, pending, err } = useRun();
  return (
    <div>
      {steps.map((s, i) => (
        <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderTop: i === 0 ? "none" : `1px solid ${C.offWhite}` }}>
          <span style={{ flex: 1, fontSize: 14, color: s.done_at ? C.light : C.primary, textDecoration: s.done_at ? "line-through" : "none" }}>{s.text}</span>
          <WhoChip who={s.assignee} onChange={p => run(() => updateStep(s.id, { assignee: p }), patchStep(s.id, { assignee: p }))} />
          <button onClick={() => run(() => deleteStep(s.id), l => ({ ...l, steps: l.steps.filter(x => x.id !== s.id) }))} aria-label="Delete step"
            style={{ ...linkBtn, color: C.light, textDecoration: "none", fontSize: 18, padding: "0 4px" }}>×</button>
        </div>
      ))}
      <form onSubmit={e => { e.preventDefault(); const t = text; void run(async () => {
        const s = unwrap(await addStep(cookDate, t, who));
        patch(l => (l.steps.some(x => x.id === s.id) ? l : { ...l, steps: [...l.steps, s] }));
        setText("");
      }); }}
        style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}>
        <input value={text} onChange={e => setText(e.target.value)} placeholder="e.g. Cook kafta and freeze for Thursday"
          style={{ flex: 1, minWidth: 0, height: 44, padding: "0 12px", border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 14 }} />
        <WhoChip who={who} onChange={setWho} />
        <button type="submit" disabled={pending || !text.trim()} style={{ ...bigBtn(true), opacity: pending || !text.trim() ? 0.5 : 1 }}>Add</button>
      </form>
      {err && <p style={{ margin: "6px 0 0", fontSize: 12.5, color: C.error }}>{err}</p>}
    </div>
  );
}

export default function PlanTab({ cookDate, dates, rows, items, steps, onSaved }: {
  cookDate: string; dates: string[]; rows: PlanRow[]; items: PlanItem[]; steps: PlanStep[]; onSaved: () => void;
}) {
  const { patch, people, begin, end } = useKitchen();
  const itemBy = useMemo(() => new Map(items.map(i => [i.subrecipe_id, i])), [items]);
  const initial = useMemo(
    () => new Map(rows.map(r => [r.subrecipe_id, initialLine(r, itemBy.get(r.subrecipe_id), people)])),
    [rows, itemBy, people],
  );
  // Only what was typed here; everything else follows the saved plan.
  const [edits, setEdits] = useState<Map<number, Line>>(new Map());
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = usePref<Sort>("akli-kitchen-sort", "amount");
  const [hideDone, setHideDone] = usePref<boolean>("akli-kitchen-plan-hide-done", false);

  const lineFor = (r: PlanRow) => edits.get(r.subrecipe_id) ?? initial.get(r.subrecipe_id)!;
  const setLine = (r: PlanRow, patch: Partial<Line>) => {
    setEdits(prev => new Map(prev).set(r.subrecipe_id, { ...lineFor(r), ...patch }));
    setSavedAt(null);
  };

  const isDone = (r: PlanRow) => lineDone(itemBy.get(r.subrecipe_id));
  const doneCount = rows.filter(isDone).length;
  const visible = (list: PlanRow[]) => {
    const out = list.filter(r => matchesQuery(r.name, query) && !(hideDone && isDone(r)));
    return sort === "az" ? [...out].sort(byName) : out;
  };

  const notBought = rows.filter(r => r.prep_type !== "ready");
  const today = notBought.filter(r => r.need > 0 && !r.is_side_salad);
  const salads = notBought.filter(r => r.need > 0 && r.is_side_salad);
  const later = notBought.filter(r => r.need <= 0);
  const bought = rows.filter(r => r.prep_type === "ready" && r.need > 0);
  const laterPlanned = later.some(r => (itemBy.get(r.subrecipe_id)?.cook ?? 0) > 0);
  const [open, setOpen] = useState({ salads: true, later: laterPlanned, bought: false, team: false });
  const searching = query.trim().length > 0;

  const dirty = rows.some(r => {
    const a = lineFor(r);
    const b = initial.get(r.subrecipe_id)!;
    return num(a.have) !== num(b.have) || num(a.cook) !== num(b.cook) || a.assignee !== b.assignee;
  }) || items.length === 0;

  function save() {
    const out: { subrecipe_id: number; need: number; have: number; cook: number; assignee: Person }[] = [];
    const remove: number[] = [];
    for (const r of rows) {
      const l = lineFor(r);
      const have = r.prep_type === "ready" ? 0 : num(l.have);
      const cook = r.prep_type === "ready" ? 0 : num(l.cook);
      const saved = itemBy.get(r.subrecipe_id);
      if (r.need > 0 || have > 0 || cook > 0) out.push({ subrecipe_id: r.subrecipe_id, need: r.need, have, cook, assignee: l.assignee });
      else if (saved && !saved.done_at && !saved.portioned_at) remove.push(r.subrecipe_id);
    }
    setErr(null);
    start(async () => {
      begin();
      try {
        const fresh = unwrap(await savePlan(cookDate, out, remove));
        patch(() => fresh);
        setEdits(new Map());
        setSavedAt(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
      } catch (e) {
        setErr(saveError(e));
      } finally {
        end();
      }
    });
  }

  const totalCook = notBought.reduce((n, r) => n + num(lineFor(r).cook), 0);
  const dishCount = notBought.filter(r => num(lineFor(r).cook) > 0).length;
  const cards = (list: PlanRow[]) => {
    const shown = visible(list);
    if (shown.length === 0) return <p style={{ margin: "4px 0 8px", fontSize: 13, color: C.muted }}>{searching ? "No match." : hideDone ? "All done here." : "Nothing here."}</p>;
    return shown.map((r, i) => (
      <RowCard key={r.subrecipe_id} row={r} line={lineFor(r)} onLine={p => setLine(r, p)} dates={dates} cookDate={cookDate} first={i === 0} done={isDone(r)} />
    ));
  };
  const count = (list: PlanRow[]) => visible(list).length;

  if (rows.length === 0) {
    return <p style={{ fontSize: 13.5, color: C.muted }}>Nothing ordered this week from this day.</p>;
  }

  return (
    <div style={{ paddingBottom: 90 }}>
      <p style={{ margin: "0 0 4px", fontSize: 12.5, color: C.muted }}>
        For each one: how many servings you <strong>have</strong>, how many you <strong>cook</strong>. The boxes show what&apos;s ordered each day, and the week total.
      </p>

      <ListTools query={query} setQuery={setQuery} sort={sort} setSort={setSort} hideDone={hideDone} setHideDone={setHideDone} doneCount={doneCount} />

      <Group title="To cook & prepare" sub="Needed today" count={count(today)} open>
        {cards(today)}
      </Group>

      {salads.length > 0 && (
        <Group title="Side salads" sub="Guitta's by default" count={count(salads)} open={open.salads || searching} onToggle={() => setOpen(o => ({ ...o, salads: !o.salads }))}>
          {cards(salads)}
        </Group>
      )}

      {later.length > 0 && (
        <Group title="Later this week" sub="Not needed today: cook ahead only if you want" count={count(later)} open={open.later || searching} onToggle={() => setOpen(o => ({ ...o, later: !o.later }))}>
          {cards(later)}
        </Group>
      )}

      {bought.length > 0 && (
        <Group title="Bought, just portion" sub="Nothing to cook" count={count(bought)} open={open.bought || searching} onToggle={() => setOpen(o => ({ ...o, bought: !o.bought }))}>
          {visible(bought).map((r, i) => (
            <div key={r.subrecipe_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "10px 0", borderTop: i === 0 ? "none" : `1px solid ${C.offWhite}` }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: C.primary }}>
                {isDone(r) && <span style={{ color: "#1f6f50" }}>✓ </span>}<strong>{r.name}</strong> · {fmt(r.need)} today · {fmt(weekTotal(r))} this week
              </span>
              <WhoChip who={lineFor(r).assignee} onChange={p => setLine(r, { assignee: p })} />
            </div>
          ))}
        </Group>
      )}

      <Group title="My extra steps" sub="Things that aren't a subrecipe, saved right away" count={steps.length} open>
        <Steps cookDate={cookDate} steps={steps} />
      </Group>

      <Group title="Team" sub="Who can be given tasks" count={people.filter(p => p.active).length} open={open.team} onToggle={() => setOpen(o => ({ ...o, team: !o.team }))}>
        <Team />
      </Group>

      <div style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 20, background: C.white, borderTop: `1px solid ${C.border}`,
        padding: "10px 16px calc(10px + env(safe-area-inset-bottom))",
      }}>
        <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ flex: 1, fontSize: 12.5, color: err ? C.error : C.muted }}>
            {err ?? (savedAt && !dirty ? `Saved at ${savedAt}` : `${dishCount} to cook · ${fmt(totalCook)} servings${dirty ? " · not saved yet" : ""}`)}
          </span>
          {!dirty && items.length > 0 && <button onClick={onSaved} style={bigBtn(false)}>Go to Today →</button>}
          <button onClick={save} disabled={pending} style={{ ...bigBtn(true), opacity: pending ? 0.6 : 1 }}>{pending ? "Saving…" : "Save plan"}</button>
        </div>
      </div>
    </div>
  );
}
