"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PackagingDay } from "@/lib/flask";
import { markPackaged } from "@/app/admin/packaging/actions";
import { C } from "../ui";

function fmtSlot(slot: { start_time: string | null; end_time: string | null } | null) {
  if (!slot) return "No slot";
  return `${slot.start_time?.slice(0, 5) ?? "?"}–${slot.end_time?.slice(0, 5) ?? "?"}`;
}

export default function PackagingBoard({ days }: { days: PackagingDay[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [marking, setMarking] = useState<number | null>(null);

  function toggle(mpdrId: number, currentlyPackaged: boolean) {
    setMarking(mpdrId);
    startTransition(async () => {
      await markPackaged(mpdrId, !currentlyPackaged);
      setMarking(null);
      router.refresh();
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
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {slot.clients.map((client, ci) => (
                    <div key={ci} style={{ background: C.white, borderRadius: 8, padding: "8px 10px", border: `1px solid ${C.border}` }}>
                      <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 600, color: C.primary }}>
                        {`${client.name ?? ""} ${client.last_name ?? ""}`.trim() || "Unknown client"}
                      </p>

                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {client.recipes.map(recipe => {
                          const packaged = recipe.packaging_status === "completed";
                          return (
                            <div key={recipe.meal_plan_day_recipe_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                              <div>
                                <p style={{ margin: 0, fontSize: 12.5 }}>
                                  <strong>{recipe.recipe_name ?? "—"}</strong>
                                  {recipe.meal_type && <span style={{ color: C.light }}> · {recipe.meal_type}</span>}
                                </p>
                                <p style={{ margin: "2px 0 0", fontSize: 11, color: C.light }}>
                                  {recipe.subrecipes.map(s => `${s.subrecipe_name ?? "?"} (${s.serving_size ?? "?"})`).join(" · ")}
                                </p>
                              </div>
                              <button
                                onClick={() => toggle(recipe.meal_plan_day_recipe_id, packaged)}
                                disabled={pending && marking === recipe.meal_plan_day_recipe_id}
                                style={{
                                  background: packaged ? C.tealDark : C.offWhite,
                                  color: packaged ? C.white : C.muted,
                                  border: "none", borderRadius: 7, padding: "5px 10px", fontSize: 11, fontWeight: 600,
                                  cursor: "pointer", whiteSpace: "nowrap",
                                  opacity: pending && marking === recipe.meal_plan_day_recipe_id ? 0.6 : 1,
                                }}
                              >
                                {packaged ? "Packaged ✓" : "Mark packaged"}
                              </button>
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
        </div>
      ))}
    </div>
  );
}
