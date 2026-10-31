"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { TeamMember } from "@/lib/kitchenPlan";
import { saveDayAssign, saveDayTeam } from "@/app/admin/kitchen/actions";
import { C } from "../ui";
import { fmtServings } from "./format";

const COLORS = [
  { bg: "#f1ece8", fg: "#5c3b1e" },
  { bg: "#e6f2f2", fg: "#2f6a6a" },
  { bg: "#ece8f4", fg: "#4b3a78" },
  { bg: "#fbf0dc", fg: "#8a5a00" },
  { bg: "#e7f1e4", fg: "#2f5e28" },
  { bg: "#f6e6ea", fg: "#8a2f45" },
];

export function personColor(team: TeamMember[], id: string | undefined) {
  const i = team.findIndex(m => m.id === id);
  return i < 0 ? { bg: "#f2f2f2", fg: C.light } : COLORS[i % COLORS.length];
}

export const hours = (m: TeamMember) => (m.from || m.to ? `${m.from || "?"}–${m.to || "?"}` : "");

// Same JSON whatever order the keys come back in (jsonb reorders them).
const canon = (v: unknown) => JSON.stringify(v, (_k, x) =>
  x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([p], [q]) => p.localeCompare(q))) : x);

// Edits show at once and are saved in the background. Only the latest value
// is sent: while one save runs, newer edits wait and only the last one goes.
// The page refreshes once when everything is saved. The server's value is
// taken only when it changed elsewhere (another phone), never mid-save.
function useLatestSave<T>(serverValue: T, save: (v: T) => Promise<unknown>) {
  const router = useRouter();
  const [value, setValue] = useState<T>(serverValue);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const busy = useRef(false);
  const queued = useRef<{ v: T } | null>(null);
  const sent = useRef(canon(serverValue));
  const serverKey = canon(serverValue);
  useEffect(() => {
    if (!busy.current && serverKey !== sent.current) { sent.current = serverKey; setValue(JSON.parse(serverKey)); }
  }, [serverKey]);

  function commit(next: T, toSave: T = next) {
    setValue(next);
    setErr(null);
    queued.current = { v: toSave };
    sent.current = canon(toSave);
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    (async () => {
      try {
        while (queued.current) {
          const { v } = queued.current;
          queued.current = null;
          await save(v);
        }
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Couldn't save.");
      } finally {
        busy.current = false;
        setSaving(false);
      }
    })();
  }
  return { value, setValue, commit, saving, err };
}

const newId = () => Math.random().toString(36).slice(2, 10);
const timeInput = { height: 40, padding: "0 6px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13.5, color: C.primary, background: C.white };

// Who's in the kitchen today, with arrival and departure. Saved on every
// change; a new day starts from the last day's team.
export function TeamEditor({ cookDate, team }: { cookDate: string; team: TeamMember[] }) {
  const { value: rows, setValue: setRows, commit, saving: pending, err } = useLatestSave(team, t => saveDayTeam(cookDate, t));

  function save(next: TeamMember[]) {
    commit(next, next.filter(m => m.name.trim()).map(m => ({ ...m, name: m.name.trim() })));
  }
  const edit = (id: string, patch: Partial<TeamMember>) => setRows(rs => rs.map(m => (m.id === id ? { ...m, ...patch } : m)));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.primary }}>Who’s in today ({rows.filter(m => m.name.trim()).length})</h2>
        {pending && <span style={{ fontSize: 12, color: C.light }}>Saving…</span>}
      </div>
      <p style={{ margin: "2px 0 8px", fontSize: 12, color: C.muted }}>Names and hours. Then give each task to someone below.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map(m => {
          const col = personColor(rows, m.id);
          return (
            <div key={m.id} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", border: `1px solid ${C.border}`, borderLeft: `4px solid ${col.fg}`, borderRadius: 10, padding: "6px 8px" }}>
              <span style={{ display: "flex", gap: 4, alignItems: "center", flex: "1 1 200px", minWidth: 0 }}>
                <input value={m.name} placeholder="Name" onChange={e => edit(m.id, { name: e.target.value })} onBlur={() => save(rows)}
                  style={{ ...timeInput, flex: 1, minWidth: 0, padding: "0 10px", fontWeight: 600 }} />
                <button aria-label={`Remove ${m.name || "person"}`} onClick={() => save(rows.filter(x => x.id !== m.id))}
                  style={{ width: 36, height: 40, flexShrink: 0, border: "none", background: "none", color: C.light, fontSize: 18, cursor: "pointer" }}>×</button>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: C.muted, flex: "0 0 auto" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  in <input type="time" value={m.from} onChange={e => save(rows.map(x => (x.id === m.id ? { ...x, from: e.target.value } : x)))} style={timeInput} />
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  out <input type="time" value={m.to} onChange={e => save(rows.map(x => (x.id === m.id ? { ...x, to: e.target.value } : x)))} style={timeInput} />
                </label>
              </span>
            </div>
          );
        })}
      </div>
      <button onClick={() => setRows(rs => [...rs, { id: newId(), name: "", from: "", to: "" }])}
        style={{ marginTop: 6, minHeight: 40, padding: "0 12px", borderRadius: 8, border: `1px dashed ${C.border}`, background: C.white, color: C.primary, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
        + Add a person
      </button>
      {err && <p style={{ margin: "6px 0 0", fontSize: 12, color: C.error }}>{err}</p>}
    </div>
  );
}

