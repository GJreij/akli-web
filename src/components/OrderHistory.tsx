"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  IconArrowLeft, IconChevronDown, IconLeaf, IconReceipt2,
  IconTruck, IconCheck, IconClock, IconBrandWhatsapp, IconX, IconBan,
  IconToolsKitchen2, IconCalendar, IconChevronRight,
} from "@tabler/icons-react";
import { beirutISODate } from "@/lib/dates";
import {
  requestCancellation, previewMealSwap, confirmMealSwap,
  type MealSwapResponse, type MealSwapMode, type MealSwapOption, type MealSwapMacros,
  previewDayEdit, confirmDayEdit, type DayEditChange, type DayEditResponse,
  getAvailableRecipeIdsForDate,
  previewCancellationDiscountImpact, type DiscountImpactPreview,
} from "@/lib/flask";
import { createClient } from "@/lib/supabase/client";

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
function byMealOrder(a: { meal_type: string | null }, b: { meal_type: string | null }) {
  return (MEAL_ORDER[a.meal_type ?? ""] ?? 99) - (MEAL_ORDER[b.meal_type ?? ""] ?? 99);
}
const MEAL_EMOJI: Record<string, string>  = { breakfast: "🌅", lunch: "☀️", snack: "🍎", dinner: "🌙" };

// ─── Types ────────────────────────────────────────────────────────────────────

type Recipe = { id: number; name: string | null; photo: string | null };

type DayRecipe = {
  id: number;
  meal_type: string | null;
  label: string | null;
  is_swapped: boolean | null;
  recipe: Recipe | null;
};

