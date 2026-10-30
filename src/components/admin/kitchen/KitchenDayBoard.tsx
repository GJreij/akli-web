"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { KitchenDay, KitchenIngredient, KitchenStockBatch, KitchenSubrecipe } from "@/lib/flask";
import { logBatches, closeBatch, correctBatchRemaining } from "@/app/admin/kitchen/actions";
import PortioningPanel, { type PortionTarget } from "../cooking/PortioningPanel";
import CopyListButton from "../CopyListButton";
import { C } from "../ui";
import PrepList, { buildPrepLines } from "./PrepList";

export type Plan = "must" | "suggested" | "freeze" | "custom";

// How much the cook chose to make for one subrecipe. Lives on the board (not
// the card) so the Prep list adds up exactly what each card is set to.
export interface Choice { plan: Plan; customText: string }

export function defaultChoice(s: KitchenSubrecipe): Choice {
  const hasExtra = s.suggested.servings > s.must_cook.servings + 0.01;
  const covered = s.must_cook.servings <= 0.01;
  return {
    plan: hasExtra ? "suggested" : covered ? "custom" : "must",
    customText: fmtServings(Math.max(s.suggested.servings, s.must_cook.servings) || 1),
  };
}

export function choiceCustom(c: Choice) {
  return Math.max(0, parseFloat(c.customText) || 0);
}

export function fmtServings(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "");
}

export function fmtQty(i: KitchenIngredient) {
  const q = i.unit === "g" || i.unit === "ml" ? Math.round(i.quantity) : i.quantity;
  return `${q} ${i.unit ?? ""}`.trim();
}

