"use client";

import Link from "next/link";
import type { KitchenWeek, KitchenWeekRow } from "@/lib/flask";
import { C } from "../ui";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dow(iso: string) {
  return new Date(`${iso}T00:00:00`).getDay();
}

function label(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric" });
}

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function fmt(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "");
}

export interface Session { date: string; covers: string[]; servings: number; frozen: number }

// Same rule as the cook list (services/kitchen_service.py): a batch cooked on
// a cook day covers until the day before the next cook day, as long as the
// dish keeps in the fridge; days past that go in the freezer when it
// freezes, otherwise they need their own session. No stock is counted here.
export function planSessions(row: KitchenWeekRow, dates: string[], cookDays: number[]): Session[] {
  const isCook = (d: string) => cookDays.length === 0 || cookDays.includes(dow(d));
  const needed = dates.filter(d => (row.by_date[d] ?? 0) > 0);
  const sessions: Session[] = [];
  let i = 0;
  while (i < needed.length) {
    const first = needed[i];
    // Cook on the latest cook day at or before the first open day (within
    // the week), else on that day itself.
    let cookOn = first;
    for (let back = 0; back <= 6; back++) {
      const d = addDays(first, -back);
      if (d < dates[0]) break;
      if (isCook(d)) { cookOn = d; break; }
    }
    const nextCook = dates.find(d => d > cookOn && isCook(d) && cookDays.length > 0);
    const windowEnd = nextCook ? addDays(nextCook, -1) : dates[dates.length - 1];
    const fridgeEnd = addDays(cookOn, row.fridge_days ?? 0);
    const freezeEnd = row.freezer_days != null ? addDays(cookOn, row.freezer_days) : null;
    const covers: string[] = [];
    let servings = 0;
    let frozen = 0;
    while (i < needed.length) {
      const d = needed[i];
      const inFridge = d <= fridgeEnd && d <= (cookDays.length ? windowEnd : fridgeEnd);
      const inFreezer = !inFridge && freezeEnd != null && d <= freezeEnd && d <= windowEnd && cookDays.length > 0;
      if (!inFridge && !inFreezer) break;
      covers.push(d);
      servings += row.by_date[d];
      if (inFreezer) frozen += row.by_date[d];
      i++;
    }
    if (covers.length === 0) {
      // Doesn't keep long enough to be cooked ahead: cook on the day.
      covers.push(first);
      servings += row.by_date[first];
      i++;
      sessions.push({ date: first, covers, servings, frozen });
      continue;
    }
    sessions.push({ date: cookOn, covers, servings, frozen });
  }
  return sessions;
}

export default function WeekBoard({ week }: { week: KitchenWeek }) {
  const cookDays = week.settings.cook_days;
  const rows = week.subrecipes.filter(r => r.prep_type !== "ready");
  const plans = new Map(rows.map(r => [r.subrecipe_id, planSessions(r, week.dates, cookDays)]));
  const daily = rows.reduce((n, r) => n + week.dates.filter(d => (r.by_date[d] ?? 0) > 0).length, 0);
  const batched = [...plans.values()].reduce((n, p) => n + p.length, 0);
  const sessionsByDay = new Map(week.dates.map(d => [d, 0]));
  for (const p of plans.values()) for (const s of p) sessionsByDay.set(s.date, (sessionsByDay.get(s.date) ?? 0) + 1);

  const th = { padding: "6px 6px", fontSize: 11, color: C.light, fontWeight: 600, textAlign: "right" as const, whiteSpace: "nowrap" as const };
  const td = { padding: "6px 6px", fontSize: 12, textAlign: "right" as const, borderTop: `1px solid ${C.offWhite}` };

  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ flex: "1 1 140px", background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px" }}>
          <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: C.primary }}>{batched}</p>
          <p style={{ margin: 0, fontSize: 11.5, color: C.light }}>cook sessions this week{cookDays.length ? ` (${cookDays.map(d => DAYS[d]).join("/")})` : ""}</p>
        </div>
        <div style={{ flex: "1 1 140px", background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px" }}>
          <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: C.muted }}>{daily}</p>
          <p style={{ margin: 0, fontSize: 11.5, color: C.light }}>if you cooked every dish every day</p>
        </div>
      </div>
      {cookDays.length === 0 && (
        <p style={{ margin: "0 0 10px", fontSize: 12.5, color: "#b45309" }}>
          No cook days set yet, so this assumes you can cook any day. Set them on <Link href="/admin/kitchen" style={{ color: C.tealDark }}>Kitchen Day</Link> (Change, next to “Cook days”).
        </p>
      )}
      <p style={{ margin: "0 0 10px", fontSize: 12, color: C.light }}>
        Ordered servings per day. Orders can still come in from {label(week.open_from)}, so later days may grow. Stock already cooked isn&apos;t counted here.
      </p>

      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "left", position: "sticky", left: 0, background: C.white }}>Dish</th>
              {week.dates.map(d => {
                const cook = cookDays.includes(dow(d));
                return (
                  <th key={d} style={{ ...th, background: cook ? "#eef6f6" : undefined, color: cook ? C.tealDark : C.light }}>
                    {label(d)}{cook && " 🔪"}
                    <div style={{ fontSize: 10, fontWeight: 400 }}>{sessionsByDay.get(d) ? `${sessionsByDay.get(d)} to cook` : ""}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const sessions = plans.get(r.subrecipe_id) ?? [];
              const cookOn = new Map(sessions.map(s => [s.date, s]));
              return (
                <tr key={r.subrecipe_id}>
                  <td style={{ ...td, textAlign: "left", position: "sticky", left: 0, background: C.white, minWidth: 170 }}>
                    <span style={{ color: C.primary, fontWeight: 600 }}>{r.name}</span>
                    <div style={{ fontSize: 10.5, color: C.light }}>
                      keeps {r.fridge_days ?? 0}d{r.freezer_days != null ? " · freezes" : ""}
                    </div>
                    <div style={{ fontSize: 10.5, color: C.tealDark }}>
                      {sessions.map(s => `${label(s.date)}: ${fmt(Math.round(s.servings * 100) / 100)}${s.frozen ? ` (❄️ ${fmt(Math.round(s.frozen * 100) / 100)})` : ""}`).join(" · ")}
                    </div>
                  </td>
                  {week.dates.map(d => {
                    const n = r.by_date[d] ?? 0;
                    const session = cookOn.get(d);
                    return (
                      <td key={d} style={{ ...td, background: session ? "#eef6f6" : undefined, color: n ? C.primary : C.border, fontWeight: session ? 700 : 400 }}>
                        {n ? fmt(n) : "·"}
                        {session && <div style={{ fontSize: 10, color: C.tealDark, fontWeight: 600 }}>cook {fmt(Math.round(session.servings * 100) / 100)}</div>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
