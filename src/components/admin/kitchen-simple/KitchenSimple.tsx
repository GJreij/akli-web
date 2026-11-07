"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Equipment, KitchenPerson, PlanItem, PlanRow, PlanStep } from "@/lib/kitchenSimple";
import { createClient } from "@/lib/supabase/client";
import { C } from "../ui";
import PlanTab from "./PlanTab";
import TodayTab from "./TodayTab";
import { KitchenCtx, type Live } from "./live";
import { addDays, dayLabel } from "./shared";

type Tab = "plan" | "today";

export default function KitchenSimple({ cookDate, dates, rows, items: items0, steps: steps0, equipment, people: people0, initialTab }: {
  cookDate: string; dates: string[]; rows: PlanRow[]; items: PlanItem[]; steps: PlanStep[]; equipment: Equipment[];
  people: KitchenPerson[]; initialTab?: Tab;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initialTab ?? (items0.length ? "today" : "plan"));
  const [live, setLive] = useState<Live>({ items: items0, steps: steps0 });
  const [people, setPeople] = useState(people0);
  const [refreshing, startRefresh] = useTransition();

  // A full page refresh (new orders) hands down fresh props.
  useEffect(() => { setLive({ items: items0, steps: steps0 }); }, [items0, steps0]);
  useEffect(() => { setPeople(people0); }, [people0]);

  // Saves can overlap (quick ticks): only the latest re-read lands.
  // A re-read only lands if nothing else started since (a newer read or a
  // new save) and no save is still on its way.
  const seq = useRef(0);
  const inflight = useRef(0);
  const reload = useCallback(async () => {
    const n = ++seq.current;
    try {
      const next = await readLiveInBrowser(cookDate);
      if (n === seq.current && inflight.current === 0) setLive(next);
    } catch { /* keep what's on screen */ }
  }, [cookDate]);
  const [banner, setBanner] = useState<string | null>(null);
  const ctx = useMemo(() => ({
    reload, setPeople, people, patch: (fn: (l: Live) => Live) => setLive(fn),
    begin: () => { inflight.current++; seq.current++; },
    end: () => { inflight.current = Math.max(0, inflight.current - 1); },
    report: (msg: string) => setBanner(msg),
  }), [reload, people]);

  // Both phones share the plan: pick up the other phone's ticks when coming
  // back to the page, and every 30 seconds while it's open.
  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible") void reload(); };
    document.addEventListener("visibilitychange", tick);
    const t = setInterval(tick, 30_000);
    return () => { document.removeEventListener("visibilitychange", tick); clearInterval(t); };
  }, [reload]);

  function pick(t: Tab) {
    setTab(t);
    try { window.history.replaceState(null, "", `?date=${cookDate}&tab=${t}`); } catch { /* ignore */ }
    window.scrollTo({ top: 0 });
  }
  const goDay = (d: string) => router.push(`/admin/kitchen?date=${d}&tab=${tab}`);

  const tabBtn = (t: Tab, n: number, label: string) => (
    <button onClick={() => pick(t)} style={{
      flex: 1, minHeight: 50, borderRadius: 10, border: "none", cursor: "pointer", fontSize: 15, fontWeight: 700,
      background: tab === t ? C.primary : "transparent", color: tab === t ? C.white : C.primary,
    }}>
      <span style={{ opacity: 0.6, marginRight: 6 }}>{n}</span>{label}
    </button>
  );

  return (
    <KitchenCtx.Provider value={ctx}>
      {banner && (
        <div role="alert" style={{
          position: "sticky", top: 0, zIndex: 40, display: "flex", gap: 10, alignItems: "center", marginBottom: 10,
          background: "#fdecea", border: `1px solid ${C.error}`, borderRadius: 10, padding: "10px 12px", color: C.error, fontSize: 13.5, fontWeight: 600,
        }}>
          <span style={{ flex: 1 }}>{banner}</span>
          <button onClick={() => setBanner(null)} aria-label="Close" style={{ background: "none", border: "none", color: "inherit", fontSize: 20, cursor: "pointer" }}>×</button>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <button onClick={() => goDay(addDays(cookDate, -1))} aria-label="Previous day" style={navBtn}>‹</button>
        <label style={{ flex: 1, position: "relative", textAlign: "center", fontSize: 16, fontWeight: 700, color: C.primary, cursor: "pointer" }}>
          {dayLabel(cookDate)}
          <input type="date" value={cookDate} onChange={e => e.target.value && goDay(e.target.value)}
            style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} />
        </label>
        <button onClick={() => goDay(addDays(cookDate, 1))} aria-label="Next day" style={navBtn}>›</button>
      </div>
      <div style={{ textAlign: "center", marginBottom: 10 }}>
        <button onClick={() => startRefresh(() => router.refresh())} disabled={refreshing}
          style={{ background: "none", border: "none", color: C.tealDark, fontSize: 12.5, cursor: "pointer", textDecoration: "underline" }}>
          {refreshing ? "Checking new orders…" : "↻ Check for new orders"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 4, background: C.offWhite, borderRadius: 12, padding: 4, marginBottom: 14 }}>
        {tabBtn("plan", 1, "Plan")}
        {tabBtn("today", 2, "Today")}
      </div>

      {tab === "plan"
        ? <PlanTab cookDate={cookDate} dates={dates} rows={rows} items={live.items} steps={live.steps} onSaved={() => pick("today")} />
        : <TodayTab cookDate={cookDate} rows={rows} items={live.items} steps={live.steps} equipment={equipment} onPlan={() => pick("plan")} />}
    </KitchenCtx.Provider>
  );
}

// Re-read the saved plan straight from Supabase (admin-only by RLS). Not a
// server action: Next.js runs those one at a time, so a background re-read
// would make the next tick or save wait behind it.
async function readLiveInBrowser(cookDate: string): Promise<Live> {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const supabase = createClient() as any;
  const [items, steps] = await Promise.all([
    supabase.from("kitchen_plan_item")
      .select("subrecipe_id, need, have, cook, assignee, cooked, done_at, portioned_at")
      .eq("tenant_id", 1).eq("cook_date", cookDate),
    supabase.from("kitchen_plan_step")
      .select("id, text, assignee, done_at, sort")
      .eq("tenant_id", 1).eq("cook_date", cookDate).order("sort").order("id"),
  ]);
  if (items.error) throw new Error(items.error.message);
  if (steps.error) throw new Error(steps.error.message);
  const num = (x: any) => (x == null ? null : Number(x));
  return {
    items: (items.data ?? []).map((r: any): PlanItem => ({
      subrecipe_id: Number(r.subrecipe_id), need: Number(r.need), have: Number(r.have), cook: Number(r.cook),
      assignee: r.assignee, cooked: num(r.cooked), done_at: r.done_at, portioned_at: r.portioned_at,
    })),
    steps: (steps.data ?? []) as PlanStep[],
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

const navBtn = {
  width: 46, height: 46, borderRadius: 10, border: `1px solid ${C.border}`, background: C.white,
  fontSize: 22, color: C.primary, cursor: "pointer", flexShrink: 0,
} as const;