export function fmtDay(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

const badge = (bg: string, color: string) => ({
  fontSize: 10.5, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.05em",
  padding: "2px 8px", borderRadius: 20, background: bg, color,
});

export const smallBtn = {
  background: C.offWhite, color: C.primary, border: `1px solid ${C.border}`, borderRadius: 7,
  padding: "5px 10px", fontSize: 11.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" as const,
};

const EQUIPMENT_LABEL: Record<string, string> = { stove: "🔥 Stove", oven: "♨️ Oven", grill: "Grill", none: "No heat" };

// Combined ingredient amounts for a plan choice — "freeze" is suggested + the
// extra freezer portions, cooked as one pot.
export function planIngredients(s: KitchenSubrecipe, plan: Plan, custom: number): KitchenIngredient[] {
  if (plan === "custom") {
    return s.ingredients_per_serving.map(i => ({ ...i, quantity: Math.round(i.quantity * custom * 10) / 10 }));
  }
  if (plan === "must") return s.must_cook.ingredients;
  if (plan === "suggested" || !s.freeze) return s.suggested.ingredients;
  const byId = new Map(s.suggested.ingredients.map(i => [i.ingredient_id, { ...i }]));
  for (const i of s.freeze.ingredients) {
    const cur = byId.get(i.ingredient_id);
    if (cur) cur.quantity = Math.round((cur.quantity + i.quantity) * 10) / 10;
    else byId.set(i.ingredient_id, { ...i });
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function planServings(s: KitchenSubrecipe, plan: Plan, custom = 0) {
  if (plan === "custom") return custom;
  if (plan === "must") return s.must_cook.servings;
  if (plan === "suggested") return s.suggested.servings;
  return s.suggested.servings + (s.freeze?.servings ?? 0);
}

function StockRow({ b, s, onPortion, onClose }: {
  b: KitchenStockBatch;
  s: KitchenSubrecipe;
  onPortion: (mpdrIds: number[], batchId: number) => void;
  onClose: (b: KitchenStockBatch, status: "finished" | "discarded") => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [correcting, setCorrecting] = useState(false);
  const [actual, setActual] = useState(fmtServings(Math.max(b.remaining, 0)));
  const [err, setErr] = useState<string | null>(null);
  const empty = b.remaining <= 0.01;

  function saveCorrection() {
    const n = parseFloat(actual);
    if (!Number.isFinite(n) || n < 0) { setErr("Enter how many servings you actually have."); return; }
    setErr(null);
    startTransition(async () => {
      try {
        await correctBatchRemaining(b.batch_id, b.remaining, n);
        setCorrecting(false);
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Couldn't save the correction.");
      }
    });
  }

  return (
    <div>
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap",
      background: b.expired ? "#fdecea" : C.white, border: `1px solid ${C.border}`, borderRadius: 9, padding: "7px 10px",
    }}>
      <span style={{ fontSize: 12, color: C.muted }}>
        <strong style={{ color: C.primary }}>{b.storage === "freezer" ? "❄️ Freezer" : "Fridge"}</strong>
        {" · "}cooked {fmtDay(b.cooked_on)} · <strong style={{ color: C.primary }}>{fmtServings(b.remaining)}</strong> of {fmtServings(b.servings_cooked)} left
        {" · "}
        <span style={{ color: b.expired ? C.error : C.muted, fontWeight: b.expired ? 700 : 400 }}>
          {b.expired ? "expired " : "use by "}{fmtDay(b.use_by)}
        </span>
        {b.allocated_servings > 0 && <> · covers {fmtServings(b.allocated_servings)}</>}
      </span>
      <span style={{ display: "flex", gap: 6 }}>
        {b.allocated_today_mpdr_ids.length > 0 && (
          <button style={smallBtn} onClick={() => onPortion(b.allocated_today_mpdr_ids, b.batch_id)}>Portion today</button>
        )}
        {b.allocated_mpdr_ids.length > b.allocated_today_mpdr_ids.length && (
          <button style={smallBtn} onClick={() => onPortion(b.allocated_mpdr_ids, b.batch_id)} title="Portion every client this batch covers, including future days">
            Portion all (pre-pack)
          </button>
        )}
        {empty || b.expired
          ? <button style={smallBtn} onClick={() => onClose(b, b.expired && !empty ? "discarded" : "finished")}>{b.expired && !empty ? "Thrown away" : "Used up"}</button>
          : <button style={{ ...smallBtn, color: C.error }} onClick={() => onClose(b, "discarded")}>Throw away</button>}
        {!correcting && <button style={smallBtn} onClick={() => setCorrecting(true)} title="Fix how many servings are really left">Correct</button>}
      </span>
    </div>
    {correcting && (
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "5px 0 0 4px", fontSize: 12.5, color: C.muted }}>
        Actually left right now:
        <input
          type="number" step="any" min="0" inputMode="decimal" value={actual} onChange={e => setActual(e.target.value)}
          style={{ width: 80, padding: "5px 8px", borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 13 }}
        />
        servings
        <button onClick={saveCorrection} disabled={pending} style={{ ...smallBtn, background: C.primary, color: C.white, border: "none" }}>
          {pending ? "Saving…" : "Save"}
        </button>
        <button onClick={() => { setCorrecting(false); setErr(null); }} style={{ background: "transparent", border: "none", color: C.muted, fontSize: 12, cursor: "pointer" }}>Cancel</button>
        {err && <span style={{ color: C.error }}>{err}</span>}
      </div>
    )}
    </div>
  );
}

