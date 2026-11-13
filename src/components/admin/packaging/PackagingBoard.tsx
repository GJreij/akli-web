"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PackagingDay, PackagingClient, PackagingRecipe } from "@/lib/flask";
import { markPackaged } from "@/app/admin/packaging/actions";
import { mealTypeRank } from "@/lib/mealOrder";
import { C } from "../ui";

function fmtSlot(slot: { start_time: string | null; end_time: string | null } | null) {
  if (!slot) return "No slot";
  return `${slot.start_time?.slice(0, 5) ?? "?"}–${slot.end_time?.slice(0, 5) ?? "?"}`;
}

function sortedRecipes(client: PackagingClient) {
  return [...client.recipes].sort((a, b) =>
    mealTypeRank(a.meal_type) - mealTypeRank(b.meal_type) || (a.recipe_name ?? "").localeCompare(b.recipe_name ?? "")
  );
}

function groupByMealType(client: PackagingClient) {
  const groups = new Map<string, typeof client.recipes>();
  for (const recipe of sortedRecipes(client)) {
    const key = recipe.meal_type ?? "other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(recipe);
  }
  return [...groups.entries()].sort((a, b) => mealTypeRank(a[0]) - mealTypeRank(b[0]));
}

function DayCombination({ client }: { client: PackagingClient }) {
  const groups = groupByMealType(client);
  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${C.border}`, display: "flex", flexDirection: "column", gap: 6 }}>
      {groups.map(([mealType, recipes]) => (
        <div key={mealType} style={{ fontSize: 11.5 }}>
          <span style={{ fontWeight: 700, color: C.muted, textTransform: "capitalize" }}>{mealType}: </span>
          {recipes.map((r, i) => (
            <span key={r.meal_plan_day_recipe_id}>
              {i > 0 && " + "}
              <span style={{ color: C.primary, fontWeight: 600 }}>{r.recipe_name ?? "—"}</span>
              {r.subrecipes.length > 0 && (
                <span style={{ color: C.light }}>
                  {" ("}
                  {r.subrecipes.map(s => s.subrecipe_name ?? "?").join(", ")}
                  {")"}
                </span>
              )}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

const RED = "#c0392b";
const RED_BG = "#fdecea";
const AMBER = "#b45309";
const AMBER_BG = "#fff8e6";

function fmtServing(n: number | null) {
  if (n == null) return "×?";
  return `×${Number.isInteger(n) ? n : n.toFixed(2).replace(/0+$/, "")}`;
}

function Badge({ bg, color, children }: { bg: string; color: string; children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em",
      padding: "3px 9px", borderRadius: 20, background: bg, color, whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}

// One meal = one checklist. Every component is its own big tappable line,
// and "Mark packaged" stays locked until every line is ticked, so a forgotten
// side blocks the packer instead of slipping through. Salad changes versus
// the standard dish are shouted, since packers work from memory of the usual
// recipe. Ticks are local to this page view; only "packaged" is saved.
function MealChecklist({ recipe, busy, onToggle }: {
  recipe: PackagingRecipe;
  busy: boolean;
  onToggle: (mpdrId: number, currentlyPackaged: boolean) => void;
}) {
  const packaged = recipe.packaging_status === "completed";
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const salad = recipe.salad;
  const total = recipe.subrecipes.length;
  const doneCount = packaged ? total : ticked.size;
  const allTicked = doneCount >= total;

  function tick(i: number) {
    if (packaged) return;
    setTicked(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  return (
    <div style={{
      border: `1.5px solid ${packaged ? C.tealDark : C.border}`, borderRadius: 10, padding: "10px 12px",
      background: packaged ? "#f1f7f7" : C.white,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <span style={{ fontSize: 15.5, fontWeight: 700, color: C.primary }}>{recipe.recipe_name ?? "—"}</span>
        {recipe.meal_type && (
          <span style={{ fontSize: 12, color: C.muted, textTransform: "capitalize" }}>· {recipe.meal_type}</span>
        )}
        {recipe.is_swapped && <Badge bg={AMBER_BG} color={AMBER}>Modified</Badge>}
      </div>

      {salad?.status === "removed" && (
        <div style={{
          background: RED_BG, color: RED, border: `2px solid ${RED}`, borderRadius: 8,
          padding: "8px 10px", marginBottom: 8, fontSize: 14, fontWeight: 800,
        }}>
          🚫 NO SALAD — do not add the usual {salad.usual ?? "side salad"}
        </div>
      )}
      {salad?.status === "swapped" && (
        <div style={{
          background: AMBER_BG, color: AMBER, border: `2px solid ${AMBER}`, borderRadius: 8,
          padding: "8px 10px", marginBottom: 8, fontSize: 14, fontWeight: 800,
        }}>
          🔁 SALAD CHANGED — {salad.packed} instead of {salad.usual}
        </div>
      )}
      {salad?.status === "added" && (
        <div style={{
          background: AMBER_BG, color: AMBER, border: `2px solid ${AMBER}`, borderRadius: 8,
          padding: "8px 10px", marginBottom: 8, fontSize: 14, fontWeight: 800,
        }}>
          ➕ EXTRA SALAD — add {salad.packed}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {recipe.subrecipes.map((s, i) => {
          const isTicked = packaged || ticked.has(i);
          const highlight = s.is_side_salad && salad && salad.status !== "standard";
          return (
            <button
              key={`${s.subrecipe_id}-${i}`}
              type="button"
              onClick={() => tick(i)}
              style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
                background: highlight ? AMBER_BG : isTicked ? "#e3efef" : C.offWhite,
                border: `1px solid ${highlight ? AMBER : "transparent"}`,
                borderRadius: 8, padding: "9px 10px", cursor: packaged ? "default" : "pointer",
              }}
            >
              <span style={{
                flex: "0 0 22px", height: 22, borderRadius: 6,
                border: `2px solid ${isTicked ? C.tealDark : C.light}`,
                background: isTicked ? C.tealDark : C.white, color: C.white,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800,
              }}>
                {isTicked ? "✓" : ""}
              </span>
              <span style={{
                flex: 1, fontSize: 15, fontWeight: 600, color: C.primary,
                textDecoration: isTicked ? "line-through" : "none", opacity: isTicked ? 0.6 : 1,
              }}>
                {s.subrecipe_name ?? "?"}
                {s.is_side_salad && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 800, color: AMBER }}>SALAD</span>}
              </span>
              <span style={{ fontSize: 15, fontWeight: 800, color: C.primary }}>{fmtServing(s.serving_size)}</span>
            </button>
          );
        })}
        {total === 0 && (
          <p style={{ margin: 0, fontSize: 13, color: RED, fontWeight: 700 }}>No components found for this meal — check the order.</p>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, gap: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: allTicked ? C.tealDark : C.muted }}>
          {doneCount}/{total} in the box
        </span>
        <button
          onClick={() => onToggle(recipe.meal_plan_day_recipe_id, packaged)}
          disabled={busy || (!packaged && !allTicked)}
          title={!packaged && !allTicked ? "Tick every component first" : undefined}
          style={{
            background: packaged ? C.tealDark : allTicked ? C.primary : C.offWhite,
            color: packaged || allTicked ? C.white : C.light,
            border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700,
            cursor: busy || (!packaged && !allTicked) ? "not-allowed" : "pointer", whiteSpace: "nowrap",
            opacity: busy ? 0.6 : 1,
          }}
        >
          {packaged ? "Packaged ✓ (undo)" : "Mark packaged"}
        </button>
      </div>
    </div>
  );
}

export default function PackagingBoard({ days }: { days: PackagingDay[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [marking, setMarking] = useState<number | null>(null);
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());

  function toggle(mpdrId: number, currentlyPackaged: boolean) {
    setMarking(mpdrId);
    startTransition(async () => {
      try {
        await markPackaged(mpdrId, !currentlyPackaged);
        router.refresh();
      } catch (e) {
        alert(e instanceof Error ? e.message : "Failed to update packaging status.");
      } finally {
        setMarking(null);
      }
    });
  }

  function toggleClientExpanded(key: string) {
    setExpandedClients(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  if (days.length === 0) {
    return <p style={{ fontSize: 13, color: C.light, margin: 0 }}>No deliveries scheduled for this range.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {days.map(day => (
        <div key={day.delivery_date} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 16px" }}>
          <p style={{ margin: "0 0 10px", fontFamily: "'Playfair Display', serif", fontSize: 17, fontWeight: 500, color: C.primary }}>
            {new Date(day.delivery_date).toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long" })}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {day.slots.map(slot => (
              <div key={`${day.delivery_date}-${slot.slot_id}`} style={{ background: C.offWhite, borderRadius: 10, padding: "10px 12px" }}>
                <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                  {fmtSlot(slot)}
                  {slot.clients.some(c => c.needs_cutlery) && (
                    <span style={{ marginLeft: 8, color: C.tealDark }}>
                      · 🍴 {slot.clients.filter(c => c.needs_cutlery).length} cutlery
                    </span>
                  )}
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[...slot.clients]
                    .sort((a, b) => `${a.name ?? ""} ${a.last_name ?? ""}`.trim().localeCompare(`${b.name ?? ""} ${b.last_name ?? ""}`.trim()))
                    .map((client, ci) => {
                    const clientKey = `${day.delivery_date}-${slot.slot_id}-${ci}`;
                    const isExpanded = expandedClients.has(clientKey);
                    return (
                    <div key={ci} style={{ background: C.white, borderRadius: 8, padding: "8px 10px", border: `1px solid ${C.border}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: C.primary, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          {`${client.name ?? ""} ${client.last_name ?? ""}`.trim() || "Unknown client"}
                          {/* Always say it either way, so a missing label is never
                              mistaken for "no cutlery" (or the reverse). */}
                          {client.needs_cutlery ? (
                            <span style={{
                              fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em",
                              padding: "2px 8px", borderRadius: 20, background: C.tealDark, color: C.white,
                            }}>
                              🍴 Add cutlery
                            </span>
                          ) : (
                            <span style={{
                              fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em",
                              padding: "2px 8px", borderRadius: 20, background: C.offWhite, color: C.muted,
                              border: `1px solid ${C.border}`,
                            }}>
                              🚫 No cutlery
                            </span>
                          )}
                        </p>
                        <button
                          onClick={() => toggleClientExpanded(clientKey)}
                          style={{
                            background: isExpanded ? C.primary : C.offWhite, color: isExpanded ? C.white : C.muted,
                            border: "none", borderRadius: 6, padding: "3px 8px", fontSize: 10.5, fontWeight: 600, cursor: "pointer",
                          }}
                        >
                          {isExpanded ? "Hide combination" : "View combination"}
                        </button>
                      </div>

                      {isExpanded && <DayCombination client={client} />}

                      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: isExpanded ? 8 : 0 }}>
                        {sortedRecipes(client).map(recipe => (
                          <MealChecklist
                            key={recipe.meal_plan_day_recipe_id}
                            recipe={recipe}
                            busy={pending && marking === recipe.meal_plan_day_recipe_id}
                            onToggle={toggle}
                          />
                        ))}
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
