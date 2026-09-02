"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconChevronLeft, IconChevronRight, IconPlus, IconX,
  IconBarcode, IconSearch, IconPencil, IconShoppingBag, IconCalendar, IconArrowBackUp, IconUserCircle,
} from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import { track } from "@/lib/analytics";
import { beirutISODate } from "@/lib/dates";
import { scaleMacros, buildUnitOptions, type FoodCatalogItem, type UsdaPortionWeights } from "@/lib/foodCatalog";
import type { Database } from "@/lib/supabase/types";
import BarcodeScanner from "@/components/BarcodeScanner";
import ViewToggle from "@/components/ViewToggle";

type MacroTargetRow = Database["public"]["Tables"]["daily_macro_target"]["Row"];
type OrderMacros = {
  kcal_ordered: number | null;
  protein_ordered: number | null;
  carbs_ordered: number | null;
  fat_ordered: number | null;
} | null;
type FoodLogEntryRow = Database["public"]["Tables"]["food_log_entry"]["Row"] & {
  food_catalog_item: { status: string } | null;
};

const C = {
  primary: "#063330",
  teal: "#67b1b0",
  tealDark: "#437b7b",
  offWhite: "#eee9e6",
  muted: "#5c5c5c",
  light: "#9a9a9a",
  border: "#e0dbd5",
  white: "#ffffff",
  error: "#c0392b",
};

// Order matches the MEAL_ORDER convention already used in OrderHistory.tsx.
const MEAL_TYPES = ["breakfast", "lunch", "snack", "dinner"] as const;
type MealType = (typeof MEAL_TYPES)[number];
const MEAL_LABEL: Record<MealType, string> = { breakfast: "Breakfast", lunch: "Lunch", snack: "Snack", dinner: "Dinner" };
const MEAL_EMOJI: Record<MealType, string> = { breakfast: "🌅", lunch: "☀️", snack: "🍎", dinner: "🌙" };

// Generic units for hand-typed label entry in Quick Add — no per-food
// density needed here since both the label amount and how much was eaten
// are expressed in the same unit, so the eaten/ref ratio is unit-agnostic.
const MEASURE_UNITS = ["g", "ml", "tsp", "tbsp", "cup", "serving"] as const;
type MeasureUnit = (typeof MEASURE_UNITS)[number];

function defaultMealType(): MealType {
  const h = new Date().getHours();
  if (h < 11) return "breakfast";
  if (h < 15) return "lunch";
  if (h < 19) return "snack";
  return "dinner";
}

