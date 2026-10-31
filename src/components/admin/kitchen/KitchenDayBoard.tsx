"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { KitchenDay, KitchenSubrecipe } from "@/lib/flask";
import type { DayPlan, SavedChoice, ScheduleItem } from "@/lib/kitchenPlan";
import { confirmDayPlan, reopenDayPlan, saveDaySchedule, sortCommentsWithAi } from "@/app/admin/kitchen/actions";
import { C } from "../ui";
import { CommentLine, SeparatePots } from "./CommentHandling";
import KitchenSettingsBar from "./KitchenSettingsBar";
import KitchenAssistant from "./KitchenAssistant";
import PrepCard, { buildTasks, KIND_LABEL } from "./PrepCard";
import { TeamEditor, WhoDoesWhat } from "./TeamPanel";
import StockRow from "./StockRow";
import AlreadyCooked from "./AlreadyCooked";
import {
  type Choice, type Plan, choiceCustom, defaultChoice, fmtDay, fmtServings, fmtWeekday, fromSaved,
  fmtQty, perPortion, planServings, scaledIngredients, smallBtn, toSaved, todayBatches,
} from "./format";

// Re-exported for older imports.
export { type Choice, type Plan, choiceCustom, defaultChoice, fmtDay, fmtQty, fmtServings, planIngredients, planServings, smallBtn } from "./format";

const chip = (on: boolean, locked: boolean) => ({
  minHeight: 40, padding: "0 12px", borderRadius: 20, fontSize: 12.5, fontWeight: 600,
  cursor: locked ? "default" : "pointer", opacity: locked && !on ? 0.45 : 1,
  background: on ? C.primary : C.white, color: on ? C.white : C.primary, border: `1px solid ${on ? C.primary : "#c9c2bb"}`,
});

const fold = (open: boolean) => (open ? "▾" : "▸");

// The three parts of the day share the page: one big card each, opened
// from the step buttons at the top.
export function DayCard({ id, title, sub, open, onToggle, children }: {
  id: string; title: string; sub: string; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div id={id} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden", marginBottom: 14, scrollMarginTop: 12 }}>
      <button onClick={onToggle} style={{
        width: "100%", minHeight: 56, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
        padding: "14px 16px", background: C.white, border: "none", cursor: "pointer", textAlign: "left", color: C.primary,
      }}>
        <span>
          <span style={{ display: "block", fontFamily: "'Playfair Display', serif", fontSize: 21, fontWeight: 500 }}>{title}</span>
          <span style={{ display: "block", fontSize: 12.5, color: C.muted, marginTop: 2 }}>{sub}</span>
        </span>
        <span style={{ fontSize: 20, color: C.muted }}>{fold(open)}</span>
      </button>
      {open && <div style={{ padding: "0 16px 16px" }}>{children}</div>}
    </div>
  );
}

export function FoldHeading({ open, onToggle, children }: { open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onToggle} style={{
      width: "100%", minHeight: 44, display: "flex", justifyContent: "space-between", alignItems: "center",
      background: "none", border: "none", padding: 0, cursor: "pointer", color: C.primary, textAlign: "left",
    }}>
      <span style={{ fontSize: 15, fontWeight: 700 }}>{children}</span>
      <span style={{ fontSize: 16, color: C.muted }}>{fold(open)}</span>
    </button>
  );
}

