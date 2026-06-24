"use client";

import { Fragment, useEffect, useState } from "react";
import { getPortioningSummary, type PortioningSummary } from "@/lib/flask";
import { savePortioning } from "@/app/admin/cooking/actions";
import { C } from "../ui";

export interface PortionTarget {
  subrecipeId: number;
  name: string;
  // meal_plan_day_recipe ids (recipe instances) — NOT meal_plan_day_recipe_serving ids.
  // /portioning/summary filters servings by their parent meal_plan_day_recipe_id.
  // When merging the same subrecipe across multiple recipe cards, this is the union of their ids.
  mpdrIds: number[];
}

function displayName(client: PortioningSummary["clients"][number]["client"]) {
  if (!client) return "Unknown";
  return `${client.name ?? ""} ${client.last_name ?? ""}`.trim() || "Unknown";
}

type Mode = "total" | "per_serving";

export default function PortioningPanel({ targets, onClose, onSaved }: {
  targets: PortionTarget[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bySubrecipe, setBySubrecipe] = useState<Record<number, PortioningSummary>>({});
  const [modes, setModes] = useState<Record<number, Mode>>({});
  const [weights, setWeights] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all(targets.map(t => getPortioningSummary(t.subrecipeId, t.mpdrIds))).then(results => {
      if (cancelled) return;
      const next: Record<number, PortioningSummary> = {};
      const errors: string[] = [];
      results.forEach((res, i) => {
        if (res.error) errors.push(`${targets[i].name}: ${typeof res.error === "string" ? res.error : "failed"}`);
        else if (res.data) next[targets[i].subrecipeId] = res.data;
      });
      setBySubrecipe(next);
      if (errors.length) setError(errors.join(" — "));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [targets]);

  // Rows keyed by (client, delivery date) — a client with orders on multiple
  // days must NOT be merged into one row; each date is its own portion.
  type RowInfo = { key: string; name: string; date: string | null; perTarget: Record<number, { servingId: number; demand: number }> };
  const rowByKey = new Map<string, RowInfo>();
  const rows: RowInfo[] = [];

  for (const target of targets) {
    const summary = bySubrecipe[target.subrecipeId];
    for (const c of summary?.clients ?? []) {
      const key = `${c.client?.id ?? "unknown"}|${c.delivery_date ?? ""}`;
      let row = rowByKey.get(key);
      if (!row) {
        row = { key, name: displayName(c.client), date: c.delivery_date, perTarget: {} };
        rowByKey.set(key, row);
        rows.push(row);
      }
      row.perTarget[target.subrecipeId] = { servingId: c.meal_plan_day_recipe_serving_id, demand: c.servings_for_client ?? 0 };
    }
  }
  rows.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.name.localeCompare(b.name));

  // Each subrecipe is portioned entirely independently — its own total demand,
  // its own weight input, its own per-client grams. No blending across targets.
  function totalDemand(subrecipeId: number) {
    return rows.reduce((sum, r) => sum + (r.perTarget[subrecipeId]?.demand ?? 0), 0);
  }

  function gramsFor(row: RowInfo, subrecipeId: number) {
    const entry = row.perTarget[subrecipeId];
    if (!entry) return null;
    const mode = modes[subrecipeId] ?? "total";
    const weight = parseFloat(weights[subrecipeId] ?? "");
    if (isNaN(weight) || weight <= 0) return null;
    const td = totalDemand(subrecipeId);
    return mode === "total"
      ? (td > 0 ? weight * (entry.demand / td) : 0)
      : weight * entry.demand;
  }

  function isValid(subrecipeId: number) {
    const weight = parseFloat(weights[subrecipeId] ?? "");
    return !isNaN(weight) && weight > 0;
  }

  const anyValid = targets.some(t => isValid(t.subrecipeId));

  async function handleSave() {
    setSaving(true);
    const toSave = rows.flatMap(row =>
      targets
        .filter(t => row.perTarget[t.subrecipeId] && isValid(t.subrecipeId))
        .map(t => ({
          meal_plan_day_recipe_serving_id: row.perTarget[t.subrecipeId].servingId,
          weight_after_cooking: Math.round((gramsFor(row, t.subrecipeId) ?? 0) * 10) / 10,
        }))
    );
    await savePortioning(toSave);
    setSaving(false);
    setSaved(true);
    onSaved();
  }

  const hasNoData = !loading && !error && rows.length === 0;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
      <div style={{ background: C.white, borderRadius: 16, padding: 22, width: "100%", maxWidth: 680, maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontFamily: "'Playfair Display', serif", fontSize: 19, color: C.primary }}>
            Portion {targets.map(t => t.name).join(" + ")}
          </h3>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: C.muted, fontSize: 13, cursor: "pointer" }}>Close</button>
        </div>

        {loading ? (
          <p style={{ fontSize: 13, color: C.light }}>Loading…</p>
        ) : error ? (
          <p style={{ fontSize: 13, color: C.error }}>{error}</p>
        ) : hasNoData ? (
          <p style={{ fontSize: 13, color: C.light }}>No clients found for this selection.</p>
        ) : (
          <>
            {targets.map(t => {
              const summary = bySubrecipe[t.subrecipeId];
              return (
                <div key={t.subrecipeId} style={{ background: C.offWhite, borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
                  <p style={{ margin: "0 0 4px", fontSize: 12.5, fontWeight: 600, color: C.primary }}>{t.name}</p>
                  {summary && summary.summary.ingredients.length > 0 && (
                    <p style={{ margin: "0 0 8px", fontSize: 11, color: C.muted }}>
                      Before cooking, batch of {summary.summary.total_subrecipe_servings_for_batch} servings — {summary.summary.ingredients.map(i => `${i.name}: ${i.total_servings_equivalent} ${i.unit ?? ""}`).join(" · ")}
                    </p>
                  )}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <select
                      value={modes[t.subrecipeId] ?? "total"}
                      onChange={e => setModes(prev => ({ ...prev, [t.subrecipeId]: e.target.value as Mode }))}
                      style={{ padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13 }}
                    >
                      <option value="total">Total weight after cooking</option>
                      <option value="per_serving">Weight of one serving</option>
                    </select>
                    <input
                      type="number" step="any"
                      placeholder={(modes[t.subrecipeId] ?? "total") === "total" ? "Total grams" : "Grams per serving"}
                      value={weights[t.subrecipeId] ?? ""}
                      onChange={e => setWeights(prev => ({ ...prev, [t.subrecipeId]: e.target.value }))}
                      style={{ padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, flex: "1 1 140px" }}
                    />
                  </div>
                </div>
              );
            })}

            <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse", margin: "10px 0 14px" }}>
              <thead>
                <tr style={{ textAlign: "left", color: C.light, borderBottom: `1px solid ${C.border}` }}>
                  <th style={{ padding: "4px 6px" }}>Client</th>
                  <th style={{ padding: "4px 6px" }}>Delivery date</th>
                  {targets.map(t => (
                    <th key={t.subrecipeId} colSpan={2} style={{ padding: "4px 6px" }}>{t.name}</th>
                  ))}
                </tr>
                <tr style={{ textAlign: "left", color: C.light, borderBottom: `1px solid ${C.border}`, fontSize: 11 }}>
                  <th></th>
                  <th></th>
                  {targets.map(t => (
                    <Fragment key={t.subrecipeId}>
                      <th style={{ padding: "2px 6px" }}>Servings</th>
                      <th style={{ padding: "2px 6px" }}>Grams</th>
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.key} style={{ borderBottom: `1px solid ${C.offWhite}` }}>
                    <td style={{ padding: "6px 6px", fontWeight: 600 }}>{row.name}</td>
                    <td style={{ padding: "6px 6px", color: C.muted, whiteSpace: "nowrap" }}>{row.date ?? "—"}</td>
                    {targets.map(t => {
                      const entry = row.perTarget[t.subrecipeId];
                      const grams = entry ? gramsFor(row, t.subrecipeId) : null;
                      return (
                        <Fragment key={t.subrecipeId}>
                          <td style={{ padding: "6px 6px", color: C.muted }}>{entry ? entry.demand : "—"}</td>
                          <td style={{ padding: "6px 6px", fontWeight: 600, color: C.tealDark }}>
                            {grams != null ? `${grams.toFixed(1)}g` : "—"}
                          </td>
                        </Fragment>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            <button
              onClick={handleSave}
              disabled={!anyValid || saving}
              style={{
                background: C.primary, color: C.white, border: "none", borderRadius: 8, padding: "10px 18px",
                fontSize: 13, fontWeight: 600, cursor: anyValid ? "pointer" : "not-allowed", opacity: anyValid ? 1 : 0.5,
              }}
            >
              {saving ? "Saving…" : saved ? "Saved ✓" : "Save portions"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
