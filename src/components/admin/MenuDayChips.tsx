"use client";

import { useState, useTransition } from "react";
import { C } from "@/components/admin/ui";
import { shortDay } from "@/lib/menuAvailability";

/**
 * Day chips for one dish on a weekly menu. No chip selected = available
 * every day of the menu; selecting chips limits the dish to those dates
 * (weekly_menu_recipe.available_dates). Saves on every click.
 */
export default function MenuDayChips({ dates, initial, onSave }: {
  dates: string[];
  initial: string[] | null;
  onSave: (dates: string[]) => Promise<{ error?: string } | void>;
}) {
  const [selected, setSelected] = useState<string[]>((initial ?? []).map(d => d.slice(0, 10)));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function toggle(date: string) {
    const prev = selected;
    const next = selected.includes(date) ? selected.filter(d => d !== date) : [...selected, date].sort();
    setSelected(next);
    setError(null);
    start(async () => {
      const res = await onSave(next);
      if (res && res.error) { setSelected(prev); setError(res.error); }
    });
  }

  const everyDay = selected.length === 0;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", opacity: pending ? 0.6 : 1 }}>
      {dates.map(d => {
        const on = selected.includes(d);
        return (
          <button key={d} type="button" onClick={() => toggle(d)} disabled={pending}
            style={{
              fontSize: 11, padding: "3px 7px", borderRadius: 6, cursor: pending ? "wait" : "pointer",
              border: `1px solid ${on ? C.primary : C.border}`,
              background: on ? C.primary : C.white, color: on ? C.white : C.muted,
            }}>
            {shortDay(d).replace(/ \w+$/, "")}
          </button>
        );
      })}
      <span style={{ fontSize: 11, color: everyDay ? C.tealDark : C.light, marginLeft: 4 }}>
        {everyDay ? "Every day" : `${selected.length} day${selected.length > 1 ? "s" : ""}`}
      </span>
      {error && <span style={{ fontSize: 11, color: C.error, width: "100%" }}>{error}</span>}
    </div>
  );
}