// How the day's subrecipes split across the cards, by catalog type:
// cook and make (no heat) get an amount to decide; slice items only need
// what isn't already cut; bought items are always just portioned.
export function classify(day: KitchenDay, plan: DayPlan) {
  const planned = (s: KitchenSubrecipe) => plan.choices[String(s.subrecipe_id)] != null;
  const needs = (s: KitchenSubrecipe) => s.must_cook.servings > 0.01;
  // Cut today: covered now, but it stays on the list as done.
  const cutToday = (s: KitchenSubrecipe) => s.prep_type === "slice" && todayBatches(s, day.cook_date).length > 0;
  const subs = day.subrecipes.filter(s => !s.is_side_salad);
  const amount = (type: string) => subs.filter(s => s.prep_type === type && (needs(s) || planned(s)));
  return {
    dishes: amount("cook"),
    makes: amount("assemble"),
    salads: day.subrecipes.filter(s => s.is_side_salad && s.today.servings > 0),
    slices: subs.filter(s => s.prep_type === "slice" && (needs(s) || cutToday(s))),
    portions: subs.filter(s => s.prep_type === "ready" && s.today.servings > 0),
    covered: subs.filter(s => s.prep_type !== "ready" && !needs(s) && s.today.servings > 0 && !planned(s) && !cutToday(s)),
  };
}

