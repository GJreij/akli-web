"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconArrowLeft, IconChevronDown, IconLeaf, IconReceipt2,
  IconTruck, IconCheck, IconClock, IconBrandWhatsapp, IconX,
} from "@tabler/icons-react";

// ─── Colors ───────────────────────────────────────────────────────────────────

const C = {
  primary:  "#063330",
  teal:     "#67b1b0",
  tealDark: "#437b7b",
  offWhite: "#eee9e6",
  muted:    "#5c5c5c",
  light:    "#9a9a9a",
  border:   "#e0dbd5",
  white:    "#ffffff",
  error:    "#c0392b",
};

const MEAL_ORDER: Record<string, number> = { breakfast: 0, lunch: 1, snack: 2, dinner: 3 };
const MEAL_EMOJI: Record<string, string>  = { breakfast: "🌅", lunch: "☀️", snack: "🍎", dinner: "🌙" };

// ─── Types ────────────────────────────────────────────────────────────────────

type Recipe = { id: number; name: string | null; photo: string | null };

type DayRecipe = {
  id: number;
  meal_type: string | null;
  label: string | null;
  recipe: Recipe | null;
};

type Payment = {
  id: number;
  amount: number | null;
  currency: string | null;
  status: string | null;
  provider: string | null;
  created_at: string;
};

type Delivery = {
  id: number;
  delivery_date: string | null;
  status: string | null;
  delivery_address: string | null;
  delivery_slot_id: number | null;
};

type DayMacros = {
  kcal_ordered: number | null;
  protein_ordered: number | null;
  carbs_ordered: number | null;
  fat_ordered: number | null;
} | null;

type PlanDay = {
  id: number;
  date: string | null;
  status: string | null;
  delivery_id: number | null;
  payment: Payment[] | Payment | null;
  deliveries: Delivery[] | Delivery | null;
  meal_plan_day_recipe: DayRecipe[];
  macros: DayMacros;
};