type Payment = {
  id: number;
  amount: number | null;
  currency: string | null;
  status: string | null;
  provider: string | null;
  created_at: string;
  wallet_amount_applied: number | null;
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

export type ActivityItem = { kind: "swap" | "edit" | "cancellation" | "wallet"; summary: string; amount: number | null; at: string };
const ACTIVITY_ICON: Record<ActivityItem["kind"], string> = { swap: "🔄", edit: "✏️", cancellation: "🚫", wallet: "💳" };

type MealPlan = {
  id: number;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  meal_plan_day: PlanDay[];
  activity: ActivityItem[];
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

// Purely date-derived — used to decide which SECTION a card lives in, so a
// pending (undecided) cancellation request doesn't yank the order out of
// "Upcoming"/"Active" the moment it's requested. Only a fully finalized
// cancellation should relocate the card.
function dateStatus(plan: MealPlan): "upcoming" | "active" | "completed" {
  // Beirut "today", not UTC — matches every cutoff check elsewhere in this
  // file. Using toISOString() here shifts by a day for the ~2-3 hours after
  // midnight in Beirut but before midnight UTC, so a plan whose end_date
  // was actually yesterday-in-Beirut would still read as active/upcoming.
  const today = beirutISODate(0);
  if (!plan.start_date || !plan.end_date) return "upcoming";
  if (plan.end_date < today) return "completed";
  if (plan.start_date <= today && plan.end_date >= today) return "active";
  return "upcoming";
}

// For the status BADGE on the card — day-level cancellation state takes
// priority over date-derived status here, since the badge should reflect
// "cancellation requested" even while the order stays in its normal section.
function planStatus(plan: MealPlan): "upcoming" | "active" | "completed" | "cancellation_pending" | "cancelled" {
  if (plan.meal_plan_day.length > 0 && plan.meal_plan_day.every(d => d.status === "cancelled")) {
    return "cancelled";
  }
  if (plan.meal_plan_day.some(d => d.status === "cancellation_pending")) {
    return "cancellation_pending";
  }
  return dateStatus(plan);
}

// A day is individually cancellable while it isn't already mid-review/cancelled
// and it's at least 48h out — mirrors the server-side check in
// CancellationService.request_cancellation so selecting it doesn't invite a
// request Flask will just reject.
function isDayCancellable(day: PlanDay): boolean {
  if (day.status === "cancellation_pending" || day.status === "cancelled") return false;
  if (!day.date) return false;
  return day.date >= beirutISODate(2);
}

function cancellableDays(plan: MealPlan): PlanDay[] {
  return plan.meal_plan_day.filter(isDayCancellable);
}

type CancelButtonState = { show: boolean; disabled: boolean; label: string; reason?: string };

// Whether/how the "Cancel" button appears on a card. Deliberately keyed off
// dateStatus() (upcoming/active), not the badge-facing planStatus() — that
// one flips to "cancellation_pending" the instant any day is requested,
// which previously made this whole function return false and the button
// just vanish, with no explanation, the moment a request went in.
function cancellationButtonState(plan: MealPlan): CancelButtonState {
  const status = dateStatus(plan);
  if (status !== "upcoming" && status !== "active") return { show: false, disabled: true, label: "" };

  // The backend allows only one pending cancellation_request per order at a
  // time — this is derivable purely from day status, since any day still
  // "cancellation_pending" means the single allowed request is unresolved.
  const hasPendingRequest = plan.meal_plan_day.some(d => d.status === "cancellation_pending");
  if (hasPendingRequest) {
    return {
      show: true, disabled: true, label: "Cancellation pending",
      reason: "You can cancel more days once this request has been responded to.",
    };
  }

  if (cancellableDays(plan).length === 0) return { show: false, disabled: true, label: "" };
  return { show: true, disabled: false, label: "Cancel" };
}

// A day is individually modifiable (meal swap) once it's at least two full
// days out — today Wednesday means Thursday/Friday are blocked, Saturday is
// the earliest modifiable day. Mirrors MealSwapService._load_context's gate.
function isDayModifiable(day: PlanDay): boolean {
  if (day.status === "cancellation_pending" || day.status === "cancelled") return false;
  if (!day.date) return false;
  return day.date >= beirutISODate(3);
}

function modifiableDays(plan: MealPlan): PlanDay[] {
  return plan.meal_plan_day.filter(isDayModifiable);
}

// Separate from date/status eligibility on purpose: a day can be otherwise
// modifiable but not yet paid. Swapping/editing settles a price difference
// through the wallet immediately, which is confusing before the client has
// actually paid for the order — someone who orders and changes their mind a
// second later could otherwise get an instant wallet credit for a meal they
// haven't paid for yet. Gated separately (rather than folded into
// isDayModifiable) so the "Change order" button can still show and explain
// itself, instead of silently disappearing like the date/status gate does.
function isDayPaid(day: PlanDay): boolean {
  return getPayment(day)?.status === "paid";
}

function payableDays(plan: MealPlan): PlanDay[] {
  return modifiableDays(plan).filter(isDayPaid);
}

type ModifyButtonState = { show: boolean; disabled: boolean; label: string; reason?: string };

function modifyButtonState(plan: MealPlan): ModifyButtonState {
  const status = dateStatus(plan);
  if (status !== "upcoming" && status !== "active") return { show: false, disabled: true, label: "" };

  const hasPendingRequest = plan.meal_plan_day.some(d => d.status === "cancellation_pending");
  if (hasPendingRequest) {
    return {
      show: true, disabled: true, label: "Change order",
      reason: "You can't change meals while a cancellation is pending on this order.",
    };
  }

  if (modifiableDays(plan).length === 0) return { show: false, disabled: true, label: "" };
  return { show: true, disabled: false, label: "Change order" };
}

// Excludes cancelled days — a partially-cancelled order's total should read
// as what's actually still owed/charged, not the original full-plan price
// with no indication that part of it was voided.
function planTotal(plan: MealPlan): number {
  return plan.meal_plan_day.reduce((sum, day) => {
    if (day.status === "cancelled") return sum;
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
  upcoming:             { label: "Upcoming",              bg: "#eef4ff", color: "#2563eb" },
  active:               { label: "Active",                bg: "#f0faf0", color: "#15803d" },
  completed:            { label: "Completed",             bg: "#f5f5f5", color: C.muted   },
  cancellation_pending: { label: "Cancellation requested", bg: "#fff8e6", color: "#b45309" },
  cancelled:            { label: "Cancelled",              bg: "#fff0f0", color: C.error   },
};

const DELIVERY_STATUS_ICON: Record<string, React.ReactNode> = {
  delivered:            <IconCheck size={13} />,
  pending:              <IconClock size={13} />,
  cancellation_pending: <IconClock size={13} />,
  cancelled:            <IconX     size={13} />,
};

function deliveryStatusLabel(status: string): string {
  if (status === "cancellation_pending") return "Cancellation requested";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

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
                    <div style={{ textAlign: "right" }}>
                      <p style={{
                        margin: 0, fontSize: 13, fontWeight: 600,
                        color: day.status === "cancelled" ? C.light : C.tealDark,
                        textDecoration: day.status === "cancelled" ? "line-through" : "none",
                      }}>
                        {fmtMoney(payment.amount, payment.currency)}
                      </p>
                      {day.status === "cancelled" ? (
                        <p style={{ margin: 0, fontSize: 10.5, color: C.error, fontWeight: 600 }}>Cancelled — see Wallet balance for any credit issued</p>
                      ) : (payment.wallet_amount_applied ?? 0) > 0 && (
                        <p style={{ margin: 0, fontSize: 10.5, color: C.light }}>
                          Wallet credit applied: -{fmtMoney(payment.wallet_amount_applied, payment.currency)}
                        </p>
                      )}
                    </div>
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
                          {deliveryStatusLabel(delivery.status)}
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

          {/* Activity — every post-checkout change on this order */}
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
            <ActivitySection items={plan.activity} />
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

// ─── Activity — every post-checkout change on this order, newest first ───────
// Embedded inside the receipt (not its own sheet) so the order card doesn't
// need a separate button for it.

function ActivitySection({ items }: { items: ActivityItem[] }) {
  const sorted = [...items].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <div>
      <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, color: C.primary, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        Activity
      </p>
      {sorted.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12.5, color: C.light }}>No changes have been made to this order yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sorted.map((item, i) => {
            const pd = item.amount != null ? priceDeltaLabel(item.amount) : null;
            return (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", background: C.offWhite, borderRadius: 10 }}>
                <span style={{ fontSize: 16, lineHeight: 1 }}>{ACTIVITY_ICON[item.kind]}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: "0 0 2px", fontSize: 12.5, fontWeight: 600, color: "#1a1a1a" }}>{item.summary}</p>
                  <p style={{ margin: 0, fontSize: 11, color: C.light }}>{fmtDateLong(item.at.split("T")[0])}</p>
                </div>
                {pd && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: item.amount! > 0 ? C.error : C.tealDark, whiteSpace: "nowrap" }}>
                    {pd.label}: {pd.text}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Cancel order sheet — whole order or just specific days ──────────────────

function dayValue(day: PlanDay): number {
  const p = getPayment(day);
  return (p?.amount ?? 0) + (p?.wallet_amount_applied ?? 0);
}

function ExplainerStep({ emoji, title, body }: { emoji: string; title: string; body: string }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <div style={{
        width: 34, height: 34, borderRadius: "50%", background: "#f0f7f7", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
      }}>
        {emoji}
      </div>
      <div>
        <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>{title}</p>
        <p style={{ margin: 0, fontSize: 12, color: C.muted, lineHeight: 1.5 }}>{body}</p>
      </div>
    </div>
  );
}

function CancelOrderSheet({ plan, userId, onClose, onSubmitted }: {
  plan: MealPlan; userId: string; onClose: () => void; onSubmitted: () => void;
}) {
  const days = [...plan.meal_plan_day].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  const eligible = cancellableDays(plan);
  const [selected, setSelected] = useState<Set<number>>(new Set(eligible.map(d => d.id)));
  const [phase, setPhase] = useState<"select" | "confirm" | "done">("select");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discountImpact, setDiscountImpact] = useState<DiscountImpactPreview | null>(null);
  const [discountImpactLoading, setDiscountImpactLoading] = useState(false);

  function toggleDay(id: number) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const isWholeOrder = selected.size > 0 && selected.size === eligible.length;
  const selectedDays = days.filter(d => selected.has(d.id));
  const totalToRefund = selectedDays.reduce((sum, d) => sum + dayValue(d), 0);
  const selectedKey = [...selected].sort((a, b) => a - b).join(",");

  // Give the client a heads-up, before they even submit, if cancelling
  // these specific days would drop the order below its volume-discount
  // tier — re-checked whenever they change their selection and come back
  // to review.
  useEffect(() => {
    if (phase !== "confirm" || selected.size === 0) return;
    let cancelled = false;
    setDiscountImpactLoading(true);
    setDiscountImpact(null);
    previewCancellationDiscountImpact(userId, plan.id, [...selected])
      .then(res => { if (!cancelled) setDiscountImpact(res.discount_impact ?? null); })
      .catch(() => { if (!cancelled) setDiscountImpact(null); })
      .finally(() => { if (!cancelled) setDiscountImpactLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, plan.id, userId, selectedKey]);

  async function submit() {
    if (selected.size === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await requestCancellation(userId, plan.id, isWholeOrder ? undefined : [...selected]);
      if (!res.success) {
        setError(res.error ?? "Could not request cancellation.");
        return;
      }
      setPhase("done");
    } catch {
      setError("Could not request cancellation. Please try again or contact us on WhatsApp.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div onClick={phase === "done" ? undefined : onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(6,51,48,0.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, maxHeight: "85vh", overflowY: "auto", background: C.white, borderRadius: "18px 18px 0 0", padding: "22px 20px 32px", animation: "slideUp 0.22s ease" }}>

        {phase === "select" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>Request cancellation</h3>
              <button onClick={onClose} style={{ background: "none", border: "none", padding: 2, color: C.light, cursor: "pointer" }}>
                <IconX size={18} />
              </button>
            </div>
            <p style={{ fontSize: 12.5, color: C.muted, margin: "0 0 10px" }}>
              All eligible days are selected by default — uncheck any day you want to keep. Days within 48h of delivery can&apos;t be cancelled.
            </p>

            <button
              onClick={() => setSelected(selected.size === eligible.length ? new Set() : new Set(eligible.map(d => d.id)))}
              style={{
                alignSelf: "flex-start", background: "none", border: "none", padding: 0, marginBottom: 12,
                fontSize: 12, fontWeight: 600, color: C.tealDark, cursor: "pointer", textDecoration: "underline",
              }}
            >
              {selected.size === eligible.length ? "Deselect all" : "Select all"}
            </button>

            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
              {days.map(day => {
                const cancellable = isDayCancellable(day);
                const alreadyGone = day.status === "cancellation_pending" || day.status === "cancelled";
                const checked = selected.has(day.id);
                return (
                  <label
                    key={day.id}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                      borderRadius: 10, border: `1px solid ${C.border}`,
                      background: cancellable ? (checked ? "#fdf0ef" : C.white) : C.offWhite,
                      cursor: cancellable ? "pointer" : "default", opacity: cancellable ? 1 : 0.65,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={cancellable ? checked : false}
                      disabled={!cancellable}
                      onChange={() => cancellable && toggleDay(day.id)}
                      style={{ width: 17, height: 17, flexShrink: 0 }}
                    />
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{fmtDateLong(day.date)}</p>
                      {!cancellable && (
                        <p style={{ margin: "1px 0 0", fontSize: 11, color: C.light }}>
                          {alreadyGone ? "Already being cancelled" : "Too soon to cancel — within 48h"}
                        </p>
                      )}
                    </div>
                    <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: cancellable ? C.tealDark : C.light }}>
                      {fmtMoney(dayValue(day), getPayment(day)?.currency ?? "USD")}
                    </p>
                  </label>
                );
              })}
            </div>

            <button
              onClick={() => setPhase("confirm")}
              disabled={selected.size === 0}
              style={{
                width: "100%", padding: "13px 0", borderRadius: 12, border: "none",
                background: selected.size === 0 ? C.border : C.error, color: C.white,
                fontSize: 14, fontWeight: 600, cursor: selected.size === 0 ? "default" : "pointer",
              }}
            >
              {selected.size === 0
                ? "Select at least one day"
                : isWholeOrder
                  ? "Continue — cancel entire order"
                  : `Continue — cancel ${selected.size} day${selected.size !== 1 ? "s" : ""}`}
            </button>
          </>
        )}

        {phase === "confirm" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>Confirm your request</h3>
              <button onClick={onClose} style={{ background: "none", border: "none", padding: 2, color: C.light, cursor: "pointer" }}>
                <IconX size={18} />
              </button>
            </div>

            {/* Summary card */}
            <div style={{ background: "#fdf0ef", border: `1px solid ${C.error}30`, borderRadius: 14, padding: "16px 16px 14px", marginBottom: 18 }}>
              <p style={{ margin: "0 0 8px", fontSize: 12.5, color: C.muted }}>
                You&apos;re cancelling{" "}
                <strong style={{ color: "#1a1a1a" }}>
                  {isWholeOrder ? "the entire order" : `${selected.size} day${selected.size !== 1 ? "s" : ""}`}
                </strong>
                {" "}from order #{plan.id}:
              </p>
              <ul style={{ margin: "0 0 12px", padding: 0, listStyle: "none" }}>
                {selectedDays.map(d => (
                  <li key={d.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "#1a1a1a", padding: "3px 0" }}>
                    <span>{fmtDateLong(d.date)}</span>
                    <span style={{ fontWeight: 600 }}>{fmtMoney(dayValue(d), getPayment(d)?.currency ?? "USD")}</span>
                  </li>
                ))}
              </ul>
              <div style={{ borderTop: `1px solid ${C.error}30`, paddingTop: 10, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>Total to be refunded</span>
                <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 500, color: C.error }}>
                  {fmtMoney(totalToRefund, getPayment(selectedDays[0])?.currency ?? "USD")}
                </span>
              </div>
            </div>

            {discountImpactLoading && (
              <p style={{ fontSize: 11.5, color: C.light, margin: "0 0 12px" }}>Checking price impact…</p>
            )}
            {discountImpact && (
              <div style={{ background: "#fdf6ec", border: "1px solid #b4530930", borderRadius: 12, padding: "12px 14px", marginBottom: 18 }}>
                <p style={{ margin: 0, fontSize: 12.5, color: "#8a5a00", fontWeight: 600, lineHeight: 1.5 }}>
                  ⚠️ {discountImpact.note}
                </p>
              </div>
            )}

            {/* What happens next */}
            <p style={{ margin: "0 0 12px", fontSize: 11, fontWeight: 700, color: C.light, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              What happens next
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
              <ExplainerStep
                emoji="🔍"
                title="We'll review your request"
                body="Our team checks the details — you'll get an update once it's decided."
              />
              <ExplainerStep
                emoji="👛"
                title="You'll get it back as wallet credit"
                body={`Once approved, ${fmtMoney(totalToRefund, "USD")} is added to your Akli wallet, ready to use on your next order.`}
              />
            </div>

            <p style={{ fontSize: 12, color: C.muted, margin: "0 0 20px" }}>
              If you need other options, please{" "}
              <a href="https://wa.me/96181567192" target="_blank" rel="noopener noreferrer" style={{ color: C.tealDark, fontWeight: 600 }}>
                contact us over WhatsApp
              </a>.
            </p>

            {error && (
              <div style={{ background: "#fdf0ef", border: `1px solid ${C.error}`, borderRadius: 10, padding: "10px 14px", fontSize: 12.5, color: C.error, marginBottom: 12 }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setPhase("select")}
                disabled={submitting}
                style={{
                  flex: 1, padding: "13px 0", borderRadius: 12, border: `1px solid ${C.border}`,
                  background: C.white, color: C.muted, fontSize: 13.5, fontWeight: 600,
                  cursor: submitting ? "default" : "pointer",
                }}
              >
                Back
              </button>
              <button
                onClick={submit}
                disabled={submitting}
                style={{
                  flex: 2, padding: "13px 0", borderRadius: 12, border: "none",
                  background: C.error, color: C.white, fontSize: 13.5, fontWeight: 600,
                  cursor: submitting ? "default" : "pointer", opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? "Sending…" : "Confirm cancellation request"}
              </button>
            </div>
          </>
        )}

        {phase === "done" && (
          <div style={{ textAlign: "center", padding: "12px 0 4px" }}>
            <div style={{
              width: 52, height: 52, borderRadius: "50%", background: "#e6f7f0", margin: "0 auto 16px",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <IconCheck size={26} color="#15803d" />
            </div>
            <h3 style={{ margin: "0 0 8px", fontSize: 18 }}>Request sent</h3>
            <p style={{ fontSize: 13, color: C.muted, margin: "0 0 12px", lineHeight: 1.6 }}>
              We&apos;ll review your cancellation and get back to you. If approved,{" "}
              <strong style={{ color: "#1a1a1a" }}>{fmtMoney(totalToRefund, "USD")}</strong> will be added to your
              wallet.
            </p>
            <p style={{ fontSize: 12, color: C.muted, margin: "0 0 20px" }}>
              If you need other options, please{" "}
              <a href="https://wa.me/96181567192" target="_blank" rel="noopener noreferrer" style={{ color: C.tealDark, fontWeight: 600 }}>
                contact us over WhatsApp
              </a>.
            </p>
            <button
              onClick={onSubmitted}
              style={{
                width: "100%", padding: "13px 0", borderRadius: 12, border: "none",
                background: C.primary, color: C.white, fontSize: 14, fontWeight: 600, cursor: "pointer",
              }}
            >
              Got it
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Modify (swap) meal sheet ─────────────────────────────────────────────────

type SwapCandidateRecipe = {
  id: number; name: string | null; photo: string | null;
  could_be_breakfast: boolean | null; could_be_lunch: boolean | null;
  could_be_dinner: boolean | null; could_be_snack: boolean | null;
};

function macroLine(m: { protein: number; carbs: number; fat: number; kcal: number }) {
  return `${Math.round(m.kcal)} kcal · ${Math.round(m.protein)}p / ${Math.round(m.carbs)}c / ${Math.round(m.fat)}f`;
}

// "+/-$X" read as confusing in testing — spell out which direction the
// money moves instead.
function priceDeltaLabel(delta: number): { label: string; text: string } {
  if (delta === 0) return { label: "No price change", text: "$0.00" };
  return delta > 0
    ? { label: "Cost", text: `$${delta.toFixed(2)}` }
    : { label: "Refund", text: `$${Math.abs(delta).toFixed(2)}` };
}

// Two swap options can land on the exact same outcome (rebalancing simply
// wasn't needed) — when they do, show one card instead of two look-alikes.
function swapOptionsMatch(a: MealSwapOption, b: MealSwapOption) {
  const ta = a.after.day_totals, tb = b.after.day_totals;
  return Math.round(ta.kcal) === Math.round(tb.kcal)
    && Math.round(ta.protein) === Math.round(tb.protein)
    && Math.round(ta.carbs) === Math.round(tb.carbs)
    && Math.round(ta.fat) === Math.round(tb.fat)
    && Math.abs(a.price_delta - b.price_delta) < 0.01;
}

// ─── Change order — single entry point, then asks scope ──────────────────────
// Replaces two separate same-weight "Modify" / "Edit day" buttons (which read
// as near-synonyms with no clue which does what) with one button that opens
// a short chooser explaining the difference before committing to either flow.
// Also the payment gate lives here: swapping/editing settles a price
// difference through the wallet immediately, which is confusing before the
// client has actually paid — someone who orders and changes their mind a
// second later could otherwise get an instant wallet credit for a meal
// they haven't paid for yet. The button itself stays visible either way
// (an unpaid order isn't "nothing to do here", just "not yet") — this is
// where that distinction actually gets explained.
function ChangeOrderSheet({ plan, userId, onClose, onSubmitted }: {
  plan: MealPlan; userId: string; onClose: () => void; onSubmitted: () => void;
}) {
  type Mode = "choose" | "swap" | "edit_day";
  const [mode, setMode] = useState<Mode>("choose");

  if (mode === "swap") {
    return <ModifyMealSheet plan={plan} userId={userId} onClose={onClose} onSubmitted={onSubmitted} />;
  }
  if (mode === "edit_day") {
    return <DayEditSheet plan={plan} userId={userId} onClose={onClose} onSubmitted={onSubmitted} />;
  }

  // Nothing to pick from yet, but modifiableDays(plan).length > 0 is what
  // put the button on screen at all — so there IS something coming, it's
  // just gated on payment rather than genuinely unavailable.
  if (payableDays(plan).length === 0) {
    return (
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(6,51,48,0.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
        <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, maxHeight: "85vh", overflowY: "auto", background: C.white, borderRadius: "18px 18px 0 0", padding: "22px 20px 32px", animation: "slideUp 0.22s ease" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
            <h3 style={{ margin: 0, fontSize: 18 }}>Change this order</h3>
            <button onClick={onClose} style={{ background: "none", border: "none", padding: 2, color: C.light, cursor: "pointer" }}>
              <IconX size={18} />
            </button>
          </div>
          <div style={{ textAlign: "center", padding: "20px 0 4px" }}>
            <div style={{
              width: 48, height: 48, borderRadius: "50%", background: C.offWhite, margin: "0 auto 14px",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <IconClock size={22} color={C.tealDark} />
            </div>
            <p style={{ fontSize: 13, color: C.muted, margin: "0 0 20px", lineHeight: 1.6 }}>
              You&apos;ll be able to change this once your payment is confirmed — that usually happens within 24
              hours of paying. If you&apos;re paying day-by-day, it&apos;s simpler to cancel this day and place a
              new order instead.
            </p>
            <button
              onClick={onClose}
              style={{
                width: "100%", padding: "13px 0", borderRadius: 12, border: "none",
                background: C.primary, color: C.white, fontSize: 14, fontWeight: 600, cursor: "pointer",
              }}
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(6,51,48,0.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, maxHeight: "85vh", overflowY: "auto", background: C.white, borderRadius: "18px 18px 0 0", padding: "22px 20px 32px", animation: "slideUp 0.22s ease" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>Change this order</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", padding: 2, color: C.light, cursor: "pointer" }}>
            <IconX size={18} />
          </button>
        </div>
        <p style={{ fontSize: 12.5, color: C.muted, margin: "0 0 16px" }}>
          What would you like to change?
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            onClick={() => setMode("swap")}
            style={{
              display: "flex", alignItems: "center", gap: 12, padding: "14px", borderRadius: 14,
              border: `1px solid ${C.border}`, background: C.white, cursor: "pointer", textAlign: "left",
            }}
          >
            <IconToolsKitchen2 size={22} color={C.tealDark} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>Swap one meal</span>
              <span style={{ display: "block", fontSize: 12, color: C.muted, marginTop: 2 }}>Keep the rest of the day as is</span>
            </span>
            <IconChevronRight size={16} color={C.light} style={{ flexShrink: 0 }} />
          </button>
          <button
            onClick={() => setMode("edit_day")}
            style={{
              display: "flex", alignItems: "center", gap: 12, padding: "14px", borderRadius: 14,
              border: `1px solid ${C.border}`, background: C.white, cursor: "pointer", textAlign: "left",
            }}
          >
            <IconCalendar size={22} color={C.tealDark} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>Edit the whole day</span>
              <span style={{ display: "block", fontSize: 12, color: C.muted, marginTop: 2 }}>Exclude, replace, or add meals</span>
            </span>
            <IconChevronRight size={16} color={C.light} style={{ flexShrink: 0 }} />
          </button>
        </div>
      </div>
    </div>
  );
}

function ModifyMealSheet({ plan, userId, onClose, onSubmitted }: {
  plan: MealPlan; userId: string; onClose: () => void; onSubmitted: () => void;
}) {
  type Step = "pick_day" | "pick_meal" | "pick_recipe" | "preview" | "done";
  const [step, setStep] = useState<Step>("pick_day");
  const [selectedDay, setSelectedDay] = useState<PlanDay | null>(null);
  const [selectedMeal, setSelectedMeal] = useState<DayRecipe | null>(null);
  const [pickedRecipeId, setPickedRecipeId] = useState<number | null>(null);
  const [recipes, setRecipes] = useState<SwapCandidateRecipe[] | null>(null);
  const [availableRecipeIds, setAvailableRecipeIds] = useState<number[] | null>(null);
  // Distinct from availableRecipeIds being null/empty because there's
  // genuinely no weekly menu configured — this means the check itself
  // couldn't run, so the recipe list below is unfiltered and may include
  // something not actually available for this date.
  const [menuLoadFailed, setMenuLoadFailed] = useState(false);
  const [preview, setPreview] = useState<MealSwapResponse | null>(null);
  const [chosenMode, setChosenMode] = useState<MealSwapMode | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorSuggestion, setErrorSuggestion] = useState<string | undefined>(undefined);

  const days = [...plan.meal_plan_day].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  // Payment-gated on top of the date/status check: reachable only through
  // ChangeOrderSheet, which already confirmed at least one day qualifies —
  // this just keeps any still-unpaid day (a mixed, pay-day-by-day order)
  // out of the picker rather than letting it be picked and then failing.
  const eligibleDays = days.filter(isDayModifiable).filter(isDayPaid);

  function pickDay(day: PlanDay) {
    setSelectedDay(day);
    setStep("pick_meal");
    setAvailableRecipeIds(null);
    setMenuLoadFailed(false);
    if (day.date) {
      getAvailableRecipeIdsForDate(day.date).then(ids => {
        setAvailableRecipeIds(ids);
        setMenuLoadFailed(ids === null);
      });
    }
    else setAvailableRecipeIds([]);
  }

  async function pickMeal(meal: DayRecipe) {
    setSelectedMeal(meal);
    setStep("pick_recipe");
    if (!recipes) {
      const supabase = createClient();
      const { data } = await supabase
        .from("recipe")
        .select("id, name, photo, could_be_breakfast, could_be_lunch, could_be_dinner, could_be_snack");
      setRecipes((data as SwapCandidateRecipe[] | null) ?? []);
    }
  }

  async function pickRecipe(recipe: SwapCandidateRecipe) {
    if (!selectedDay || !selectedMeal) return;
    setPickedRecipeId(recipe.id);
    setChosenMode(null);
    setStep("preview");
    setPreviewLoading(true);
    setError(null);
    setErrorSuggestion(undefined);
    try {
      const res = await previewMealSwap({
        user_id: userId,
        meal_plan_day_id: selectedDay.id,
        meal_plan_day_recipe_id: selectedMeal.id,
        new_recipe_id: recipe.id,
      });
      if (res.error) {
        setError(res.error.error);
        setErrorSuggestion(res.error.suggestion);
        setPreview(null);
      } else if (res.data) {
        setPreview(res.data);
        // Default to whichever option is actually usable, preferring the
        // fuller day rebalance when both work — unless they land on the
        // exact same outcome, in which case "meal_only" is the simpler,
        // more conservative pick (nothing else on the day is touched).
        const opts = res.data.options;
        if (opts.rebalance_day && swapOptionsMatch(opts.meal_only, opts.rebalance_day)) setChosenMode("meal_only");
        else if (opts.rebalance_day?.eligible) setChosenMode("rebalance_day");
        else if (opts.meal_only.eligible) setChosenMode("meal_only");
        else setChosenMode(opts.rebalance_day ? "rebalance_day" : "meal_only");
      }
    } catch {
      setError("Could not preview this swap. Please try again or contact us on WhatsApp.");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function confirm() {
    if (!selectedDay || !selectedMeal || !pickedRecipeId || !chosenMode) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await confirmMealSwap({
        user_id: userId,
        meal_plan_day_id: selectedDay.id,
        meal_plan_day_recipe_id: selectedMeal.id,
        new_recipe_id: pickedRecipeId,
        mode: chosenMode,
      });
      if (res.error) {
        setError(res.error.error);
        setErrorSuggestion(res.error.suggestion);
        return;
      }
      // The confirm response is the server's authoritative post-confirm
      // state (real wallet.balance_after included) — replace the earlier
      // preview with it rather than letting the "done" screen keep showing
      // numbers from before the wallet was actually settled.
      if (res.data) {
        setPreview(res.data);
        if (res.data.confirmed_mode) setChosenMode(res.data.confirmed_mode);
      }
      setStep("done");
    } catch {
      setError("Could not confirm this swap. Please try again or contact us on WhatsApp.");
    } finally {
      setSubmitting(false);
    }
  }

  const compatibleRecipes = (recipes ?? []).filter(r => {
    if (!selectedMeal) return false;
    if (r.id === selectedMeal.recipe?.id) return false;
    const t = selectedMeal.meal_type;
    const typeOk = (t === "breakfast" && r.could_be_breakfast)
        || (t === "lunch"     && r.could_be_lunch)
        || (t === "dinner"    && r.could_be_dinner)
        || (t === "snack"     && r.could_be_snack);
    if (!typeOk) return false;
    // Restrict to what's actually on the weekly menu for this date — fall
    // back to unfiltered could_be_X matching if no menu is configured.
    if (availableRecipeIds && availableRecipeIds.length > 0) return availableRecipeIds.includes(r.id);
    return true;
  });

  return (
    <div onClick={step === "done" ? undefined : onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(6,51,48,0.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, maxHeight: "85vh", overflowY: "auto", background: C.white, borderRadius: "18px 18px 0 0", padding: "22px 20px 32px", animation: "slideUp 0.22s ease" }}>

        {step === "pick_day" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>Modify a meal</h3>
              <button onClick={onClose} style={{ background: "none", border: "none", padding: 2, color: C.light, cursor: "pointer" }}>
                <IconX size={18} />
              </button>
            </div>
            <p style={{ fontSize: 12.5, color: C.muted, margin: "0 0 14px" }}>
              Pick a day, then a meal to swap. Any price difference settles through your Akli wallet — never your
              original payment.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {eligibleDays.length === 0 && (
                <p style={{ textAlign: "center", color: C.light, marginTop: 24, fontSize: 13 }}>
                  No days are available to modify right now.
                </p>
              )}
              {eligibleDays.map(day => (
                <button
                  key={day.id}
                  onClick={() => pickDay(day)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                    borderRadius: 10, border: `1px solid ${C.border}`, background: C.white,
                    cursor: "pointer", textAlign: "left",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{fmtDateLong(day.date)}</p>
                    <p style={{ margin: "1px 0 0", fontSize: 11, color: C.light }}>
                      {day.meal_plan_day_recipe.length} meal{day.meal_plan_day_recipe.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {step === "pick_meal" && selectedDay && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>{fmtDateLong(selectedDay.date)}</h3>
              <button onClick={onClose} style={{ background: "none", border: "none", padding: 2, color: C.light, cursor: "pointer" }}>
                <IconX size={18} />
              </button>
            </div>
            <p style={{ fontSize: 12.5, color: C.muted, margin: "0 0 14px" }}>
              Pick the meal you&apos;d like to swap.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
              {[...selectedDay.meal_plan_day_recipe].sort(byMealOrder).map(meal => (
                <button
                  key={meal.id}
                  onClick={() => pickMeal(meal)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                    borderRadius: 10, border: `1px solid ${C.border}`, background: C.white,
                    cursor: "pointer", textAlign: "left",
                  }}
                >
                  <span style={{ fontSize: 18 }}>{MEAL_EMOJI[meal.meal_type ?? ""] ?? "🍽️"}</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{meal.recipe?.name ?? "—"}</p>
                    <p style={{ margin: "1px 0 0", fontSize: 11, color: C.light }}>{meal.meal_type}</p>
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={() => setStep("pick_day")}
              style={{
                width: "100%", padding: "12px 0", borderRadius: 12, border: `1px solid ${C.border}`,
                background: C.white, color: C.muted, fontSize: 13.5, fontWeight: 600, cursor: "pointer",
              }}
            >
              Back
            </button>
          </>
        )}

        {step === "pick_recipe" && selectedMeal && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>Swap {selectedMeal.meal_type}</h3>
              <button onClick={onClose} style={{ background: "none", border: "none", padding: 2, color: C.light, cursor: "pointer" }}>
                <IconX size={18} />
              </button>
            </div>
            <p style={{ fontSize: 12.5, color: C.muted, margin: "0 0 12px" }}>
              Currently <strong>{selectedMeal.recipe?.name ?? "—"}</strong>. Pick a replacement.
            </p>
            {menuLoadFailed && (
              <p style={{ fontSize: 11.5, color: "#b45309", background: "#fff8e6", borderRadius: 7, padding: "7px 10px", margin: "0 0 12px" }}>
                Couldn&apos;t check this date&apos;s menu — showing everything valid for {selectedMeal.meal_type}, which may include something not actually on the menu that day.
              </p>
            )}

            {recipes === null ? (
              <p style={{ textAlign: "center", color: C.light, marginTop: 24, fontSize: 13 }}>Loading recipes…</p>
            ) : compatibleRecipes.length === 0 ? (
              <p style={{ textAlign: "center", color: C.light, marginTop: 24, fontSize: 13 }}>No alternatives available for this meal type.</p>
            ) : (
              <div style={{ maxHeight: "55vh", overflowY: "auto" }}>
                {compatibleRecipes.map(r => (
                  <button
                    key={r.id}
                    onClick={() => pickRecipe(r)}
                    style={{
                      width: "100%", display: "flex", gap: 12, alignItems: "center", padding: "12px 0",
                      background: "none", border: "none", borderBottom: `1px solid ${C.border}`,
                      cursor: "pointer", textAlign: "left",
                    }}
                  >
                    <div style={{ width: 52, height: 52, borderRadius: 9, overflow: "hidden", flexShrink: 0, background: C.offWhite, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {r.photo ? <img src={r.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <IconLeaf size={18} color={C.light} />}
                    </div>
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>{r.name}</span>
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={() => setStep("pick_meal")}
              style={{
                width: "100%", marginTop: 14, padding: "12px 0", borderRadius: 12, border: `1px solid ${C.border}`,
                background: C.white, color: C.muted, fontSize: 13.5, fontWeight: 600, cursor: "pointer",
              }}
            >
              Back
            </button>
          </>
        )}

        {step === "preview" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>Choose how to swap</h3>
              <button onClick={onClose} style={{ background: "none", border: "none", padding: 2, color: C.light, cursor: "pointer" }}>
                <IconX size={18} />
              </button>
            </div>

            {previewLoading && (
              <p style={{ textAlign: "center", color: C.light, margin: "24px 0", fontSize: 13 }}>Checking what&apos;s possible…</p>
            )}

            {!previewLoading && error && (
              <div style={{ background: "#fdf0ef", border: `1px solid ${C.error}`, borderRadius: 10, padding: "12px 14px", fontSize: 12.5, color: C.error, marginBottom: 14 }}>
                {error}
                {errorSuggestion === "cancel_and_replan" && (
                  <p style={{ margin: "6px 0 0" }}>
                    Try picking something closer in price, or cancel this day and re-order it from scratch.
                  </p>
                )}
              </div>
            )}

            {!previewLoading && preview && (
              <>
                <p style={{ fontSize: 12, color: C.muted, margin: "0 0 12px" }}>
                  Currently <strong style={{ color: "#1a1a1a" }}>{preview.before.meal.name}</strong> ({macroLine(preview.before.meal.macros)}).
                  Pick how you&apos;d like to apply the swap:
                </p>

                {(() => {
                  const rebalance = preview.options.rebalance_day;
                  const combined = rebalance && swapOptionsMatch(preview.options.meal_only, rebalance);
                  const cards = combined
                    ? [{
                        mode: "meal_only" as MealSwapMode,
                        title: "Apply this swap",
                        blurb: "No rebalancing needed — every other meal on the day stays exactly as it is.",
                        option: preview.options.meal_only,
                      }]
                    : [
                        {
                          mode: "meal_only" as MealSwapMode,
                          title: "Just this meal",
                          blurb: "Only the swapped meal changes — every other meal on the day stays exactly as it is.",
                          option: preview.options.meal_only,
                        },
                        ...(rebalance ? [{
                          mode: "rebalance_day" as MealSwapMode,
                          title: "Rebalance the day",
                          blurb: "Other meals may adjust a bit to keep the day's macros on target.",
                          option: rebalance,
                        }] : []),
                      ];
                  return cards.map(({ mode, title, blurb, option }) => {
                    const selected = combined || chosenMode === mode;
                    const swappedMeal = {
                      meal_plan_day_recipe_id: selectedMeal!.id,
                      meal_type: selectedMeal!.meal_type ?? "",
                      recipe_name: option.after.meal.name,
                      before_macros: preview.before.meal.macros,
                      after_macros: option.after.meal.macros,
                      isSwapped: true,
                    };
                    const unifiedMeals = [
                      swappedMeal,
                      ...option.after.other_meals.map(m => ({ ...m, isSwapped: false })),
                    ].sort(byMealOrder);
                    return (
                      <button
                        key={mode}
                        onClick={() => setChosenMode(mode)}
                        style={{
                          display: "block", width: "100%", textAlign: "left", cursor: "pointer",
                          border: `2px solid ${selected ? C.primary : C.border}`, borderRadius: 14,
                          background: selected ? "#f0f7f7" : C.white, padding: "12px 14px", marginBottom: 10,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                          <span style={{ fontSize: 13.5, fontWeight: 700, color: "#1a1a1a" }}>{title}</span>
                          <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                            <span style={{ fontSize: 9.5, color: C.light, textTransform: "uppercase", letterSpacing: 0.3 }}>
                              {priceDeltaLabel(option.price_delta).label}
                            </span>
                            <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 17, fontWeight: 500, color: option.eligible ? C.tealDark : C.error }}>
                              {priceDeltaLabel(option.price_delta).text}
                            </span>
                          </span>
                        </div>
                        <p style={{ margin: "0 0 6px", fontSize: 11.5, color: C.muted }}>{blurb}</p>
                        <p style={{ margin: "0 0 6px", fontSize: 11.5, color: C.muted }}>
                          Day: {macroLine(preview.before.day_totals)} <strong style={{ color: "#1a1a1a" }}>→ {macroLine(option.after.day_totals)}</strong>
                        </p>
                        <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 6, paddingTop: 6 }}>
                          {unifiedMeals.map(m => {
                            const changed = Math.round(m.after_macros.kcal) !== Math.round(m.before_macros.kcal)
                              || Math.round(m.after_macros.protein) !== Math.round(m.before_macros.protein)
                              || Math.round(m.after_macros.carbs) !== Math.round(m.before_macros.carbs)
                              || Math.round(m.after_macros.fat) !== Math.round(m.before_macros.fat);
                            return (
                              <p key={m.meal_plan_day_recipe_id} style={{ margin: "0 0 2px", fontSize: 10.5, color: C.light }}>
                                {MEAL_EMOJI[m.meal_type] ?? "🍽️"} {m.recipe_name ?? "—"}{m.isSwapped ? " (swapped)" : ""}
                                {changed || m.isSwapped ? ` · ${macroLine(m.before_macros)} → ${macroLine(m.after_macros)}` : " · unchanged"}
                              </p>
                            );
                          })}
                        </div>
                        {!option.eligible && (
                          <p style={{ margin: "6px 0 0", fontSize: 11.5, color: C.error, fontWeight: 600 }}>
                            Short by ${(option.required_topup ?? 0).toFixed(2)} — top up your wallet to use this option.
                          </p>
                        )}
                      </button>
                    );
                  });
                })()}

                {chosenMode && (
                  <div style={{ background: C.offWhite, borderRadius: 12, padding: "10px 14px", margin: "4px 0 16px", display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: C.muted }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Wallet now</span>
                      <span style={{ fontWeight: 600, color: "#1a1a1a" }}>${preview.options[chosenMode]!.wallet.balance_before.toFixed(2)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Wallet after</span>
                      <span style={{ fontWeight: 600, color: "#1a1a1a" }}>${preview.options[chosenMode]!.wallet.balance_after.toFixed(2)}</span>
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => setStep("pick_recipe")}
                    disabled={submitting}
                    style={{
                      flex: 1, padding: "13px 0", borderRadius: 12, border: `1px solid ${C.border}`,
                      background: C.white, color: C.muted, fontSize: 13.5, fontWeight: 600,
                      cursor: submitting ? "default" : "pointer",
                    }}
                  >
                    Back
                  </button>
                  <button
                    onClick={confirm}
                    disabled={submitting || !chosenMode || !preview.options[chosenMode]?.eligible}
                    style={{
                      flex: 2, padding: "13px 0", borderRadius: 12, border: "none",
                      background: (!chosenMode || !preview.options[chosenMode]?.eligible) ? C.border : C.primary,
                      color: C.white, fontSize: 13.5, fontWeight: 600,
                      cursor: submitting || !chosenMode || !preview.options[chosenMode]?.eligible ? "default" : "pointer",
                      opacity: submitting ? 0.7 : 1,
                    }}
                  >
                    {submitting ? "Confirming…" : "Confirm swap"}
                  </button>
                </div>
              </>
            )}

            {!previewLoading && !preview && error && (
              <button
                onClick={() => setStep("pick_recipe")}
                style={{
                  width: "100%", padding: "13px 0", borderRadius: 12, border: `1px solid ${C.border}`,
                  background: C.white, color: C.muted, fontSize: 13.5, fontWeight: 600, cursor: "pointer",
                }}
              >
                Choose a different recipe
              </button>
            )}
          </>
        )}

        {step === "done" && preview && chosenMode && (
          <div style={{ textAlign: "center", padding: "12px 0 4px" }}>
            <div style={{
              width: 52, height: 52, borderRadius: "50%", background: "#e6f7f0", margin: "0 auto 16px",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <IconCheck size={26} color="#15803d" />
            </div>
            <h3 style={{ margin: "0 0 8px", fontSize: 18 }}>Meal swapped</h3>
            <p style={{ fontSize: 13, color: C.muted, margin: "0 0 20px", lineHeight: 1.6 }}>
              {preview.options[chosenMode]!.after.meal.name} is now on your order.
              {preview.options[chosenMode]!.price_delta !== 0 && (
                <> Your wallet balance is now <strong style={{ color: "#1a1a1a" }}>${preview.options[chosenMode]!.wallet.balance_after.toFixed(2)}</strong>.</>
              )}
            </p>
            <button
              onClick={onSubmitted}
              style={{
                width: "100%", padding: "13px 0", borderRadius: 12, border: "none",
                background: C.primary, color: C.white, fontSize: 14, fontWeight: 600, cursor: "pointer",
              }}
            >
              Got it
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Edit day sheet — exclude/replace/add meals for a whole day ──────────────

type MealAction =
  | { kind: "keep" }
  | { kind: "delete" }
  | { kind: "replace"; recipeId: number; recipeName: string | null };

type PickTarget =
  | { kind: "replace"; mpdrId: number; mealType: string }
  | { kind: "add"; mealType: string };

const ALL_MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"];

function DayEditSheet({ plan, userId, onClose, onSubmitted }: {
  plan: MealPlan; userId: string; onClose: () => void; onSubmitted: () => void;
}) {
  type Step = "pick_day" | "edit" | "pick_recipe" | "preview" | "done";
  const [step, setStep] = useState<Step>("pick_day");
  const [selectedDay, setSelectedDay] = useState<PlanDay | null>(null);
  const [mealActions, setMealActions] = useState<Record<number, MealAction>>({});
  const [addedMeals, setAddedMeals] = useState<{ meal_type: string; recipeId: number; recipeName: string | null }[]>([]);
  const [pickingFor, setPickingFor] = useState<PickTarget | null>(null);
  const [recipes, setRecipes] = useState<SwapCandidateRecipe[] | null>(null);
  const [availableRecipeIds, setAvailableRecipeIds] = useState<number[] | null>(null);
  // See ModifyMealSheet's identical flag — distinguishes "couldn't check
  // the menu" from "no menu configured," which otherwise look the same.
  const [menuLoadFailed, setMenuLoadFailed] = useState(false);
  const [preview, setPreview] = useState<DayEditResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const days = [...plan.meal_plan_day].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  // Payment-gated on top of the date/status check: reachable only through
  // ChangeOrderSheet, which already confirmed at least one day qualifies —
  // this just keeps any still-unpaid day (a mixed, pay-day-by-day order)
  // out of the picker rather than letting it be picked and then failing.
  const eligibleDays = days.filter(isDayModifiable).filter(isDayPaid);

  async function pickDay(day: PlanDay) {
    setSelectedDay(day);
    setMealActions({});
    setAddedMeals([]);
    setStep("edit");
    setAvailableRecipeIds(null);
    setMenuLoadFailed(false);
    if (day.date) {
      getAvailableRecipeIdsForDate(day.date).then(ids => {
        setAvailableRecipeIds(ids);
        setMenuLoadFailed(ids === null);
      });
    } else {
      setAvailableRecipeIds([]);
    }
    if (!recipes) {
      const supabase = createClient();
      const { data } = await supabase
        .from("recipe")
        .select("id, name, photo, could_be_breakfast, could_be_lunch, could_be_dinner, could_be_snack");
      setRecipes((data as SwapCandidateRecipe[] | null) ?? []);
    }
  }

  function actionFor(mpdrId: number): MealAction {
    return mealActions[mpdrId] ?? { kind: "keep" };
  }

  function toggleDelete(mpdrId: number) {
    setMealActions(prev => {
      const next = { ...prev };
      if (next[mpdrId]?.kind === "delete") delete next[mpdrId];
      else next[mpdrId] = { kind: "delete" };
      return next;
    });
  }

  function clearAction(mpdrId: number) {
    setMealActions(prev => {
      const next = { ...prev };
      delete next[mpdrId];
      return next;
    });
  }

  function pickRecipeFor(recipe: SwapCandidateRecipe) {
    if (!pickingFor) return;
    if (pickingFor.kind === "replace") {
      setMealActions(prev => ({ ...prev, [pickingFor.mpdrId]: { kind: "replace", recipeId: recipe.id, recipeName: recipe.name } }));
    } else {
      setAddedMeals(prev => [...prev, { meal_type: pickingFor.mealType, recipeId: recipe.id, recipeName: recipe.name }]);
    }
    setPickingFor(null);
    setStep("edit");
  }

  const currentMeals = [...(selectedDay?.meal_plan_day_recipe ?? [])].sort(byMealOrder);
  const remainingMealTypes = new Set(
    currentMeals.filter(m => actionFor(m.id).kind !== "delete").map(m => m.meal_type ?? "")
  );
  for (const a of addedMeals) remainingMealTypes.add(a.meal_type);
  const availableToAdd = ALL_MEAL_TYPES.filter(mt => !remainingMealTypes.has(mt));

  function buildChanges(): DayEditChange[] {
    const changes: DayEditChange[] = [];
    for (const m of currentMeals) {
      const a = actionFor(m.id);
      if (a.kind === "delete") changes.push({ action: "delete", meal_plan_day_recipe_id: m.id });
      else if (a.kind === "replace") changes.push({ action: "replace", meal_plan_day_recipe_id: m.id, new_recipe_id: a.recipeId });
    }
    for (const add of addedMeals) {
      changes.push({ action: "add", meal_type: add.meal_type, new_recipe_id: add.recipeId });
    }
    return changes;
  }
  const changes = buildChanges();

  async function goPreview() {
    if (!selectedDay) return;
    setStep("preview");
    setPreviewLoading(true);
    setError(null);
    try {
      const res = await previewDayEdit({ user_id: userId, meal_plan_day_id: selectedDay.id, changes });
      if (res.error) {
        setError(res.error.error);
        setPreview(null);
      } else if (res.data) {
        setPreview(res.data);
      }
    } catch {
      setError("Could not preview these changes. Please try again or contact us on WhatsApp.");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function confirm() {
    if (!selectedDay) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await confirmDayEdit({ user_id: userId, meal_plan_day_id: selectedDay.id, changes });
      if (res.error) {
        setError(res.error.error);
        return;
      }
      // Same as meal-swap confirm: replace the pre-confirm preview with the
      // server's authoritative post-confirm response so the "done" screen
      // shows the real settled wallet balance, not the earlier preview's.
      if (res.data) setPreview(res.data);
      setStep("done");
    } catch {
      setError("Could not confirm these changes. Please try again or contact us on WhatsApp.");
    } finally {
      setSubmitting(false);
    }
  }

  const compatibleRecipes = (recipes ?? []).filter(r => {
    if (!pickingFor) return false;
    const t = pickingFor.mealType;
    const typeOk = (t === "breakfast" && r.could_be_breakfast)
        || (t === "lunch"     && r.could_be_lunch)
        || (t === "dinner"    && r.could_be_dinner)
        || (t === "snack"     && r.could_be_snack);
    if (!typeOk) return false;
    if (availableRecipeIds && availableRecipeIds.length > 0) return availableRecipeIds.includes(r.id);
    return true;
  });

  return (
    <div onClick={step === "done" ? undefined : onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(6,51,48,0.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, maxHeight: "85vh", overflowY: "auto", background: C.white, borderRadius: "18px 18px 0 0", padding: "22px 20px 32px", animation: "slideUp 0.22s ease" }}>

        {step === "pick_day" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>Edit a day</h3>
              <button onClick={onClose} style={{ background: "none", border: "none", padding: 2, color: C.light, cursor: "pointer" }}>
                <IconX size={18} />
              </button>
            </div>
            <p style={{ fontSize: 12.5, color: C.muted, margin: "0 0 14px" }}>
              Exclude a meal, swap recipes, or add one back — all in one go. This is blocking: if the wallet can&apos;t
              cover the cost, you&apos;ll need to top up before it goes through.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {eligibleDays.length === 0 && (
                <p style={{ textAlign: "center", color: C.light, marginTop: 24, fontSize: 13 }}>
                  No days are available to edit right now.
                </p>
              )}
              {eligibleDays.map(day => (
                <button
                  key={day.id}
                  onClick={() => pickDay(day)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                    borderRadius: 10, border: `1px solid ${C.border}`, background: C.white,
                    cursor: "pointer", textAlign: "left",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{fmtDateLong(day.date)}</p>
                    <p style={{ margin: "1px 0 0", fontSize: 11, color: C.light }}>
                      {day.meal_plan_day_recipe.length} meal{day.meal_plan_day_recipe.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {step === "edit" && selectedDay && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>{fmtDateLong(selectedDay.date)}</h3>
              <button onClick={onClose} style={{ background: "none", border: "none", padding: 2, color: C.light, cursor: "pointer" }}>
                <IconX size={18} />
              </button>
            </div>
            <p style={{ fontSize: 12.5, color: C.muted, margin: "0 0 12px" }}>
              Tap a meal to exclude or replace it.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              {currentMeals.map(m => {
                const a = actionFor(m.id);
                const isDeleted = a.kind === "delete";
                const isReplaced = a.kind === "replace";
                return (
                  <div key={m.id} style={{
                    border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px",
                    background: isDeleted ? "#fdf0ef" : isReplaced ? "#f0f7f7" : C.white,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 16 }}>{MEAL_EMOJI[m.meal_type ?? ""] ?? "🍽️"}</span>
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: isDeleted ? C.light : "#1a1a1a", textDecoration: isDeleted ? "line-through" : "none" }}>
                          {isReplaced ? a.recipeName : m.recipe?.name ?? "—"}
                        </p>
                        <p style={{ margin: "1px 0 0", fontSize: 11, color: C.light }}>
                          {m.meal_type}{isDeleted ? " · excluded" : isReplaced ? ` · was ${m.recipe?.name ?? "—"}` : ""}
                        </p>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      {a.kind === "keep" && (
                        <>
                          <button
                            onClick={() => { setPickingFor({ kind: "replace", mpdrId: m.id, mealType: m.meal_type ?? "" }); setStep("pick_recipe"); }}
                            style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, color: C.muted, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                          >
                            Replace
                          </button>
                          <button
                            onClick={() => toggleDelete(m.id)}
                            style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: `1px solid ${C.error}40`, background: C.white, color: C.error, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                          >
                            Exclude
                          </button>
                        </>
                      )}
                      {a.kind !== "keep" && (
                        <button
                          onClick={() => clearAction(m.id)}
                          style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, color: C.muted, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                        >
                          Undo
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {addedMeals.map((a, i) => (
                <div key={`added-${i}`} style={{ border: `1px solid ${C.teal}`, borderRadius: 10, padding: "10px 12px", background: "#f0f7f7" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 16 }}>{MEAL_EMOJI[a.meal_type] ?? "🍽️"}</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{a.recipeName}</p>
                      <p style={{ margin: "1px 0 0", fontSize: 11, color: C.light }}>{a.meal_type} · added</p>
                    </div>
                    <button
                      onClick={() => setAddedMeals(prev => prev.filter((_, idx) => idx !== i))}
                      style={{ background: "none", border: "none", padding: 2, color: C.light, cursor: "pointer" }}
                    >
                      <IconX size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {availableToAdd.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
                {availableToAdd.map(mt => (
                  <button
                    key={mt}
                    onClick={() => { setPickingFor({ kind: "add", mealType: mt }); setStep("pick_recipe"); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 20,
                      border: `1px dashed ${C.border}`, background: C.white, color: C.tealDark, fontSize: 12, fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    {MEAL_EMOJI[mt] ?? "🍽️"} Add {mt}
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={goPreview}
              disabled={changes.length === 0}
              style={{
                width: "100%", padding: "13px 0", borderRadius: 12, border: "none",
                background: changes.length === 0 ? C.border : C.primary, color: C.white,
                fontSize: 14, fontWeight: 600, cursor: changes.length === 0 ? "default" : "pointer",
              }}
            >
              {changes.length === 0 ? "Make a change to continue" : "Preview changes"}
            </button>
          </>
        )}

        {step === "pick_recipe" && pickingFor && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>
                {pickingFor.kind === "add" ? `Add ${pickingFor.mealType}` : `Replace ${pickingFor.mealType}`}
              </h3>
              <button onClick={onClose} style={{ background: "none", border: "none", padding: 2, color: C.light, cursor: "pointer" }}>
                <IconX size={18} />
              </button>
            </div>
            {menuLoadFailed && (
              <p style={{ fontSize: 11.5, color: "#b45309", background: "#fff8e6", borderRadius: 7, padding: "7px 10px", margin: "0 0 12px" }}>
                Couldn&apos;t check this date&apos;s menu — showing everything valid for {pickingFor.mealType}, which may include something not actually on the menu that day.
              </p>
            )}

            {recipes === null ? (
              <p style={{ textAlign: "center", color: C.light, marginTop: 24, fontSize: 13 }}>Loading recipes…</p>
            ) : compatibleRecipes.length === 0 ? (
              <p style={{ textAlign: "center", color: C.light, marginTop: 24, fontSize: 13 }}>No alternatives available for this meal type.</p>
            ) : (
              <div style={{ maxHeight: "55vh", overflowY: "auto" }}>
                {compatibleRecipes.map(r => (
                  <button
                    key={r.id}
                    onClick={() => pickRecipeFor(r)}
                    style={{
                      width: "100%", display: "flex", gap: 12, alignItems: "center", padding: "12px 0",
                      background: "none", border: "none", borderBottom: `1px solid ${C.border}`,
                      cursor: "pointer", textAlign: "left",
                    }}
                  >
                    <div style={{ width: 52, height: 52, borderRadius: 9, overflow: "hidden", flexShrink: 0, background: C.offWhite, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {r.photo ? <img src={r.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <IconLeaf size={18} color={C.light} />}
                    </div>
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>{r.name}</span>
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={() => { setPickingFor(null); setStep("edit"); }}
              style={{
                width: "100%", marginTop: 14, padding: "12px 0", borderRadius: 12, border: `1px solid ${C.border}`,
                background: C.white, color: C.muted, fontSize: 13.5, fontWeight: 600, cursor: "pointer",
              }}
            >
              Back
            </button>
          </>
        )}

        {step === "preview" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>Confirm changes</h3>
              <button onClick={onClose} style={{ background: "none", border: "none", padding: 2, color: C.light, cursor: "pointer" }}>
                <IconX size={18} />
              </button>
            </div>

            {previewLoading && (
              <p style={{ textAlign: "center", color: C.light, margin: "24px 0", fontSize: 13 }}>Working it out…</p>
            )}

            {!previewLoading && error && (
              <div style={{ background: "#fdf0ef", border: `1px solid ${C.error}`, borderRadius: 10, padding: "12px 14px", fontSize: 12.5, color: C.error, marginBottom: 14 }}>
                {error}
              </div>
            )}

            {!previewLoading && preview && (
              <>
                <div style={{ background: C.offWhite, borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: C.light, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.3 }}>
                    <span>Day total (before → after)</span>
                    <span>Your goal</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                    <span style={{ fontSize: 12, color: C.muted }}>
                      {macroLine(preview.before.day_totals)}
                      <br />
                      <strong style={{ color: "#1a1a1a" }}>→ {macroLine(preview.after.day_totals)}</strong>
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.tealDark, textAlign: "right", whiteSpace: "nowrap" }}>
                      {macroLine(preview.goal)}
                    </span>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
                  {[...preview.after.meals].sort(byMealOrder).map((m, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: C.offWhite, borderRadius: 8 }}>
                      <span style={{ fontSize: 12.5 }}>{MEAL_EMOJI[m.meal_type] ?? "🍽️"} {m.recipe_name ?? "—"}</span>
                      <span style={{ fontSize: 11, color: C.light }}>{macroLine(m.macros)}</span>
                    </div>
                  ))}
                </div>

                {preview.eligible ? (
                  <div style={{ background: "#f0f7f7", borderRadius: 14, padding: "16px 16px 14px", marginBottom: 18 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>
                        {priceDeltaLabel(preview.price_delta).label}
                      </span>
                      <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 500, color: C.tealDark }}>
                        {priceDeltaLabel(preview.price_delta).text}
                      </span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: C.muted }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>Wallet now</span>
                        <span style={{ fontWeight: 600, color: "#1a1a1a" }}>${preview.wallet.balance_before.toFixed(2)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>Wallet after</span>
                        <span style={{ fontWeight: 600, color: "#1a1a1a" }}>${preview.wallet.balance_after.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ background: "#fdf0ef", border: `1px solid ${C.error}30`, borderRadius: 14, padding: "16px 16px 14px", marginBottom: 18 }}>
                    <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>
                      Not enough in your wallet for these changes
                    </p>
                    <p style={{ margin: 0, fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
                      This costs ${preview.price_delta.toFixed(2)}, and your wallet is short by{" "}
                      <strong style={{ color: C.error }}>${(preview.required_topup ?? 0).toFixed(2)}</strong>. Top up
                      your wallet from your profile, or adjust your changes.
                    </p>
                  </div>
                )}

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => setStep("edit")}
                    disabled={submitting}
                    style={{
                      flex: 1, padding: "13px 0", borderRadius: 12, border: `1px solid ${C.border}`,
                      background: C.white, color: C.muted, fontSize: 13.5, fontWeight: 600,
                      cursor: submitting ? "default" : "pointer",
                    }}
                  >
                    Back
                  </button>
                  {preview.eligible && (
                    <button
                      onClick={confirm}
                      disabled={submitting}
                      style={{
                        flex: 2, padding: "13px 0", borderRadius: 12, border: "none",
                        background: C.primary, color: C.white, fontSize: 13.5, fontWeight: 600,
                        cursor: submitting ? "default" : "pointer", opacity: submitting ? 0.7 : 1,
                      }}
                    >
                      {submitting ? "Confirming…" : "Confirm changes"}
                    </button>
                  )}
                </div>
              </>
            )}

            {!previewLoading && !preview && error && (
              <button
                onClick={() => setStep("edit")}
                style={{
                  width: "100%", padding: "13px 0", borderRadius: 12, border: `1px solid ${C.border}`,
                  background: C.white, color: C.muted, fontSize: 13.5, fontWeight: 600, cursor: "pointer",
                }}
              >
                Back to editing
              </button>
            )}
          </>
        )}

        {step === "done" && (
          <div style={{ textAlign: "center", padding: "12px 0 4px" }}>
            <div style={{
              width: 52, height: 52, borderRadius: "50%", background: "#e6f7f0", margin: "0 auto 16px",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <IconCheck size={26} color="#15803d" />
            </div>
            <h3 style={{ margin: "0 0 8px", fontSize: 18 }}>Day updated</h3>
            <p style={{ fontSize: 13, color: C.muted, margin: "0 0 20px", lineHeight: 1.6 }}>
              Your changes are locked in.
              {preview && preview.price_delta !== 0 && (
                <> Your wallet balance is now <strong style={{ color: "#1a1a1a" }}>${preview.wallet.balance_after.toFixed(2)}</strong>.</>
              )}
            </p>
            <button
              onClick={onSubmitted}
              style={{
                width: "100%", padding: "13px 0", borderRadius: 12, border: "none",
                background: C.primary, color: C.white, fontSize: 14, fontWeight: 600, cursor: "pointer",
              }}
            >
              Got it
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Order card ───────────────────────────────────────────────────────────────

function OrderCard({ plan, userId }: { plan: MealPlan; userId: string }) {
  const router = useRouter();
  const [open, setOpen]         = useState(false);
  const [receipt, setReceipt]   = useState(false);
  const [cancelSheet, setCancelSheet] = useState(false);
  const [changeSheet, setChangeSheet] = useState(false);
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
  const cancelState = cancellationButtonState(plan);
  const modifyState = modifyButtonState(plan);

  // Unique meal count
  const totalMeals = days.reduce((s, d) => s + (d.meal_plan_day_recipe?.length ?? 0), 0);

  return (
    <>
      {receipt && <ReceiptModal plan={plan} onClose={() => setReceipt(false)} />}
      {cancelSheet && (
        <CancelOrderSheet
          plan={plan}
          userId={userId}
          onClose={() => setCancelSheet(false)}
          onSubmitted={() => { setCancelSheet(false); router.refresh(); }}
        />
      )}
      {changeSheet && (
        <ChangeOrderSheet
          plan={plan}
          userId={userId}
          onClose={() => setChangeSheet(false)}
          onSubmitted={() => { setChangeSheet(false); router.refresh(); }}
        />
      )}

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
              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4, marginBottom: 6 }}>
                {pInfo.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={pInfo.logo} alt={pInfo.label} style={{ width: 16, height: 16, borderRadius: 3, objectFit: "cover" }} />
                ) : (
                  <span style={{ fontSize: 13 }}>{pInfo.icon}</span>
                )}
                <span style={{ fontSize: 11, color: C.light }}>{pInfo.label}</span>
              </div>
              <button
                onClick={() => setReceipt(true)}
                style={{
                  display: "flex", alignItems: "center", gap: 4, marginLeft: "auto",
                  background: "none", border: "none", padding: 0, cursor: "pointer",
                  fontSize: 11.5, fontWeight: 600, color: C.tealDark, textDecoration: "underline",
                }}
              >
                <IconReceipt2 size={13} /> View receipt
              </button>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 6 }}>
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
            {cancelState.show && (
              <button
                onClick={() => !cancelState.disabled && setCancelSheet(true)}
                disabled={cancelState.disabled}
                title={cancelState.reason}
                style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  padding: "9px 0", borderRadius: 10,
                  border: `1px solid ${cancelState.disabled ? C.border : C.error}`,
                  background: cancelState.disabled ? C.offWhite : C.white,
                  fontSize: 12.5, fontWeight: 500,
                  color: cancelState.disabled ? C.light : C.error,
                  cursor: cancelState.disabled ? "default" : "pointer",
                }}
              >
                <IconBan size={14} /> {cancelState.label}
              </button>
            )}
            {modifyState.show && (
              <button
                onClick={() => !modifyState.disabled && setChangeSheet(true)}
                disabled={modifyState.disabled}
                title={modifyState.reason}
                style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  padding: "9px 0", borderRadius: 10,
                  border: `1px solid ${modifyState.disabled ? C.border : C.tealDark}`,
                  background: modifyState.disabled ? C.offWhite : C.white,
                  fontSize: 12.5, fontWeight: 500,
                  color: modifyState.disabled ? C.light : C.tealDark,
                  cursor: modifyState.disabled ? "default" : "pointer",
                }}
              >
                {modifyState.label}
              </button>
            )}
          </div>
          {cancelState.show && cancelState.disabled && cancelState.reason && (
            <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "#b45309" }}>{cancelState.reason}</p>
          )}
          {modifyState.show && modifyState.disabled && modifyState.reason && (
            <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "#b45309" }}>{modifyState.reason}</p>
          )}
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
                          {deliveryStatusLabel(delivery.status)}
                        </span>
                      )}
                      {payment?.amount != null && (
                        <span style={{
                          fontSize: 11, fontWeight: 600,
                          color: day.status === "cancelled" ? C.light : C.tealDark,
                          textDecoration: day.status === "cancelled" ? "line-through" : "none",
                        }}>
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

export default function OrderHistory({ plans, userId, hasOlderOrders = false, walletBalance = 0 }: {
  plans: MealPlan[]; userId: string; hasOlderOrders?: boolean; walletBalance?: number;
}) {
  const router = useRouter();

  // Sectioning is date-based, not cancellation-badge-based — an order with a
  // pending (undecided) cancellation stays put in its natural section; only
  // a fully finalized cancellation moves it to "Cancelled".
  const cancelled = plans.filter(p => planStatus(p) === "cancelled");
  const stillActive = plans.filter(p => planStatus(p) !== "cancelled");
  const active    = stillActive.filter(p => dateStatus(p) === "active");
  const upcoming  = stillActive.filter(p => dateStatus(p) === "upcoming");
  const completed = stillActive.filter(p => dateStatus(p) === "completed");

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
          const totalMeals = plans.reduce((s, p) => s + p.meal_plan_day.reduce((d, day) => d + (day.meal_plan_day_recipe?.length ?? 0), 0), 0);
          const totalDays  = plans.reduce((s, p) => s + p.meal_plan_day.length, 0);
          return (
            <div style={{ display: "flex", gap: 8 }}>
              {[
                { label: "Orders",     value: `${plans.length}` },
                { label: "Days",       value: `${totalDays}` },
                { label: "Meals",      value: `${totalMeals}` },
                { label: "Wallet",     value: `$${walletBalance.toFixed(0)}` },
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
                {active.map(p => <OrderCard key={p.id} plan={p} userId={userId} />)}
              </Section>
            )}
            {upcoming.length > 0 && (
              <Section label="Upcoming" emoji="🔵">
                {upcoming.map(p => <OrderCard key={p.id} plan={p} userId={userId} />)}
              </Section>
            )}
            {completed.length > 0 && (
              <Section label="Past orders" emoji="✅">
                {completed.map(p => <OrderCard key={p.id} plan={p} userId={userId} />)}
              </Section>
            )}
            {cancelled.length > 0 && (
              <Section label="Cancelled" emoji="🚫">
                {cancelled.map(p => <OrderCard key={p.id} plan={p} userId={userId} />)}
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
