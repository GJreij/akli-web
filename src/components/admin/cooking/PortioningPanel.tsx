"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { getPortioningSummary, type PortioningSummary } from "@/lib/flask";
import { savePortioning } from "@/app/admin/cooking/actions";
import { mealTypeRank } from "@/lib/mealOrder";
import { ALLERGENS } from "@/lib/allergens";
import { C } from "../ui";
import { decimalInput } from "../kitchen-simple/shared";

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

// Number boxes are text boxes with a decimal keypad: type="number" drops a
// half-typed "1." on some phones, and comma-keypad phones can't type a dot.
const numIn = (s: string | undefined) => {
  const n = parseFloat((s ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};
const fmtG = (g: number) => `${Math.round(g).toLocaleString("en-US")} g`;

// Kitchen: a day that can be portioned from this pot.
export interface PortionDay { date: string; label: string; mpdrIds: number[]; servings: number }

const r2 = (n: number) => Math.round(n * 100) / 100;

export default function PortioningPanel({ targets: baseTargets, onClose, onSaved, batchId, potServings, pots, onAddPot, notes, days }: {
  targets: PortionTarget[];
  // Kitchen: days to choose from (first = the cook date, picked by default).
  // Picking more portions those days' boxes from the same pot.
  days?: PortionDay[];
  // Client notes by user id, shown under the client's name.
  notes?: Record<string, string[]>;
  onClose: () => void;
  // complete: every client shown was portioned (nobody left out);
  // dates: the delivery days that were in the window.
  onSaved: (info: { complete: boolean; dates: string[] }) => void;
  // Kitchen Day: the kitchen_batch these portions are taken from.
  batchId?: number;
  // Kitchen: servings in the pot being weighed, when it holds more than
  // today's portions (the rest is put aside).
  potServings?: number;
  // Saved pot/tray weights, taken off the weighed total.
  pots?: PotWeight[];
  onAddPot?: (name: string, weightG: number) => Promise<PotWeight>;
}) {
  const [picked, setPicked] = useState<string[]>(() => (days?.length ? [days[0].date] : []));
  // With day choices, the single target's meals are the picked days' meals.
  const targets = useMemo(() => {
    if (!days?.length || baseTargets.length !== 1) return baseTargets;
    const ids = days.filter(d => picked.includes(d.date)).flatMap(d => d.mpdrIds);
    return [{ ...baseTargets[0], mpdrIds: ids }];
  }, [baseTargets, days, picked]);
  // Rows (client · day · meal) left out of this pot, e.g. a "no garlic"
  // cooked in its own pot. They're not counted and not saved.
  const [out, setOutRaw] = useState<Set<string>>(new Set());
  // Rows saved from this window (main pot first, left-out ones after).
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bySubrecipe, setBySubrecipe] = useState<Record<number, PortioningSummary>>({});
  const [modes, setModes] = useState<Record<number, Mode>>({});
  const [weights, setWeights] = useState<Record<number, string>>({});
  // Pot/tray weight to take off, and servings in the weighed pot, per subrecipe.
  const [tares, setTares] = useState<Record<number, string>>({});
  // Only what the cook typed; otherwise the pot's servings come from the plan.
  const [potServ, setPotServ] = useState<Record<number, string>>({});
  const [potList, setPotList] = useState<PotWeight[]>(pots ?? []);
  const [newPot, setNewPot] = useState<{ sid: number; name: string } | null>(null);
  const [potErr, setPotErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const setOut = (next: Set<string> | ((prev: Set<string>) => Set<string>)) => { setOutRaw(next); setSaved(false); };

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
    key: string; clientId: string | null; name: string; date: string | null; mealType: string | null; mealLabel: string | null;
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
        row = { key, clientId: c.client?.id ?? null, name: displayName(c.client), date: c.delivery_date, mealType: c.meal_type ?? null, mealLabel, perTarget: {}, allergens: new Set() };
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

  const included = rows.filter(r => !out.has(r.key));

  function rowDemand(row: RowInfo, subrecipeId: number) {
    return (row.perTarget[subrecipeId] ?? []).reduce((sum, e) => sum + e.demand, 0);
  }

  // Each subrecipe is portioned entirely independently — its own total demand,
  // its own weight input, its own per-client grams. No blending across targets.
  function totalDemand(subrecipeId: number) {
    return included.reduce((sum, r) => sum + rowDemand(r, subrecipeId), 0);
  }
  const leftOutDemand = (subrecipeId: number) =>
    rows.filter(r => out.has(r.key)).reduce((sum, r) => sum + rowDemand(r, subrecipeId), 0);

  // Servings in the pot: what the cook typed, else the plan's pot (minus
  // anyone left out, who was cooked apart) when it holds more than these portions.
  function potServingsFor(subrecipeId: number): string {
    if (potServ[subrecipeId] != null) return potServ[subrecipeId];
    if (potServings == null || targets.length !== 1) return "";
    const ps = r2(potServings - leftOutDemand(subrecipeId));
    // Shown whenever it differs from these boxes: bigger → some is put
    // aside; smaller → a warning that the boxes need more than the pot has.
    return ps > 0 && Math.abs(ps - totalDemand(subrecipeId)) > 0.01 ? String(ps) : "";
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
    const ps = numIn(potServingsFor(subrecipeId));
    if (ps > td + 0.01 && td > 0) {
      const today = net * (td / ps);
      return { net, today, aside: net - today, asideServings: ps - td, perServing: net / ps };
    }
    return { net, today: net, aside: 0, asideServings: 0, perServing: td > 0 ? net / td : 0 };
  }

  // Total grams for this row (across all its serving entries for this subrecipe).
  function gramsFor(row: RowInfo, subrecipeId: number) {
    if (out.has(row.key)) return null;
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
    const toSave = included.flatMap(row =>
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
      const nowSaved = new Set([...savedKeys, ...included.map(r => r.key)]);
      setSavedKeys(nowSaved);
      setSaved(true);
      // Complete once every row is portioned: in this save, an earlier save
      // from this window, or already saved before.
      const complete = rows.every(r => nowSaved.has(r.key) || targets.every(t => !r.perTarget[t.subrecipeId]?.length || savedGramsFor(r, t.subrecipeId) != null));
      onSaved({ complete, dates: [...new Set(rows.map(r => r.date).filter((d): d is string => !!d))] });
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

        {days && days.length > 1 && (
          <div style={{ marginBottom: 12 }}>
            <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 6 }}>Portion boxes for</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {days.filter(d => d.mpdrIds.length > 0).map(d => {
                const on = picked.includes(d.date);
                return (
                  <button key={d.date}
                    onClick={() => {
                      if (on && picked.length === 1) return; // at least one day
                      setOut(new Set());
                      setPicked(p => on ? p.filter(x => x !== d.date) : [...p, d.date]);
                    }}
                    style={{
                      minHeight: 40, padding: "0 12px", borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: "pointer",
                      background: on ? C.primary : C.white, color: on ? C.white : C.primary, border: `1.5px solid ${on ? C.primary : C.border}`,
                    }}>
                    {on ? "✓ " : "+ "}{d.label} · {r2(d.servings)}
                  </button>
                );
              })}
            </div>
          </div>
        )}

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
                      type="text" inputMode="decimal"
                      placeholder={(modes[t.subrecipeId] ?? "total") === "total" ? "Total grams" : "Grams per serving"}
                      value={weights[t.subrecipeId] ?? ""}
                      onChange={e => setWeights(prev => ({ ...prev, [t.subrecipeId]: decimalInput(e.target.value) }))}
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
                            <input type="text" inputMode="decimal" placeholder="g" value={tares[sid] ?? ""}
                              onChange={e => setTares(prev => ({ ...prev, [sid]: decimalInput(e.target.value) }))} style={field} />
                          </label>
                          <label style={{ fontSize: 12, color: C.muted, display: "flex", alignItems: "center", gap: 6 }}>
                            Servings in the pot
                            <input type="text" inputMode="decimal" placeholder={String(r2(td))} value={potServingsFor(sid)}
                              onChange={e => setPotServ(prev => ({ ...prev, [sid]: decimalInput(e.target.value) }))} style={{ ...field, width: 90 }} />
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
                            {numIn(potServingsFor(sid)) > 0 && numIn(potServingsFor(sid)) < td - 0.01 && (
                              <><br /><strong style={{ color: C.error }}>
                                ⚠️ The pot holds {r2(numIn(potServingsFor(sid)))} servings but these boxes need {r2(td)}: portions will be smaller. Pick fewer days?
                              </strong></>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })}

            {(() => {
              const noted = rows.filter(r => r.clientId && notes?.[r.clientId]?.length);
              if (noted.length === 0 && out.size === 0) return null;
              const allNotedOut = noted.length > 0 && noted.every(r => out.has(r.key));
              return (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "10px 0 0" }}>
                  {noted.length > 0 && !allNotedOut && (
                    <button onClick={() => setOut(prev => new Set([...prev, ...noted.map(r => r.key)]))} style={{
                      minHeight: 38, padding: "0 12px", borderRadius: 19, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                      background: "#fff3dc", color: "#5c3d00", border: "1.5px solid #e8c46a",
                    }}>
                      💬 Leave out clients with a note ({noted.length})
                    </button>
                  )}
                  {out.size > 0 && (
                    <>
                      <span style={{ fontSize: 12.5, color: "#8a5a00", fontWeight: 700 }}>
                        {out.size} left out: not counted, not saved. Portion them from their own pot after.
                      </span>
                      <button onClick={() => setOut(new Set())} style={{ background: "none", border: "none", padding: 0, color: C.tealDark, fontSize: 12.5, textDecoration: "underline", cursor: "pointer" }}>
                        Put everyone back
                      </button>
                      <button onClick={() => setOut(new Set(rows.filter(r => !out.has(r.key)).map(r => r.key)))} style={{ background: "none", border: "none", padding: 0, color: C.tealDark, fontSize: 12.5, textDecoration: "underline", cursor: "pointer" }}>
                        Swap (portion only them)
                      </button>
                    </>
                  )}
                </div>
              );
            })()}

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
                {rows.map(row => {
                  const isOut = out.has(row.key);
                  return (
                  <tr key={row.key} style={{ borderBottom: `1px solid ${C.offWhite}`, background: isOut ? "#f4f1ee" : undefined, opacity: isOut ? 0.6 : 1 }}>
                    <td style={{ padding: "6px 6px", fontWeight: 600 }}>
                      <span style={{ textDecoration: isOut ? "line-through" : "none" }}>{row.name}</span>
                      <button
                        onClick={() => setOut(prev => { const n = new Set(prev); n.has(row.key) ? n.delete(row.key) : n.add(row.key); return n; })}
                        style={{
                          marginLeft: 6, padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 700, cursor: "pointer",
                          background: isOut ? C.primary : C.white, color: isOut ? C.white : C.muted, border: `1px solid ${isOut ? C.primary : C.border}`,
                        }}>
                        {isOut ? "Put back" : "Leave out"}
                      </button>
                      {row.allergens.size > 0 && (
                        <span
                          title={`Allergic to ${ALLERGENS.filter(a => row.allergens.has(a.key)).map(a => a.label).join(", ")}`}
                          style={{ marginLeft: 5, fontSize: 11, fontWeight: 600, color: "#c45f00" }}
                        >
                          ⚠️
                        </span>
                      )}
                      {row.clientId && notes?.[row.clientId]?.map(n => (
                        <span key={n} style={{ display: "block", marginTop: 2, fontSize: 12, fontWeight: 600, color: "#8a5a00" }}>💬 {n}</span>
                      ))}
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
                            {isOut && !showSaved
                              ? "left out"
                              : grams != null
                                ? `${grams.toFixed(1)}g`
                                : showSaved
                                  ? `${savedGrams.toFixed(1)}g ✓ saved`
                                  : "—"}
                          </td>
                        </Fragment>
                      );
                    })}
                  </tr>
                  );
                })}
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
