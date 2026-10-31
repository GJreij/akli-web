"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { KitchenComment, KitchenDay, KitchenSubrecipe } from "@/lib/flask";
import type { DayPlan, SavedChoice, TeamMember } from "@/lib/kitchenPlan";
import { logBatches, saveDaySchedule, setPlanTaskDone } from "@/app/admin/kitchen/actions";
import PortioningPanel, { type PortionTarget } from "../cooking/PortioningPanel";
import { C } from "../ui";
import { potIngredients } from "./CommentHandling";
import PrepList, { buildPrepLines } from "./PrepList";
import { classify, FoldHeading } from "./KitchenDayBoard";
import { fmtQty, fmtServings, fmtWeekday, perPortion, scaledIngredients, smallBtn, todayBatches } from "./format";
import { hours, personColor } from "./TeamPanel";

type Kind = "dish" | "make" | "pot" | "salad" | "slice" | "portion";

export const KIND_LABEL: Record<Kind, string> = {
  dish: "Cook", make: "Make, no heat", pot: "Separate pots", salad: "Side salads", slice: "Slice & portion", portion: "Bought: portion",
};

export interface Task {
  key: string;
  kind: Kind;
  name: string;
  sub: string;
  amount: number;
  subs: KitchenSubrecipe[];
  saved?: SavedChoice;
  done: boolean;
  doneText?: string;
  note: string;
  lines: { name: string; qty: string }[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const az = <T extends { name: string }>(xs: T[]) => [...xs].sort((a, b) => a.name.localeCompare(b.name));

const PLAN_LABEL = (s: KitchenSubrecipe, c: SavedChoice) =>
  c.plan === "must" ? "today only"
    : c.plan === "suggested" ? `today → ${fmtWeekday(s.suggested.through)}`
      : c.plan === "freeze" ? `today → ${fmtWeekday(s.suggested.through)} + ${fmtServings(c.freezer)} to freeze`
        : "my amount";

function potsFor(s: KitchenSubrecipe, c: SavedChoice) {
  return s.comments
    .filter(x => x.handling === "separate_pot")
    .map(x => ({ c: x, servings: r2(c.plan === "must" ? x.servings_must : x.servings_suggested) }))
    .filter(p => p.servings > 0);
}

const potKey = (s: KitchenSubrecipe, c: KitchenComment) => `pot:${s.subrecipe_id}:${c.user_id}:${c.recipe_id ?? 0}`;

// Everything to do today, from the confirmed plan: a task per dish or
// no-heat recipe, per separate pot, per side salad, per item to slice and
// per bought item to portion.
export function buildTasks(day: KitchenDay, plan: DayPlan): Task[] {
  const { dishes, makes, salads, slices, portions } = classify(day, plan);
  const tasks: Task[] = [];
  const doneText = (s: KitchenSubrecipe) => {
    const made = todayBatches(s, day.cook_date).reduce((n, b) => n + b.servings_cooked, 0);
    return `done · ${fmtServings(made)} made`;
  };
  // Grams per portion and in all, one line per catalog ingredient.
  const portionLines = (s: KitchenSubrecipe, n: number) =>
    az(s.ingredients_per_serving.map(i => ({ name: i.name, qty: `${fmtQty({ quantity: i.quantity * n, unit: i.unit })} · ${fmtQty(i)} each` })));

  for (const s of [...dishes, ...makes]) {
    const saved = plan.choices[String(s.subrecipe_id)];
    const c: SavedChoice = saved ?? { plan: "must", servings: s.must_cook.servings, fridge: s.must_cook.servings, freezer: 0 };
    const pots = potsFor(s, c);
    const main = r2(c.servings - pots.reduce((n, p) => n + p.servings, 0));
    const done = todayBatches(s, day.cook_date).length > 0;
    const assembly = s.comments.filter(x => x.handling === "assembly");
    tasks.push({
      key: `dish:${s.subrecipe_id}`, kind: s.prep_type === "assemble" ? "make" : "dish",
      name: s.name, amount: c.servings, subs: [s], saved: c, done, doneText: done ? doneText(s) : undefined,
      sub: saved ? PLAN_LABEL(s, c) : "new orders since you confirmed",
      note: [
        pots.length ? `Main pot ${fmtServings(main)} servings · ${pots.map(p => `${p.c.name}’s ${fmtServings(p.servings)} made apart`).join(" · ")}.` : `For ${fmtServings(c.servings)} servings.`,
        c.freezer > 0 ? `Fridge ${fmtServings(c.fridge)} · freezer ${fmtServings(c.freezer)}.` : "",
        assembly.length ? `When portioning: ${assembly.map(x => `${x.name}: ${x.instruction || x.comment}`).join(" · ")}.` : "",
        s.instructions ? `\n${s.instructions}` : "",
      ].filter(Boolean).join(" "),
      lines: az(scaledIngredients(s, main).map(i => ({ name: i.name, qty: fmtQty(i) }))),
    });
    for (const p of pots) {
      const key = potKey(s, p.c);
      tasks.push({
        key, kind: "pot", name: `${s.name} for ${p.c.name}`, amount: p.servings, subs: [s],
        sub: `separate pot · ${p.c.instruction || p.c.comment}`, done: plan.done[key] != null, doneText: "done",
        note: `${p.c.name}: “${p.c.comment}”. Make it apart and label it with their name.`,
        lines: az(potIngredients(s.ingredients_per_serving, p.c).map(i => ({
          name: i.name, qty: i.less ? "less" : fmtQty({ quantity: i.quantity * p.servings, unit: i.unit }),
        }))),
      });
    }
  }

  for (const s of salads) {
    const n = s.must_cook.servings;
    const done = todayBatches(s, day.cook_date).length > 0 || n <= 0.01;
    tasks.push({
      key: `salad:${s.subrecipe_id}`, kind: "salad", name: s.name, amount: done ? s.today.servings : n, subs: [s],
      sub: s.comments.length ? s.comments.map(c => `${c.name}: ${c.comment}`).join(" · ") : "side salad",
      done, doneText: done ? (todayBatches(s, day.cook_date).length ? doneText(s) : "done · already made") : undefined,
      note: `For ${fmtServings(n)} people.${s.comments.length ? ` ${s.comments.map(c => `${c.name}: ${c.comment}, make theirs apart`).join(" · ")}.` : ""}`,
      lines: az(scaledIngredients(s, n).map(i => ({ name: i.name, qty: fmtQty(i) }))),
    });
  }

  for (const s of slices) {
    const done = todayBatches(s, day.cook_date).length > 0;
    const n = done ? todayBatches(s, day.cook_date).reduce((x, b) => x + b.servings_cooked, 0) : s.must_cook.servings;
    tasks.push({
      key: `slice:${s.subrecipe_id}`, kind: "slice", name: s.name, amount: n, subs: [s],
      sub: `cut into ${fmtServings(n)} portions · ${perPortion(s)} each`, done, doneText: done ? doneText(s) : undefined,
      note: [`Cut and portion ${fmtServings(n)} portions of ${perPortion(s)}.`, s.instructions ? `\n${s.instructions}` : ""].filter(Boolean).join(" "),
      lines: portionLines(s, n),
    });
  }

  for (const s of portions) {
    const n = s.today.servings;
    const key = `portion:${s.subrecipe_id}`;
    tasks.push({
      key, kind: "portion", name: s.name, amount: n, subs: [s],
      sub: `bought · ${fmtServings(n)} × ${perPortion(s)}`, done: plan.done[key] != null, doneText: "done · portioned",
      note: [`Nothing to make: portion ${fmtServings(n)} × ${perPortion(s)} and label them.`, s.instructions ? `\n${s.instructions}` : ""].filter(Boolean).join(" "),
      lines: portionLines(s, n),
    });
  }
  return tasks;
}

const pill = (col: { bg: string; fg: string }) => ({
  fontSize: 10.5, fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: col.bg, color: col.fg,
});
const actionBtn = (primary: boolean) => ({
  minHeight: 40, padding: "0 12px", borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
  border: primary ? "none" : `1px solid ${C.primary}`, background: primary ? C.primary : C.white, color: primary ? C.white : C.primary,
});

function TaskCard({ t, cookDate, open, onToggle, onPortion, team, personId }: {
  t: Task; cookDate: string; open: boolean; onToggle: () => void; team: TeamMember[]; personId?: string;
  onPortion: (targets: PortionTarget[]) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [diff, setDiff] = useState(false);
  const [actual, setActual] = useState("");
  const [picker, setPicker] = useState(false);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const s = t.subs[0];

  function run(fn: () => Promise<unknown>) {
    setErr(null);
    startTransition(async () => {
      try {
        await fn();
        setDiff(false);
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Couldn't save.");
      }
    });
  }

  // Done ✓ books the batch at the planned amount (fridge + freezer); a
  // different amount fills the fridge part first, the rest goes to the freezer.
  function markDone(made?: number) {
    // Separate pots and bought items have no batch of their own: a tick on the plan.
    if (t.kind === "pot" || t.kind === "portion") return run(() => setPlanTaskDone(cookDate, t.key, true, made ?? t.amount));
    const total = made ?? t.amount;
    const plannedFreezer = t.kind === "dish" || t.kind === "make" ? t.saved?.freezer ?? 0 : 0;
    const fridge = plannedFreezer > 0 ? Math.min(total, t.saved!.fridge) : total;
    const freezer = r2(total - fridge);
    return run(() => logBatches({
      subrecipeId: s.subrecipe_id, cookedOn: cookDate,
      batches: [{ servings: fridge, storage: "fridge" }, ...(freezer > 0 ? [{ servings: freezer, storage: "freezer" as const }] : [])],
      notes: made != null && Math.abs(made - t.amount) > 0.01 ? `Planned ${fmtServings(t.amount)}, made ${fmtServings(made)}` : null,
    }));
  }

  function saveActual() {
    const n = parseFloat(actual);
    if (!Number.isFinite(n) || n < 0) { setErr("Enter how many servings you made."); return; }
    markDone(n);
  }

  const batches = t.kind === "pot" || t.kind === "portion" ? [] : todayBatches(s, cookDate);
  const fridgeBatch = batches.find(b => b.storage === "fridge");
  const portionToday = () => {
    const targets = t.subs
      .filter(x => x.today.mpdr_ids.length)
      .map(x => ({
        subrecipeId: x.subrecipe_id, name: x.name, mpdrIds: x.today.mpdr_ids,
        batchId: fridgeBatch?.batch_id,
      }));
    if (targets.length) onPortion(targets);
  };
  const dayChips = batches.flatMap(b => b.allocated_by_date.map(d => ({
    id: `${b.batch_id}:${d.date}`, b, d, label: `${b.storage === "freezer" ? "❄️ " : ""}${fmtWeekday(d.date)} · ${fmtServings(d.servings)}`,
  })));
  const picked = dayChips.filter(c => !off.has(c.id));
  const multiDay = dayChips.length > 1;
  function portionPicked() {
    // One portioning window per batch, so each portion is linked to the
    // fridge or freezer batch it really came from.
    const byBatch = new Map<number, number[]>();
    for (const c of picked) byBatch.set(c.b.batch_id, [...(byBatch.get(c.b.batch_id) ?? []), ...c.d.mpdr_ids]);
    const first = [...byBatch.entries()][0];
    if (!first) return;
    onPortion([{ subrecipeId: s.subrecipe_id, name: s.name, mpdrIds: [...new Set(first[1])], batchId: first[0] }]);
  }
  const batchesPicked = new Set(picked.map(c => c.b.batch_id)).size;

  return (
    <div style={{ border: `1px solid ${t.done ? "#b9d9d8" : C.border}`, background: t.done ? "#f1f8f8" : C.white, borderRadius: 12, padding: "10px 12px" }}>
      <button onClick={onToggle} style={{
        width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
        background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", color: C.primary, minHeight: 44,
      }}>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <span style={pill(personColor(team, personId))}>{team.find(m => m.id === personId)?.name ?? "No one yet"}</span>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{t.name}</span>
          </span>
          <span style={{ display: "block", fontSize: 12, color: C.muted, marginTop: 2 }}>{t.done ? t.doneText : t.sub}</span>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 18, fontWeight: 700 }}>{fmtServings(t.amount)}</span>
          <span style={{ fontSize: 15, color: C.muted }}>{open ? "▾" : "▸"}</span>
        </span>
      </button>

      {open && (
        <div style={{ marginTop: 8, background: "#f7f4f2", borderRadius: 10, padding: "10px 12px" }}>
          <p style={{ margin: "0 0 6px", fontSize: 12, color: "#3d3d3d", whiteSpace: "pre-wrap" }}>{t.note}</p>
          {t.lines.map((l, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "5px 0", borderTop: "1px solid #e8e2dc", fontSize: 13 }}>
              <span style={{ color: C.primary }}>{l.name}</span>
              <strong style={{ color: C.primary, textAlign: "right" }}>{l.qty}</strong>
            </div>
          ))}
          {t.lines.length === 0 && <p style={{ margin: 0, fontSize: 12, color: C.light }}>No ingredients listed in the catalog.</p>}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
        {!t.done && (
          <>
            <button disabled={pending} onClick={() => markDone()} style={actionBtn(true)}>{pending ? "Saving…" : "Done ✓"}</button>
            {t.kind !== "portion" && <button onClick={() => setDiff(v => !v)} style={{ ...actionBtn(false), borderColor: C.border, fontWeight: 600 }}>Made a different amount</button>}
          </>
        )}
        {t.done && (t.kind === "pot" || t.kind === "portion") && (
          <button disabled={pending} onClick={() => run(() => setPlanTaskDone(cookDate, t.key, false))} style={{ ...actionBtn(false), borderColor: C.border, fontWeight: 600 }}>Undo</button>
        )}
        {t.done && t.kind !== "pot" && t.subs.some(x => x.today.mpdr_ids.length) && (
          <button onClick={portionToday} style={actionBtn(false)}>Portion today</button>
        )}
        {t.done && multiDay && <button onClick={() => setPicker(v => !v)} style={actionBtn(false)}>Portion several days…</button>}
      </div>

      {diff && !t.done && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 13, color: C.muted, flexWrap: "wrap" }}>
          I actually made
          <input type="number" step="any" min="0" inputMode="decimal" value={actual} onChange={e => setActual(e.target.value)}
            style={{ width: 80, height: 40, padding: "0 10px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14 }} />
          servings
          <button disabled={pending} onClick={saveActual} style={actionBtn(true)}>Save &amp; done</button>
        </label>
      )}

      {picker && t.done && (
        <div style={{ marginTop: 8, background: "#f7f4f2", borderRadius: 10, padding: 10 }}>
          <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: C.primary, marginBottom: 6 }}>Portion for which days?</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {dayChips.map(c => {
              const on = !off.has(c.id);
              return (
                <button key={c.id} onClick={() => setOff(prev => { const n = new Set(prev); if (on) n.add(c.id); else n.delete(c.id); return n; })}
                  style={{ minHeight: 40, padding: "0 12px", borderRadius: 20, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                    background: on ? C.primary : C.white, color: on ? C.white : C.primary, border: `1px solid ${on ? C.primary : "#c9c2bb"}` }}>
                  {c.label}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
            <button disabled={picked.length === 0 || batchesPicked > 1} onClick={portionPicked} style={{ ...actionBtn(true), opacity: picked.length === 0 || batchesPicked > 1 ? 0.5 : 1 }}>
              Portion {fmtServings(picked.reduce((n, c) => n + c.d.servings, 0))} servings
            </button>
            <span style={{ fontSize: 12, color: C.muted }}>
              {batchesPicked > 1 ? "Fridge and ❄️ freezer days are portioned separately: pick one or the other." : "Weigh once: it splits per client and day."}
            </span>
          </div>
        </div>
      )}
      {err && <p style={{ margin: "6px 0 0", fontSize: 12, color: C.error }}>{err}</p>}
    </div>
  );
}

type View = "person" | "type";

const matches = (t: Task, q: string) =>
  [t.name, t.sub, t.note, ...t.lines.map(l => l.name)].some(x => x.toLowerCase().includes(q));

export default function PrepCard({ day, plan, onOrganise }: { day: KitchenDay; plan: DayPlan; onOrganise: () => void }) {
  const router = useRouter();
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [showIngr, setShowIngr] = useState(false);
  const [panel, setPanel] = useState<PortionTarget[] | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("person");
  const [hideDone, setHideDone] = useState(false);
  const [, startTransition] = useTransition();

  // The section layout is a per-phone preference.
  useEffect(() => {
    try {
      const v = localStorage.getItem("akli-prep-view");
      if (v === "person" || v === "type") setView(v);
    } catch { /* storage unavailable */ }
  }, []);
  function pickView(v: View) {
    setView(v);
    try { localStorage.setItem("akli-prep-view", v); } catch { /* ignore */ }
  }

  if (plan.confirmed_at == null) {
    return <p style={{ margin: 0, fontSize: 13, color: C.muted }}>Confirm your plan in step 1 first: the checklist, the ingredients and the assistant all work from it.</p>;
  }

  const team = plan.team.filter(m => m.name.trim());
  const personOf = (t: Task) => (team.some(m => m.id === plan.assign[t.key]) ? plan.assign[t.key] : undefined);
  const tasks = buildTasks(day, plan);
  const done = tasks.filter(t => t.done).length;
  const q = query.trim().toLowerCase();
  const shown = tasks.filter(t => (!q || matches(t, q)) && !(hideDone && t.done));

  // Sections: one per person (then what no one has yet), or one per kind of job.
  const sections: { id: string; title: string; sub?: string; col?: { bg: string; fg: string }; tasks: Task[] }[] =
    view === "person" && team.length > 0
      ? [
        ...team.map(m => ({ id: m.id, title: m.name, sub: hours(m), col: personColor(team, m.id), tasks: shown.filter(t => personOf(t) === m.id) })),
        { id: "none", title: "Not given to anyone", sub: "give them out in step 1", tasks: shown.filter(t => !personOf(t)) },
      ]
      : (Object.keys(KIND_LABEL) as Kind[]).map(k => ({ id: k, title: KIND_LABEL[k], tasks: shown.filter(t => t.kind === k) }));

  // Prep list: every ingredient across today's tasks, at the planned amounts.
  const servingsFor = new Map<number, number>();
  for (const t of tasks) {
    // Bought items aren't weighed or cut: they stay out of this list.
    if (t.kind === "dish" || t.kind === "make") servingsFor.set(t.subs[0].subrecipe_id, t.amount);
    if (t.kind === "salad" || t.kind === "slice") servingsFor.set(t.subs[0].subrecipe_id, t.subs[0].must_cook.servings);
  }
  const prepSubs = day.subrecipes.filter(s => (servingsFor.get(s.subrecipe_id) ?? 0) > 0);
  const prepLines = buildPrepLines(prepSubs, s => scaledIngredients(s, servingsFor.get(s.subrecipe_id) ?? 0));
  const prepShown = q ? prepLines.filter(l => l.name.toLowerCase().includes(q) || l.dishes.some(d => d.name.toLowerCase().includes(q))) : prepLines;

  const chip = (on: boolean) => ({
    minHeight: 36, padding: "0 12px", borderRadius: 20, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
    background: on ? C.primary : C.white, color: on ? C.white : C.primary, border: `1px solid ${on ? C.primary : "#c9c2bb"}`,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ border: "1px solid #b9d9d8", background: "#f1f8f8", borderRadius: 12, padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13.5, color: C.primary }}>
            <strong>Kitchen assistant</strong>
            <span style={{ display: "block", fontSize: 12, color: "#3d5f5f" }}>
              Sees your confirmed plan · 5 burners · 1 oven · {team.length ? team.map(m => m.name).join(", ") : "add your team in step 1"}
            </span>
          </span>
          <button onClick={onOrganise} style={{ ...actionBtn(true), minHeight: 44 }}>{plan.schedule ? "Re-plan" : "✨ Organise my day"}</button>
        </div>
        {plan.schedule && (
          <div style={{ marginTop: 10 }}>
            {plan.schedule.map((x, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "48px 72px 1fr", gap: 8, fontSize: 12.5, padding: "5px 0", borderTop: "1px solid #d6e9e8", color: C.primary }}>
                <strong>{x.time}</strong>
                <span style={{ fontWeight: 600, color: personColor(team, team.find(m => m.name === x.who)?.id).fg, overflow: "hidden", textOverflow: "ellipsis" }}>{x.who}</span>
                <span>{x.station && x.station !== "none" ? `${x.station}: ` : ""}{x.task}</span>
              </div>
            ))}
            <button onClick={() => startTransition(async () => { await saveDaySchedule(day.cook_date, null); router.refresh(); })}
              style={{ ...smallBtn, marginTop: 6, background: "transparent", border: "none", color: C.muted, textDecoration: "underline" }}>
              Clear the order of work
            </button>
          </div>
        )}
      </div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.primary }}>Checklist</h2>
          <span style={{ fontSize: 12, color: C.muted }}>{done} of {tasks.length} done · tap a task for its ingredients</span>
        </div>

        <div style={{ position: "sticky", top: 0, zIndex: 2, background: C.white, paddingBottom: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search a dish, ingredient or client…"
            style={{ width: "100%", boxSizing: "border-box", height: 44, padding: "0 12px", border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 14, color: C.primary }} />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: C.muted }}>Sections:</span>
            <button onClick={() => pickView("person")} style={chip(view === "person")}>By person</button>
            <button onClick={() => pickView("type")} style={chip(view === "type")}>By job</button>
            <button onClick={() => setHideDone(v => !v)} style={chip(hideDone)}>Hide done</button>
          </div>
        </div>

        {q && shown.length === 0 && <p style={{ margin: "4px 0", fontSize: 12.5, color: C.muted }}>No task matches “{query}”.</p>}
        {view === "person" && team.length === 0 && (
          <p style={{ margin: "0 0 8px", fontSize: 12, color: C.muted }}>Add who’s in today in step 1 to see each person’s list.</p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {sections.filter(sec => sec.tasks.length > 0).map(sec => (
            <section key={sec.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, padding: "4px 10px", marginBottom: 6, borderRadius: 8,
                background: sec.col?.bg ?? C.offWhite, color: sec.col?.fg ?? C.primary }}>
                <strong style={{ fontSize: 13.5 }}>{sec.title}{sec.sub ? <span style={{ fontWeight: 500, fontSize: 12 }}> · {sec.sub}</span> : null}</strong>
                <span style={{ fontSize: 12 }}>{sec.tasks.filter(t => t.done).length}/{sec.tasks.length} done</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {sec.tasks.map(t => (
                  <TaskCard key={t.key} t={t} cookDate={day.cook_date} team={team} personId={personOf(t)}
                    open={openTask === t.key || (!!q && shown.length <= 3)} onToggle={() => setOpenTask(openTask === t.key ? null : t.key)}
                    onPortion={setPanel} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      {prepLines.length > 0 && (
        <div>
          <FoldHeading open={showIngr || !!q} onToggle={() => setShowIngr(v => !v)}>
            Ingredients to weigh &amp; cut ({q ? `${prepShown.length} of ${prepLines.length}` : prepLines.length}) · A–Z
          </FoldHeading>
          {(showIngr || !!q) && prepShown.length > 0 && <PrepList lines={prepShown} storageKey={`akli-prep-${day.cook_date}`} />}
        </div>
      )}

      {panel && <PortioningPanel targets={panel} onClose={() => setPanel(null)} onSaved={() => router.refresh()} />}
    </div>
  );
}
