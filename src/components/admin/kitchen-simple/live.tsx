"use client";

import { createContext, useContext, useState } from "react";
import { saveError, unwrap, type KitchenPerson, type PlanItem, type PlanStep, type Result } from "@/lib/kitchenSimple";

export interface Live { items: PlanItem[]; steps: PlanStep[] }

interface Ctx {
  // Re-reads the saved plan (lines + steps) without re-fetching the orders.
  reload: () => Promise<void>;
  // Changes what's on screen right away, before the save comes back.
  patch: (fn: (l: Live) => Live) => void;
  people: KitchenPerson[];
  setPeople: (p: KitchenPerson[]) => void;
  // Saves in flight: background re-reads wait until they're all back, so a
  // quick second tick never flickers back.
  begin: () => void;
  end: () => void;
  // Shown at the top of the screen (the row that failed may be hidden).
  report: (msg: string) => void;
}

export const KitchenCtx = createContext<Ctx>({
  reload: async () => {}, patch: () => {}, people: [], setPeople: () => {}, begin: () => {}, end: () => {}, report: () => {},
});

export const useKitchen = () => useContext(KitchenCtx);

export const patchItem = (subrecipeId: number, p: Partial<PlanItem>) => (l: Live): Live => ({
  ...l, items: l.items.map(i => (i.subrecipe_id === subrecipeId ? { ...i, ...p } : i)),
});
export const patchStep = (id: number, p: Partial<PlanStep>) => (l: Live): Live => ({
  ...l, steps: l.steps.map(s => (s.id === id ? { ...s, ...p } : s)),
});

// Run a save. With `optimistic`, the screen changes at once. Only a failed
// save re-reads the plan (to put the screen back to what's really saved):
// re-reading after every tick queued up behind the next tick.
export function useRun() {
  const { reload, patch, begin, end, report } = useKitchen();
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>, optimistic?: (l: Live) => Live) => {
    setErr(null);
    begin();
    if (optimistic) patch(optimistic);
    else setPending(true);
    let failed = false;
    try {
      const r = await fn();
      // Kitchen actions return { ok: false, error } instead of throwing.
      if (r && typeof r === "object" && "ok" in r && (r as Result<unknown>).ok === false) unwrap(r as Result<unknown>);
    } catch (e) {
      failed = true;
      const msg = saveError(e);
      setErr(msg);
      if (optimistic) report(`${msg} The screen shows what's really saved.`);
    } finally {
      setPending(false);
      end();
      if (failed) void reload();
    }
  };
  return { run, pending, err };
}
