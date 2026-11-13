"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { patchItem, useKitchen, useRun } from "./live";
import { defaultAssignee, saveError, unwrap, type PlanItem, type PlanRow, type Person } from "@/lib/kitchenSimple";
import { loadNextDay, savePlan, setIngredientFrozen, setItemDone } from "@/app/admin/kitchen/simple-actions";
import { C } from "../ui";
import { addDays, bigBtn, dayLabel, decimalInput, fmt, linkBtn, qty, r2, weekday } from "./shared";

const now = () => new Date().toISOString();

// ─── 1. Did I cook what was planned? ─────────────────────────────────────────

function CookCheck({ row, item, cookDate }: { row: PlanRow; item: PlanItem; cookDate: string }) {
  const { run, err } = useRun();
  const [diff, setDiff] = useState(false);
  const [made, setMade] = useState(fmt(item.cook));
  const sid = item.subrecipe_id;
  const done = item.done_at != null;
  const cooked = item.cooked ?? item.cook;
  const mark = (n: number | null) => run(() => setItemDone(cookDate, sid, true, n), patchItem(sid, { done_at: now(), cooked: n }));

  return (
    <div style={{ padding: "10px 0", borderTop: `1px solid ${C.offWhite}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ flex: "1 1 160px", fontSize: 15, fontWeight: 700, color: C.primary }}>{row.name}</span>
        {done ? (
          <span style={{ fontSize: 14, fontWeight: 700, color: cooked < item.cook ? "#b45309" : "#1f6f50" }}>
            {cooked <= 0 ? "✗ Didn't cook" : `✓ Cooked ${fmt(cooked)}`}
            {cooked > 0 && cooked !== item.cook && <span style={{ fontWeight: 400, color: C.muted }}> (planned {fmt(item.cook)})</span>}
            {" · "}
            <button onClick={() => run(() => setItemDone(cookDate, sid, false), patchItem(sid, { done_at: null, cooked: null }))} style={linkBtn}>change</button>
          </span>
        ) : (
          <span style={{ fontSize: 13, color: C.muted }}>planned {fmt(item.cook)}</span>
        )}
      </div>
      {!done && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          <button onClick={() => mark(null)} style={bigBtn(true)}>✓ Cooked {fmt(item.cook)}</button>
          <button onClick={() => setDiff(v => !v)} style={bigBtn(false)}>Different amount</button>
          <button onClick={() => mark(0)} style={bigBtn(false)}>Didn&apos;t cook</button>
        </div>
      )}
      {diff && !done && (
        <form onSubmit={e => { e.preventDefault(); const n = parseFloat(made); if (Number.isFinite(n) && n >= 0) { void mark(n); setDiff(false); } }}
          style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8, fontSize: 14, color: C.muted }}>
          I cooked
          <input type="text" inputMode="decimal" value={made} onChange={e => setMade(decimalInput(e.target.value))} onFocus={e => e.target.select()}
            style={{ width: 80, height: 44, padding: "0 10px", border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 16, fontWeight: 700 }} />
          servings
          <button type="submit" style={bigBtn(true)}>Save</button>
        </form>
      )}
      {err && <span style={{ display: "block", marginTop: 4, fontSize: 12.5, color: C.error }}>{err}</span>}
    </div>
  );
}

// ─── 2 & 3. Next cooking day + freezer ───────────────────────────────────────

interface NextDay { cookDate: string; dates: string[]; rows: PlanRow[]; items: PlanItem[] }
interface Line { row: PlanRow; have: number; cook: number; assignee: Person; suggested: number | null }

// Same rules as the Plan tab: the saved plan if there is one, otherwise
// "I have" = what's left from the last saved day, "I cook" = what's missing.
function linesFor(next: NextDay, people: ReturnType<typeof useKitchen>["people"]): Line[] {
  const saved = new Map(next.items.map(i => [i.subrecipe_id, i]));
  const out: Line[] = [];
  for (const row of next.rows) {
    const ready = row.prep_type === "ready";
    const item = saved.get(row.subrecipe_id);
    const have = ready ? 0 : item ? item.have : row.suggested_have ?? 0;
    const cook = ready ? 0 : item ? item.cook : Math.max(0, r2(row.need - have));
    if (row.need > 0 || have > 0 || cook > 0) {
      out.push({ row, have, cook, assignee: item?.assignee ?? defaultAssignee(row, people), suggested: row.suggested_have });
    }
  }
  return out.sort((a, b) => b.cook - a.cook || a.row.name.localeCompare(b.row.name));
}

function NextDayPanel({ next, frozen, onFrozen }: {
  next: NextDay; frozen: Map<number, boolean>; onFrozen: (id: number, v: boolean) => void;
}) {
  const router = useRouter();
  const { people } = useKitchen();
  const [items, setItems] = useState(next.items);
  const view = useMemo(() => ({ ...next, items }), [next, items]);
  const lines = useMemo(() => linesFor(view, people), [view, people]);
  const [saving, startSave] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const planned = items.length > 0;
  const toCook = lines.filter(l => l.cook > 0);

  const isFrozen = (i: { ingredient_id: number; stored_frozen: boolean }) => frozen.get(i.ingredient_id) ?? i.stored_frozen;

  // Every ingredient going into tomorrow's pots, added up.
  const ingredients = useMemo(() => {
    const by = new Map<number, { id: number; name: string; unit: string | null; staple: boolean; stored_frozen: boolean; thaw: number | null; total: number; uses: { name: string; qty: number }[] }>();
    for (const l of toCook) {
      for (const ing of l.row.ingredients_per_serving) {
        const q = ing.quantity * l.cook;
        if (!(q > 0)) continue;
        const e = by.get(ing.ingredient_id) ?? { id: ing.ingredient_id, name: ing.name, unit: ing.unit, staple: ing.is_staple, stored_frozen: ing.stored_frozen, thaw: ing.thaw_hours, total: 0, uses: [] };
        e.total += q;
        e.uses.push({ name: l.row.name, qty: q });
        by.set(ing.ingredient_id, e);
      }
    }
    return [...by.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [toCook]);
  const freezer = ingredients.filter(i => isFrozen({ ingredient_id: i.id, stored_frozen: i.stored_frozen }));
  const notStaple = ingredients.filter(i => !i.staple);

  function saveAsPlan() {
    setErr(null);
    startSave(async () => {
      try {
        const fresh = unwrap(await savePlan(next.cookDate, lines.map(l => ({
          subrecipe_id: l.row.subrecipe_id, need: l.row.need, have: l.have, cook: l.cook, assignee: l.assignee,
        })), []));
        setItems(fresh.items);
      } catch (e) {
        setErr(saveError(e));
      }
    });
  }

  return (
    <>
      <Card n={2} title={`${dayLabel(next.cookDate)}: what to cook`}
        sub={planned ? "From the saved plan for that day." : "Not planned yet: suggested from what's left today."}>
        {toCook.length === 0 && <p style={{ margin: "4px 0", fontSize: 13.5, color: C.muted }}>Nothing to cook that day: what&apos;s left covers it.</p>}
        {lines.map(l => {
          const stale = planned && l.suggested != null && Math.abs(l.suggested - l.have) > 0.01;
          // Only what needs cooking (or a plan that no longer matches what's left).
          if (l.cook <= 0 && !stale) return null;
          return (
            <div key={l.row.subrecipe_id} style={{ padding: "8px 0", borderTop: `1px solid ${C.offWhite}`, fontSize: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ color: C.primary, fontWeight: 700 }}>{l.row.name}</span>
                <strong style={{ color: l.cook > 0 ? C.primary : C.light, whiteSpace: "nowrap" }}>{l.cook > 0 ? `cook ${fmt(l.cook)}` : "nothing to cook"}</strong>
              </div>
              <span style={{ fontSize: 12.5, color: C.muted }}>
                needs {fmt(l.row.need)} · have {fmt(l.have)}
              </span>
              {stale && (
                <span style={{ display: "block", fontSize: 12.5, color: "#b45309", fontWeight: 700 }}>
                  ⚠️ Left now: {fmt(l.suggested ?? 0)}, the plan says {fmt(l.have)}. Fix it in the plan.
                </span>
              )}
            </div>
          );
        })}
        {lines.length > toCook.length && (
          <p style={{ margin: "6px 0 0", fontSize: 12.5, color: C.muted }}>
            + {lines.length - toCook.length} more covered by what&apos;s left or bought ready.
          </p>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
          {!planned && lines.length > 0 && (
            <button onClick={saveAsPlan} disabled={saving} style={{ ...bigBtn(true), opacity: saving ? 0.6 : 1 }}>
              {saving ? "Saving…" : `Save as ${weekday(next.cookDate)}'s plan`}
            </button>
          )}
          {planned && <span style={{ fontSize: 13, color: "#1f6f50", fontWeight: 700 }}>✓ Plan saved</span>}
          <button onClick={() => router.push(`/admin/kitchen?date=${next.cookDate}&tab=plan`)} style={bigBtn(false)}>
            {planned ? "Change the plan →" : "Adjust in the plan →"}
          </button>
        </div>
        {err && <span style={{ display: "block", marginTop: 6, fontSize: 12.5, color: C.error }}>{err}</span>}
      </Card>

      <Card n={3} title="❄️ Take out of the freezer tonight" sub={`For ${dayLabel(next.cookDate)}'s cooking.`}>
        {freezer.length === 0 ? (
          <p style={{ margin: "4px 0", fontSize: 13.5, color: C.muted }}>
            {toCook.length === 0 ? "Nothing to cook, nothing to take out." : "Nothing marked as frozen yet. Tick below which ingredients live in the freezer."}
          </p>
        ) : freezer.map((e, i) => (
          <div key={e.id} style={{ padding: "8px 0", borderTop: i === 0 ? "none" : `1px solid ${C.offWhite}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 16 }}>
              <span style={{ color: C.primary, fontWeight: 800 }}>{e.name}</span>
              <strong style={{ color: C.primary, whiteSpace: "nowrap", fontSize: 17 }}>{qty(e.total, e.unit)}</strong>
            </div>
            {e.uses.map(u => (
              <div key={u.name} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12.5, color: C.muted, paddingLeft: 10, marginTop: 2 }}>
                <span>{u.name}</span><span style={{ whiteSpace: "nowrap" }}>{qty(u.qty, e.unit)}</span>
              </div>
            ))}
            {e.thaw != null && e.thaw > 0 && <span style={{ fontSize: 12, color: "#24507f" }}>Needs about {fmt(e.thaw)} h to thaw</span>}
          </div>
        ))}
        {notStaple.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <button onClick={() => setSetupOpen(v => !v)} style={linkBtn}>
              {setupOpen ? "Hide" : "Which ingredients live in the freezer?"}
            </button>
            {(setupOpen || (freezer.length === 0 && toCook.length > 0)) && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                {notStaple.map(e => <FrozenChip key={e.id} id={e.id} name={e.name} on={isFrozen({ ingredient_id: e.id, stored_frozen: e.stored_frozen })} onChange={onFrozen} />)}
              </div>
            )}
          </div>
        )}
      </Card>
    </>
  );
}

function FrozenChip({ id, name, on, onChange }: { id: number; name: string; on: boolean; onChange: (id: number, v: boolean) => void }) {
  const [err, setErr] = useState(false);
  return (
    <button
      onClick={async () => {
        setErr(false);
        onChange(id, !on);
        try { unwrap(await setIngredientFrozen(id, !on)); } catch { setErr(true); onChange(id, on); }
      }}
      style={{
        minHeight: 38, padding: "0 12px", borderRadius: 19, fontSize: 13, fontWeight: 700, cursor: "pointer",
        background: on ? "#e6eef9" : C.white, color: on ? "#24507f" : C.primary,
        border: `1.5px solid ${err ? C.error : on ? "#24507f" : C.border}`,
      }}>
      {on ? "❄️ " : ""}{name}
    </button>
  );
}

function Card({ n, title, sub, children }: { n: number; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: "12px 14px", marginBottom: 12 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "baseline", marginBottom: 4 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: C.light }}>{n}</span>
        <span>
          <span style={{ display: "block", fontSize: 16, fontWeight: 800, color: C.primary }}>{title}</span>
          {sub && <span style={{ display: "block", fontSize: 12.5, color: C.muted }}>{sub}</span>}
        </span>
      </div>
      {children}
    </section>
  );
}

// End of the day: confirm what really got cooked, then see the next cooking
// day's plan (built on what's actually left) and what to take out of the freezer.
export default function WrapUpTab({ cookDate, rows, items }: { cookDate: string; rows: PlanRow[]; items: PlanItem[] }) {
  const rowBy = new Map(rows.map(r => [r.subrecipe_id, r]));
  const cooking = items.filter(i => i.cook > 0 && rowBy.has(i.subrecipe_id))
    .sort((a, b) => Number(a.done_at != null) - Number(b.done_at != null) || rowBy.get(a.subrecipe_id)!.name.localeCompare(rowBy.get(b.subrecipe_id)!.name));
  const open = cooking.filter(i => i.done_at == null).length;

  const [nextDate, setNextDate] = useState(addDays(cookDate, 1));
  const [next, setNext] = useState<NextDay | null>(null);
  const [loading, startLoad] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  // Freezer ticks made here, ahead of a reload.
  const [frozen, setFrozen] = useState<Map<number, boolean>>(new Map());

  function load(date: string) {
    setErr(null);
    setNextDate(date);
    startLoad(async () => {
      try { setNext(unwrap(await loadNextDay(date))); } catch (e) { setErr(saveError(e)); }
    });
  }

  return (
    <div style={{ paddingBottom: 60 }}>
      <p style={{ margin: "0 0 10px", fontSize: 12.5, color: C.muted }}>
        At the end of the day: say what really got cooked, then see the next day&apos;s cooking and what to take out of the freezer.
      </p>

      <Card n={1} title="Did you cook what was planned?" sub={cooking.length === 0 ? undefined : open ? `${open} still to confirm` : "All confirmed ✓"}>
        {cooking.length === 0
          ? <p style={{ margin: "4px 0", fontSize: 13.5, color: C.muted }}>Nothing was planned to cook today.</p>
          : cooking.map(i => <CookCheck key={i.subrecipe_id} row={rowBy.get(i.subrecipe_id)!} item={i} cookDate={cookDate} />)}
      </Card>

      {!next || loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "stretch", marginBottom: 12 }}>
          {open > 0 && !loading && (
            <span style={{ fontSize: 13, color: "#b45309", fontWeight: 700 }}>
              {open} not confirmed yet: they count as cooked as planned.
            </span>
          )}
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button onClick={() => setNextDate(addDays(nextDate, -1))} disabled={loading || nextDate <= addDays(cookDate, 1)} aria-label="Earlier day" style={navBtn}>‹</button>
            <button onClick={() => load(nextDate)} disabled={loading} style={{ ...bigBtn(true), flex: 1, opacity: loading ? 0.6 : 1 }}>
              {loading ? "Working it out…" : `Next: ${dayLabel(nextDate)} →`}
            </button>
            <button onClick={() => setNextDate(addDays(nextDate, 1))} disabled={loading} aria-label="Later day" style={navBtn}>›</button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 14, marginBottom: 6 }}>
            <button onClick={() => setNext(null)} style={linkBtn}>Another day</button>
            <button onClick={() => load(next.cookDate)} style={linkBtn}>↻ Recalculate</button>
          </div>
          <NextDayPanel key={`${next.cookDate}-${next.items.length}`} next={next} frozen={frozen}
            onFrozen={(id, v) => setFrozen(m => new Map(m).set(id, v))} />
        </>
      )}
      {err && <p style={{ fontSize: 13, color: C.error }}>{err}</p>}
    </div>
  );
}

const navBtn = {
  width: 46, height: 46, borderRadius: 10, border: `1px solid ${C.border}`, background: C.white,
  fontSize: 22, color: C.primary, cursor: "pointer", flexShrink: 0,
} as const;
