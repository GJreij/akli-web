"use client";

import { useMemo, useState, useTransition } from "react";
import { useKitchen, useRun, patchStep } from "./live";
import { coversThrough, defaultAssignee, saveError, unwrap, weekTotal, type KitchenPerson, type Person, type PlanItem, type PlanRow, type PlanStep } from "@/lib/kitchenSimple";
import { addPerson, addStep, deleteStep, removePerson, savePlan, updateStep } from "@/app/admin/kitchen/simple-actions";
import { C } from "../ui";
import {
  bigBtn, byName, ClientNotes, fmt, linkBtn, ListTools, matchesQuery, NumberBox, personColor, r2, usePref, weekday, WhoChip, type Sort,
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

// Day boxes are buttons: tap the days you want this pot to cover.
function WeekStrip({ row, dates, cookDate, picked, onPick }: {
  row: PlanRow; dates: string[]; cookDate: string; picked: Set<string>; onPick: (d: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
      {dates.map(d => {
        const n = row.by_date[d] ?? 0;
        const today = d === cookDate;
        const on = picked.has(d);
        return (
          <button key={d} type="button" disabled={n <= 0} onClick={() => onPick(d)} style={{
            minWidth: 44, textAlign: "center", padding: "3px 4px", borderRadius: 6, fontSize: 11.5, lineHeight: 1.25, font: "inherit",
            cursor: n > 0 ? "pointer" : "default",
            background: on ? "#f2b84b" : today ? C.primary : n > 0 ? "#eef6f6" : "transparent",
            color: on ? "#3d2700" : today ? C.white : n > 0 ? C.primary : C.border,
            border: on ? "2px solid #c98a10" : today || n > 0 ? "2px solid transparent" : `1px dashed ${C.border}`,
          }}>
            <span style={{ display: "block", fontSize: 10, opacity: 0.8 }}>{on ? "✓ " : ""}{weekday(d)}</span>
            <strong>{n > 0 ? fmt(n) : "–"}</strong>
            {n > 0 && (row.people_by_date[d] ?? 0) > 0 && (
              <span style={{ display: "block", fontSize: 10, opacity: 0.85 }}>👤 {row.people_by_date[d]}</span>
            )}
          </button>
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

// Who it's for today: clients, and meal boxes when someone has it twice.
function TodayPeople({ row, cookDate }: { row: PlanRow; cookDate: string }) {
  const people = row.people_by_date[cookDate] ?? 0;
  const boxes = row.boxes_by_date[cookDate] ?? 0;
  if (!people && !boxes) return null;
  return (
    <span style={{ display: "block", marginTop: 6, fontSize: 13, color: C.primary }}>
      Today: <strong>{fmt(row.need)} servings</strong>
      {people > 0 && <> for <strong>{people} {people === 1 ? "person" : "people"}</strong></>}
      {boxes > 0 && boxes !== people && <> · {boxes} boxes</>}
    </span>
  );
}

function RowCard({ row, line, onLine, dates, cookDate, first, done, onAddStep }: {
  row: PlanRow; line: Line; onLine: (patch: Partial<Line>) => void; dates: string[]; cookDate: string; first: boolean; done: boolean;
  onAddStep: () => void;
}) {
  const have = num(line.have);
  const cook = num(line.cook);
  const total = r2(have + cook);
  const reach = coversThrough(row, dates, total);
  const shortToday = total + 0.01 < row.need;
  // Days tapped on the strip: I cook = their total − what I have.
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const pickedSum = r2([...picked].reduce((n, d) => n + (row.by_date[d] ?? 0), 0));
  function pick(d: string) {
    const next = new Set(picked);
    if (next.has(d)) next.delete(d); else next.add(d);
    setPicked(next);
    if (next.size > 0) {
      const sum = [...next].reduce((n, x) => n + (row.by_date[x] ?? 0), 0);
      onLine({ cook: fmt(Math.max(0, r2(sum - have))) });
    }
  }
  return (
    <div id={`plan-row-${row.subrecipe_id}`} style={{ padding: "12px 0", borderTop: first ? "none" : `1px solid ${C.offWhite}`, opacity: done ? 0.6 : 1, scrollMarginTop: 130 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ flex: 1, fontSize: 15, fontWeight: 700, color: C.primary, minWidth: 0 }}>
          {done && <span style={{ color: "#1f6f50" }}>✓ </span>}{row.name}
        </span>
        <button type="button" onClick={onAddStep} title="Add an extra step" style={{
          height: 36, padding: "0 10px", borderRadius: 18, border: `1px solid ${C.border}`, background: C.white, color: C.primary, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
        }}>+ step</button>
        <WhoChip who={line.assignee} onChange={p => onLine({ assignee: p })} />
      </div>
      <WeekStrip row={row} dates={dates} cookDate={cookDate} picked={picked} onPick={pick} />
      {picked.size > 0 && (
        <span style={{ display: "block", marginTop: 6, fontSize: 13, color: "#8a5a00" }}>
          {dates.filter(d => picked.has(d)).map(d => `${weekday(d)} ${fmt(row.by_date[d] ?? 0)}`).join(" + ")} = <strong>{fmt(pickedSum)}</strong>
          {have > 0 && <> − {fmt(have)} I have = <strong>{fmt(Math.max(0, r2(pickedSum - have)))}</strong></>}
          {" "}→ I cook · <button onClick={() => setPicked(new Set())} style={{ ...linkBtn, fontSize: 12.5 }}>clear</button>
        </span>
      )}
      {row.need > 0 && <TodayPeople row={row} cookDate={cookDate} />}
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
      <div style={{ marginTop: 8 }}><ClientNotes row={row} cookDate={cookDate} total={total} /></div>
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

function Group({ id, title, sub, count, open, onToggle, children }: {
  id?: string; title: string; sub?: string; count: number; open: boolean; onToggle?: () => void; children: React.ReactNode;
}) {
  return (
    <section id={id} style={{ scrollMarginTop: 130, background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: "4px 14px 10px", marginBottom: 12 }}>
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

function Steps({ cookDate, steps, onAdded }: { cookDate: string; steps: PlanStep[]; onAdded?: () => void }) {
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
        onAdded?.();
      }); }}
        style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}>
        <input id="plan-step-input" value={text} onChange={e => setText(e.target.value)} placeholder="e.g. Cook kafta and freeze for Thursday"
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

  // "+ step" on a dish: jump down to extra steps, then a button brings you back.
  const [returnTo, setReturnTo] = useState<{ id: number; name: string } | null>(null);
  function jumpToSteps(r: PlanRow) {
    setReturnTo({ id: r.subrecipe_id, name: r.name });
    document.getElementById("plan-steps")?.scrollIntoView({ behavior: "smooth", block: "start" });
    // Focus without a second jump; the keyboard opens on the step box.
    setTimeout(() => (document.getElementById("plan-step-input") as HTMLInputElement | null)?.focus({ preventScroll: true }), 350);
  }
  function goBack() {
    if (!returnTo) return;
    const el = document.getElementById(`plan-row-${returnTo.id}`);
    (document.activeElement as HTMLElement | null)?.blur();
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    setReturnTo(null);
  }

  const totalCook = notBought.reduce((n, r) => n + num(lineFor(r).cook), 0);
  const dishCount = notBought.filter(r => num(lineFor(r).cook) > 0).length;
  const cards = (list: PlanRow[]) => {
    const shown = visible(list);
    if (shown.length === 0) return <p style={{ margin: "4px 0 8px", fontSize: 13, color: C.muted }}>{searching ? "No match." : hideDone ? "All done here." : "Nothing here."}</p>;
    return shown.map((r, i) => (
      <RowCard key={r.subrecipe_id} row={r} line={lineFor(r)} onLine={p => setLine(r, p)} dates={dates} cookDate={cookDate} first={i === 0} done={isDone(r)}
        onAddStep={() => jumpToSteps(r)} />
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
                {isDone(r) && <span style={{ color: "#1f6f50" }}>✓ </span>}<strong>{r.name}</strong> · {fmt(r.need)} today{(r.people_by_date[cookDate] ?? 0) > 0 ? ` (👤 ${r.people_by_date[cookDate]})` : ""} ·{fmt(weekTotal(r))} this week
              </span>
              <WhoChip who={lineFor(r).assignee} onChange={p => setLine(r, { assignee: p })} />
            </div>
          ))}
        </Group>
      )}

      <Group id="plan-steps" title="My extra steps" sub="Things that aren't a subrecipe, saved right away" count={steps.length} open>
        <Steps cookDate={cookDate} steps={steps} onAdded={returnTo ? goBack : undefined} />
      </Group>

      <Group title="Team" sub="Who can be given tasks" count={people.filter(p => p.active).length} open={open.team} onToggle={() => setOpen(o => ({ ...o, team: !o.team }))}>
        <Team />
      </Group>

      <div style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 20, background: C.white, borderTop: `1px solid ${C.border}`,
        padding: "10px 16px calc(10px + env(safe-area-inset-bottom))",
      }}>
        {returnTo && (
          <button onClick={goBack} style={{
            display: "block", width: "100%", maxWidth: 760, margin: "0 auto 8px", minHeight: 44, borderRadius: 12, border: "none",
            background: "#f2b84b", color: "#3d2700", fontSize: 14, fontWeight: 800, cursor: "pointer",
          }}>↩ Back to {returnTo.name}</button>
        )}
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