function fmtDateHeading(iso: string) {
  const today = beirutISODate(0);
  if (iso === today) return "Today";
  if (iso === beirutISODate(-1)) return "Yesterday";
  if (iso === beirutISODate(1)) return "Tomorrow";
  return new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function round(n: number | null | undefined) {
  return Math.round(n ?? 0);
}

function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── Calendar picker ──────────────────────────────────────────────────────────
// A real, self-contained month grid — not a native <input type="date">
// overlay, which turned out unreliable to open on tap across browsers.

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function CalendarSheet({ value, onSelect, onClose }: {
  value: string; onSelect: (iso: string) => void; onClose: () => void;
}) {
  const [viewDate, setViewDate] = useState(() => new Date(value + "T12:00:00"));
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const todayIso = beirutISODate(0);

  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(startWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 250,
        background: "rgba(6,51,48,0.55)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 420, background: C.white, borderRadius: "18px 18px 0 0", padding: "20px 20px 32px" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <button
            onClick={() => setViewDate(new Date(year, month - 1, 1))}
            style={{ background: "none", border: "none", padding: 6, color: C.tealDark, cursor: "pointer", display: "flex" }}
          >
            <IconChevronLeft size={17} />
          </button>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>
            {viewDate.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
          </span>
          <button
            onClick={() => setViewDate(new Date(year, month + 1, 1))}
            style={{ background: "none", border: "none", padding: 6, color: C.tealDark, cursor: "pointer", display: "flex" }}
          >
            <IconChevronRight size={17} />
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 6 }}>
          {WEEKDAY_LABELS.map((d, i) => (
            <div key={i} style={{ textAlign: "center", fontSize: 10.5, color: C.light, fontWeight: 600 }}>{d}</div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
          {cells.map((d, i) => {
            if (d === null) return <div key={i} />;
            const iso = toISODate(new Date(year, month, d));
            const isSelected = iso === value;
            const isToday = iso === todayIso;
            return (
              <button
                key={i}
                onClick={() => { onSelect(iso); onClose(); }}
                style={{
                  aspectRatio: "1", borderRadius: 9, border: "none", fontSize: 13, cursor: "pointer",
                  background: isSelected ? C.tealDark : isToday ? C.offWhite : "transparent",
                  color: isSelected ? C.white : "#1a1a1a",
                  fontWeight: isSelected || isToday ? 700 : 500,
                }}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Reconciliation card ─────────────────────────────────────────────────────

function StatRow({ label, kcal, protein, carbs, fat, muted }: {
  label: string; kcal: number | null; protein?: number | null; carbs?: number | null; fat?: number | null; muted?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 0", opacity: muted ? 0.5 : 1 }}>
      <span style={{ fontSize: 11.5, color: C.light, textTransform: "uppercase", letterSpacing: "0.04em", flexShrink: 0 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, justifyContent: "flex-end" }}>
        <span style={{ fontSize: 14.5, fontWeight: 700, color: C.primary, whiteSpace: "nowrap" }}>
          {kcal == null ? "—" : `${round(kcal).toLocaleString("en-US")} kcal`}
        </span>
        {protein != null && (
          <span style={{ fontSize: 11.5, color: C.muted, whiteSpace: "nowrap" }}>
            P {round(protein)} · C {round(carbs)} · F {round(fat)}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Diary entry row ──────────────────────────────────────────────────────────

function EntryBadge({ entry }: { entry: FoodLogEntryRow }) {
  if (entry.entry_source === "order_auto") {
    return (
      <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", padding: "2px 6px", borderRadius: 20, background: "#eef4ff", color: "#2563eb" }}>
        From your order
      </span>
    );
  }
  if (entry.food_catalog_item?.status === "pending") {
    return (
      <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", padding: "2px 6px", borderRadius: 20, background: "#fff8e6", color: "#b45309" }}>
        Unverified
      </span>
    );
  }
  return null;
}

function EntryRow({ entry, onRemove, onRestore }: {
  entry: FoodLogEntryRow;
  onRemove: (entry: FoodLogEntryRow) => void;
  onRestore: (entry: FoodLogEntryRow) => void;
}) {
  // A removed order_auto entry stays visible in its meal section, dimmed,
  // with a Restore control that works at any point — not a timed toast.
  const removed = entry.hidden_by_user;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: `1px solid ${C.border}`, opacity: removed ? 0.5 : 1 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <p style={{
            margin: 0, fontSize: 13.5, fontWeight: 600, color: "#1a1a1a",
            textDecoration: removed ? "line-through" : "none",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {entry.name_snapshot}
          </p>
          {removed ? (
            <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", padding: "2px 6px", borderRadius: 20, background: C.offWhite, color: C.light }}>
              Removed
            </span>
          ) : (
            <EntryBadge entry={entry} />
          )}
        </div>
        <p style={{ margin: "2px 0 0", fontSize: 11.5, color: C.light }}>
          {round(entry.kcal)} kcal · P {round(entry.protein_g)}g · C {round(entry.carbs_g)}g · F {round(entry.fat_g)}g
        </p>
      </div>
      {removed ? (
        <button
          onClick={() => onRestore(entry)}
          style={{
            display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", padding: "6px 2px",
            color: C.tealDark, fontWeight: 700, fontSize: 12, cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap",
          }}
        >
          <IconArrowBackUp size={14} /> Restore
        </button>
      ) : (
        <button
          onClick={() => onRemove(entry)}
          title="Remove from your day"
          style={{ background: "none", border: "none", padding: 6, margin: -6, color: C.light, cursor: "pointer", display: "flex", flexShrink: 0 }}
        >
          <IconX size={15} />
        </button>
      )}
    </div>
  );
}

// ─── Catalog source tag ───────────────────────────────────────────────────────
// Shows where a catalog item's data actually came from — nothing surfaced
// this anywhere before, so there was no way to tell a USDA result from an
// OpenFoodFacts one, or a verified community submission, while searching.

function sourceTagInfo(item: FoodCatalogItem): { label: string; bg: string; color: string } {
  if (item.status === "pending") return { label: "Unverified", bg: "#fff8e6", color: "#b45309" };
  if (item.source === "usda") return { label: "USDA", bg: "#eef4ff", color: "#2563eb" };
  if (item.source === "off") return { label: "OpenFoodFacts", bg: "#eef4ff", color: "#2563eb" };
  return { label: "Verified", bg: "#f0faf0", color: "#15803d" }; // user_submitted, admin-approved
}

function SourceTag({ item }: { item: FoodCatalogItem }) {
  const { label, bg, color } = sourceTagInfo(item);
  return (
    <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", padding: "2px 6px", borderRadius: 20, background: bg, color, flexShrink: 0 }}>
      {label}
    </span>
  );
}

// ─── Add-food sheet ───────────────────────────────────────────────────────────

type AddTab = "search" | "scan" | "quick";

// tsp/tbsp/cup/serving are all "how many of this unit" — small integers make
// sense as the default step, unlike grams which is naturally a bigger number.
function defaultAmountFor(unitKey: string, item: FoodCatalogItem): number {
  if (unitKey === "g" || unitKey === "ml") return item.default_serving_qty ?? 100;
  return 1;
}

function QuantityStep({ item, presetMealType, onAdd, onBack }: {
  item: FoodCatalogItem;
  presetMealType?: MealType;
  onAdd: (mealType: MealType, grams: number, displayQuantity: number, displayUnit: string) => void;
  onBack: () => void;
}) {
  // tsp/tbsp/cup only become available once this resolves — USDA's
  // household-measure data lives on a separate detail endpoint, fetched
  // lazily here rather than during search (so search stays fast and USDA's
  // rate limit isn't spent on items nobody ends up picking).
  const [portions, setPortions] = useState<UsdaPortionWeights | null>(null);
  useEffect(() => {
    if (item.source !== "usda" || !item.external_id) return;
    let cancelled = false;
    fetch(`/api/food/lookup?usdaDensityFor=${encodeURIComponent(item.external_id)}`)
      .then((r) => r.json())
      .then((json) => { if (!cancelled) setPortions(json.portions ?? null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [item.source, item.external_id]);

  const unitOptions = buildUnitOptions(item, portions);
  const initialUnitKey = unitOptions.find((u) => u.key === "serving")?.key ?? "g";
  const [unitKey, setUnitKey] = useState(initialUnitKey);
  const [amount, setAmount] = useState(defaultAmountFor(initialUnitKey, item));
  const [count, setCount] = useState(1);
  const [mealType, setMealType] = useState<MealType>(presetMealType ?? defaultMealType());

  function selectUnit(key: string) {
    setUnitKey(key);
    setAmount(defaultAmountFor(key, item));
  }

  const selectedUnit = unitOptions.find((u) => u.key === unitKey) ?? unitOptions[0];
  const grams = amount * selectedUnit.gramsPerUnit * count;
  const scaled = scaleMacros(item, grams);
  const displayUnit = selectedUnit.key === "g" || selectedUnit.key === "ml"
    ? `${amount}${selectedUnit.label}`
    : selectedUnit.label;

  return (
    <div>
      <button onClick={onBack} style={{ background: "none", border: "none", padding: 0, color: C.tealDark, fontSize: 12.5, fontWeight: 600, cursor: "pointer", marginBottom: 12, display: "flex", alignItems: "center", gap: 4 }}>
        <IconChevronLeft size={14} /> Back
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", margin: "0 0 2px" }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>{item.name}</p>
        <SourceTag item={item} />
      </div>
      {item.brand && <p style={{ margin: "0 0 12px", fontSize: 12, color: C.light }}>{item.brand}</p>}

      {/* Unit choice — grams always available; the food's own serving (e.g.
          "3 slices") and, once density resolves, tsp/tbsp/cup/ml. */}
      {unitOptions.length > 1 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
          {unitOptions.map((u) => (
            <button
              key={u.key}
              onClick={() => selectUnit(u.key)}
              style={{
                padding: "6px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
                border: `1px solid ${unitKey === u.key ? C.tealDark : C.border}`,
                background: unitKey === u.key ? C.tealDark : C.white,
                color: unitKey === u.key ? C.white : C.muted,
              }}
            >
              {u.label}
            </button>
          ))}
        </div>
      )}

      {/* Amount per unit and a separate × count — "100g x1" or "55g x3",
          not just one flat total. Works the same whether the unit is grams
          or the food's own serving. */}
      <div style={{ display: "grid", gridTemplateColumns: selectedUnit.key === "serving" ? "1fr" : "1fr auto", gap: 8, alignItems: "end" }}>
        {selectedUnit.key !== "serving" && (
          <div>
            <label style={{ fontSize: 11.5, color: C.light, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Amount ({selectedUnit.label})
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value) || 0)}
              style={{ width: "100%", marginTop: 4, padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 16 }}
            />
          </div>
        )}
        <div>
          <label style={{ fontSize: 11.5, color: C.light, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            × How many
          </label>
          <input
            type="number"
            value={count}
            onChange={(e) => setCount(Number(e.target.value) || 0)}
            style={{ width: selectedUnit.key === "serving" ? "100%" : 80, marginTop: 4, padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 16 }}
          />
        </div>
      </div>
      <p style={{ fontSize: 11, color: C.light, margin: "6px 0 10px" }}>≈ {round(grams)} g total</p>

      {/* Already known when opened from a specific meal's own "Log food"
          button — only ask when reached via the general add flow. */}
      {!presetMealType && (
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {MEAL_TYPES.map((mt) => (
            <button
              key={mt}
              onClick={() => setMealType(mt)}
              style={{
                flex: 1, padding: "8px 4px", borderRadius: 10, fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                border: `1px solid ${mealType === mt ? C.tealDark : C.border}`,
                background: mealType === mt ? C.tealDark : C.white,
                color: mealType === mt ? C.white : C.muted,
              }}
            >
              {MEAL_EMOJI[mt]} {MEAL_LABEL[mt]}
            </button>
          ))}
        </div>
      )}

      <div style={{ background: C.offWhite, borderRadius: 10, padding: "10px 12px", marginBottom: 14, fontSize: 12.5, color: C.muted }}>
        {round(scaled.kcal)} kcal · P {round(scaled.protein_g)}g · C {round(scaled.carbs_g)}g · F {round(scaled.fat_g)}g
      </div>

      <button
        className="btn-primary"
        style={{ width: "100%", padding: "13px 0", fontSize: 14.5 }}
        onClick={() => onAdd(mealType, grams, count, displayUnit)}
        disabled={grams <= 0}
      >
        Add to {MEAL_LABEL[mealType]}
      </button>
    </div>
  );
}

function SubmitUnknownForm({ barcode, onSubmitted, onBack }: {
  barcode: string;
  onSubmitted: (item: FoodCatalogItem) => void;
  onBack: () => void;
}) {
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!name.trim() || !kcal) { setErr("Name and calories are required."); return; }
    setSaving(true); setErr(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("food_catalog_item") as any)
        .insert({
          barcode, name: name.trim(), brand: brand.trim() || null,
          source: "user_submitted", status: "pending", submitted_by: user.id,
          kcal_per_100: Number(kcal) || 0,
          protein_per_100: Number(protein) || 0,
          carbs_per_100: Number(carbs) || 0,
          fat_per_100: Number(fat) || 0,
        })
        .select("*")
        .single();

      if (error) throw new Error(error.message);
      track("food_unknown_submitted", { barcode }, "food_diary");
      onSubmitted(data as FoodCatalogItem);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Couldn't submit this item.";
      track("food_log_error", { stage: "submit_unknown", message }, "food_diary");
      setErr(message);
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 11px", borderRadius: 9, border: `1px solid ${C.border}`, fontSize: 16 };

  return (
    <div>
      <button onClick={onBack} style={{ background: "none", border: "none", padding: 0, color: C.tealDark, fontSize: 12.5, fontWeight: 600, cursor: "pointer", marginBottom: 12, display: "flex", alignItems: "center", gap: 4 }}>
        <IconChevronLeft size={14} /> Back
      </button>
      <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>We don&apos;t have this one yet</p>
      <p style={{ margin: "0 0 14px", fontSize: 12, color: C.light }}>
        Add what you know from the label — Akli will review it, and it&apos;ll be marked verified for everyone once checked. Per 100g/ml.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        <input placeholder="Product name" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
        <input placeholder="Brand (optional)" value={brand} onChange={(e) => setBrand(e.target.value)} style={inputStyle} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <input placeholder="Kcal / 100g" type="number" value={kcal} onChange={(e) => setKcal(e.target.value)} style={inputStyle} />
          <input placeholder="Protein g / 100g" type="number" value={protein} onChange={(e) => setProtein(e.target.value)} style={inputStyle} />
          <input placeholder="Carbs g / 100g" type="number" value={carbs} onChange={(e) => setCarbs(e.target.value)} style={inputStyle} />
          <input placeholder="Fat g / 100g" type="number" value={fat} onChange={(e) => setFat(e.target.value)} style={inputStyle} />
        </div>
      </div>

      {err && <p style={{ color: C.error, fontSize: 12, margin: "0 0 10px" }}>{err}</p>}

      <button
        className="btn-primary"
        style={{ width: "100%", padding: "13px 0", fontSize: 14.5, opacity: saving ? 0.6 : 1 }}
        onClick={submit}
        disabled={saving}
      >
        {saving ? "Submitting…" : "Submit & log this"}
      </button>
    </div>
  );
}

// Non-blocking kcal-vs-macros sanity check, shared by both Quick Add modes —
// 4 kcal/g protein & carbs, 9 kcal/g fat (same Atwater factors used
// elsewhere in this app). Flagged, never enforced: a nudge, not validation.
function KcalMismatchNote({ kcal, protein, carbs, fat, onUseComputed }: {
  kcal: string; protein: string; carbs: string; fat: string; onUseComputed: (kcal: number) => void;
}) {
  const hasAnyMacro = protein !== "" || carbs !== "" || fat !== "";
  const computedKcal = Math.round((Number(protein) || 0) * 4 + (Number(carbs) || 0) * 4 + (Number(fat) || 0) * 9);
  const typedKcal = Number(kcal) || 0;
  const mismatch = kcal !== "" && hasAnyMacro && computedKcal > 0 && Math.abs(typedKcal - computedKcal) / computedKcal > 0.1;
  if (!mismatch) return null;

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap",
      background: "#fff8e6", border: "1px solid #ffe4a3", borderRadius: 8, padding: "8px 10px", marginBottom: 12,
    }}>
      <p style={{ fontSize: 11.5, color: "#8a5a00", margin: 0, lineHeight: 1.4 }}>
        These macros work out to about <strong>{computedKcal} kcal</strong>, but you entered <strong>{typedKcal} kcal</strong> — do you want to continue anyway?
      </p>
      <button
        onClick={() => onUseComputed(computedKcal)}
        style={{ background: "none", border: "none", padding: 0, color: "#8a5a00", fontWeight: 700, fontSize: 11.5, textDecoration: "underline", cursor: "pointer", whiteSpace: "nowrap" }}
      >
        Use {computedKcal}
      </button>
    </div>
  );
}

type QuickAddMode = "direct" | "perServing";

function QuickAddForm({ presetMealType, onAdd }: {
  presetMealType?: MealType;
  onAdd: (mealType: MealType, name: string, macros: { kcal: number; protein_g: number; carbs_g: number; fat_g: number }, quantity: number, quantityUnit: string, mode: QuickAddMode) => void;
}) {
  const [mode, setMode] = useState<QuickAddMode>("direct");
  const [name, setName] = useState("");
  // Direct mode — totals for what was actually eaten.
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  // Per-serving mode — copy the label as printed, then say how much was
  // actually eaten in the *same* unit; the app does the scaling. No
  // conversion table needed here (unlike the catalog's QuantityStep) — as
  // long as both numbers share a unit, kcal * (eaten/ref) is correct
  // whether that unit is grams, tbsp, or "servings".
  const [refUnit, setRefUnit] = useState<MeasureUnit>("g");
  const [refAmount, setRefAmount] = useState("100");
  const [refKcal, setRefKcal] = useState("");
  const [refProtein, setRefProtein] = useState("");
  const [refCarbs, setRefCarbs] = useState("");
  const [refFat, setRefFat] = useState("");
  const [eatenAmount, setEatenAmount] = useState("");
  const [mealType, setMealType] = useState<MealType>(presetMealType ?? defaultMealType());

  const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 11px", borderRadius: 9, border: `1px solid ${C.border}`, fontSize: 16 };

  const scale = (Number(eatenAmount) || 0) / (Number(refAmount) || 1);
  const scaledMacros = {
    kcal: Math.round((Number(refKcal) || 0) * scale),
    protein_g: Math.round((Number(refProtein) || 0) * scale * 10) / 10,
    carbs_g: Math.round((Number(refCarbs) || 0) * scale * 10) / 10,
    fat_g: Math.round((Number(refFat) || 0) * scale * 10) / 10,
  };

  // Found during stress testing: a bare "field is non-empty" check let a
  // negative number through (e.g. a typo'd minus sign), which would
  // silently subtract from the day's total. The DB now rejects it outright
  // too, but this keeps that from ever being the first line of defense.
  const valid = mode === "direct"
    ? name.trim().length > 0 && kcal !== "" && Number(kcal) >= 0
      && Number(protein || 0) >= 0 && Number(carbs || 0) >= 0 && Number(fat || 0) >= 0
    : name.trim().length > 0 && refKcal !== "" && Number(refKcal) >= 0 && Number(refAmount) > 0 && Number(eatenAmount) > 0;

  function submit() {
    if (mode === "direct") {
      onAdd(mealType, name.trim(), {
        kcal: Number(kcal) || 0, protein_g: Number(protein) || 0, carbs_g: Number(carbs) || 0, fat_g: Number(fat) || 0,
      }, 1, "serving", mode);
    } else {
      onAdd(mealType, name.trim(), scaledMacros, Number(eatenAmount), refUnit, mode);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {([["direct", "I ate this much"], ["perServing", "Per label + amount eaten"]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setMode(key)}
            style={{
              flex: 1, padding: "8px 6px", borderRadius: 10, fontSize: 11.5, fontWeight: 600, cursor: "pointer",
              border: `1px solid ${mode === key ? C.tealDark : C.border}`,
              background: mode === key ? C.tealDark : C.white,
              color: mode === key ? C.white : C.muted,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <input placeholder="What did you eat?" value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, marginBottom: 8 }} />

      {mode === "direct" ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
            <input placeholder="Kcal" type="number" value={kcal} onChange={(e) => setKcal(e.target.value)} style={inputStyle} />
            <input placeholder="Protein g" type="number" value={protein} onChange={(e) => setProtein(e.target.value)} style={inputStyle} />
            <input placeholder="Carbs g" type="number" value={carbs} onChange={(e) => setCarbs(e.target.value)} style={inputStyle} />
            <input placeholder="Fat g" type="number" value={fat} onChange={(e) => setFat(e.target.value)} style={inputStyle} />
          </div>
          <KcalMismatchNote kcal={kcal} protein={protein} carbs={carbs} fat={fat} onUseComputed={(k) => setKcal(String(k))} />
        </>
      ) : (
        <>
          <p style={{ fontSize: 11.5, color: C.light, margin: "0 0 8px" }}>
            Copy the nutrition label exactly as printed, then say how much you actually ate in the same unit — the totals get scaled automatically.
          </p>

          <label style={{ fontSize: 11, color: C.light, textTransform: "uppercase", letterSpacing: "0.04em" }}>Measured in</label>
          <div style={{ display: "flex", gap: 6, margin: "4px 0 10px", flexWrap: "wrap" }}>
            {MEASURE_UNITS.map((u) => (
              <button
                key={u}
                onClick={() => setRefUnit(u)}
                style={{
                  padding: "6px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
                  border: `1px solid ${refUnit === u ? C.tealDark : C.border}`,
                  background: refUnit === u ? C.tealDark : C.white,
                  color: refUnit === u ? C.white : C.muted,
                }}
              >
                {u}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>Label is per</span>
            <input type="number" value={refAmount} onChange={(e) => setRefAmount(e.target.value)} style={{ ...inputStyle, width: 70 }} />
            <span style={{ fontSize: 12, color: C.muted }}>{refUnit}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
            <input placeholder="Kcal" type="number" value={refKcal} onChange={(e) => setRefKcal(e.target.value)} style={inputStyle} />
            <input placeholder="Protein g" type="number" value={refProtein} onChange={(e) => setRefProtein(e.target.value)} style={inputStyle} />
            <input placeholder="Carbs g" type="number" value={refCarbs} onChange={(e) => setRefCarbs(e.target.value)} style={inputStyle} />
            <input placeholder="Fat g" type="number" value={refFat} onChange={(e) => setRefFat(e.target.value)} style={inputStyle} />
          </div>
          <KcalMismatchNote kcal={refKcal} protein={refProtein} carbs={refCarbs} fat={refFat} onUseComputed={(k) => setRefKcal(String(k))} />

          <label style={{ fontSize: 11.5, color: C.light, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            How much did you eat? ({refUnit})
          </label>
          <input
            type="number" value={eatenAmount} onChange={(e) => setEatenAmount(e.target.value)}
            style={{ ...inputStyle, marginTop: 4, marginBottom: 4 }}
          />
          {Number(eatenAmount) > 0 && Number(refKcal) > 0 && (
            <p style={{ fontSize: 12.5, color: C.muted, background: C.offWhite, borderRadius: 8, padding: "8px 10px", margin: "6px 0 12px" }}>
              → {scaledMacros.kcal} kcal · P {scaledMacros.protein_g}g · C {scaledMacros.carbs_g}g · F {scaledMacros.fat_g}g
            </p>
          )}
        </>
      )}

      {!presetMealType && (
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {MEAL_TYPES.map((mt) => (
            <button
              key={mt}
              onClick={() => setMealType(mt)}
              style={{
                flex: 1, padding: "8px 4px", borderRadius: 10, fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                border: `1px solid ${mealType === mt ? C.tealDark : C.border}`,
                background: mealType === mt ? C.tealDark : C.white,
                color: mealType === mt ? C.white : C.muted,
              }}
            >
              {MEAL_EMOJI[mt]} {MEAL_LABEL[mt]}
            </button>
          ))}
        </div>
      )}

      <button
        className="btn-primary"
        style={{ width: "100%", padding: "13px 0", fontSize: 14.5 }}
        disabled={!valid}
        onClick={submit}
      >
        Add to {MEAL_LABEL[mealType]}
      </button>
    </div>
  );
}

function SearchTab({ query, setQuery, results, setResults, onPick }: {
  query: string; setQuery: (q: string) => void;
  results: FoodCatalogItem[]; setResults: (r: FoodCatalogItem[]) => void;
  onPick: (item: FoodCatalogItem) => void;
}) {
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Was autoFocus — that fires the instant this mounts, so the keyboard's
  // own slide-up animation ran at the same time as the sheet's own
  // slideUp 0.22s entrance animation. Two competing viewport-resizing
  // animations at once produced the jumpy "goes up and down" motion (and a
  // blurred intermediate frame) reported on a phone. Deferring focus past
  // the sheet's animation lets them happen one after the other instead.
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 260);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/food/lookup?q=${encodeURIComponent(query.trim())}`);
        const json = await res.json();
        setResults(json.items ?? []);
      } catch {
        track("food_log_error", { stage: "search" }, "food_diary");
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div>
      <div style={{ position: "relative", marginBottom: 10 }}>
        <IconSearch size={15} color={C.light} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
        <input
          ref={inputRef}
          placeholder="Search foods — chicken breast, olive oil…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          // 16px is the line iOS Safari uses to decide whether to auto-zoom
          // a focused input.
          style={{ width: "100%", padding: "10px 12px 10px 34px", borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 16 }}
        />
      </div>
      {loading && <p style={{ fontSize: 12, color: C.light, textAlign: "center", padding: "10px 0" }}>Searching…</p>}
      {!loading && query.trim().length >= 2 && results.length === 0 && (
        <p style={{ fontSize: 12, color: C.light, textAlign: "center", padding: "10px 0" }}>No matches — try scanning a barcode or quick-add it below.</p>
      )}
      <div style={{ maxHeight: 320, overflowY: "auto" }}>
        {results.map((item) => (
          <button
            key={`${item.source}-${item.id}`}
            onClick={() => onPick(item)}
            style={{
              width: "100%", textAlign: "left", background: "none", border: "none", borderBottom: `1px solid ${C.border}`,
              padding: "10px 2px", cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: "#1a1a1a" }}>{item.name}</p>
              <SourceTag item={item} />
            </div>
            <p style={{ margin: "2px 0 0", fontSize: 11.5, color: C.light }}>
              {item.brand ? `${item.brand} · ` : ""}{round(item.kcal_per_100)} kcal / 100{item.default_serving_unit ?? "g"}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

function AddFoodSheet({ userId, date, presetMealType, onClose, onAdded }: {
  userId: string; date: string; presetMealType?: MealType; onClose: () => void; onAdded: () => void;
}) {
  const [tab, setTab] = useState<AddTab>("search");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [pendingItem, setPendingItem] = useState<FoodCatalogItem | null>(null);
  // Where the pending catalog item came from — carried through to the
  // eventual food_logged event so adoption of search vs. scan is visible
  // separately, not just "catalog" as one bucket.
  const [itemOrigin, setItemOrigin] = useState<"search" | "scan">("search");
  const [unknownBarcode, setUnknownBarcode] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  // Lifted out of SearchTab so picking a result and hitting Back doesn't
  // lose the search — SearchTab unmounts while QuantityStep is showing.
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FoodCatalogItem[]>([]);

  function pickItem(item: FoodCatalogItem, origin: "search" | "scan") {
    setItemOrigin(origin);
    setPendingItem(item);
  }

  async function insertCatalogEntry(item: FoodCatalogItem, mealType: MealType, grams: number, displayQuantity: number, displayUnit: string) {
    setBusyLabel("Saving…");
    setAddError(null);
    try {
      const supabase = createClient();
      const scaled = scaleMacros(item, grams);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("food_log_entry") as any).insert({
        user_id: userId, log_date: date, meal_type: mealType,
        food_catalog_item_id: item.id, entry_source: "catalog",
        name_snapshot: item.name, brand_snapshot: item.brand,
        quantity: displayQuantity, quantity_unit: displayUnit,
        ...scaled,
      });
      if (error) throw new Error(error.message);
      track("food_logged", { entry_source: "catalog", origin: itemOrigin, catalog_source: item.source, meal_type: mealType }, "food_diary");
      onAdded();
      onClose();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Couldn't save this.";
      track("food_log_error", { stage: "catalog_insert", message }, "food_diary");
      setAddError(message);
    } finally {
      setBusyLabel(null);
    }
  }

  async function insertQuickAdd(
    mealType: MealType, name: string, macros: { kcal: number; protein_g: number; carbs_g: number; fat_g: number },
    quantity: number, quantityUnit: string, mode: QuickAddMode
  ) {
    setBusyLabel("Saving…");
    setAddError(null);
    try {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("food_log_entry") as any).insert({
        user_id: userId, log_date: date, meal_type: mealType,
        entry_source: "quick_add", name_snapshot: name,
        quantity, quantity_unit: quantityUnit, ...macros,
      });
      if (error) throw new Error(error.message);
      track("food_logged", { entry_source: "quick_add", quick_add_mode: mode, meal_type: mealType }, "food_diary");
      onAdded();
      onClose();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Couldn't save this.";
      track("food_log_error", { stage: "quick_add_insert", message }, "food_diary");
      setAddError(message);
    } finally {
      setBusyLabel(null);
    }
  }

  async function handleBarcode(barcode: string) {
    setScannerOpen(false);
    setBusyLabel("Looking up this product…");
    setScanError(null);
    try {
      const res = await fetch(`/api/food/lookup?barcode=${encodeURIComponent(barcode)}`);
      const json = await res.json();
      track("barcode_scanned", { found: !!json.found }, "food_diary");
      if (json.found) {
        pickItem(json.item as FoodCatalogItem, "scan");
      } else {
        setUnknownBarcode(barcode);
      }
    } catch {
      track("food_log_error", { stage: "barcode_lookup" }, "food_diary");
      setScanError("Couldn't look up that barcode — check your connection and try again.");
    } finally {
      setBusyLabel(null);
    }
  }

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
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 480, maxHeight: "88dvh", overflowY: "auto",
          background: C.white, borderRadius: "18px 18px 0 0", padding: "20px 20px 32px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 17 }}>
            {presetMealType ? `Log ${MEAL_LABEL[presetMealType]}` : "Log food"}
          </h3>
          <button onClick={onClose} style={{ background: "none", border: "none", padding: 4, color: C.light, cursor: "pointer", display: "flex" }}>
            <IconX size={18} />
          </button>
        </div>

        {!pendingItem && !unknownBarcode && (
          <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
            {([["search", "Search", IconSearch], ["scan", "Scan", IconBarcode], ["quick", "Quick add", IconPencil]] as const).map(([key, label, Icon]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                  padding: "9px 4px", borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: "pointer",
                  border: `1px solid ${tab === key ? C.tealDark : C.border}`,
                  background: tab === key ? C.tealDark : C.white,
                  color: tab === key ? C.white : C.muted,
                }}
              >
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>
        )}

        {scanError && <p style={{ color: C.error, fontSize: 12, marginBottom: 10 }}>{scanError}</p>}
        {addError && <p style={{ color: C.error, fontSize: 12, marginBottom: 10 }}>{addError}</p>}

        {pendingItem ? (
          <QuantityStep
            item={pendingItem} presetMealType={presetMealType} onBack={() => setPendingItem(null)}
            onAdd={(mt, grams, qty, unit) => insertCatalogEntry(pendingItem, mt, grams, qty, unit)}
          />
        ) : unknownBarcode ? (
          <SubmitUnknownForm
            barcode={unknownBarcode}
            onBack={() => setUnknownBarcode(null)}
            onSubmitted={(item) => { setUnknownBarcode(null); pickItem(item, "scan"); }}
          />
        ) : tab === "search" ? (
          <SearchTab query={searchQuery} setQuery={setSearchQuery} results={searchResults} setResults={setSearchResults} onPick={(item) => pickItem(item, "search")} />
        ) : tab === "scan" ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>Scan the barcode on the package.</p>
            <button
              className="btn-primary"
              style={{ padding: "12px 28px", fontSize: 14 }}
              onClick={() => setScannerOpen(true)}
            >
              Open camera
            </button>
          </div>
        ) : (
          <QuickAddForm presetMealType={presetMealType} onAdd={insertQuickAdd} />
        )}

        {busyLabel && !pendingItem && <p style={{ textAlign: "center", fontSize: 12, color: C.light, marginTop: 10 }}>{busyLabel}</p>}
      </div>

      {scannerOpen && (
        <div onClick={(e) => e.stopPropagation()}>
          <BarcodeScanner onDetected={handleBarcode} onClose={() => setScannerOpen(false)} />
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function LogFood({
  userId, name, date: initialDate, macroTarget, order: initialOrder, initialEntries,
}: {
  userId: string;
  name: string;
  date: string;
  macroTarget: MacroTargetRow | null;
  order: OrderMacros;
  initialEntries: FoodLogEntryRow[];
}) {
  const router = useRouter();
  const [date, setDate] = useState(initialDate);
  const [order, setOrder] = useState(initialOrder);
  const [entries, setEntries] = useState(initialEntries);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [navigatingProfile, setNavigatingProfile] = useState(false);

  // This can be someone's default landing screen, so it needs the same way
  // out to Profile/Sign out that the dashboard has — not just a way back to it.
  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    track("signout", {}, "auth");
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }
  const [addMealType, setAddMealType] = useState<MealType | undefined>(undefined);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const today = beirutISODate(0);

  function openAddSheet(mealType?: MealType) {
    setAddMealType(mealType);
    setAddOpen(true);
  }

  async function loadDay(d: string) {
    setLoading(true);
    try {
      const supabase = createClient();
      const [orderRes, entriesRes] = await Promise.all([
        supabase
          .from("daily_macro_order")
          .select("kcal_ordered, protein_ordered, carbs_ordered, fat_ordered")
          .eq("user_id", userId)
          .eq("for_date", d)
          .maybeSingle(),
        // A removed order_auto entry stays fetched (as "hidden") so it can
        // show an always-available Restore control — only catalog/quick_add
        // removals are truly dropped from view.
        supabase
          .from("food_log_entry")
          .select("*, food_catalog_item:food_catalog_item_id ( status )")
          .eq("user_id", userId)
          .eq("log_date", d)
          .or("hidden_by_user.eq.false,entry_source.eq.order_auto")
          .order("created_at", { ascending: true }),
      ]);
      setOrder(orderRes.data as OrderMacros);
      setEntries((entriesRes.data ?? []) as unknown as FoodLogEntryRow[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (date === initialDate) return; // first render already has server-fetched data
    loadDay(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  function jumpToDate(next: string) {
    if (!next || next === date) return;
    setDate(next);
    router.replace(`/log-food?date=${next}`, { scroll: false });
  }

  function changeDate(deltaDays: number) {
    const d = new Date(date + "T12:00:00");
    d.setDate(d.getDate() + deltaDays);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    jumpToDate(next);
  }

  // Removing a catalog/quick_add entry drops it from view entirely. Removing
  // an order_auto one just flips it to hidden — it stays in the list so its
  // meal section can show a persistent Restore control, not a timed toast,
  // so it can be brought back at any point.
  async function removeEntry(entry: FoodLogEntryRow) {
    if (entry.entry_source === "order_auto") {
      setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, hidden_by_user: true } : e)));
    } else {
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    }
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("food_log_entry") as any).update({ hidden_by_user: true }).eq("id", entry.id);
    if (error) track("food_log_error", { stage: "remove_entry", message: error.message }, "food_diary");
    else track("food_removed", { entry_source: entry.entry_source, meal_type: entry.meal_type }, "food_diary");
  }

  async function restoreEntry(entry: FoodLogEntryRow) {
    setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, hidden_by_user: false } : e)));
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("food_log_entry") as any).update({ hidden_by_user: false }).eq("id", entry.id);
    if (error) track("food_log_error", { stage: "restore_entry", message: error.message }, "food_diary");
    else track("food_restored", { meal_type: entry.meal_type }, "food_diary");
  }

  // A person can optionally track a bigger number than what they order
  // (set in Profile → Your diet → Diary tracking target) — falls back to
  // the order target when they haven't set one, which is today's behavior.
  const hasCustomDiaryTarget = macroTarget?.diary_kcal_target != null;
  const diaryTarget = {
    kcal: macroTarget?.diary_kcal_target ?? macroTarget?.kcal_target ?? null,
    protein: macroTarget?.diary_protein_g ?? macroTarget?.protein_g,
    carbs: macroTarget?.diary_carbs_g ?? macroTarget?.carbs_g,
    fat: macroTarget?.diary_fat_g ?? macroTarget?.fat_g,
  };
  const diaryVsOrderKcal = hasCustomDiaryTarget
    ? (macroTarget?.diary_kcal_target ?? 0) - (macroTarget?.kcal_target ?? 0)
    : 0;

  const totals = entries
    .filter((e) => !e.hidden_by_user)
    .reduce(
      (acc, e) => ({ kcal: acc.kcal + e.kcal, protein: acc.protein + e.protein_g, carbs: acc.carbs + e.carbs_g, fat: acc.fat + e.fat_g }),
      { kcal: 0, protein: 0, carbs: 0, fat: 0 }
    );

  // Always show all four meals, even empty — each gets its own log button.
  // Active entries first, removed (restorable) ones after.
  const byMeal = MEAL_TYPES.map((mt) => ({
    mt,
    items: entries
      .filter((e) => e.meal_type === mt)
      .sort((a, b) => Number(a.hidden_by_user) - Number(b.hidden_by_user)),
  }));

  // Same greeting shown on the dashboard — kept here too since this can be
  // someone's default screen.
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();
  const dayStr = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div style={{ minHeight: "100vh", background: C.offWhite, display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ background: C.primary, padding: "18px 20px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          {/* Same wordmark as the dashboard, not a "back to home" link — the
              toggle below already covers switching screens, and both screens
              are equally "default", so this one shouldn't read as secondary. */}
          <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: C.white, fontWeight: 500, letterSpacing: "0.01em" }}>
            akli
          </span>
          {/* Same as the dashboard's top bar — this can be someone's default
              screen, so it needs its own way to Profile/Sign out too. */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button
              onClick={() => { setNavigatingProfile(true); router.push("/profile"); }}
              title="Profile"
              style={{
                background: "none", border: "none", padding: 10, margin: -10,
                color: "rgba(255,255,255,0.7)", cursor: "pointer", display: "flex",
                opacity: navigatingProfile ? 0.5 : 1,
              }}
            >
              <IconUserCircle size={22} />
            </button>
            <button
              onClick={signOut}
              disabled={signingOut}
              style={{
                background: "none", border: "none", fontSize: 12, color: "rgba(255,255,255,0.45)",
                padding: "10px 8px", margin: "-10px -8px -10px 0", cursor: "pointer",
                opacity: signingOut ? 0.5 : 1,
              }}
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", margin: "0 0 2px" }}>{dayStr}</p>
        <h2 style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: name ? 26 : 22, fontWeight: 500,
          color: C.white, margin: "0 0 14px",
        }}>
          {name ? `${greeting}, ${name}.` : greeting + "."}
        </h2>

        <ViewToggle active="food_diary" userId={userId} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, background: "rgba(255,255,255,0.08)", borderRadius: 12, padding: "8px 12px" }}>
            <button onClick={() => changeDate(-1)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", cursor: "pointer", display: "flex" }}>
              <IconChevronLeft size={16} />
            </button>
            <button
              onClick={() => setCalendarOpen(true)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6, minWidth: 110,
                background: "none", border: "none", padding: 0, cursor: "pointer",
              }}
            >
              <IconCalendar size={13} color="rgba(255,255,255,0.55)" />
              <span style={{ fontSize: 13.5, fontWeight: 600, color: C.white }}>{fmtDateHeading(date)}</span>
            </button>
            <button onClick={() => changeDate(1)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", cursor: "pointer", display: "flex" }}>
              <IconChevronRight size={16} />
            </button>
          </div>
          {date !== today && (
            <button
              onClick={() => jumpToDate(today)}
              style={{
                background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 12,
                padding: "8px 12px", color: C.teal, fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              Today
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, padding: "18px 20px 60px" }}>
        {/* Order this week — same top-level action as on the dashboard, not
            hidden just because this is the diary view. */}
        <button
          className="btn-primary"
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 15, padding: "14px 0", marginBottom: 18, lineHeight: 1 }}
          onClick={() => router.push("/order/new")}
        >
          <IconShoppingBag size={17} style={{ flexShrink: 0, display: "block" }} />
          <span style={{ lineHeight: 1 }}>Start a new order</span>
        </button>

        {/* Food Diary Target / Ordered / Logged reconciliation — same label
            and same number as the equivalent card on Home, so the two
            screens never show two different "targets". */}
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: "6px 16px", marginBottom: 18 }}>
          <StatRow
            label={hasCustomDiaryTarget ? "Food Diary Target*" : "Food Diary Target"}
            kcal={diaryTarget.kcal} protein={diaryTarget.protein} carbs={diaryTarget.carbs} fat={diaryTarget.fat}
          />
          <div style={{ borderTop: `1px solid ${C.border}` }} />
          <StatRow label="Ordered" kcal={order?.kcal_ordered ?? null} protein={order?.protein_ordered} carbs={order?.carbs_ordered} fat={order?.fat_ordered} muted={!order} />
          <div style={{ borderTop: `1px solid ${C.border}` }} />
          <StatRow label="Logged" kcal={totals.kcal} protein={totals.protein} carbs={totals.carbs} fat={totals.fat} />
        </div>

        {hasCustomDiaryTarget && (
          <p style={{ fontSize: 11, color: C.light, margin: "-12px 0 18px", lineHeight: 1.4 }}>
            * {diaryVsOrderKcal > 0
              ? "Set higher than what you order, on purpose"
              : diaryVsOrderKcal < 0
              ? "Set lower than what you order, on purpose"
              : "Set to match what you order"} — change it anytime in Profile → Your diet.
          </p>
        )}

        {loading && <p style={{ textAlign: "center", fontSize: 12, color: C.light }}>Loading…</p>}

        {!loading && byMeal.map(({ mt, items }) => (
          <div key={mt} style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "0 0 6px" }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>
                {MEAL_EMOJI[mt]} {MEAL_LABEL[mt]}
              </p>
              <button
                onClick={() => openAddSheet(mt)}
                style={{
                  display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", padding: "2px 0",
                  color: C.tealDark, fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}
              >
                <IconPlus size={13} /> Log food
              </button>
            </div>
            <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: items.length ? "2px 14px" : "14px 14px" }}>
              {items.length
                ? items.map((e) => <EntryRow key={e.id} entry={e} onRemove={removeEntry} onRestore={restoreEntry} />)
                : <p style={{ margin: 0, fontSize: 12, color: C.light }}>Nothing logged yet.</p>}
            </div>
          </div>
        ))}
      </div>

      {addOpen && (
        <AddFoodSheet
          userId={userId} date={date} presetMealType={addMealType}
          onClose={() => setAddOpen(false)} onAdded={() => loadDay(date)}
        />
      )}

      {calendarOpen && (
        <CalendarSheet value={date} onSelect={jumpToDate} onClose={() => setCalendarOpen(false)} />
      )}

    </div>
  );
}
