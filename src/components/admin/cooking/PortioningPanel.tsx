"use client";

import { Fragment, useEffect, useState } from "react";
import { getPortioningSummary, type PortioningSummary } from "@/lib/flask";
import { savePortioning } from "@/app/admin/cooking/actions";
import { mealTypeRank } from "@/lib/mealOrder";
import { ALLERGENS } from "@/lib/allergens";
import { C } from "../ui";

export interface PortionTarget {
  subrecipeId: number;
  name: string;
  // meal_plan_day_recipe ids (recipe instances) — NOT meal_plan_day_recipe_serving ids.
  // /portioning/summary filters servings by their parent meal_plan_day_recipe_id.
  // When merging the same subrecipe across multiple recipe cards, this is the union of their ids.
  mpdrIds: number[];
  // Kitchen Day: the kitchen_batch this subrecipe's portions come from
  // (overrides the panel-wide batchId).
  batchId?: number;
}

function displayName(client: PortioningSummary["clients"][number]["client"]) {
  if (!client) return "Unknown";
  return `${client.name ?? ""} ${client.last_name ?? ""}`.trim() || "Unknown";
}

type Mode = "total" | "per_serving";

export interface PotWeight { id: number; name: string; weight_g: number }

const numIn = (s: string | undefined) => {
  const n = parseFloat(s ?? "");
  return Number.isFinite(n) ? n : NaN;
};
const fmtG = (g: number) => `${Math.round(g).toLocaleString("en-US")} g`;