type MealPlan = {
  id: number;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  meal_plan_day: PlanDay[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function fmtDateLong(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function fmtMoney(amount: number | null, currency: string | null) {
  if (amount == null) return "—";
  const sym = currency === "USD" ? "$" : (currency ?? "$");
  return `${sym}${amount.toFixed(2)}`;
}

function getPayment(day: PlanDay): Payment | null {
  if (!day.payment) return null;
  return Array.isArray(day.payment) ? (day.payment[0] ?? null) : day.payment;
}

function getDelivery(day: PlanDay): Delivery | null {
  if (!day.deliveries) return null;
  return Array.isArray(day.deliveries) ? (day.deliveries[0] ?? null) : day.deliveries;
}

function planStatus(plan: MealPlan): "upcoming" | "active" | "completed" | "cancelled" {
  const today = new Date().toISOString().split("T")[0];
  if (!plan.start_date || !plan.end_date) return "upcoming";
  if (plan.end_date < today) return "completed";
  if (plan.start_date <= today && plan.end_date >= today) return "active";
  return "upcoming";
}

function planTotal(plan: MealPlan): number {
  return plan.meal_plan_day.reduce((sum, day) => {
    const p = getPayment(day);
    return sum + (p?.amount ?? 0);
  }, 0);
}

function planProvider(plan: MealPlan): string | null {
  for (const day of plan.meal_plan_day) {
    const p = getPayment(day);
    if (p?.provider) return p.provider;
  }
  return null;
}

function providerLabel(p: string | null) {
  if (p === "cash")  return { label: "Cash on delivery", icon: "💵" };
  if (p === "whish") return { label: "Whish Money",      icon: null, logo: "/Whish_Logo.jpg" };
  if (p === "neo")   return { label: "Neo",              icon: null, logo: "/Neo_Logo.jpg" };
  return { label: "—", icon: "💳" };
}

const STATUS_CONFIG = {
  upcoming:  { label: "Upcoming",  bg: "#eef4ff", color: "#2563eb" },
  active:    { label: "Active",    bg: "#f0faf0", color: "#15803d" },
  completed: { label: "Completed", bg: "#f5f5f5", color: C.muted   },
  cancelled: { label: "Cancelled", bg: "#fff0f0", color: C.error   },
};

const DELIVERY_STATUS_ICON: Record<string, React.ReactNode> = {
  delivered: <IconCheck size={13} />,
  pending:   <IconClock size={13} />,
  cancelled: <IconX     size={13} />,
};

// ─── Day macro boxes — same style as step 2 of ordering: kcal + protein up
// front, carbs/fat behind a toggle. No target comparison, just what was
// actually delivered that day. ──────────────────────────────────────────────

function MacroBox({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: 1, textAlign: "center", background: C.offWhite, borderRadius: 7, padding: "5px 2px 6px" }}>
      <p style={{ fontSize: 9.5, color: C.light, margin: "0 0 2px", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</p>
      <p style={{ fontSize: 12, fontWeight: 700, margin: 0, color: C.primary }}>{value}</p>
    </div>
  );
}

function DayMacroBoxes({ macros, expanded }: { macros: DayMacros; expanded: boolean }) {
  if (!macros || macros.kcal_ordered == null) return null;
  return (
    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
      <MacroBox label="Kcal" value={Math.round(macros.kcal_ordered).toLocaleString("en-US")} />
      <MacroBox label="Protein" value={`${Math.round(macros.protein_ordered ?? 0)}g`} />
      {expanded && (
        <>
          <MacroBox label="Carbs" value={`${Math.round(macros.carbs_ordered ?? 0)}g`} />
          <MacroBox label="Fat" value={`${Math.round(macros.fat_ordered ?? 0)}g`} />
        </>
      )}
    </div>
  );
}

// ─── Receipt modal ────────────────────────────────────────────────────────────

function ReceiptModal({ plan, onClose }: { plan: MealPlan; onClose: () => void }) {
  const [showMacroDetail, setShowMacroDetail] = useState(false);
  const total    = planTotal(plan);
  const provider = planProvider(plan);
  const pInfo    = providerLabel(provider);
  const days     = [...plan.meal_plan_day].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  const hasMacros = days.some(d => d.macros?.kcal_ordered != null);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(6,51,48,0.55)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.white, borderRadius: "20px 20px 0 0",
          width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto",
          animation: "slideUp 0.3s ease",
        }}
      >
        {/* Header */}
        <div style={{ background: C.primary, borderRadius: "20px 20px 0 0", padding: "20px 20px 24px", color: C.white }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <p style={{ margin: "0 0 4px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.5 }}>
                Receipt · Order #{plan.id}
              </p>
              <h3 style={{ margin: "0 0 4px", fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 500 }}>
                {fmtDate(plan.start_date)} – {fmtDate(plan.end_date)}
              </h3>
              <p style={{ margin: 0, fontSize: 12.5, opacity: 0.55 }}>
                Ordered {fmtDateLong(plan.created_at.split("T")[0])}
              </p>
            </div>
            <button onClick={onClose} style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 8, padding: "6px 8px", color: C.white, cursor: "pointer" }}>
              <IconX size={16} />
            </button>
          </div>
        </div>

        <div style={{ padding: "20px 20px 32px" }}>
          {/* Day breakdown */}
          {days.map((day, i) => {
            const payment  = getPayment(day);
            const delivery = getDelivery(day);
            const meals    = [...(day.meal_plan_day_recipe ?? [])].sort(
              (a, b) => (MEAL_ORDER[a.meal_type ?? ""] ?? 9) - (MEAL_ORDER[b.meal_type ?? ""] ?? 9)
            );

            return (
              <div key={day.id} style={{ marginBottom: i < days.length - 1 ? 16 : 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: C.primary }}>
                    {fmtDateLong(day.date)}
                  </p>
                  {payment?.amount != null && (
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: C.tealDark }}>
                      {fmtMoney(payment.amount, payment.currency)}
                    </p>
                  )}
                </div>

                {/* Meals */}
                <div style={{ background: C.offWhite, borderRadius: 10, padding: "10px 12px", marginBottom: 6 }}>
                  {meals.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 12, color: C.light }}>No meals recorded</p>
                  ) : meals.map(m => (
                    <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                      <span style={{ fontSize: 14, flexShrink: 0 }}>{MEAL_EMOJI[m.meal_type ?? ""] ?? "🍽️"}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 500, color: "#1a1a1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {m.recipe?.name ?? m.label ?? "—"}
                        </p>
                        <p style={{ margin: 0, fontSize: 10.5, color: C.light, textTransform: "capitalize" }}>
                          {m.meal_type ?? ""}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Delivery info */}
                {delivery ? (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: C.light }}>
                      <IconTruck size={12} />
                      {delivery.delivery_date ? `Delivery: ${fmtDate(delivery.delivery_date)}` : "Delivery scheduled"}
                      {delivery.status && (
                        <span style={{
                          marginLeft: 4, padding: "1px 7px", borderRadius: 10, fontSize: 10.5,
                          background: delivery.status === "delivered" ? "#e6f7f0" : C.offWhite,
                          color: delivery.status === "delivered" ? "#15803d" : C.muted,
                          display: "flex", alignItems: "center", gap: 3,
                        }}>
                          {DELIVERY_STATUS_ICON[delivery.status] ?? null}
                          {delivery.status.charAt(0).toUpperCase() + delivery.status.slice(1)}
                        </span>
                      )}
                    </div>
                    {delivery.delivery_address && (
                      <p style={{ margin: "3px 0 0 18px", fontSize: 11, color: C.light, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {delivery.delivery_address}
                      </p>
                    )}
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: 11.5, color: C.light }}>Delivery details not available yet for this day.</p>
                )}

                <DayMacroBoxes macros={day.macros} expanded={showMacroDetail} />

                {i < days.length - 1 && (
                  <div style={{ borderBottom: `1px dashed ${C.border}`, marginTop: 14 }} />
                )}
              </div>
            );
          })}

          {hasMacros && (
            <button
              onClick={() => setShowMacroDetail(s => !s)}
              style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4, background: "none", border: "none", padding: 0, fontSize: 11, color: C.light, cursor: "pointer" }}
            >
              {showMacroDetail ? "Hide carbs & fat" : "See carbs & fat"}
              <IconChevronDown size={12} style={{ transform: showMacroDetail ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
            </button>
          )}

          {/* Total */}
          <div style={{ borderTop: `2px solid ${C.primary}`, marginTop: 20, paddingTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: C.primary }}>Total</span>
              <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 500, color: C.primary }}>
                ${total.toFixed(2)}
              </span>
            </div>

            {/* Payment method */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
              {pInfo.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={pInfo.logo} alt={pInfo.label} style={{ width: 20, height: 20, borderRadius: 4, objectFit: "cover" }} />
              ) : (
                <span style={{ fontSize: 16 }}>{pInfo.icon}</span>
              )}
              <span style={{ fontSize: 12, color: C.muted }}>{pInfo.label}</span>
            </div>
          </div>

          {/* WhatsApp CTA */}
          <a
            href="https://wa.me/96181567192"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              marginTop: 20, padding: "12px 0", borderRadius: 12,
              background: "#25d366", color: C.white, textDecoration: "none",
              fontSize: 13.5, fontWeight: 600,
            }}
          >
            <IconBrandWhatsapp size={18} /> Contact Akli on WhatsApp
          </a>
        </div>
      </div>
      <style>{`@keyframes slideUp { from { transform: translateY(50px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
    </div>
  );
}

// ─── Order card ───────────────────────────────────────────────────────────────

function OrderCard({ plan }: { plan: MealPlan }) {
  const [open, setOpen]         = useState(false);
  const [receipt, setReceipt]   = useState(false);
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set());

  const status   = planStatus(plan);
  const total    = planTotal(plan);
  const provider = planProvider(plan);
  const pInfo    = providerLabel(provider);
  const sCfg     = STATUS_CONFIG[status];
  const days     = [...plan.meal_plan_day].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  const dayCount = days.length;
  const hasMacros     = days.some(d => d.macros?.kcal_ordered != null);
  const allDaysExpanded = days.length > 0 && days.every(d => expandedDays.has(d.id));

  // Unique meal count
  const totalMeals = days.reduce((s, d) => s + (d.meal_plan_day_recipe?.length ?? 0), 0);

  return (
    <>
      {receipt && <ReceiptModal plan={plan} onClose={() => setReceipt(false)} />}

      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, marginBottom: 12, overflow: "hidden" }}>

        {/* Card header */}
        <div style={{ padding: "16px 16px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{
                  fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
                  padding: "2px 8px", borderRadius: 20,
                  background: sCfg.bg, color: sCfg.color,
                }}>
                  {sCfg.label}
                </span>
                <span style={{ fontSize: 11, color: C.light }}>#{plan.id}</span>
              </div>
              <p style={{ margin: "0 0 2px", fontFamily: "'Playfair Display', serif", fontSize: 17, fontWeight: 500, color: "#1a1a1a" }}>
                {fmtDate(plan.start_date)} – {fmtDate(plan.end_date)}
              </p>
              <p style={{ margin: 0, fontSize: 11.5, color: C.light }}>
                {dayCount} day{dayCount !== 1 ? "s" : ""} · {totalMeals} meals
              </p>
            </div>

            {/* Total + payment */}
            <div style={{ textAlign: "right" }}>
              <p style={{ margin: "0 0 4px", fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 500, color: C.primary }}>
                ${total.toFixed(2)}
              </p>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                {pInfo.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={pInfo.logo} alt={pInfo.label} style={{ width: 16, height: 16, borderRadius: 3, objectFit: "cover" }} />
                ) : (
                  <span style={{ fontSize: 13 }}>{pInfo.icon}</span>
                )}
                <span style={{ fontSize: 11, color: C.light }}>{pInfo.label}</span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => setReceipt(true)}
              style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                padding: "9px 0", borderRadius: 10, border: `1px solid ${C.border}`,
                background: C.offWhite, fontSize: 12.5, fontWeight: 500, color: C.muted, cursor: "pointer",
              }}
            >
              <IconReceipt2 size={14} /> View receipt
            </button>
            <button
              onClick={() => setOpen(o => !o)}
              style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                padding: "9px 0", borderRadius: 10, border: `1px solid ${C.border}`,
                background: open ? C.primary : C.offWhite,
                fontSize: 12.5, fontWeight: 500,
                color: open ? C.white : C.muted,
                cursor: "pointer", transition: "background 0.15s, color 0.15s",
              }}
            >
              Meals
              <IconChevronDown size={13} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
            </button>
          </div>
        </div>

        {/* Expanded meals view */}
        {open && (
          <div style={{ borderTop: `1px solid ${C.border}`, padding: "0 12px 14px" }}>
            {hasMacros && (
              <button
                onClick={() => setExpandedDays(allDaysExpanded ? new Set() : new Set(days.map(d => d.id)))}
                style={{
                  display: "flex", alignItems: "center", gap: 5, margin: "12px 0 0", background: "none",
                  border: `1px solid ${C.border}`, borderRadius: 20, padding: "5px 11px",
                  fontSize: 11, color: C.tealDark, cursor: "pointer",
                }}
              >
                <IconChevronDown size={12} style={{ transform: allDaysExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
                {allDaysExpanded ? "Hide carbs & fat for all days" : "See carbs & fat for all days"}
              </button>
            )}
            {days.map((day, di) => {
              const delivery = getDelivery(day);
              const payment  = getPayment(day);
              const meals    = [...(day.meal_plan_day_recipe ?? [])].sort(
                (a, b) => (MEAL_ORDER[a.meal_type ?? ""] ?? 9) - (MEAL_ORDER[b.meal_type ?? ""] ?? 9)
              );

              return (
                <div key={day.id} style={{ paddingTop: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: delivery?.delivery_address ? 2 : 8 }}>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: C.primary }}>
                      {fmtDateLong(day.date)}
                    </p>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {delivery?.status && (
                        <span style={{
                          fontSize: 10, padding: "2px 7px", borderRadius: 10,
                          background: delivery.status === "delivered" ? "#e6f7f0" : C.offWhite,
                          color: delivery.status === "delivered" ? "#15803d" : C.muted,
                          display: "flex", alignItems: "center", gap: 3,
                        }}>
                          {DELIVERY_STATUS_ICON[delivery.status] ?? null}
                          {delivery.status.charAt(0).toUpperCase() + delivery.status.slice(1)}
                        </span>
                      )}
                      {payment?.amount != null && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: C.tealDark }}>
                          {fmtMoney(payment.amount, payment.currency)}
                        </span>
                      )}
                    </div>
                  </div>
                  {delivery?.delivery_address && (
                    <p style={{ margin: "0 0 8px", fontSize: 10.5, color: C.light, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <IconTruck size={10} style={{ marginRight: 4, verticalAlign: "-1px" }} />
                      {delivery.delivery_address}
                    </p>
                  )}

                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {meals.length === 0 ? (
                      <p style={{ margin: 0, fontSize: 12, color: C.light }}>No meals recorded</p>
                    ) : meals.map(m => (
                      <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: C.offWhite, borderRadius: 9 }}>
                        {m.recipe?.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.recipe.photo} alt="" style={{ width: 36, height: 36, borderRadius: 7, objectFit: "cover", flexShrink: 0 }} />
                        ) : (
                          <div style={{ width: 36, height: 36, borderRadius: 7, background: C.border, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <IconLeaf size={14} color={C.light} />
                          </div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {m.recipe?.name ?? m.label ?? "—"}
                          </p>
                          <p style={{ margin: 0, fontSize: 10.5, color: C.light, textTransform: "capitalize" }}>
                            {MEAL_EMOJI[m.meal_type ?? ""] ?? "🍽️"} {m.meal_type ?? ""}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {day.macros?.kcal_ordered != null && (
                    <>
                      <DayMacroBoxes macros={day.macros} expanded={expandedDays.has(day.id)} />
                      <button
                        onClick={() => setExpandedDays(prev => {
                          const next = new Set(prev);
                          if (next.has(day.id)) next.delete(day.id); else next.add(day.id);
                          return next;
                        })}
                        style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6, background: "none", border: "none", padding: 0, fontSize: 10.5, color: C.light, cursor: "pointer" }}
                      >
                        {expandedDays.has(day.id) ? "Hide carbs & fat" : "See carbs & fat"}
                        <IconChevronDown size={11} style={{ transform: expandedDays.has(day.id) ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
                      </button>
                    </>
                  )}

                  {di < days.length - 1 && (
                    <div style={{ borderBottom: `1px dashed ${C.border}`, marginTop: 12 }} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function OrderHistory({ plans, userId: _userId, hasOlderOrders = false }: {
  plans: MealPlan[]; userId: string; hasOlderOrders?: boolean;
}) {
  const router = useRouter();

  const active    = plans.filter(p => planStatus(p) === "active");
  const upcoming  = plans.filter(p => planStatus(p) === "upcoming");
  const completed = plans.filter(p => planStatus(p) === "completed");

  return (
    <div style={{ minHeight: "100vh", background: C.offWhite }}>

      {/* Header */}
      <div style={{ background: C.primary, padding: "20px 20px 28px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <button
            onClick={() => router.back()}
            style={{ background: "none", border: "none", padding: 0, color: "rgba(255,255,255,0.6)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
          >
            <IconArrowLeft size={16} /> Back
          </button>
          <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 17, color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>akli</span>
        </div>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 500, color: "#fff", margin: "0 0 4px" }}>
          My Orders
        </h2>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", margin: "0 0 20px" }}>
          {plans.length === 0 ? "No orders yet" : `${plans.length} order${plans.length !== 1 ? "s" : ""} · last 3 months`}
        </p>

        {/* Stats strip */}
        {plans.length > 0 && (() => {
          const totalSpent = plans.reduce((s, p) => s + planTotal(p), 0);
          const totalMeals = plans.reduce((s, p) => s + p.meal_plan_day.reduce((d, day) => d + (day.meal_plan_day_recipe?.length ?? 0), 0), 0);
          const totalDays  = plans.reduce((s, p) => s + p.meal_plan_day.length, 0);
          return (
            <div style={{ display: "flex", gap: 8 }}>
              {[
                { label: "Orders",     value: `${plans.length}` },
                { label: "Days",       value: `${totalDays}` },
                { label: "Meals",      value: `${totalMeals}` },
                { label: "Total spent",value: `$${totalSpent.toFixed(0)}` },
              ].map(s => (
                <div key={s.label} style={{ flex: 1, background: "rgba(255,255,255,0.08)", borderRadius: 10, padding: "9px 8px", textAlign: "center" }}>
                  <p style={{ margin: "0 0 2px", fontSize: 16, fontWeight: 700, color: C.white }}>{s.value}</p>
                  <p style={{ margin: 0, fontSize: 9.5, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{s.label}</p>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      <div style={{ padding: "16px 20px 80px" }}>

        {plans.length === 0 ? (
          <div style={{ textAlign: "center", paddingTop: 60 }}>
            <p style={{ fontSize: 40, margin: "0 0 12px" }}>🥗</p>
            <p style={{ fontSize: 17, fontWeight: 600, color: "#1a1a1a", margin: "0 0 6px" }}>
              {hasOlderOrders ? "Nothing in the last 3 months" : "No orders yet"}
            </p>
            <p style={{ fontSize: 13, color: C.light, margin: "0 0 24px" }}>
              {hasOlderOrders
                ? "You have older orders, but this view only shows the last 3 months. Message us on WhatsApp if you need anything from further back."
                : "Your meal plan history will appear here"}
            </p>
            <button
              onClick={() => router.push("/order/new")}
              style={{ padding: "12px 24px", borderRadius: 12, background: C.primary, color: C.white, border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
            >
              {hasOlderOrders ? "Place a new order" : "Order your first plan"}
            </button>
          </div>
        ) : (
          <>
            {active.length > 0 && (
              <Section label="Active" emoji="🟢">
                {active.map(p => <OrderCard key={p.id} plan={p} />)}
              </Section>
            )}
            {upcoming.length > 0 && (
              <Section label="Upcoming" emoji="🔵">
                {upcoming.map(p => <OrderCard key={p.id} plan={p} />)}
              </Section>
            )}
            {completed.length > 0 && (
              <Section label="Past orders" emoji="✅">
                {completed.map(p => <OrderCard key={p.id} plan={p} />)}
              </Section>
            )}
          </>
        )}
      </div>

      {/* New order FAB */}
      {plans.length > 0 && (
        <div style={{ position: "fixed", bottom: 24, left: 0, right: 0, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
          <button
            onClick={() => router.push("/order/new")}
            style={{
              pointerEvents: "all",
              background: C.primary, color: C.white,
              border: "none", borderRadius: 30,
              padding: "13px 28px", fontSize: 14, fontWeight: 600,
              boxShadow: "0 4px 20px rgba(6,51,48,0.35)", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 8,
            }}
          >
            + New order
          </button>
        </div>
      )}
    </div>
  );
}

function Section({ label, emoji, children }: { label: string; emoji: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: C.light, margin: "0 0 10px" }}>
        {emoji} {label}
      </p>
      {children}
    </div>
  );
}