function DishRow({ s, cookDate, choice, onChoice, locked, saved, open, onToggle, first, verb = "cook" }: {
  s: KitchenSubrecipe; cookDate: string; choice: Choice; onChoice: (patch: Partial<Choice>) => void;
  locked: boolean; saved: SavedChoice | null; open: boolean; onToggle: () => void; first: boolean; verb?: "cook" | "make";
}) {
  const hasExtra = s.suggested.servings > s.must_cook.servings + 0.01;
  const nextDays = s.suggested.by_date.filter(d => d.date !== cookDate);
  const amount = saved && locked ? saved.servings : planServings(s, choice.plan, choiceCustom(choice));
  const opts: { k: Plan; label: string }[] = [];
  if (s.must_cook.servings > 0.01) opts.push({ k: "must", label: `Today only · ${fmtServings(s.must_cook.servings)}` });
  if (hasExtra) opts.push({ k: "suggested", label: `Through ${fmtWeekday(s.suggested.through)} · ${fmtServings(s.suggested.servings)}` });
  if (s.freeze) opts.push({ k: "freeze", label: `+ freeze to ${fmtWeekday(s.freeze.through)} · ${fmtServings(planServings(s, "freeze"))}` });
  const pick = (k: Plan) => { if (!locked) onChoice({ plan: k }); };
  const comments = s.comments.length;

  return (
    <div style={{ padding: "12px 0", borderTop: first ? "none" : `1px solid ${C.offWhite}` }}>
      <button onClick={onToggle} style={{
        width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
        background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", color: C.primary, minHeight: 44,
      }}>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>{s.name}</span>
            {s.freezer_days != null && <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: "#eaf2fb", color: "#2c5f8a" }}>Freezes</span>}
            {comments > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: "#fff3dc", color: "#8a5a00" }}>{comments} comment{comments === 1 ? "" : "s"}</span>}
          </span>
          <span style={{ display: "block", fontSize: 12.5, color: C.muted, marginTop: 2 }}>
            Today <strong style={{ color: C.primary }}>{fmtServings(s.today.servings)}</strong>
            {s.today.covered > 0.01 && <> ({fmtServings(s.today.covered)} already cooked)</>}
            {nextDays.length > 0
              ? <> · then {nextDays.map(d => `${fmtWeekday(d.date)} ${fmtServings(d.servings)}`).join(" · ")}</>
              : s.fridge_days === 0 ? " · same day only" : ""}
          </span>
        </span>
        <span style={{ textAlign: "right", flexShrink: 0 }}>
          <span style={{ display: "block", fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{fmtServings(amount)}</span>
          <span style={{ display: "block", fontSize: 11, color: C.muted }}>to {verb} {fold(open)}</span>
        </span>
      </button>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
        {opts.map(o => <button key={o.k} disabled={locked} onClick={() => pick(o.k)} style={chip(choice.plan === o.k, locked)}>{o.label}</button>)}
        <button disabled={locked} onClick={() => pick("custom")} style={chip(choice.plan === "custom", locked)}>My amount</button>
        {choice.plan === "custom" && (
          <input
            type="number" step="any" min="0" inputMode="decimal" value={choice.customText} disabled={locked}
            onChange={e => onChoice({ customText: e.target.value, plan: "custom" })}
            style={{ width: 80, height: 40, padding: "0 10px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14 }}
          />
        )}
      </div>

      <AlreadyCooked s={s} cookDate={cookDate} locked={locked} label={verb === "make" ? "Already made" : "Already cooked"} />

      {open && (
        <div style={{ marginTop: 10, background: "#f7f4f2", borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 12, color: C.muted }}>
            {s.recipes.join(" · ") || "—"}
            {s.fridge_days != null && <> · keeps {s.fridge_days === 0 ? "same day only" : `${s.fridge_days} days in the fridge`}</>}
            {s.freezer_days != null && <>, {s.freezer_days} in the freezer</>}
            {s.suggested.buffer > 0 && <> · “Through” includes +{fmtServings(s.suggested.buffer)} for late orders</>}
          </span>
          {s.comments.map(c => (
            <CommentLine key={`${c.user_id}-${c.recipe_id}-${c.comment}`} c={c} subrecipeId={s.subrecipe_id} dayLabel={fmtDay(c.date)} />
          ))}
          <SeparatePots
            pots={s.comments.filter(c => c.handling === "separate_pot").map(c => ({ c, servings: choice.plan === "must" ? c.servings_must : c.servings_suggested }))}
            totalServings={amount}
            perServing={s.ingredients_per_serving}
          />
          {s.stock.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.primary }}>Already cooked</span>
              {s.stock.map(b => <StockRow key={b.batch_id} b={b} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// One ingredient cut and portioned (turkey, cheese, fruit): only what isn't
// already cut is on the list; "Already have" corrects it like a dish.
function SliceRow({ s, cookDate, locked, first }: { s: KitchenSubrecipe; cookDate: string; locked: boolean; first: boolean }) {
  return (
    <div style={{ padding: "10px 0", borderTop: first ? "none" : `1px solid ${C.offWhite}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 14.5, fontWeight: 700, color: C.primary }}>{s.name}</span>
          <span style={{ display: "block", fontSize: 12.5, color: C.muted, marginTop: 2 }}>
            Today <strong style={{ color: C.primary }}>{fmtServings(s.today.servings)}</strong> portions · {perPortion(s)} each
          </span>
        </span>
        <span style={{ textAlign: "right", flexShrink: 0, color: C.primary }}>
          <span style={{ display: "block", fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{fmtServings(s.must_cook.servings)}</span>
          <span style={{ display: "block", fontSize: 11, color: C.muted }}>to slice</span>
        </span>
      </div>
      <AlreadyCooked s={s} cookDate={cookDate} locked={locked} label="Already cut" />
    </div>
  );
}

// Bought items: nothing to make, just portion and label.
function PortionRow({ s, first }: { s: KitchenSubrecipe; first: boolean }) {
  const total = scaledIngredients(s, s.today.servings).map(i => fmtQty(i)).join(" + ");
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "8px 0", borderTop: first ? "none" : `1px solid ${C.offWhite}` }}>
      <span style={{ minWidth: 0, fontSize: 13 }}>
        <strong style={{ color: C.primary }}>{s.name}</strong>
        <span style={{ display: "block", fontSize: 12, color: C.muted }}>{perPortion(s)} each{total ? ` · ${total} in all` : ""}</span>
      </span>
      <span style={{ textAlign: "right", flexShrink: 0, color: C.primary }}>
        <strong style={{ display: "block", fontSize: 16 }}>{fmtServings(s.today.servings)}</strong>
        <span style={{ fontSize: 11, color: C.muted }}>portions</span>
      </span>
    </div>
  );
}

function DecideBody({ day, plan, choices, setChoice }: {
  day: KitchenDay; plan: DayPlan; choices: Map<number, Choice>; setChoice: (s: KitchenSubrecipe, patch: Partial<Choice>) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [openDish, setOpenDish] = useState<number | null>(null);
  const [showCovered, setShowCovered] = useState(false);
  const [showPortions, setShowPortions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmed = plan.confirmed_at != null;
  const { dishes, makes, salads, slices, portions, covered } = classify(day, plan);
  // Everything with an amount to decide (and confirm).
  const decided = [...dishes, ...makes];
  const expired = day.subrecipes.flatMap(s => s.stock.filter(b => b.expired && b.remaining > 0.01).map(b => ({ s, b })));

  const choiceFor = (s: KitchenSubrecipe): Choice => {
    const saved = plan.choices[String(s.subrecipe_id)];
    if (confirmed && saved) return fromSaved(saved);
    return choices.get(s.subrecipe_id) ?? (saved ? fromSaved(saved) : defaultChoice(s));
  };
  const total = decided.reduce((n, s) => {
    const saved = plan.choices[String(s.subrecipe_id)];
    return n + (confirmed && saved ? saved.servings : planServings(s, choiceFor(s).plan, choiceCustom(choiceFor(s))));
  }, 0);

  function run(fn: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save.");
      }
    });
  }

  // The same tasks Prep will show, from the amounts picked on screen.
  const draft: DayPlan = confirmed ? plan : {
    ...plan, confirmed_at: plan.confirmed_at,
    choices: Object.fromEntries(decided.map(s => [String(s.subrecipe_id), toSaved(s, choiceFor(s))])),
  };
  const whoTasks = buildTasks(day, draft).map(t => ({ key: t.key, name: t.name, amount: t.amount, type: KIND_LABEL[t.kind] }));

  function confirm() {
    const saved: Record<string, SavedChoice> = {};
    for (const s of decided) saved[String(s.subrecipe_id)] = toSaved(s, choiceFor(s));
    run(() => confirmDayPlan(day.cook_date, saved));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {error && <p style={{ margin: 0, fontSize: 12.5, color: C.error }}>{error}</p>}
      {expired.length > 0 && (
        <div style={{ background: "#fdecea", border: `1px solid ${C.error}40`, borderRadius: 12, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
          <strong style={{ fontSize: 13, color: C.error }}>Past use-by: check and throw away</strong>
          {expired.map(({ s, b }) => (
            <div key={b.batch_id}><span style={{ fontSize: 12.5, color: C.primary, fontWeight: 600 }}>{s.name}</span><StockRow b={b} /></div>
          ))}
        </div>
      )}

      <TeamEditor cookDate={day.cook_date} team={plan.team} />

      {confirmed && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", background: "#f1f8f8", border: "1px solid #b9d9d8", borderRadius: 12, padding: "10px 12px" }}>
          <span style={{ fontSize: 13, color: C.primary }}>
            <strong>✓ Plan confirmed</strong> at {new Date(plan.confirmed_at!).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} · the whole team sees it
          </span>
          <button onClick={() => run(() => reopenDayPlan(day.cook_date))} disabled={pending} style={{ ...smallBtn, minHeight: 40, background: C.white }}>Change plan</button>
        </div>
      )}

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.primary }}>To cook today ({dishes.length})</h2>
          <span style={{ fontSize: 12, color: C.muted }}>{fmtServings(total)} servings</span>
        </div>
        {!confirmed && <p style={{ margin: "2px 0 0", fontSize: 12, color: C.muted }}>The best option is already picked. Change only what you disagree with. Tap a dish for comments and what’s already cooked.</p>}
        {dishes.length === 0 && <p style={{ margin: "8px 0 0", fontSize: 13, color: C.muted }}>Nothing to cook today.</p>}
        {dishes.map((s, i) => (
          <DishRow
            key={s.subrecipe_id} s={s} cookDate={day.cook_date} first={i === 0}
            choice={choiceFor(s)} onChoice={patch => setChoice(s, patch)}
            locked={confirmed} saved={plan.choices[String(s.subrecipe_id)] ?? null}
            open={openDish === s.subrecipe_id} onToggle={() => setOpenDish(openDish === s.subrecipe_id ? null : s.subrecipe_id)}
          />
        ))}
      </div>

      {makes.length > 0 && (
        <div>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.primary }}>To make, no heat ({makes.length})</h2>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: C.muted }}>Sauces, spreads, dressings: they keep a few days, so you can make ahead.</p>
          {makes.map((s, i) => (
            <DishRow
              key={s.subrecipe_id} s={s} cookDate={day.cook_date} first={i === 0}
              choice={choiceFor(s)} onChoice={patch => setChoice(s, patch)}
              locked={confirmed} saved={plan.choices[String(s.subrecipe_id)] ?? null}
              open={openDish === s.subrecipe_id} onToggle={() => setOpenDish(openDish === s.subrecipe_id ? null : s.subrecipe_id)}
              verb="make"
            />
          ))}
        </div>
      )}

      {salads.length > 0 && (
        <div>
          <h2 style={{ margin: "0 0 2px", fontSize: 15, fontWeight: 700, color: C.primary }}>Side salads ({salads.length})</h2>
          <p style={{ margin: "0 0 8px", fontSize: 12, color: C.muted }}>Made fresh for today.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
            {salads.map(s => (
              <div key={s.subrecipe_id} style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <strong style={{ fontSize: 13.5, color: C.primary }}>{s.name}</strong>
                  <span style={{ fontSize: 13, color: C.primary, whiteSpace: "nowrap" }}><strong>{fmtServings(s.today.servings)}</strong> people</span>
                </div>
                {s.must_cook.servings < s.today.servings - 0.01 && (
                  <span style={{ display: "block", fontSize: 11.5, color: C.tealDark }}>{fmtServings(s.today.servings - s.must_cook.servings)} already made</span>
                )}
                {s.comments.map(c => (
                  <span key={`${c.user_id}-${c.comment}`} style={{ display: "block", fontSize: 12, color: "#8a5a00", marginTop: 4 }}>
                    <strong>{c.name}:</strong> {c.comment}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {slices.length > 0 && (
        <div>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.primary }}>Slice &amp; portion ({slices.length})</h2>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: C.muted }}>Cold cuts, cheese, fruit, veg: cut and portion. If some is already cut, correct it.</p>
          {slices.map((s, i) => <SliceRow key={s.subrecipe_id} s={s} cookDate={day.cook_date} locked={confirmed} first={i === 0} />)}
        </div>
      )}

      {portions.length > 0 && (
        <div>
          <FoldHeading open={showPortions} onToggle={() => setShowPortions(v => !v)}>Bought, just portion ({portions.length})</FoldHeading>
          {showPortions && (
            <>
              <p style={{ margin: "0 0 4px", fontSize: 12, color: C.muted }}>Nothing to make: each one is a portioning task in Prep.</p>
              {portions.map((s, i) => <PortionRow key={s.subrecipe_id} s={s} first={i === 0} />)}
            </>
          )}
        </div>
      )}

      {covered.length > 0 && (
        <div>
          <FoldHeading open={showCovered} onToggle={() => setShowCovered(v => !v)}>Already cooked · nothing to do ({covered.length})</FoldHeading>
          {showCovered && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
              {covered.map(s => (
                <div key={s.subrecipe_id} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 12px", display: "flex", flexDirection: "column", gap: 5 }}>
                  <span style={{ fontSize: 13 }}>
                    <strong style={{ color: C.primary }}>{s.name}</strong>
                    <span style={{ display: "block", fontSize: 12, color: C.muted }}>Today {fmtServings(s.today.servings)} covered by what’s already cooked</span>
                  </span>
                  <AlreadyCooked s={s} cookDate={day.cook_date} locked={confirmed} />
                  {s.stock.map(b => <StockRow key={b.batch_id} b={b} />)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <WhoDoesWhat cookDate={day.cook_date} team={plan.team} assign={plan.assign} tasks={whoTasks} />

      {!confirmed && (
        <div>
          <button onClick={confirm} disabled={pending} style={{
            width: "100%", minHeight: 52, borderRadius: 12, border: "none", background: C.primary, color: C.white,
            fontSize: 15, fontWeight: 700, cursor: "pointer", opacity: pending ? 0.6 : 1,
          }}>
            {pending ? "Saving…" : `✓ Confirm my plan (${fmtServings(total)} servings) → Prep`}
          </button>
          <p style={{ margin: "6px 0 0", fontSize: 12, color: C.muted, textAlign: "center" }}>Saved and shared: everyone sees the same plan on their phone.</p>
        </div>
      )}
    </div>
  );
}

type Step = 1 | 2 | 3;

export default function KitchenDayBoard({ day, plan, tomorrow, nextDate }: {
  day: KitchenDay; plan: DayPlan; tomorrow: React.ReactNode; nextDate: string | null;
}) {
  const router = useRouter();
  const confirmed = plan.confirmed_at != null;
  const [open, setOpen] = useState<Record<Step, boolean>>({ 1: !confirmed, 2: confirmed, 3: false });
  const [choices, setChoices] = useState<Map<number, Choice>>(new Map());
  const [askAssistant, setAskAssistant] = useState<{ text: string; id: number } | null>(null);
  const [sortNote, setSortNote] = useState<string | null>(null);
  const sortTried = useRef(false);

  // Open Prep as soon as the plan gets confirmed (here or on another phone).
  const wasConfirmed = useRef(confirmed);
  useEffect(() => {
    if (confirmed && !wasConfirmed.current) setOpen({ 1: false, 2: true, 3: false });
    if (!confirmed && wasConfirmed.current) setOpen(o => ({ ...o, 1: true }));
    wasConfirmed.current = confirmed;
  }, [confirmed]);

  // The plan is shared: pick up the other phone's changes when coming back
  // to the page, and every minute while it's open.
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") router.refresh(); };
    document.addEventListener("visibilitychange", refresh);
    const t = setInterval(refresh, 60_000);
    return () => { document.removeEventListener("visibilitychange", refresh); clearInterval(t); };
  }, [router]);

  // New client comments are sorted in the background (separate pot or not).
  const unsorted = new Set(day.subrecipes.flatMap(s => s.comments.filter(c => c.handling == null).map(c => `${c.user_id}|${c.recipe_id ?? 0}|${c.comment}`))).size;
  useEffect(() => {
    if (unsorted === 0) { setSortNote(null); return; }
    if (sortTried.current) return;
    sortTried.current = true;
    setSortNote(`Sorting ${unsorted} new client comment${unsorted === 1 ? "" : "s"}…`);
    // One retry: the sort reloads the day while the page is still loading Tomorrow.
    sortCommentsWithAi(day.cook_date)
      .catch(() => new Promise(r => setTimeout(r, 3000)).then(() => sortCommentsWithAi(day.cook_date)))
      .then(() => { setSortNote(null); router.refresh(); })
      .catch(e => setSortNote(`Couldn't sort the new comments (${e instanceof Error ? e.message : "error"}). Set them by hand on each dish.`));
  }, [unsorted, day.cook_date, router]);

  function setChoice(s: KitchenSubrecipe, patch: Partial<Choice>) {
    setChoices(prev => {
      const saved = plan.choices[String(s.subrecipe_id)];
      const base = prev.get(s.subrecipe_id) ?? (saved ? fromSaved(saved) : defaultChoice(s));
      return new Map(prev).set(s.subrecipe_id, { ...base, ...patch });
    });
  }

  function go(step: Step) {
    setOpen({ 1: step === 1, 2: step === 2, 3: step === 3 });
    setTimeout(() => document.getElementById(`kd-step-${step}`)?.scrollIntoView({ block: "start" }), 0);
  }

  async function applyAssistantPlan(next: Map<number, Choice>, schedule: ScheduleItem[]) {
    if (!confirmed) setChoices(prev => new Map([...prev, ...next]));
    await saveDaySchedule(day.cook_date, schedule.length ? schedule : null);
    router.refresh();
  }

  const { dishes, makes, salads, slices, portions } = classify(day, plan);
  const doneCount = dishes.filter(s => todayBatches(s, day.cook_date).length > 0).length;
  const stepBtn = (n: Step, label: string, sub: string) => (
    <button key={n} onClick={() => go(n)} style={{
      flex: 1, minHeight: 56, borderRadius: 10, border: "none", cursor: "pointer", textAlign: "left", padding: "6px 10px",
      background: open[n] ? C.primary : C.white, color: open[n] ? C.white : C.primary,
    }}>
      <span style={{ display: "block", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", opacity: 0.7 }}>STEP {n}</span>
      <span style={{ display: "block", fontSize: 14, fontWeight: 700 }}>{label}</span>
      <span style={{ display: "block", fontSize: 11, opacity: 0.8 }}>{sub}</span>
    </button>
  );

  if (day.subrecipes.length === 0) {
    return <p style={{ fontSize: 13, color: C.light, margin: 0 }}>Nothing ordered for {fmtDay(day.cook_date)} and nothing in stock.</p>;
  }

  return (
    <>
      <div style={{ display: "flex", gap: 6, background: C.offWhite, borderRadius: 12, padding: 4, marginBottom: 12 }}>
        {stepBtn(1, "Decide", confirmed ? "plan confirmed ✓" : `${dishes.length} dishes`)}
        {stepBtn(2, "Prep & cook", confirmed ? `${doneCount}/${dishes.length} dishes done` : "after step 1")}
        {stepBtn(3, "Tomorrow", nextDate ? fmtDay(nextDate) : "nothing ordered")}
      </div>

      <details style={{ marginBottom: 12 }}>
        <summary style={{ cursor: "pointer", fontSize: 12.5, color: C.muted }}>⚙ Cook days &amp; settings · <Link href={`/admin/kitchen/week?start=${day.cook_date}`} style={{ color: C.tealDark }}>Week view →</Link></summary>
        <div style={{ marginTop: 8 }}>
          <KitchenSettingsBar settings={day.settings} isCookDay={day.is_cook_day} nextPlanned={day.next_planned_cook_day} fmtDay={fmtDay} />
        </div>
      </details>

      {sortNote && <p style={{ margin: "0 0 10px", fontSize: 12.5, color: C.muted }}>✨ {sortNote}</p>}

      <DayCard
        id="kd-step-1" title="1 · Decide what to cook" open={open[1]} onToggle={() => setOpen(o => ({ ...o, 1: !o[1] }))}
        sub={confirmed
          ? `Plan confirmed · ${dishes.length} dishes${salads.length ? ` + ${salads.length} side salads` : ""}`
          : `${dishes.length} to cook · ${makes.length} to make · ${salads.length} side salads · ${slices.length + portions.length} to portion`}
      >
        <DecideBody day={day} plan={plan} choices={choices} setChoice={setChoice} />
      </DayCard>

      <DayCard
        id="kd-step-2" title="2 · Prep & cook" open={open[2]} onToggle={() => setOpen(o => ({ ...o, 2: !o[2] }))}
        sub={confirmed ? `${doneCount} of ${dishes.length} dishes done${plan.schedule ? " · order of work ready" : ""}` : "Confirm your plan first: Prep is built from it"}
      >
        <PrepCard day={day} plan={plan} onOrganise={() => setAskAssistant({
          text: "Organise my day from my confirmed plan: a timed order of work for the oven, the burners and each person in today’s team.",
          id: Date.now(),
        })} />
      </DayCard>

      <DayCard
        id="kd-step-3" title={`3 · Tomorrow${nextDate ? ` (${fmtDay(nextDate)})` : ""}`} open={open[3]} onToggle={() => setOpen(o => ({ ...o, 3: !o[3] }))}
        sub={nextDate ? "What to take out tonight, jobs, and the WhatsApp note" : "Nothing ordered for the next days"}
      >
        {tomorrow}
      </DayCard>

      <KitchenAssistant day={day} request={askAssistant} confirmed={confirmed} onApplyPlan={applyAssistantPlan} />
    </>
  );
}
