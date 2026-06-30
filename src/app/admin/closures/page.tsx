"use client";

import { useState, useEffect, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";

const C = {
  primary: "#063330", teal: "#67b1b0", tealDark: "#437b7b",
  offWhite: "#eee9e6", muted: "#5c5c5c", light: "#9a9a9a",
  border: "#e0dbd5", white: "#ffffff", error: "#c0392b",
  closedBg: "#fff3e8", closedText: "#c45f00", closedBorder: "#f0b87a",
};

type ClosureRow = { id: number; closure_date: string; reason: string | null };

function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

export default function AdminClosuresPage() {
  const [closures, setClosures] = useState<ClosureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDate, setNewDate] = useState("");
  const [newReason, setNewReason] = useState("");
  const [addErr, setAddErr] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const supabase = createClient();

  async function fetchClosures() {
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from("kitchen_closure")
      .select("id, closure_date, reason")
      .gte("closure_date", today)
      .order("closure_date", { ascending: true });
    setClosures((data ?? []) as ClosureRow[]);
    setLoading(false);
  }

  useEffect(() => { fetchClosures(); }, []);

  async function handleAdd() {
    if (!newDate) { setAddErr("Please pick a date."); return; }
    setAddErr(null);
    startTransition(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("kitchen_closure") as any)
        .insert({ closure_date: newDate, reason: newReason.trim() || null });
      if (error) { setAddErr(error.message); return; }
      setNewDate("");
      setNewReason("");
      await fetchClosures();
    });
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Remove this closure date?")) return;
    startTransition(async () => {
      await supabase.from("kitchen_closure").delete().eq("id", id);
      await fetchClosures();
    });
  }

  return (
    <div style={{ padding: "24px 20px 60px" }}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 500, color: C.primary, margin: "0 0 6px" }}>
          Kitchen Closures
        </h1>
        <p style={{ fontSize: 13, color: C.muted, margin: "0 0 24px" }}>
          Dates marked here will appear on the ordering calendar so customers know the kitchen is closed.
        </p>

        {/* Add form */}
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 18px", marginBottom: 24 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: C.primary, margin: "0 0 14px" }}>Add closure date</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 140px" }}>
              <label style={{ fontSize: 11.5, color: C.muted, display: "block", marginBottom: 4 }}>Date</label>
              <input
                type="date"
                value={newDate}
                onChange={e => setNewDate(e.target.value)}
                style={{
                  width: "100%", padding: "9px 11px", borderRadius: 8, border: `1px solid ${C.border}`,
                  fontSize: 13, outline: "none", background: C.white, color: C.primary,
                }}
              />
            </div>
            <div style={{ flex: "2 1 200px" }}>
              <label style={{ fontSize: 11.5, color: C.muted, display: "block", marginBottom: 4 }}>Reason (optional)</label>
              <input
                type="text"
                value={newReason}
                onChange={e => setNewReason(e.target.value)}
                placeholder="e.g. Public holiday"
                style={{
                  width: "100%", padding: "9px 11px", borderRadius: 8, border: `1px solid ${C.border}`,
                  fontSize: 13, outline: "none", background: C.white,
                }}
              />
            </div>
            <button
              onClick={handleAdd}
              disabled={isPending || !newDate}
              style={{
                flexShrink: 0, padding: "9px 20px", borderRadius: 8, border: "none",
                background: newDate ? C.primary : C.border, color: C.white,
                fontSize: 13, fontWeight: 600, cursor: newDate ? "pointer" : "default",
              }}
            >
              {isPending ? "Saving…" : "Add"}
            </button>
          </div>
          {addErr && <p style={{ fontSize: 12, color: C.error, margin: "8px 0 0" }}>{addErr}</p>}
        </div>

        {/* List */}
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}` }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: C.primary }}>Upcoming closures</p>
          </div>
          {loading ? (
            <p style={{ fontSize: 13, color: C.light, margin: "20px 18px" }}>Loading…</p>
          ) : closures.length === 0 ? (
            <p style={{ fontSize: 13, color: C.light, margin: "20px 18px" }}>No upcoming closure dates set.</p>
          ) : (
            closures.map((c, i) => (
              <div
                key={c.id}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                  padding: "13px 18px", borderBottom: i < closures.length - 1 ? `1px solid ${C.border}` : "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{
                    width: 10, height: 10, borderRadius: 3, background: C.closedText, flexShrink: 0,
                    display: "inline-block",
                  }} />
                  <div>
                    <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600 }}>{fmtDate(c.closure_date)}</p>
                    {c.reason && <p style={{ margin: "2px 0 0", fontSize: 12, color: C.muted }}>{c.reason}</p>}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(c.id)}
                  disabled={isPending}
                  style={{
                    flexShrink: 0, padding: "6px 14px", borderRadius: 7, border: `1px solid ${C.border}`,
                    background: C.white, color: C.error, fontSize: 12, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