function LogBatchForm({ s, plan, custom, cookDate, onDone }: { s: KitchenSubrecipe; plan: Plan; custom: number; cookDate: string; onDone: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const withFreeze = plan === "freeze" && s.freeze;
  const [fridge, setFridge] = useState(fmtServings(plan === "custom" ? custom : plan === "must" ? s.must_cook.servings : s.suggested.servings));
  const [freezer, setFreezer] = useState(withFreeze ? fmtServings(s.freeze!.servings) : "");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    const batches = [
      { servings: parseFloat(fridge), storage: "fridge" as const },
      ...(withFreeze ? [{ servings: parseFloat(freezer), storage: "freezer" as const }] : []),
    ];
    startTransition(async () => {
      try {
        await logBatches({ subrecipeId: s.subrecipe_id, cookedOn: cookDate, batches });
        onDone();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't log the batch.");
      }
    });
  }

  const input = { padding: "6px 9px", borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 13, width: 90 };
  return (
    <div style={{ marginTop: 10, background: C.white, border: `1px solid ${C.teal}`, borderRadius: 10, padding: "10px 12px" }}>
      <p style={{ margin: "0 0 8px", fontSize: 12.5, fontWeight: 600, color: C.primary }}>How many servings did you cook?</p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", fontSize: 12.5, color: C.muted }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          Fridge <input type="number" step="any" min="0" value={fridge} onChange={e => setFridge(e.target.value)} style={input} />
        </label>
        {withFreeze && (
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            ❄️ Freezer <input type="number" step="any" min="0" value={freezer} onChange={e => setFreezer(e.target.value)} style={input} />
          </label>
        )}
        <button
          onClick={submit}
          disabled={pending}
          style={{ background: C.primary, color: C.white, border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
        >
          {pending ? "Saving…" : "Save batch"}
        </button>
        <button onClick={onDone} style={{ background: "transparent", border: "none", color: C.muted, fontSize: 12, cursor: "pointer" }}>Cancel</button>
      </div>
      {withFreeze && (
        <p style={{ margin: "6px 0 0", fontSize: 11.5, color: C.light }}>
          Freezer portions: split them per client right away with “Portion all”, so nothing is left as a loose tray.
        </p>
      )}
      {error && <p style={{ margin: "6px 0 0", fontSize: 12, color: C.error }}>{error}</p>}
    </div>
  );
}

function CookCard({ s, cookDate, choice, onChoice, onPortion, onCloseBatch }: {
  s: KitchenSubrecipe;
  cookDate: string;
  choice: Choice;
  onChoice: (patch: Partial<Choice>) => void;
  onPortion: (s: KitchenSubrecipe, mpdrIds: number[], batchId?: number) => void;
  onCloseBatch: (b: KitchenStockBatch, status: "finished" | "discarded") => void;
}) {
  const hasExtra = s.suggested.servings > s.must_cook.servings + 0.01;
  const covered = s.must_cook.servings <= 0.01;
  const { plan, customText } = choice;
  const setPlan = (p: Plan) => onChoice({ plan: p });
  const custom = choiceCustom(choice);
  const [logging, setLogging] = useState(false);
  const [showInstr, setShowInstr] = useState(false);
  const ingredients = planIngredients(s, plan, custom);
  const nextDays = s.suggested.by_date.filter(d => d.date !== cookDate);

  const option = (value: Plan, label: string, sub: string) => (
    <label key={value} style={{
      display: "flex", gap: 6, alignItems: "flex-start", cursor: "pointer", padding: "6px 9px", borderRadius: 8,
      border: `1px solid ${plan === value ? C.teal : C.border}`, background: plan === value ? "#eef6f6" : C.white, flex: "1 1 150px",
    }}>
      <input type="radio" checked={plan === value} onChange={() => setPlan(value)} style={{ marginTop: 2 }} />
      <span>
        <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: C.primary }}>{label}</span>
        <span style={{ display: "block", fontSize: 11, color: C.light }}>{sub}</span>
      </span>
    </label>
  );

  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: "13px 15px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <p style={{ margin: 0, fontFamily: "'Playfair Display', serif", fontSize: 16, fontWeight: 500, color: C.primary }}>{s.name}</p>
            {s.skill === "helper" && <span style={badge("#eef6f6", C.tealDark)}>Helper</span>}
            {s.equipment && <span style={badge(C.offWhite, C.muted)}>{EQUIPMENT_LABEL[s.equipment]}</span>}
            {s.freezer_days != null && <span style={badge("#eaf2fb", "#2c5f8a")}>Freezes</span>}
          </div>
          <p style={{ margin: "2px 0 0", fontSize: 11.5, color: C.light }}>
            {s.recipes.join(" · ") || "—"}{s.fridge_days != null && <> · keeps {s.fridge_days === 0 ? "same day only" : `${s.fridge_days}d in fridge`}</>}
          </p>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: covered ? C.tealDark : C.primary }}>
            {covered ? "✓" : fmtServings(s.must_cook.servings)}
          </p>
          <p style={{ margin: 0, fontSize: 10.5, color: C.light }}>{covered ? "covered" : "to cook today"}</p>
        </div>
      </div>

      <p style={{ margin: "8px 0 0", fontSize: 12, color: C.muted }}>
        Today {fmtServings(s.today.servings)} servings
        {s.today.covered > 0 && <> · <span style={{ color: C.tealDark, fontWeight: 600 }}>{fmtServings(s.today.covered)} already cooked</span></>}
        {nextDays.length > 0 && <> · next: {nextDays.map(d => `${fmtDay(d.date)} → ${fmtServings(d.servings)}`).join(" · ")}</>}
      </p>

      {s.comments.length > 0 && (
        <div style={{ margin: "8px 0 0" }}>
          {s.comments.map((c, i) => (
            <p key={i} style={{ margin: "0 0 2px", fontSize: 12, color: C.error }}>
              <strong>{c.name}</strong> ({fmtDay(c.date)}, {fmtServings(c.servings)}): {c.comment}
            </p>
          ))}
        </div>
      )}

      <>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "10px 0 8px" }}>
            {!covered && option("must", `Today only · ${fmtServings(s.must_cook.servings)}`, "Just what's needed now")}
            {hasExtra && option("suggested", `Through ${fmtDay(s.suggested.through)} · ${fmtServings(s.suggested.servings)}`, `Keeps ${s.fridge_days}d in the fridge`)}
            {s.freeze && option("freeze", `+ freeze · ${fmtServings(planServings(s, "freeze"))}`, `Extra ${fmtServings(s.freeze.servings)} frozen through ${fmtDay(s.freeze.through)}`)}
            <label style={{
              display: "flex", gap: 6, alignItems: "center", cursor: "pointer", padding: "6px 9px", borderRadius: 8,
              border: `1px solid ${plan === "custom" ? C.teal : C.border}`, background: plan === "custom" ? "#eef6f6" : C.white, flex: "1 1 150px",
            }}>
              <input type="radio" checked={plan === "custom"} onChange={() => setPlan("custom")} />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: C.primary }}>My amount</span>
              <input
                type="number" step="any" min="0" inputMode="decimal" value={customText}
                onFocus={() => setPlan("custom")}
                onChange={e => onChoice({ customText: e.target.value, plan: "custom" })}
                style={{ width: 72, padding: "4px 7px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13 }}
              />
              <span style={{ fontSize: 11.5, color: C.light }}>servings</span>
            </label>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "4px 0" }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: C.primary }}>Ingredients for {fmtServings(planServings(s, plan, custom))} servings</p>
            <CopyListButton label="Copy" text={ingredients.map(i => `${i.name}: ${fmtQty(i)}`).join("\n")} />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 14px", fontSize: 12, color: C.muted }}>
            {ingredients.map(i => <span key={i.ingredient_id}>{i.name}: <strong style={{ color: C.primary }}>{fmtQty(i)}</strong></span>)}
          </div>
      </>

      {s.stock.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 10 }}>
          {s.stock.map(b => (
            <StockRow key={b.batch_id} b={b} s={s} onPortion={(ids, batchId) => onPortion(s, ids, batchId)} onClose={onCloseBatch} />
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
        {!logging && (
          <button
            onClick={() => setLogging(true)}
            style={{ background: C.primary, color: C.white, border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
          >
            Cooked ✓ log batch
          </button>
        )}
        {s.instructions && (
          <button onClick={() => setShowInstr(v => !v)} style={{ background: "transparent", border: "none", padding: 0, color: C.muted, fontSize: 11.5, fontWeight: 600, textDecoration: "underline", cursor: "pointer" }}>
            {showInstr ? "Hide instructions" : "Instructions"}
          </button>
        )}
      </div>
      {showInstr && s.instructions && (
        <p style={{ margin: "6px 0 0", padding: "8px 10px", background: C.offWhite, borderRadius: 8, fontSize: 12, lineHeight: 1.5, color: C.muted, whiteSpace: "pre-wrap" }}>
          {s.instructions}
        </p>
      )}
      {logging && <LogBatchForm s={s} plan={plan} custom={custom} cookDate={cookDate} onDone={() => setLogging(false)} />}
    </div>
  );
}

function SectionHeading({ id, title, sub }: { id?: string; title: string; sub?: string }) {
  return (
    <div id={id} style={{ margin: "22px 0 8px", scrollMarginTop: 12 }}>
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.primary }}>{title}</h2>
      {sub && <p style={{ margin: "2px 0 0", fontSize: 12, color: C.light }}>{sub}</p>}
    </div>
  );
}

export default function KitchenDayBoard({ day }: { day: KitchenDay }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [panel, setPanel] = useState<{ targets: PortionTarget[]; batchId?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCovered, setShowCovered] = useState(false);
  const [showAhead, setShowAhead] = useState(false);
  const [showPrep, setShowPrep] = useState(false);
  const [choices, setChoices] = useState<Map<number, Choice>>(new Map());
  const choiceFor = (s: KitchenSubrecipe) => choices.get(s.subrecipe_id) ?? defaultChoice(s);
  function patchChoice(s: KitchenSubrecipe, patch: Partial<Choice>) {
    setChoices(prev => new Map(prev).set(s.subrecipe_id, { ...(prev.get(s.subrecipe_id) ?? defaultChoice(s)), ...patch }));
  }

  const subs = day.subrecipes;
  const needsToday = (s: KitchenSubrecipe) => s.must_cook.servings > 0.01;
  const cook = subs.filter(s => s.prep_type === "cook" && needsToday(s));
  const assemble = subs.filter(s => s.prep_type === "assemble" && needsToday(s));
  const ready = subs.filter(s => s.prep_type === "ready" && s.today.servings > 0);
  const covered = subs.filter(s => s.prep_type !== "ready" && !needsToday(s) && s.today.servings > 0);
  const ahead = subs.filter(s => s.prep_type !== "ready" && !needsToday(s) && s.today.servings <= 0 && (s.suggested.servings > 0 || s.stock.length > 0));
  const prepLines = buildPrepLines([...cook, ...assemble], s => {
    const c = choiceFor(s);
    return planIngredients(s, c.plan, choiceCustom(c));
  });
  const expired = subs.flatMap(s => s.stock.filter(b => b.expired && b.remaining > 0.01).map(b => ({ s, b })));

  function jumpTo(id: string) {
    if (id === "sec-covered") setShowCovered(true);
    if (id === "sec-ahead") setShowAhead(true);
    if (id === "sec-prep") setShowPrep(true);
    // Let a just-expanded section render before scrolling to it.
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: "start" }), 0);
  }

  function openPortion(s: KitchenSubrecipe, mpdrIds: number[], batchId?: number) {
    setPanel({ targets: [{ subrecipeId: s.subrecipe_id, name: s.name, mpdrIds }], batchId });
  }

  function onCloseBatch(b: KitchenStockBatch, status: "finished" | "discarded") {
    const msg = status === "discarded"
      ? `Throw away the ${fmtServings(Math.max(b.remaining, 0))} servings left in this batch?`
      : "Mark this batch as used up?";
    if (!window.confirm(msg)) return;
    setError(null);
    startTransition(async () => {
      try {
        await closeBatch(b.batch_id, status, status === "discarded" ? Math.max(b.remaining, 0) : undefined);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't update the batch.");
      }
    });
  }

  const card = (s: KitchenSubrecipe) => (
    <CookCard
      key={s.subrecipe_id} s={s} cookDate={day.cook_date}
      choice={choiceFor(s)} onChoice={patch => patchChoice(s, patch)}
      onPortion={openPortion} onCloseBatch={onCloseBatch}
    />
  );

  if (subs.length === 0) {
    return <p style={{ fontSize: 13, color: C.light, margin: 0 }}>Nothing ordered for {fmtDay(day.cook_date)} and nothing in stock.</p>;
  }

  return (
    <>
      {error && <p style={{ margin: "0 0 10px", fontSize: 12.5, color: C.error }}>{error}</p>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[
          { id: "sec-cook", n: cook.length, label: "to cook" },
          { id: "sec-assemble", n: assemble.length, label: "to assemble" },
          { id: "sec-prep", n: prepLines.length, label: "prep list" },
          { id: "sec-ready", n: ready.length, label: "ready-made" },
          { id: "sec-covered", n: covered.length, label: "already cooked" },
          { id: "sec-ahead", n: ahead.length, label: "not needed today" },
          ...(day.next_cook_date ? [{ id: "sec-tomorrow", n: null, label: `next day · ${fmtDay(day.next_cook_date)}` }] : []),
        ].map(x => (
          <button
            key={x.id}
            onClick={() => jumpTo(x.id)}
            disabled={x.n === 0}
            style={{
              flex: "1 1 100px", textAlign: "left", background: C.white, border: `1px solid ${C.border}`, borderRadius: 12,
              padding: "10px 12px", cursor: x.n === 0 ? "default" : "pointer", opacity: x.n === 0 ? 0.5 : 1,
            }}
          >
            <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: C.primary }}>{x.n ?? "→"}</p>
            <p style={{ margin: 0, fontSize: 11.5, color: C.light }}>{x.label} ↓</p>
          </button>
        ))}
      </div>

      {expired.length > 0 && (
        <div style={{ marginTop: 14, background: "#fdecea", border: `1px solid ${C.error}40`, borderRadius: 12, padding: "10px 12px" }}>
          <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 700, color: C.error }}>Past use-by: check and throw away</p>
          {expired.map(({ s, b }) => (
            <p key={b.batch_id} style={{ margin: 0, fontSize: 12, color: C.muted }}>
              {s.name}: {fmtServings(b.remaining)} servings ({b.storage}, use by {fmtDay(b.use_by)})
            </p>
          ))}
        </div>
      )}

      {cook.length > 0 && (
        <>
          <SectionHeading id="sec-cook" title="Cook" sub="Pick how far ahead to cook. Batches that keep cover the next days, so they won't come back tomorrow." />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{cook.map(card)}</div>
        </>
      )}

      {assemble.length > 0 && (
        <>
          <SectionHeading id="sec-assemble" title="Assemble" sub="No cooking: salads, dressings, spreads. Good jobs for your helper." />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{assemble.map(card)}</div>
        </>
      )}

      {prepLines.length > 0 && (
        <>
          <button id="sec-prep" onClick={() => setShowPrep(v => !v)} style={{ scrollMarginTop: 12, display: "block", textAlign: "left", background: "transparent", border: "none", padding: 0, margin: "22px 0 2px", cursor: "pointer", fontSize: 15, fontWeight: 700, color: C.primary }}>
            {showPrep ? "▾" : "▸"} Prep list for what you picked ({prepLines.length} ingredients)
          </button>
          <p style={{ margin: "0 0 8px", fontSize: 12, color: C.light }}>
            Adds up the Cook and Assemble cards above, at the amount chosen on each. Change a card and this updates.
          </p>
          {showPrep && (
            <>
              <div style={{ background: C.offWhite, borderRadius: 10, padding: "8px 12px", marginBottom: 8, fontSize: 12, color: C.muted }}>
                <strong style={{ color: C.primary }}>Based on: </strong>
                {[...cook, ...assemble].map(s => {
                  const c = choiceFor(s);
                  const n = planServings(s, c.plan, choiceCustom(c));
                  const how = c.plan === "must" ? "today" : c.plan === "suggested" ? `through ${fmtDay(s.suggested.through)}` : c.plan === "freeze" ? "+ freeze" : "my amount";
                  return `${s.name} ${fmtServings(n)} (${how})`;
                }).join(" · ")}
              </div>
              <PrepList lines={prepLines} storageKey={`akli-prep-${day.cook_date}`} />
            </>
          )}
        </>
      )}

      {ready.length > 0 && (
        <>
          <SectionHeading id="sec-ready" title="Ready-made: just portion" />
          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: "6px 14px" }}>
            {ready.map(s => (
              <div key={s.subrecipe_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${C.offWhite}`, gap: 8 }}>
                <span style={{ fontSize: 13, color: C.primary }}>{s.name}</span>
                <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: C.muted }}>{fmtServings(s.today.servings)} servings</span>
                  <button style={smallBtn} onClick={() => openPortion(s, s.today.mpdr_ids)}>Portion</button>
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {covered.length > 0 && (
        <>
          <button id="sec-covered" onClick={() => setShowCovered(v => !v)} style={{ scrollMarginTop: 12, background: "transparent", border: "none", padding: 0, margin: "22px 0 8px", cursor: "pointer", fontSize: 15, fontWeight: 700, color: C.primary }}>
            {showCovered ? "▾" : "▸"} Already cooked for today ({covered.length})
          </button>
          {showCovered && <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{covered.map(card)}</div>}
        </>
      )}

      {ahead.length > 0 && (
        <>
          <button id="sec-ahead" onClick={() => setShowAhead(v => !v)} style={{ scrollMarginTop: 12, display: "block", background: "transparent", border: "none", padding: 0, margin: "22px 0 8px", cursor: "pointer", fontSize: 15, fontWeight: 700, color: C.primary }}>
            {showAhead ? "▾" : "▸"} Not needed today: in stock or can cook ahead ({ahead.length})
          </button>
          {showAhead && <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{ahead.map(card)}</div>}
        </>
      )}

      {panel && (
        <PortioningPanel
          targets={panel.targets}
          batchId={panel.batchId}
          onClose={() => setPanel(null)}
          onSaved={() => router.refresh()}
        />
      )}
    </>
  );
}