export interface AssignableTask { key: string; name: string; amount: number; type: string }

// Every task of the day with one chip per person: tap to give it to them,
// tap again to take it back. Saved straight away.
export function WhoDoesWhat({ cookDate, team, assign, tasks }: {
  cookDate: string; team: TeamMember[]; assign: Record<string, string>; tasks: AssignableTask[];
}) {
  const { value: local, commit, err } = useLatestSave(assign, a => saveDayAssign(cookDate, a));

  const people = team.filter(m => m.name.trim());
  if (people.length === 0) {
    return <p style={{ margin: 0, fontSize: 12.5, color: C.muted }}>Add who’s in today above, then give each task to someone here.</p>;
  }

  function give(keys: string[], personId: string | null) {
    const next = { ...local };
    for (const k of keys) { if (personId) next[k] = personId; else delete next[k]; }
    commit(next);
  }

  const who = (k: string) => (people.some(m => m.id === local[k]) ? local[k] : undefined);
  const left = tasks.filter(t => !who(t.key));

  return (
    <div>
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.primary }}>Who does what</h2>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "6px 0 8px" }}>
        {people.map(m => {
          const col = personColor(team, m.id);
          const n = tasks.filter(t => who(t.key) === m.id).length;
          return (
            <span key={m.id} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 20, background: col.bg, color: col.fg, fontWeight: 600 }}>
              {m.name}{hours(m) ? ` · ${hours(m)}` : ""} · {n} task{n === 1 ? "" : "s"}
            </span>
          );
        })}
        <span style={{ fontSize: 12, padding: "4px 10px", borderRadius: 20, background: left.length ? "#fdecea" : "#f2f2f2", color: left.length ? C.error : C.light, fontWeight: 600 }}>
          {left.length} not given yet
        </span>
      </div>
      {left.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 8, fontSize: 12, color: C.muted }}>
          Give the {left.length} left to
          {people.map(m => (
            <button key={m.id} onClick={() => give(left.map(t => t.key), m.id)}
              style={{ minHeight: 36, padding: "0 10px", borderRadius: 20, border: `1px solid ${C.border}`, background: C.white, color: C.primary, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              {m.name}
            </button>
          ))}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {tasks.map((t, i) => (
          <div key={t.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "6px 0", borderTop: i ? `1px solid ${C.offWhite}` : "none" }}>
            <span style={{ fontSize: 13, color: C.primary, minWidth: 0, flex: "1 1 160px" }}>
              {t.name} <span style={{ color: C.light, fontSize: 12 }}>· {t.type}{t.amount > 0 ? ` · ${fmtServings(t.amount)}` : ""}</span>
            </span>
            <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {people.map(m => {
                const on = who(t.key) === m.id;
                const col = personColor(team, m.id);
                return (
                  <button key={m.id} onClick={() => give([t.key], on ? null : m.id)} aria-pressed={on}
                    style={{ minHeight: 36, padding: "0 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
                      background: on ? col.fg : C.white, color: on ? C.white : col.fg, border: `1px solid ${on ? col.fg : "#d8d1ca"}` }}>
                    {m.name}
                  </button>
                );
              })}
            </span>
          </div>
        ))}
      </div>
      {err && <p style={{ margin: "6px 0 0", fontSize: 12, color: C.error }}>{err}</p>}
    </div>
  );
}
