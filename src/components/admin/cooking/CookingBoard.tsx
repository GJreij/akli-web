"use client";

import { useState } from "react";
import type { CookingRecipe } from "@/lib/flask";
import CopyListButton from "../CopyListButton";
import PortioningPanel, { type PortionTarget } from "./PortioningPanel";
import { ALLERGENS } from "@/lib/allergens";
import { C } from "../ui";

function allergenLabel(key: string) {
  return ALLERGENS.find(a => a.key === key)?.label ?? key;
}

interface Occurrence {
  recipeId: number;
  subrecipeId: number;
  name: string;
  mpdrIds: number[];
}

export default function CookingBoard({ recipes }: { recipes: CookingRecipe[] }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<Map<string, Occurrence>>(new Map());
  const [panelTargets, setPanelTargets] = useState<PortionTarget[] | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const occurrences = [...selected.values()];
  const existingSubIds = new Set(occurrences.map(o => o.subrecipeId));
  const existingRecipeIds = new Set(occurrences.map(o => o.recipeId));

  // Every occurrence of each subrecipe across all recipes currently on the
  // board (i.e. within the date range/filters already applied) — powers the
  // "select all" shortcut so admins don't have to expand every recipe card
  // and click each one by hand.
  const occurrencesBySubrecipe = new Map<number, Occurrence[]>();
  for (const r of recipes) {
    for (const s of r.subrecipes) {
      const list = occurrencesBySubrecipe.get(s.subrecipe_id) ?? [];
      list.push({ recipeId: r.recipe_id, subrecipeId: s.subrecipe_id, name: s.name, mpdrIds: r.meal_plan_day_recipe_ids });
      occurrencesBySubrecipe.set(s.subrecipe_id, list);
    }
  }

  function selectAllOccurrences(subrecipeId: number) {
    const occs = occurrencesBySubrecipe.get(subrecipeId) ?? [];
    const next = new Map<string, Occurrence>();
    for (const occ of occs) next.set(`${occ.recipeId}:${occ.subrecipeId}`, occ);
    setSelected(next);
  }

  function toggleExpand(recipeId: number) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(recipeId) ? next.delete(recipeId) : next.add(recipeId);
      return next;
    });
  }

  function toggleSelected(occ: Occurrence) {
    const key = `${occ.recipeId}:${occ.subrecipeId}`;
    setSelected(prev => {
      const next = new Map(prev);
      if (next.has(key)) {
        next.delete(key);
        return next;
      }
      if (!canSelect(occ.recipeId, occ.subrecipeId)) return prev;
      next.set(key, occ);
      return next;
    });
  }

  function isSelected(recipeId: number, subrecipeId: number) {
    return selected.has(`${recipeId}:${subrecipeId}`);
  }

  function canSelect(recipeId: number, subrecipeId: number) {
    if (selected.size === 0 || isSelected(recipeId, subrecipeId)) return true;

    // Two valid combinations only:
    //   - the same subrecipe pulled from different recipes (e.g. "Rice" used
    //     in two recipes, cooked + portioned as one batch), or
    //   - different subrecipes from the SAME recipe (e.g. turkey + cheese +
    //     bread that make up one sandwich, portioned together per client).
    // Once the selection has committed to one of those two modes — more than
    // one recipe selected, or more than one subrecipe selected — only that
    // mode's dimension may keep growing. Otherwise "select all occurrences of
    // X" (many recipes, one subrecipe) would also let you add an unrelated
    // subrecipe from any of those recipes, which has no shared per-client
    // basis to split a combined weight by.
    const sameSubrecipeMode = existingSubIds.size === 1 && existingRecipeIds.size > 1;
    const sameRecipeMode = existingRecipeIds.size === 1 && existingSubIds.size > 1;

    if (sameSubrecipeMode) return existingSubIds.has(subrecipeId);
    if (sameRecipeMode) return existingRecipeIds.has(recipeId);

    // Only one occurrence selected so far — either extension is still valid.
    return existingSubIds.has(subrecipeId) || existingRecipeIds.has(recipeId);
  }

  function openCombined() {
    if (occurrences.length === 0) return;
    // Group by subrecipe — multiple occurrences of the same subrecipe (from
    // different recipes) merge into one target with unioned mpdrIds.
    const bySubrecipe = new Map<number, PortionTarget>();
    for (const o of occurrences) {
      const existing = bySubrecipe.get(o.subrecipeId);
      if (existing) existing.mpdrIds = [...new Set([...existing.mpdrIds, ...o.mpdrIds])];
      else bySubrecipe.set(o.subrecipeId, { subrecipeId: o.subrecipeId, name: o.name, mpdrIds: [...o.mpdrIds] });
    }
    setPanelTargets([...bySubrecipe.values()]);
  }

  if (recipes.length === 0) {
    return <p style={{ fontSize: 13, color: C.light, margin: 0 }}>No recipes scheduled for this range/filter.</p>;
  }

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {recipes.map(r => {
          const isOpen = expanded.has(r.recipe_id);
          // Defensive default — undefined until the backend deploy that adds
          // this field to /cooking/overview has gone out.
          const allergenConflicts = r.allergen_conflicts ?? [];
          return (
            <div key={r.recipe_id} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
              <button
                onClick={() => toggleExpand(r.recipe_id)}
                style={{
                  width: "100%", textAlign: "left", background: "transparent", border: "none", cursor: "pointer",
                  padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <p style={{ margin: 0, fontFamily: "'Playfair Display', serif", fontSize: 16, fontWeight: 500, color: C.primary }}>{r.name}</p>
                    {r.any_swapped && (
                      <span style={{
                        fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
                        padding: "2px 8px", borderRadius: 20, background: "#fff8e6", color: "#b45309",
                      }}>
                        Modified
                      </span>
                    )}
                    {allergenConflicts.length > 0 && (
                      <span
                        title={allergenConflicts.map(c => `${c.name}: ${c.allergens.map(allergenLabel).join(", ")}`).join(" · ")}
                        style={{
                          fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
                          padding: "2px 8px", borderRadius: 20, background: "#fff3e8", color: "#c45f00",
                        }}
                      >
                        ⚠️ Allergen
                      </span>
                    )}
                  </div>
                  <p style={{ margin: "2px 0 0", fontSize: 11.5, color: C.light }}>
                    {r.earliest_date} · {r.subrecipes.length} subrecipe{r.subrecipes.length === 1 ? "" : "s"} · {r.comments.length} comment{r.comments.length === 1 ? "" : "s"}
                  </p>
                  {allergenConflicts.length > 0 && (
                    <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "#c45f00", fontWeight: 600 }}>
                      {allergenConflicts.map(c => `${c.name} — ${c.allergens.map(allergenLabel).join(", ")}`).join(" · ")}
                    </p>
                  )}
                </div>
              </button>

              {isOpen && (
                <div style={{ padding: "0 16px 16px", borderTop: `1px solid ${C.offWhite}` }}>
                  {r.comments.length > 0 && (
                    <div style={{ margin: "12px 0" }}>
                      {r.comments.map((c, i) => (
                        <p key={i} style={{ margin: "0 0 4px", fontSize: 12.5 }}>
                          <strong>{c.name}:</strong> <span style={{ color: C.muted }}>{c.comment}</span>
                        </p>
                      ))}
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "12px 0 6px" }}>
                    <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: C.primary }}>Ingredients (recipe total)</p>
                    <CopyListButton
                      label="Copy"
                      text={r.ingredients_needed.map(i => `${i.name}: ${i.total_quantity ?? i.quantity} ${i.unit ?? ""}`.trim()).join("\n")}
                    />
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 14px", marginBottom: 14, fontSize: 12, color: C.muted }}>
                    {r.ingredients_needed.map(i => (
                      <span key={i.ingredient_id}>{i.name}: {i.total_quantity ?? i.quantity} {i.unit ?? ""}</span>
                    ))}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {r.subrecipes.map(s => {
                      const checked = isSelected(r.recipe_id, s.subrecipe_id);
                      const disabled = !checked && !canSelect(r.recipe_id, s.subrecipe_id);
                      const occurrenceCount = occurrencesBySubrecipe.get(s.subrecipe_id)?.length ?? 1;
                      return (
                        <div key={s.subrecipe_id} style={{ background: C.offWhite, borderRadius: 10, padding: "10px 12px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: disabled ? C.light : C.primary }}>
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={disabled}
                                onChange={() => toggleSelected({ recipeId: r.recipe_id, subrecipeId: s.subrecipe_id, name: s.name, mpdrIds: r.meal_plan_day_recipe_ids })}
                              />
                              {s.name}
                            </label>
                            <div style={{ display: "flex", gap: 6 }}>
                              {occurrenceCount > 1 && (
                                <button
                                  onClick={() => selectAllOccurrences(s.subrecipe_id)}
                                  title={`Select this subrecipe in all ${occurrenceCount} recipes it appears in`}
                                  style={{
                                    background: C.offWhite, color: C.primary, border: `1px solid ${C.border}`,
                                    borderRadius: 7, padding: "5px 11px", fontSize: 11.5, fontWeight: 600,
                                    cursor: "pointer",
                                  }}
                                >
                                  Select all ({occurrenceCount})
                                </button>
                              )}
                              <button
                                onClick={() => setPanelTargets([{ subrecipeId: s.subrecipe_id, name: s.name, mpdrIds: r.meal_plan_day_recipe_ids }])}
                                style={{
                                  background: C.primary, color: C.white,
                                  border: "none", borderRadius: 7, padding: "5px 11px", fontSize: 11.5, fontWeight: 600,
                                  cursor: "pointer",
                                }}
                              >
                                Portion
                              </button>
                            </div>
                          </div>
                          <p style={{ margin: "0 0 4px", fontSize: 11, color: C.light }}>Total servings: {s.total_servings}</p>
                          <div style={{ fontSize: 11.5, color: C.muted }}>
                            {s.ingredients_needed.map(i => `${i.name}: ${i.total_quantity ?? i.quantity} ${i.unit ?? ""}`).join(" · ")}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selected.size > 0 && (
        <div style={{
          position: "fixed", bottom: 18, left: "50%", transform: "translateX(-50%)", background: C.primary,
          color: C.white, borderRadius: 12, padding: "10px 16px", display: "flex", gap: 12, alignItems: "center", zIndex: 50,
          boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
        }}>
          <span style={{ fontSize: 12.5 }}>{occurrences.length} selected: {occurrences.map(o => o.name).join(", ")}</span>
          <button
            onClick={openCombined}
            style={{ background: C.white, color: C.primary, border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            Portion together
          </button>
          <button
            onClick={() => setSelected(new Map())}
            style={{ background: "transparent", color: "rgba(255,255,255,0.7)", border: "none", fontSize: 12, cursor: "pointer" }}
          >
            Clear
          </button>
        </div>
      )}

      {panelTargets && (
        <PortioningPanel
          key={refreshKey}
          targets={panelTargets}
          onClose={() => setPanelTargets(null)}
          onSaved={() => { setRefreshKey(k => k + 1); setSelected(new Map()); }}
        />
      )}
    </>
  );
}
