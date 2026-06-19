"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  IconArrowLeft, IconArrowRight, IconX, IconRefresh,
  IconLeaf, IconCheck, IconBrandWhatsapp, IconChevronDown,
} from "@tabler/icons-react";
import type { Database } from "@/lib/supabase/types";
import {
  generateMealPlan, getCheckoutSummary, confirmOrder, updateMealPlan, simplePriceSimulator,
  type GenerateMealPlanResponse, type CheckoutSummaryResponse, type PlanDay, type Meal, type ChangeLog,
} from "@/lib/flask";
import RecipeRater from "@/components/RecipeRater";
import { type PrefRating } from "@/lib/preferences";

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = "days" | "generating" | "review" | "checkout" | "confirmed";
type MealType = "breakfast" | "lunch" | "dinner" | "snack";

type RecipeRow = {
  id: number; name: string | null; photo: string | null;
  could_be_breakfast: boolean | null; could_be_lunch: boolean | null;
  could_be_dinner: boolean | null; could_be_snack: boolean | null;
};

export type OrderableWeek = {
  id: number;
  week_start_date: string;
  week_end_date: string;
  weekdays: string[];
  recipes: RecipeRow[];
};

type DeliverySlot = Database["public"]["Tables"]["delivery_slots"]["Row"];
type UserRow      = Database["public"]["Tables"]["user"]["Row"];
type MacroRow     = Database["public"]["Tables"]["daily_macro_target"]["Row"];

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

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch:     "Lunch",
  dinner:    "Dinner",
  snack:     "Snack",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtWeekRange(start: string, end: string) {
  const s = new Date(start + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const e = new Date(end   + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${s} – ${e}`;
}

function fmtDayChip(iso: string) {
  const d = new Date(iso + "T12:00:00");
  return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()] + " " + d.getDate();
}

function fmtDayFull(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });
}

function fmtTime(t: string | null) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "pm" : "am";
  const hr = h % 12 || 12;
  return m === 0 ? `${hr}${ap}` : `${hr}:${m.toString().padStart(2,"0")}${ap}`;
}

function mealBadgeStyle(type: string): React.CSSProperties {
  const map: Record<string, { color: string; bg: string }> = {
    breakfast: { color: "#b07d1a", bg: "#fff4de" },
    lunch:     { color: C.tealDark, bg: "#e8f4f4" },
    dinner:    { color: "#2d6b5e", bg: "#ddf0ed" },
    snack:     { color: "#8a6a3a", bg: "#f5ede0" },
  };
  const s = map[type] ?? { color: C.muted, bg: C.offWhite };
  return { fontSize: 10.5, fontWeight: 600, color: s.color, background: s.bg, padding: "2px 8px", borderRadius: 20 };
}

// ─── Range picker ─────────────────────────────────────────────────────────────

// Safe local ISO — avoids UTC-offset day-shift bug from toISOString()
function localISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function RangePicker({ orderableWeeks, rangeStart, rangeEnd, removed, onPick, onRemoveDay }: {
  orderableWeeks: OrderableWeek[];
  rangeStart: string | null;
  rangeEnd:   string | null;
  removed:    Set<string>;
  onPick:      (iso: string) => void;
  onRemoveDay: (iso: string) => void;
}) {
  const today        = localISO(new Date());
  const availableSet = new Set(orderableWeeks.flatMap(w => w.weekdays));

  // Derive all ISOs in the selected range (available weekdays minus removed)
  const selectedInRange = new Set<string>();
  if (rangeStart && rangeEnd) {
    const cur = new Date(rangeStart + "T12:00:00");
    const end = new Date(rangeEnd   + "T12:00:00");
    while (cur <= end) {
      const iso = localISO(cur);
      if (availableSet.has(iso) && !removed.has(iso)) selectedInRange.add(iso);
      cur.setDate(cur.getDate() + 1);
    }
  }

  // Months to display
  const allAvail = [...availableSet].sort();
  const months: { year: number; month: number }[] = [];
  for (const iso of allAvail) {
    const [y, m] = iso.split("-").map(Number);
    if (!months.find(x => x.year === y && x.month === m)) months.push({ year: y, month: m });
  }

  const sortedSelected = [...selectedInRange].sort();

  return (
    <div style={{ marginBottom: 24, maxWidth: 340, margin: "0 auto 24px" }}>

      {/* Instruction hint */}
      <p style={{ fontSize: 12, color: C.muted, margin: "0 0 12px" }}>
        {!rangeStart
          ? "Tap a start date"
          : !rangeEnd
            ? "Now tap an end date"
            : `${sortedSelected.length} day${sortedSelected.length !== 1 ? "s" : ""} selected — tap a day to reset`}
      </p>

      {/* Calendar months */}
      {months.map(({ year, month }) => {
        const monthName = new Date(year, month - 1, 1)
          .toLocaleDateString("en-GB", { month: "long", year: "numeric" });

        const firstDow  = (new Date(year, month - 1, 1).getDay() + 6) % 7; // Mon=0
        const daysInMonth = new Date(year, month, 0).getDate();

        const cells: (string | null)[] = [
          ...Array(firstDow).fill(null),
          ...Array.from({ length: daysInMonth }, (_, i) => {
            return `${year}-${String(month).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
          }),
        ];
        while (cells.length % 7 !== 0) cells.push(null);
        const rows: (string | null)[][] = [];
        for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

        return (
          <div key={`${year}-${month}`} style={{ marginBottom: 18 }}>
            <p style={{ fontSize: 12.5, fontWeight: 600, color: "#1a1a1a", margin: "0 0 8px" }}>{monthName}</p>

            {/* DOW header */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 2 }}>
              {DOW.map(d => (
                <div key={d} style={{ textAlign: "center", fontSize: 10, color: C.light, fontWeight: 600, padding: "2px 0" }}>
                  {d}
                </div>
              ))}
            </div>

            {/* Rows */}
            {rows.map((row, ri) => (
              <div key={ri} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 2 }}>
                {row.map((iso, ci) => {
                  if (!iso) return <div key={ci} />;

                  const dow         = ci; // Mon=0 … Sun=6
                  const isWeekend   = dow >= 5;
                  const isAvail     = availableSet.has(iso);
                  const isPast      = iso < today;
                  const isToday     = iso === today;
                  const disabled    = isWeekend || isPast || !isAvail;
                  const isStart     = iso === rangeStart;
                  const isEnd       = iso === rangeEnd;
                  const inRange     = rangeStart && rangeEnd && iso >= rangeStart && iso <= rangeEnd && isAvail;
                  const isRemoved   = removed.has(iso) && inRange;
                  const isSelected  = selectedInRange.has(iso);
                  const dayNum      = parseInt(iso.split("-")[2], 10);

                  // Visual state
                  let bg = "transparent";
                  let color = isWeekend || isPast ? "#d0cbc5" : "#1a1a1a";
                  let fontWeight: number = 400;
                  let border = "none";
                  let opacity = 1;

                  if (isStart || isEnd) {
                    bg = C.primary; color = C.white; fontWeight = 700;
                  } else if (isSelected) {
                    bg = "#e8f4f4"; color = C.tealDark; fontWeight = 600;
                  } else if (isRemoved) {
                    bg = "transparent"; color = "#d0cbc5"; fontWeight = 400;
                    border = `1px dashed ${C.border}`; opacity = 0.6;
                  } else if (inRange && isWeekend) {
                    bg = "#f5f5f3"; color = "#d0cbc5";
                  }

                  if (isToday && !isStart && !isEnd) border = `1.5px solid ${C.teal}`;

                  return (
                    <button
                      key={iso}
                      onClick={() => !disabled && onPick(iso)}
                      disabled={disabled}
                      style={{
                        height: 34, borderRadius: 7, border, background: bg, color,
                        fontSize: 12.5, fontWeight,
                        cursor: disabled ? "default" : "pointer",
                        transition: "all 0.1s", opacity,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      {dayNum}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        );
      })}

      {/* Removable day chips */}
      {sortedSelected.length > 0 && (
        <div>
          <p style={{ fontSize: 11, color: C.light, margin: "4px 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Your days — tap × to remove
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {sortedSelected.map(iso => (
              <div key={iso} style={{ display: "flex", alignItems: "center", gap: 5, background: C.white, border: `1px solid ${C.border}`, borderRadius: 20, padding: "5px 9px 5px 12px" }}>
                <span style={{ fontSize: 12.5, fontWeight: 500 }}>{fmtDayChip(iso)}</span>
                <button
                  onClick={() => onRemoveDay(iso)}
                  style={{ background: "none", border: "none", padding: 0, display: "flex", cursor: "pointer", color: C.light }}
                >
                  <IconX size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step header ──────────────────────────────────────────────────────────────

function StepHeader({ step, total, title, subtitle, onBack }: {
  step: number; total: number; title: string; subtitle?: string; onBack?: () => void;
}) {
  return (
    <div style={{ background: C.primary, padding: "18px 20px 22px", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        {onBack ? (
          <button onClick={onBack} style={{ background: "none", border: "none", padding: 0, color: "rgba(255,255,255,0.55)", cursor: "pointer", display: "flex" }}>
            <IconArrowLeft size={18} />
          </button>
        ) : <div style={{ width: 18 }} />}
        <div style={{ flex: 1, display: "flex", gap: 5 }}>
          {Array.from({ length: total }, (_, i) => (
            <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i < step ? C.teal : "rgba(255,255,255,0.18)" }} />
          ))}
        </div>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", minWidth: 32, textAlign: "right" }}>
          {step}/{total}
        </span>
      </div>
      <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 500, color: C.white, margin: subtitle ? "0 0 4px" : 0 }}>
        {title}
      </h2>
      {subtitle && <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", margin: 0 }}>{subtitle}</p>}
    </div>
  );
}

// ─── Generating screen ────────────────────────────────────────────────────────

const MSGS = [
  "Balancing your macros…",
  "Picking the tastiest combinations…",
  "Making sure it all adds up…",
  "Running the optimizer…",
  "Almost ready…",
];

function GeneratingScreen() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % MSGS.length), 1800);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, background: C.offWhite }}>
      <svg width={68} height={68} viewBox="0 0 68 68" style={{ marginBottom: 28, animation: "spin 1.1s linear infinite" }}>
        <circle cx={34} cy={34} r={26} fill="none" stroke={C.border} strokeWidth={5} />
        <circle cx={34} cy={34} r={26} fill="none" stroke={C.teal}   strokeWidth={5}
          strokeDasharray="56 108" strokeLinecap="round"
          style={{ transform: "rotate(-90deg)", transformOrigin: "34px 34px" }} />
      </svg>
      <h3 style={{ margin: "0 0 8px", fontSize: 20, textAlign: "center" }}>Building your plan</h3>
      <p style={{ fontSize: 13, color: C.muted, margin: 0, textAlign: "center", minHeight: 22 }}>{MSGS[idx]}</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Meal row ─────────────────────────────────────────────────────────────────

function MealRow({ meal, onRemove, onReplace }: { meal: Meal; onRemove: () => void; onReplace: () => void }) {
  const [imgErr, setImgErr] = useState(false);
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
      <div style={{ width: 48, height: 48, borderRadius: 9, overflow: "hidden", flexShrink: 0, background: C.offWhite, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {meal.photo && !imgErr
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={meal.photo} alt="" onError={() => setImgErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <IconLeaf size={18} color={C.light} />
        }
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {meal.recipe_name}
        </p>
        <span style={mealBadgeStyle(meal.meal_type)}>
          {meal.meal_type.charAt(0).toUpperCase() + meal.meal_type.slice(1)}
        </span>
      </div>
      <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
        <button onClick={onReplace} title="Replace" style={{ width: 32, height: 32, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, color: C.muted, background: "none", border: "none", cursor: "pointer" }}>
          <IconRefresh size={14} />
        </button>
        <button onClick={onRemove} title="Remove" style={{ width: 32, height: 32, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, color: C.muted, background: "none", border: "none", cursor: "pointer" }}>
          <IconX size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── Day card ─────────────────────────────────────────────────────────────────

function DayCard({ day, onRemoveDay, onRemoveMeal, onReplaceMeal }: {
  day: PlanDay;
  onRemoveDay: () => void;
  onRemoveMeal: (meal: Meal) => void;
  onReplaceMeal: (meal: Meal) => void;
}) {
  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, marginBottom: 12, overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 14px 11px", background: "#faf9f7", borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>{fmtDayFull(day.date)}</span>
        <button onClick={onRemoveDay} style={{ background: "none", border: "none", fontSize: 12, color: C.light, padding: "3px 0", cursor: "pointer" }}>
          Remove day
        </button>
      </div>
      <div style={{ padding: "0 14px" }}>
        {day.meals.map((meal) => (
          <MealRow key={meal.meal_key} meal={meal} onRemove={() => onRemoveMeal(meal)} onReplace={() => onReplaceMeal(meal)} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, padding: "10px 14px", borderTop: `1px solid ${C.border}` }}>
        {[
          { label: "Protein", val: `${Math.round(day.totals.protein)}g` },
          { label: "Carbs",   val: `${Math.round(day.totals.carbs)}g` },
          { label: "Fat",     val: `${Math.round(day.totals.fat)}g` },
          { label: "Kcal",    val: Math.round(day.totals.kcal).toLocaleString("en-US") },
        ].map(({ label, val }) => (
          <div key={label} style={{ flex: 1, textAlign: "center", background: C.offWhite, borderRadius: 7, padding: "5px 2px" }}>
            <p style={{ fontSize: 9.5, color: C.light, margin: "0 0 1px", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</p>
            <p style={{ fontSize: 12, fontWeight: 600, margin: 0 }}>{val}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Remove meal sheet ────────────────────────────────────────────────────────

function RemoveMealSheet({ meal, onClose, onSpread, onEatingOut }: {
  meal: Meal; onClose: () => void; onSpread: () => void; onEatingOut: () => void;
}) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(6,51,48,0.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, background: C.white, borderRadius: "18px 18px 0 0", padding: "22px 20px 40px", animation: "slideUp 0.22s ease" }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 18 }}>Remove {meal.recipe_name}?</h3>
        <p style={{ fontSize: 13, color: C.muted, margin: "0 0 20px" }}>What happens to those calories?</p>
        <button onClick={onSpread} style={{ width: "100%", marginBottom: 10, padding: "14px 16px", textAlign: "left", borderRadius: 12, border: `1px solid ${C.border}`, background: C.white, cursor: "pointer" }}>
          <p style={{ margin: "0 0 2px", fontWeight: 600, fontSize: 13.5 }}>Spread across my other meals</p>
          <p style={{ margin: 0, fontSize: 12, color: C.muted }}>Daily calorie target stays the same.</p>
        </button>
        <button onClick={onEatingOut} style={{ width: "100%", padding: "14px 16px", textAlign: "left", borderRadius: 12, border: `1px solid ${C.border}`, background: C.white, cursor: "pointer" }}>
          <p style={{ margin: "0 0 2px", fontWeight: 600, fontSize: 13.5 }}>I&apos;m eating out for this meal</p>
          <p style={{ margin: 0, fontSize: 12, color: C.muted }}>Those calories are removed from my day.</p>
        </button>
      </div>
    </div>
  );
}

// ─── Replace meal sheet ───────────────────────────────────────────────────────

function ReplaceMealSheet({ meal, recipes, onClose, onSelect }: {
  meal: Meal; recipes: RecipeRow[]; onClose: () => void; onSelect: (id: number) => void;
}) {
  const compatible = recipes.filter(r => {
    if (r.id === meal.recipe_id) return false;
    const t = meal.meal_type;
    return (t === "breakfast" && r.could_be_breakfast)
        || (t === "lunch"     && r.could_be_lunch)
        || (t === "dinner"    && r.could_be_dinner)
        || (t === "snack"     && r.could_be_snack);
  });
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(6,51,48,0.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, background: C.white, borderRadius: "18px 18px 0 0", maxHeight: "72vh", display: "flex", flexDirection: "column", animation: "slideUp 0.22s ease" }}>
        <div style={{ padding: "20px 20px 14px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <h3 style={{ margin: "0 0 3px", fontSize: 18 }}>Replace {meal.meal_type}</h3>
          <p style={{ margin: 0, fontSize: 12.5, color: C.muted }}>Pick something else from this week&apos;s menu</p>
        </div>
        <div style={{ overflowY: "auto", padding: "6px 20px 36px" }}>
          {compatible.length === 0
            ? <p style={{ textAlign: "center", color: C.light, marginTop: 24, fontSize: 13 }}>No alternatives available for this meal type.</p>
            : compatible.map(r => (
              <button key={r.id} onClick={() => onSelect(r.id)}
                style={{ width: "100%", display: "flex", gap: 12, alignItems: "center", padding: "12px 0", background: "none", border: "none", borderBottom: `1px solid ${C.border}`, cursor: "pointer", textAlign: "left" }}
              >
                <div style={{ width: 52, height: 52, borderRadius: 9, overflow: "hidden", flexShrink: 0, background: C.offWhite, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {r.photo
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={r.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <IconLeaf size={18} color={C.light} />
                  }
                </div>
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>{r.name}</span>
              </button>
            ))
          }
        </div>
      </div>
    </div>
  );
}

// ─── Daily breakdown (collapsible, in checkout) ───────────────────────────────

// ─── Recipe preferences section (step 1) ─────────────────────────────────────

function PreferencesSection({
  userId, weeks, initialPrefs,
}: {
  userId: string;
  weeks: OrderableWeek[];
  initialPrefs: Record<number, PrefRating>;
}) {
  const [open, setOpen] = useState(false);

  const allRecipes = Array.from(new Map(
    weeks.flatMap(w => w.recipes).map(r => [r.id, r])
  ).values());

  const ratedCount = allRecipes.filter(r => initialPrefs[r.id] != null).length;

  return (
    <div style={{ marginTop: 24 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
          background: C.white, border: `1px solid ${C.border}`,
          borderRadius: open ? "12px 12px 0 0" : 12,
          padding: "14px 16px", cursor: "pointer", transition: "border-radius 0.2s",
        }}
      >
        <div style={{ textAlign: "left" }}>
          <p style={{ margin: "0 0 2px", fontSize: 13.5, fontWeight: 600 }}>Recipe preferences</p>
          <p style={{ margin: 0, fontSize: 11.5, color: C.light }}>
            {ratedCount > 0 ? `${ratedCount} rated — solver will use these` : "Optional · tell us what you love or skip"}
          </p>
        </div>
        <IconChevronDown
          size={16} color={C.light}
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }}
        />
      </button>

      {open && (
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderTop: "none", borderRadius: "0 0 12px 12px", padding: "4px 14px 6px" }}>
          {allRecipes.length === 0 ? (
            <p style={{ fontSize: 13, color: C.light, padding: "16px 0", textAlign: "center" }}>No recipes in upcoming weeks yet.</p>
          ) : (
            allRecipes.map((recipe, i) => (
              <div key={recipe.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "11px 0", borderBottom: i < allRecipes.length - 1 ? `1px solid ${C.border}` : "none" }}>
                <div style={{ width: 42, height: 42, borderRadius: 8, overflow: "hidden", flexShrink: 0, background: C.offWhite, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {recipe.photo
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={recipe.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <IconLeaf size={14} color={C.light} />
                  }
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12.5, fontWeight: 600, margin: "0 0 6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {recipe.name}
                  </p>
                  <RecipeRater userId={userId} recipeId={recipe.id} initialRating={initialPrefs[recipe.id] ?? null} />
                </div>
              </div>
            ))
          )}
          <p style={{ fontSize: 11, color: C.light, textAlign: "center", padding: "10px 0 6px" }}>
            Manage all preferences in{" "}
            <a href="/tastes" style={{ color: "#437b7b", textDecoration: "underline" }}>My Tastes</a>
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Daily breakdown (collapsible, in checkout) ───────────────────────────────

function DailyBreakdown({ breakdown }: { breakdown: CheckoutSummaryResponse["price_breakdown"]["daily_breakdown"] }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 10, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: "100%", background: "none", border: "none", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", padding: 0 }}
      >
        <span style={{ fontSize: 12.5, color: C.muted }}>Per-day breakdown</span>
        <IconChevronDown size={15} color={C.light} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
      </button>
      {open && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 7 }}>
          {breakdown.map(d => (
            <div key={d.date} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5 }}>
              <span style={{ color: C.muted }}>
                {new Date(d.date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
              </span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {d.delivery_applied && (
                  <span style={{ fontSize: 11, color: d.delivery_fee === 0 ? C.tealDark : C.light }}>
                    {d.delivery_fee === 0 ? "free delivery" : `+$${d.delivery_fee.toFixed(2)} delivery`}
                  </span>
                )}
                <span style={{ fontWeight: 600 }}>${d.total_price_with_delivery.toFixed(2)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function OrderFlow({
  userId, profile, macroTarget, orderableWeeks, deliverySlots, initialPrefs = {},
}: {
  userId: string;
  profile: UserRow | null;
  macroTarget: MacroRow | null;
  orderableWeeks: OrderableWeek[];
  deliverySlots: DeliverySlot[];
  initialPrefs?: Record<number, PrefRating>;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("days");

  // ── Step 1 state ──────────────────────────────────────────────────────────────

  const availableSet = new Set(orderableWeeks.flatMap(w => w.weekdays));
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [rangeEnd,   setRangeEnd]   = useState<string | null>(null);
  const [removed,    setRemoved]    = useState<Set<string>>(new Set());

  // Derive selected: all available days in [rangeStart, rangeEnd] minus removed
  const selected = new Set<string>();
  if (rangeStart && rangeEnd) {
    const cur = new Date(rangeStart + "T12:00:00");
    const end = new Date(rangeEnd   + "T12:00:00");
    while (cur <= end) {
      const iso = localISO(cur);
      if (availableSet.has(iso) && !removed.has(iso)) selected.add(iso);
      cur.setDate(cur.getDate() + 1);
    }
  }

  const ALL_MEALS: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
  const [excludedMeals, setExcludedMeals] = useState<Set<MealType>>(new Set());
  const [mealEatingOut, setMealEatingOut] = useState<Record<MealType, boolean>>({
    breakfast: false, lunch: false, dinner: false, snack: false,
  });

  // ── Plan state ────────────────────────────────────────────────────────────────

  const [plan, setPlan]            = useState<GenerateMealPlanResponse | null>(null);
  const [generateError, setGenErr] = useState<string | null>(null);
  const [updatingPlan, setUpdating] = useState(false);

  type RemoveTarget  = { date: string; meal: Meal };
  type ReplaceTarget = { date: string; meal: Meal };
  const [removeTarget,  setRemoveTarget]  = useState<RemoveTarget  | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<ReplaceTarget | null>(null);

  // ── Checkout state ────────────────────────────────────────────────────────────

  const [checkoutData, setCheckoutData] = useState<CheckoutSummaryResponse | null>(null);
  const [checkoutLoading, setCoLoading] = useState(false);
  const [promoInput, setPromoInput]     = useState("");
  const [promoApplied, setPromoApplied] = useState("");
  const [slotId, setSlotId]             = useState<number | null>(deliverySlots[0]?.id ?? null);
  const [address, setAddress]           = useState(profile?.delivery_address ?? profile?.address ?? "");
  const [confirming, setConfirming]     = useState(false);
  const [confirmErr, setConfirmErr]     = useState<string | null>(null);

  const [estDayPrice, setEstDayPrice] = useState<number | null>(null);
  useEffect(() => {
    if (!macroTarget) return;
    simplePriceSimulator({
      protein_g:               macroTarget.protein_g   ?? 0,
      carbs_g:                 macroTarget.carbs_g     ?? 0,
      fat_g:                   macroTarget.fat_g       ?? 0,
      meals_per_day:           3,
      avg_subrecipes_per_meal: 2,
    }).then(r => setEstDayPrice(r.avg_day_price)).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allRecipes = Array.from(new Map(
    orderableWeeks.flatMap(w => w.recipes).map(r => [r.id, r])
  ).values());

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function handlePickDay(iso: string) {
    if (!rangeStart || (rangeStart && rangeEnd)) {
      // Reset and start fresh
      setRangeStart(iso);
      setRangeEnd(null);
      setRemoved(new Set());
    } else {
      // Second tap: set end (swap if needed)
      if (iso < rangeStart) {
        setRangeEnd(rangeStart);
        setRangeStart(iso);
      } else {
        setRangeEnd(iso);
      }
      setRemoved(new Set());
    }
  }

  function handleRemoveDay(iso: string) {
    setRemoved(prev => { const n = new Set(prev); n.add(iso); return n; });
  }

  function toggleMeal(meal: MealType) {
    setExcludedMeals(prev => {
      const n = new Set(prev);
      n.has(meal) ? n.delete(meal) : n.add(meal);
      return n;
    });
  }

  // ── Generate ──────────────────────────────────────────────────────────────────

  async function handleGenerate() {
    if (selected.size === 0 || !rangeStart || !rangeEnd) return;
    setGenErr(null);
    setStep("generating");
    const sorted = [...selected].sort();

    const includedMeals = ALL_MEALS.filter(m => !excludedMeals.has(m));
    const mealsParam = includedMeals.length < ALL_MEALS.length
      ? Object.fromEntries(includedMeals.map(m => [m, m]))
      : undefined;

    try {
      const result = await generateMealPlan({
        user_id: userId,
        start_date: sorted[0],
        end_date:   sorted[sorted.length - 1],
        include_weekends: false,
        meals: mealsParam,
      });
      result.days = result.days.filter(d => selected.has(d.date));
      setPlan(result);
      setStep("review");
    } catch (e) {
      setGenErr(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      setStep("days");
    }
  }

  // ── Plan edits ────────────────────────────────────────────────────────────────

  function removePlanDay(date: string) {
    if (!plan || plan.days.length <= 1) return;
    setPlan({ ...plan, days: plan.days.filter(d => d.date !== date) });
  }

  async function applyChange(logs: ChangeLog[]) {
    if (!plan) return;
    setUpdating(true);
    try { setPlan(await updateMealPlan(plan, logs)); }
    catch { /* keep existing */ }
    finally { setUpdating(false); }
  }

  function handleRemoveMeal(spread: boolean) {
    if (!removeTarget) return;
    const log: ChangeLog = {
      date: removeTarget.date, meal_key: removeTarget.meal.meal_key,
      Delete: true, old_recipe_id: removeTarget.meal.recipe_id,
      include_macros_in_rest: spread, created_at: new Date().toISOString(),
    };
    setRemoveTarget(null);
    applyChange([log]);
  }

  function handleReplaceMeal(newId: number) {
    if (!replaceTarget) return;
    const log: ChangeLog = {
      date: replaceTarget.date, meal_key: replaceTarget.meal.meal_key,
      old_recipe_id: replaceTarget.meal.recipe_id, new_recipe_id: newId,
      include_macros_in_rest: true, created_at: new Date().toISOString(),
    };
    setReplaceTarget(null);
    applyChange([log]);
  }

  // ── Checkout ──────────────────────────────────────────────────────────────────

  async function goToCheckout() {
    if (!plan) return;
    setCoLoading(true);
    try {
      setCheckoutData(await getCheckoutSummary(userId, plan, promoApplied || undefined));
    } catch { setCheckoutData(null); }
    finally { setCoLoading(false); setStep("checkout"); }
  }

  async function applyPromo() {
    if (!plan || !promoInput.trim()) return;
    setCoLoading(true);
    try {
      setCheckoutData(await getCheckoutSummary(userId, plan, promoInput.trim()));
      setPromoApplied(promoInput.trim());
    } catch { /* ignore */ }
    finally { setCoLoading(false); }
  }

  async function handleConfirm() {
    if (!plan || !checkoutData || !slotId) return;
    setConfirming(true);
    setConfirmErr(null);
    try {
      const res = await confirmOrder(userId, plan, checkoutData, slotId);
      if (res.success) setStep("confirmed");
      else setConfirmErr(res.error ?? "Something went wrong.");
    } catch (e) {
      setConfirmErr(e instanceof Error ? e.message : "Something went wrong.");
    } finally { setConfirming(false); }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Screens
  // ─────────────────────────────────────────────────────────────────────────────

  if (step === "generating") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <StepHeader step={2} total={3} title="Building your plan" />
        <GeneratingScreen />
      </div>
    );
  }

  if (step === "confirmed") {
    return (
      <div style={{ minHeight: "100vh", background: C.offWhite, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", textAlign: "center" }}>
        <div style={{ width: 68, height: 68, borderRadius: "50%", background: C.teal, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 22 }}>
          <IconCheck size={30} color={C.white} />
        </div>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, margin: "0 0 10px" }}>You&apos;re all set!</h2>
        <p style={{ fontSize: 14, color: C.muted, margin: "0 0 6px", lineHeight: 1.65, maxWidth: 280 }}>
          Your order is confirmed. Akli will follow up on WhatsApp to finalise delivery details.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#25d366", marginBottom: 32, fontSize: 13 }}>
          <IconBrandWhatsapp size={16} /><span>Expect a message soon</span>
        </div>
        <button className="btn-primary" style={{ maxWidth: 300 }} onClick={() => router.push("/home")}>
          Back to home
        </button>
      </div>
    );
  }

  // ── Step 1: Days & preferences ────────────────────────────────────────────────

  if (step === "days") {
    const dayCount     = selected.size;
    const includedCount = ALL_MEALS.length - excludedMeals.size;

    return (
      <div style={{ minHeight: "100vh", background: C.offWhite, display: "flex", flexDirection: "column" }}>
        <StepHeader
          step={1} total={3}
          title="Days & preferences"
          subtitle="Choose your week, then customise"
          onBack={() => router.push("/home")}
        />

        <div style={{ flex: 1, padding: "22px 20px 130px" }}>

          {/* ── Range picker ── */}
          {orderableWeeks.length === 0 ? (
            <p style={{ fontSize: 13.5, color: C.muted, marginBottom: 24 }}>No upcoming weeks available yet.</p>
          ) : (
            <RangePicker
              orderableWeeks={orderableWeeks}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              removed={removed}
              onPick={handlePickDay}
              onRemoveDay={handleRemoveDay}
            />
          )}

          {/* ── Meal type preferences ── */}
          <p style={{ fontSize: 11, color: C.light, margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Meal types
          </p>
          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 13, overflow: "hidden", marginBottom: 8 }}>
            {ALL_MEALS.map((meal, i) => {
              const excluded = excludedMeals.has(meal);
              const isLast   = i === ALL_MEALS.length - 1;
              return (
                <div key={meal}>
                  <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "14px 16px",
                    borderBottom: (!isLast || excluded) ? `1px solid ${C.border}` : "none",
                  }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: excluded ? C.light : "#1a1a1a" }}>
                        {MEAL_LABELS[meal]}
                      </p>
                      {excluded && (
                        <p style={{ margin: "2px 0 0", fontSize: 11.5, color: C.light }}>Not included</p>
                      )}
                    </div>
                    {/* Toggle switch */}
                    <button
                      onClick={() => toggleMeal(meal)}
                      aria-label={excluded ? `Enable ${meal}` : `Disable ${meal}`}
                      style={{
                        width: 44, height: 26, borderRadius: 13, border: "none", cursor: "pointer", flexShrink: 0,
                        background: excluded ? C.border : C.teal,
                        position: "relative", transition: "background 0.2s",
                      }}
                    >
                      <span style={{
                        position: "absolute", top: 3, width: 20, height: 20,
                        borderRadius: "50%", background: C.white,
                        left: excluded ? 3 : 21,
                        transition: "left 0.2s",
                      }} />
                    </button>
                  </div>

                  {/* Sub-question when excluded */}
                  {excluded && (
                    <div style={{ padding: "12px 16px 14px", background: "#faf9f7", borderBottom: !isLast ? `1px solid ${C.border}` : "none" }}>
                      <p style={{ margin: "0 0 9px", fontSize: 12.5, color: C.muted }}>
                        What will you do for {meal}?
                      </p>
                      <div style={{ display: "flex", gap: 7 }}>
                        <button
                          onClick={() => setMealEatingOut(p => ({ ...p, [meal]: false }))}
                          style={{
                            flex: 1, padding: "9px 8px", borderRadius: 9, fontSize: 12, cursor: "pointer",
                            border: `2px solid ${!mealEatingOut[meal] ? C.tealDark : C.border}`,
                            background: !mealEatingOut[meal] ? "#f0f7f7" : C.white,
                            fontWeight: !mealEatingOut[meal] ? 600 : 400,
                            color: !mealEatingOut[meal] ? C.tealDark : C.muted,
                          }}
                        >
                          Spread to other meals
                        </button>
                        <button
                          onClick={() => setMealEatingOut(p => ({ ...p, [meal]: true }))}
                          style={{
                            flex: 1, padding: "9px 8px", borderRadius: 9, fontSize: 12, cursor: "pointer",
                            border: `2px solid ${mealEatingOut[meal] ? C.tealDark : C.border}`,
                            background: mealEatingOut[meal] ? "#f0f7f7" : C.white,
                            fontWeight: mealEatingOut[meal] ? 600 : 400,
                            color: mealEatingOut[meal] ? C.tealDark : C.muted,
                          }}
                        >
                          Eating out / reduce kcal
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: 11.5, color: C.light, margin: "0 0 0" }}>
            Disabling a meal type lets you tell us whether to adjust your daily calorie target or spread those macros to your remaining meals.
          </p>

          {/* ── Recipe preferences (collapsible) ── */}
          <PreferencesSection
            userId={userId}
            weeks={orderableWeeks}
            initialPrefs={initialPrefs}
          />

          {generateError && (
            <div style={{ background: "#fdf0ef", border: `1px solid ${C.error}`, borderRadius: 10, padding: "12px 14px", fontSize: 12.5, color: C.error, marginTop: 16 }}>
              {generateError}
            </div>
          )}
        </div>

        {/* Sticky footer */}
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: C.white, borderTop: `1px solid ${C.border}`, padding: "14px 20px 28px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>
              {!rangeStart
                ? "Select a start date"
                : !rangeEnd
                  ? "Now pick an end date"
                  : dayCount === 0
                    ? "No available days in range"
                    : `${dayCount} day${dayCount !== 1 ? "s" : ""} · ${includedCount} meal${includedCount !== 1 ? "s" : ""}/day`
              }
            </span>
            {dayCount > 0 && estDayPrice !== null && (
              <span style={{ fontSize: 13, color: C.muted }}>~${(estDayPrice * dayCount).toFixed(0)} est.</span>
            )}
          </div>
          <button
            className="btn-primary"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            onClick={handleGenerate}
            disabled={dayCount === 0 || excludedMeals.size >= ALL_MEALS.length}
          >
            Build my plan <IconArrowRight size={16} />
          </button>
          {excludedMeals.size >= ALL_MEALS.length && (
            <p style={{ fontSize: 12, color: C.error, textAlign: "center", margin: "8px 0 0" }}>
              Please include at least one meal type.
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Step 2: Plan review ───────────────────────────────────────────────────────

  if (step === "review" && plan) {
    return (
      <div style={{ minHeight: "100vh", background: C.offWhite, display: "flex", flexDirection: "column" }}>
        <StepHeader
          step={2} total={3}
          title="Your plan"
          subtitle={`${plan.days.length} day${plan.days.length !== 1 ? "s" : ""} · tap a meal to edit`}
          onBack={() => setStep("days")}
        />
        <div style={{ flex: 1, padding: "18px 20px 110px" }}>
          {updatingPlan && (
            <p style={{ fontSize: 12, color: C.teal, textAlign: "center", marginBottom: 12 }}>Updating your plan…</p>
          )}
          {plan.days.map(day => (
            <DayCard key={day.date} day={day}
              onRemoveDay={() => removePlanDay(day.date)}
              onRemoveMeal={meal => setRemoveTarget({ date: day.date, meal })}
              onReplaceMeal={meal => setReplaceTarget({ date: day.date, meal })}
            />
          ))}
        </div>

        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: C.white, borderTop: `1px solid ${C.border}`, padding: "14px 20px 28px" }}>
          <button
            className="btn-primary"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            onClick={goToCheckout}
            disabled={checkoutLoading || plan.days.length === 0 || updatingPlan}
          >
            {checkoutLoading ? "Loading…" : <>Looks good <IconArrowRight size={16} /></>}
          </button>
        </div>

        {removeTarget && (
          <RemoveMealSheet
            meal={removeTarget.meal}
            onClose={() => setRemoveTarget(null)}
            onSpread={() => handleRemoveMeal(true)}
            onEatingOut={() => handleRemoveMeal(false)}
          />
        )}
        {replaceTarget && (
          <ReplaceMealSheet
            meal={replaceTarget.meal}
            recipes={allRecipes}
            onClose={() => setReplaceTarget(null)}
            onSelect={handleReplaceMeal}
          />
        )}
        <style>{`@keyframes slideUp { from { transform: translateY(40px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
      </div>
    );
  }

  // ── Step 3: Checkout ──────────────────────────────────────────────────────────

  if (step === "checkout") {
    const bd         = checkoutData?.price_breakdown;
    const totalPrice = bd?.final_price ?? (estDayPrice !== null ? estDayPrice * (plan?.days.length ?? 1) : null);
    const dayCount   = plan?.days.length ?? 0;
    const freeThreshold = bd?.delivery?.minimum_per_day_for_free_delivery ?? 25;

    return (
      <div style={{ minHeight: "100vh", background: C.offWhite, display: "flex", flexDirection: "column" }}>
        <StepHeader step={3} total={3} title="Review & confirm" onBack={() => setStep("review")} />

        <div style={{ flex: 1, padding: "20px 20px 110px" }}>

          {/* Price summary */}
          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px", marginBottom: 12 }}>
            <p style={{ fontSize: 11, color: C.light, margin: "0 0 12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Order summary</p>

            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
              <span style={{ fontSize: 13.5 }}>{dayCount} day{dayCount !== 1 ? "s" : ""}</span>
              <span style={{ fontSize: 13.5 }}>{bd?.total_price_before_discount != null ? `$${bd.total_price_before_discount.toFixed(2)}` : estDayPrice !== null ? `$${(estDayPrice * dayCount).toFixed(2)}` : "—"}</span>
            </div>

            {(bd?.discount_amount ?? 0) > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7, color: C.tealDark }}>
                <span style={{ fontSize: 13 }}>Promo discount</span>
                <span style={{ fontSize: 13 }}>-${bd!.discount_amount.toFixed(2)}</span>
              </div>
            )}

            {bd?.delivery && (
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 13 }}>Delivery</span>
                <span style={{ fontSize: 13, color: bd.delivery.is_free_delivery ? C.tealDark : "inherit" }}>
                  {bd.delivery.is_free_delivery ? "Free" : `$${bd.delivery.delivery_fee.toFixed(2)}`}
                </span>
              </div>
            )}

            {/* Free delivery callout */}
            <div style={{ background: "#f0f7f7", borderRadius: 8, padding: "7px 10px", margin: "8px 0 10px", fontSize: 11.5, color: C.tealDark }}>
              🚚 Free delivery on days totalling over ${freeThreshold}
            </div>

            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>Total</span>
              <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 500 }}>
                {totalPrice !== null ? `$${totalPrice.toFixed(2)}` : "—"}
              </span>
            </div>

            {bd?.daily_breakdown && bd.daily_breakdown.length > 0 && (
              <DailyBreakdown breakdown={bd.daily_breakdown} />
            )}
          </div>

          {/* Promo code */}
          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 16px", marginBottom: 12 }}>
            <p style={{ fontSize: 12.5, fontWeight: 600, margin: "0 0 10px" }}>Promo code</p>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="text" placeholder="Enter code" value={promoInput}
                onChange={e => setPromoInput(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === "Enter" && applyPromo()}
                style={{ flex: 1, textTransform: "uppercase" }}
              />
              <button onClick={applyPromo} disabled={checkoutLoading} style={{ padding: "10px 14px", flexShrink: 0, fontSize: 13 }}>
                Apply
              </button>
            </div>
            {bd?.promo_message && (
              <p style={{ fontSize: 12, margin: "7px 0 0", color: bd.promo_code_status === "valid" ? C.tealDark : C.error }}>
                {bd.promo_message}
              </p>
            )}
          </div>

          {/* Delivery slot */}
          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 16px", marginBottom: 12 }}>
            <p style={{ fontSize: 12.5, fontWeight: 600, margin: "0 0 10px" }}>Delivery time</p>
            {deliverySlots.length <= 1 ? (
              <p style={{ fontSize: 13.5, color: "#1a1a1a", margin: 0 }}>
                {deliverySlots[0] ? `${fmtTime(deliverySlots[0].start_time)} – ${fmtTime(deliverySlots[0].end_time)}` : "6pm – 9pm"}
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {deliverySlots.map(s => (
                  <button key={s.id} onClick={() => setSlotId(s.id)} style={{
                    padding: "11px 14px", textAlign: "left", borderRadius: 10,
                    border: `2px solid ${slotId === s.id ? C.tealDark : C.border}`,
                    background: slotId === s.id ? "#f0f7f7" : C.white,
                    fontSize: 13.5, cursor: "pointer",
                  }}>
                    {fmtTime(s.start_time)} – {fmtTime(s.end_time)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Address */}
          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 16px", marginBottom: 12 }}>
            <p style={{ fontSize: 12.5, fontWeight: 600, margin: "0 0 10px" }}>Delivery address</p>
            <textarea rows={2} placeholder="Building, street, area" value={address}
              onChange={e => setAddress(e.target.value)} style={{ resize: "none" }} />
          </div>

          {confirmErr && (
            <div style={{ background: "#fdf0ef", border: `1px solid ${C.error}`, borderRadius: 10, padding: "12px 14px", fontSize: 12.5, color: C.error }}>
              {confirmErr}
            </div>
          )}
        </div>

        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: C.white, borderTop: `1px solid ${C.border}`, padding: "14px 20px 28px" }}>
          <button
            className="btn-primary"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            onClick={handleConfirm}
            disabled={confirming || !slotId}
          >
            {confirming ? "Confirming…" : <><IconCheck size={16} /> Confirm order</>}
          </button>
        </div>
      </div>
    );
  }

  return null;
}