export default function PortioningPanel({ targets, onClose, onSaved, batchId, potServings, pots, onAddPot }: {
  targets: PortionTarget[];
  onClose: () => void;
  onSaved: () => void;
  // Kitchen Day: the kitchen_batch these portions are taken from.
  batchId?: number;
  // Kitchen: servings in the pot being weighed, when it holds more than
  // today's portions (the rest is put aside).
  potServings?: number;
  // Saved pot/tray weights, taken off the weighed total.
  pots?: PotWeight[];
  onAddPot?: (name: string, weightG: number) => Promise<PotWeight>;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bySubrecipe, setBySubrecipe] = useState<Record<number, PortioningSummary>>({});
  const [modes, setModes] = useState<Record<number, Mode>>({});
  const [weights, setWeights] = useState<Record<number, string>>({});
  // Pot/tray weight to take off, and servings in the weighed pot, per subrecipe.
  const [tares, setTares] = useState<Record<number, string>>({});
  const [potServ, setPotServ] = useState<Record<number, string>>(() =>
    potServings != null && targets.length === 1 ? { [targets[0].subrecipeId]: String(Math.round(potServings * 100) / 100) } : {});
  const [potList, setPotList] = useState<PotWeight[]>(pots ?? []);
  const [newPot, setNewPot] = useState<{ sid: number; name: string } | null>(null);
  const [potErr, setPotErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all(targets.map(t => getPortioningSummary(t.subrecipeId, t.mpdrIds))).then(results => {
      if (cancelled) return;
      const next: Record<number, PortioningSummary> = {};
      const errors: string[] = [];
      results.forEach((res, i) => {
        if (res.error) {
          const e = res.error;
          const msg = typeof e === "string"
            ? e
            : `${e.error} — ${e.missing.length} recipe${e.missing.length === 1 ? "" : "s"} missing a serving row (ids: ${e.missing.join(", ")})`;
          errors.push(`${targets[i].name}: ${msg}`);
        }
        else if (res.data) next[targets[i].subrecipeId] = res.data;
      });
      setBySubrecipe(next);
      if (errors.length) setError(errors.join(" — "));
      setLoading(false);
    }).catch(e => {
      if (cancelled) return;
      setError(e instanceof Error ? e.message : "Failed to load portioning data — unknown error.");
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [targets]);

  // Rows are keyed by (client, delivery date, meal_plan_day_recipe) — i.e. one
  // physical meal instance. This matters because the same subrecipe can show
  // up twice for the same client on the same day but in TWO DIFFERENT MEALS
  // (e.g. a salad in both their lunch and dinner recipe) — those need two
  // separate portions, not one combined blob. Multiple TARGETS (subrecipes)
  // that belong to the SAME meal (e.g. turkey + cheese for one sandwich) are
  // still meant to combine into one row — that's the "portion together"
  // feature — so the key must include the meal, not just client+date.
  // perTarget still holds an array (rather than a single entry) as a defensive
  // measure in case a subrecipe genuinely appears twice within one meal.
  type ServingEntry = { servingId: number; demand: number; savedWeight: number | null };
  type RowInfo = {
    key: string; name: string; date: string | null; mealType: string | null; mealLabel: string | null;
    perTarget: Record<number, ServingEntry[]>;
    // Union across every subrecipe portioned into this one physical meal —
    // e.g. a sandwich's bread + filling are portioned together but both
    // could carry a different allergen, and the client needs to see both.
    allergens: Set<string>;
  };
  const rowByKey = new Map<string, RowInfo>();
  const rows: RowInfo[] = [];

  function capitalize(s: string) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  for (const target of targets) {
    const summary = bySubrecipe[target.subrecipeId];
    for (const c of summary?.clients ?? []) {
      const key = `${c.client?.id ?? "unknown"}|${c.delivery_date ?? ""}|${c.meal_plan_day_recipe_id}`;
      let row = rowByKey.get(key);
      if (!row) {
        const mealLabel = [c.meal_type ? capitalize(c.meal_type) : null, c.recipe_name].filter(Boolean).join(" · ") || null;
        row = { key, name: displayName(c.client), date: c.delivery_date, mealType: c.meal_type ?? null, mealLabel, perTarget: {}, allergens: new Set() };
        rowByKey.set(key, row);
        rows.push(row);
      }
      (row.perTarget[target.subrecipeId] ??= []).push({
        servingId: c.meal_plan_day_recipe_serving_id,
        demand: c.servings_for_client ?? 0,
        savedWeight: c.has_weight_after_cooking ? c.weight_after_cooking : null,
      });
      for (const key of c.client_allergens ?? []) row.allergens.add(key);
    }
  }
  rows.sort((a, b) =>
    (a.date ?? "").localeCompare(b.date ?? "")
    || a.name.localeCompare(b.name)
    || mealTypeRank(a.mealType) - mealTypeRank(b.mealType)
    || (a.mealLabel ?? "").localeCompare(b.mealLabel ?? "")
  );

  function rowDemand(row: RowInfo, subrecipeId: number) {
    return (row.perTarget[subrecipeId] ?? []).reduce((sum, e) => sum + e.demand, 0);
  }

  // Each subrecipe is portioned entirely independently — its own total demand,
  // its own weight input, its own per-client grams. No blending across targets.
  function totalDemand(subrecipeId: number) {
    return rows.reduce((sum, r) => sum + rowDemand(r, subrecipeId), 0);
  }

  // "Total weight" mode: weighed total − pot weight = food; when the pot
  // holds more servings than these portions, only their share is portioned
  // and the rest is put aside.
  function split(subrecipeId: number) {
    const weight = numIn(weights[subrecipeId]);
    if (!(weight > 0)) return null;
    const tare = numIn(tares[subrecipeId]);
    const net = weight - (tare > 0 ? tare : 0);
    if (net <= 0) return null;
    const td = totalDemand(subrecipeId);
    const ps = numIn(potServ[subrecipeId]);
    if (ps > td + 0.01 && td > 0) {
      const today = net * (td / ps);
      return { net, today, aside: net - today, asideServings: ps - td, perServing: net / ps };
    }
    return { net, today: net, aside: 0, asideServings: 0, perServing: td > 0 ? net / td : 0 };
  }

  // Total grams for this row (across all its serving entries for this subrecipe).
  function gramsFor(row: RowInfo, subrecipeId: number) {
    const entries = row.perTarget[subrecipeId];
    if (!entries || entries.length === 0) return null;
    const mode = modes[subrecipeId] ?? "total";
    const demand = rowDemand(row, subrecipeId);
    if (mode === "per_serving") {
      const weight = numIn(weights[subrecipeId]);
      return weight > 0 ? weight * demand : null;
    }
    const s = split(subrecipeId);
    if (!s) return null;
    const td = totalDemand(subrecipeId);
    return td > 0 ? s.today * (demand / td) : 0;
  }

  // Grams for one specific serving row, splitting the row's total grams
  // proportionally when a client has more than one serving of this subrecipe
  // on the same day.
  function gramsForServing(row: RowInfo, subrecipeId: number, entry: ServingEntry) {
    const rowGrams = gramsFor(row, subrecipeId);
    if (rowGrams == null) return null;
    const demand = rowDemand(row, subrecipeId);
    return demand > 0 ? rowGrams * (entry.demand / demand) : 0;
  }

  // Already-saved grams for one row (sum of each serving's persisted
  // weight_after_cooking) — shown as a fallback when no new weight has been
  // typed yet, so a previously-saved portion doesn't look identical to an
  // unsaved one.
  function savedGramsFor(row: RowInfo, subrecipeId: number) {
    const entries = row.perTarget[subrecipeId];
    if (!entries || entries.length === 0) return null;
    if (entries.some(e => e.savedWeight == null)) return null;
    return entries.reduce((sum, e) => sum + (e.savedWeight ?? 0), 0);
  }

  function isValid(subrecipeId: number) {
    if ((modes[subrecipeId] ?? "total") === "per_serving") return numIn(weights[subrecipeId]) > 0;
    return split(subrecipeId) != null;
  }

  async function savePot(sid: number, name: string) {
    const w = numIn(tares[sid]);
    if (!onAddPot) return;
    setPotErr(null);
    try {
      const p = await onAddPot(name, w);
      setPotList(prev => [...prev, p].sort((a, b) => a.name.localeCompare(b.name)));
      setNewPot(null);
    } catch (e) {
      setPotErr(e instanceof Error ? e.message : "Couldn't save the pot.");
    }
  }

  const anyValid = targets.some(t => isValid(t.subrecipeId));

  async function handleSave() {
    console.log("[portioning] handleSave clicked. weights =", weights, "anyValid =", anyValid);
    setSaving(true);
    setSaveError(null);
    const toSave = rows.flatMap(row =>
      targets
        .filter(t => row.perTarget[t.subrecipeId]?.length && isValid(t.subrecipeId))
        .flatMap(t =>
          row.perTarget[t.subrecipeId].map(entry => ({
            meal_plan_day_recipe_serving_id: entry.servingId,
            weight_after_cooking: Math.round((gramsForServing(row, t.subrecipeId, entry) ?? 0) * 10) / 10,
            batch_id: t.batchId ?? batchId,
          }))
        )
    );
    console.log("[portioning] toSave =", toSave);
    try {
      await savePortioning(toSave);
      console.log("[portioning] savePortioning resolved with no error");
      setSaved(true);
      onSaved();
    } catch (e) {
      console.error("[portioning] savePortioning threw:", e);
      setSaveError(e instanceof Error ? e.message : "Save failed — unknown error.");
    } finally {
      setSaving(false);
    }
  }

  const hasNoData = !loading && !error && rows.length === 0;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
      <div style={{ background: C.white, borderRadius: 16, padding: 22, width: "100%", maxWidth: 680, maxHeight: "85dvh", overflowY: "auto" }}>
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
                  {(modes[t.subrecipeId] ?? "total") === "total" && (() => {
                    const sid = t.subrecipeId;
                    const s = split(sid);
                    const td = totalDemand(sid);
                    const field = { padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, width: 110 };
                    return (
                      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                          <label style={{ fontSize: 12, color: C.muted, display: "flex", alignItems: "center", gap: 6 }}>
                            Pot / tray (optional)
                            <input type="number" step="any" min="0" inputMode="decimal" placeholder="g" value={tares[sid] ?? ""}
                              onChange={e => setTares(prev => ({ ...prev, [sid]: e.target.value }))} style={field} />
                          </label>
                          <label style={{ fontSize: 12, color: C.muted, display: "flex", alignItems: "center", gap: 6 }}>
                            Servings in the pot
                            <input type="number" step="any" min="0" inputMode="decimal" placeholder={String(Math.round(td * 100) / 100)} value={potServ[sid] ?? ""}
                              onChange={e => setPotServ(prev => ({ ...prev, [sid]: e.target.value }))} style={{ ...field, width: 90 }} />
                          </label>
                        </div>
                        {(potList.length > 0 || onAddPot) && (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                            {potList.map(p => {
                              const on = numIn(tares[sid]) === p.weight_g;
                              return (
                                <button key={p.id} onClick={() => setTares(prev => ({ ...prev, [sid]: on ? "" : String(p.weight_g) }))} style={{
                                  minHeight: 34, padding: "0 10px", borderRadius: 17, fontSize: 12, fontWeight: 600, cursor: "pointer",
                                  background: on ? C.primary : C.white, color: on ? C.white : C.primary, border: `1px solid ${on ? C.primary : C.border}`,
                                }}>{p.name} · {fmtG(p.weight_g)}</button>
                              );
                            })}
                            {onAddPot && numIn(tares[sid]) > 0 && !potList.some(p => p.weight_g === numIn(tares[sid])) && (
                              newPot?.sid === sid ? (
                                <form onSubmit={e => { e.preventDefault(); void savePot(sid, newPot.name); }} style={{ display: "flex", gap: 6 }}>
                                  <input autoFocus value={newPot.name} onChange={e => setNewPot({ sid, name: e.target.value })} placeholder="Name, e.g. Big pot"
                                    style={{ ...field, width: 150 }} />
                                  <button type="submit" style={{ minHeight: 34, padding: "0 10px", borderRadius: 8, border: "none", background: C.primary, color: C.white, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Save</button>
                                </form>
                              ) : (
                                <button onClick={() => setNewPot({ sid, name: "" })} style={{ background: "none", border: "none", color: C.tealDark, fontSize: 12, textDecoration: "underline", cursor: "pointer" }}>
                                  Save this pot weight
                                </button>
                              )
                            )}
                          </div>
                        )}
                        {potErr && <span style={{ fontSize: 12, color: C.error }}>{potErr}</span>}
                        {s && (
                          <div style={{ background: C.white, borderRadius: 8, padding: "8px 10px", fontSize: 13, color: C.primary, lineHeight: 1.5 }}>
                            {fmtG(s.net)} of food{numIn(tares[sid]) > 0 ? ` (pot ${fmtG(numIn(tares[sid]))} taken off)` : ""} · {fmtG(s.perServing)} per serving
                            <br />
                            <strong>Portion now: {fmtG(s.today)}</strong> for {Math.round(td * 100) / 100} servings
                            {s.aside > 0.5 && <><br /><strong>Put aside: {fmtG(s.aside)}</strong> ({Math.round(s.asideServings * 100) / 100} servings)</>}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })}

            <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse", margin: "10px 0 14px" }}>
              <thead>
                <tr style={{ textAlign: "left", color: C.light, borderBottom: `1px solid ${C.border}` }}>
                  <th style={{ padding: "4px 6px" }}>Client</th>
                  <th style={{ padding: "4px 6px" }}>Delivery date</th>
                  <th style={{ padding: "4px 6px" }}>Meal</th>
                  {targets.map(t => (
                    <th key={t.subrecipeId} colSpan={2} style={{ padding: "4px 6px" }}>{t.name}</th>
                  ))}
                </tr>
                <tr style={{ textAlign: "left", color: C.light, borderBottom: `1px solid ${C.border}`, fontSize: 11 }}>
                  <th></th>
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
                    <td style={{ padding: "6px 6px", fontWeight: 600 }}>
                      {row.name}
                      {row.allergens.size > 0 && (
                        <span
                          title={`Allergic to ${ALLERGENS.filter(a => row.allergens.has(a.key)).map(a => a.label).join(", ")}`}
                          style={{ marginLeft: 5, fontSize: 11, fontWeight: 600, color: "#c45f00" }}
                        >
                          ⚠️
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "6px 6px", color: C.muted, whiteSpace: "nowrap" }}>{row.date ?? "—"}</td>
                    <td style={{ padding: "6px 6px", color: C.muted, whiteSpace: "nowrap" }}>{row.mealLabel ?? "—"}</td>
                    {targets.map(t => {
                      const entries = row.perTarget[t.subrecipeId];
                      const grams = entries?.length ? gramsFor(row, t.subrecipeId) : null;
                      const savedGrams = entries?.length ? savedGramsFor(row, t.subrecipeId) : null;
                      // A freshly-typed weight always previews ahead of whatever
                      // was saved before — only fall back to the saved value
                      // when nothing new has been entered yet.
                      const showSaved = grams == null && savedGrams != null;
                      return (
                        <Fragment key={t.subrecipeId}>
                          <td style={{ padding: "6px 6px", color: C.muted }}>{entries?.length ? rowDemand(row, t.subrecipeId) : "—"}</td>
                          <td style={{ padding: "6px 6px", fontWeight: 600, color: showSaved ? C.muted : C.tealDark }}>
                            {grams != null
                              ? `${grams.toFixed(1)}g`
                              : showSaved
                                ? `${savedGrams.toFixed(1)}g ✓ saved`
                                : "—"}
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
            {saveError && (
              <p style={{ margin: "8px 0 0", fontSize: 12.5, color: C.error }}>{saveError}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
