"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconArrowLeft, IconLeaf } from "@tabler/icons-react";
import { conflictingAllergens, type AllergenFlags } from "@/lib/allergens";
import { availabilityLabel, isAvailableOn, isRestricted, weekdaysBetween } from "@/lib/menuAvailability";

type RecipeRow = {
  id: number; name: string | null; description: string | null; photo: string | null;
  could_be_breakfast: boolean | null; could_be_lunch: boolean | null;
  could_be_dinner: boolean | null; could_be_snack: boolean | null;
  available_dates?: string[] | null;
};

type WeekMenu = {
  id: number;
  week_start_date: string;
  week_end_date: string;
  recipes: RecipeRow[];
};


const C = {
  primary: "#063330", teal: "#67b1b0", offWhite: "#eee9e6",
  muted: "#5c5c5c", light: "#9a9a9a", border: "#e0dbd5", white: "#ffffff",
};

function mealLabel(r: RecipeRow): string {
  const labels = [];
  if (r.could_be_breakfast) labels.push("Breakfast");
  if (r.could_be_lunch)     labels.push("Lunch");
  if (r.could_be_dinner)    labels.push("Dinner");
  if (r.could_be_snack)     labels.push("Snack");
  return labels.join(" · ") || "Meal";
}

// ── Recipe modal ──────────────────────────────────────────────────────────────

function AllergenWarning({ conflicts }: { conflicts: { key: string; label: string }[] }) {
  if (conflicts.length === 0) return null;
  return (
    <p style={{ fontSize: 11, color: "#b45309", background: "#fff8e6", borderRadius: 6, padding: "3px 7px", margin: "0 0 7px", display: "inline-block" }}>
      ⚠️ Contains {conflicts.map(c => c.label).join(", ")}
    </p>
  );
}

function RecipeModal({ recipe, conflicts, onClose }: { recipe: RecipeRow; conflicts: { key: string; label: string }[]; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        background: "rgba(6,51,48,0.55)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 480,
          background: C.white, borderRadius: "18px 18px 0 0",
          overflow: "hidden", animation: "slideUp 0.22s ease",
        }}
      >
        {recipe.photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={recipe.photo} alt={recipe.name ?? ""} style={{ width: "100%", height: 240, objectFit: "cover" }} />
        )}
        <div style={{ padding: "20px 22px 36px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: 20 }}>{recipe.name}</h3>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#437b7b", background: "#e8f4f4", padding: "3px 8px", borderRadius: 20, whiteSpace: "nowrap", marginLeft: 10 }}>
              {mealLabel(recipe)}
            </span>
          </div>
          {availabilityLabel(recipe.available_dates) && (
            <p style={{ fontSize: 12.5, color: "#8a5a00", fontWeight: 600, margin: "0 0 10px" }}>
              Available {availabilityLabel(recipe.available_dates)!.replace(/^Only /, "only on ")} this week
            </p>
          )}
          <AllergenWarning conflicts={conflicts} />
          {recipe.description && (
            <p style={{ fontSize: 13.5, color: C.muted, margin: 0, lineHeight: 1.65 }}>{recipe.description}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Recipe card ───────────────────────────────────────────────────────────────

/** "Wed only" / "Mon & Tue only" — short, since the day is already picked. */
function daysTag(dates: string[] | null | undefined): string | null {
  if (!isRestricted(dates)) return null;
  const names = [...new Set(dates!.map(d => d.slice(0, 10)))].sort()
    .map(d => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short" }));
  return `${names.join(" & ")} only`;
}

function RecipeCard({ recipe, conflicts, onClick }: { recipe: RecipeRow; conflicts: { key: string; label: string }[]; onClick: () => void }) {
  const tag = daysTag(recipe.available_dates);
  const [imgErr, setImgErr] = useState(false);
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", gap: 12, alignItems: "center",
        width: "100%", padding: "11px 0",
        background: "none", border: "none",
        cursor: "pointer", textAlign: "left",
      }}
    >
      <div style={{ width: 58, height: 58, borderRadius: 10, overflow: "hidden", flexShrink: 0, background: C.offWhite, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {recipe.photo && !imgErr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={recipe.photo} alt="" onError={() => setImgErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <IconLeaf size={22} color={C.light} />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color: "#1a1a1a", lineHeight: 1.3 }}>
          {recipe.name}
        </p>
        {tag && (
          <span style={{ display: "inline-block", marginTop: 5, fontSize: 10.5, fontWeight: 600, color: "#8a5a00", background: "#fbf1dc", padding: "2px 7px", borderRadius: 20 }}>
            {tag}
          </span>
        )}
        {conflicts.length > 0 && (
          <p style={{ fontSize: 11, color: "#b45309", fontWeight: 600, margin: "4px 0 0" }}>
            Contains: {conflicts.map(c => c.label).join(", ")}
          </p>
        )}
      </div>
    </button>
  );
}

// ── Day picker ────────────────────────────────────────────────────────────────

function DayStrip({ days, selected, onSelect }: { days: string[]; selected: string; onSelect: (d: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>(`[data-day="${selected}"]`)?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [selected]);
  return (
    <div ref={ref} style={{ display: "flex", gap: 8, overflowX: "auto", padding: "2px 20px 4px", scrollbarWidth: "none" }}>
      {days.map((d, i) => {
        const dt = new Date(d + "T12:00:00");
        const on = d === selected;
        const newWeek = i > 0 && (new Date(days[i - 1] + "T12:00:00").getTime() + 3 * 864e5 < dt.getTime() || dt.getDay() === 1);
        return (
          <button
            key={d}
            data-day={d}
            aria-label={dt.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
            aria-pressed={on}
            onClick={() => onSelect(d)}
            style={{
              flexShrink: 0, width: 54, padding: "8px 0 7px", borderRadius: 14,
              marginLeft: newWeek ? 10 : 0,
              border: `1px solid ${on ? C.primary : C.border}`,
              background: on ? C.primary : C.white,
              color: on ? C.white : "#1a1a1a",
              cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
            }}
          >
            <span style={{ fontSize: 11, opacity: on ? 0.75 : 0.55 }}>{dt.toLocaleDateString("en-GB", { weekday: "short" })}</span>
            <span style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.2 }}>{dt.getDate()}</span>
            <span style={{ fontSize: 10, opacity: on ? 0.75 : 0.55 }}>{dt.toLocaleDateString("en-GB", { month: "short" })}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

const SECTIONS: { key: string; title: string; match: (r: RecipeRow) => boolean }[] = [
  { key: "breakfast", title: "Breakfast", match: r => !!r.could_be_breakfast },
  { key: "main", title: "Lunch & dinner", match: r => !r.could_be_breakfast && !!(r.could_be_lunch || r.could_be_dinner) },
  { key: "snack", title: "Snacks", match: r => !r.could_be_breakfast && !r.could_be_lunch && !r.could_be_dinner && !!r.could_be_snack },
];

export default function MenuBrowser({ menus, userAllergens, recipeAllergens, today, closedDays = [] }: {
  menus: WeekMenu[];
  userAllergens: AllergenFlags;
  recipeAllergens: Record<number, AllergenFlags>;
  today: string;
  closedDays?: string[];
}) {
  const router = useRouter();
  const [activeRecipe, setActiveRecipe] = useState<RecipeRow | null>(null);

  // Every open weekday from today on that some menu covers, with what's cooked that day.
  const dayMenus = useMemo(() => {
    const closed = new Set(closedDays);
    const byDay = new Map<string, Map<number, RecipeRow>>();
    for (const w of menus) {
      for (const d of weekdaysBetween(w.week_start_date, w.week_end_date)) {
        if (d < today || closed.has(d)) continue;
        const m = byDay.get(d) ?? new Map<number, RecipeRow>();
        for (const r of w.recipes) if (isAvailableOn(r.available_dates, d)) m.set(r.id, r);
        byDay.set(d, m);
      }
    }
    return new Map([...byDay.entries()].filter(([, m]) => m.size > 0).sort(([a], [b]) => a.localeCompare(b)));
  }, [menus, today, closedDays]);

  const days = [...dayMenus.keys()];
  const [selected, setSelected] = useState<string>(days[0] ?? "");
  const recipes = [...(dayMenus.get(selected)?.values() ?? [])];

  return (
    <div style={{ minHeight: "100vh", background: C.offWhite }}>

      {/* Header */}
      <div style={{ background: C.primary, padding: "20px 20px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <button
            onClick={() => router.back()}
            style={{ background: "none", border: "none", padding: 0, color: "rgba(255,255,255,0.6)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
          >
            <IconArrowLeft size={16} /> Back
          </button>
          <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 17, color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>akli</span>
        </div>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 500, color: C.white, margin: 0 }}>
          Menu
        </h2>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "rgba(255,255,255,0.65)" }}>Pick a day to see what&apos;s cooking</p>
      </div>

      {/* Sticky day picker */}
      {days.length > 0 && (
        <div style={{
          position: "sticky", top: 0, zIndex: 20,
          background: "rgba(238,233,230,0.92)", backdropFilter: "blur(10px)",
          borderBottom: `1px solid ${C.border}`, padding: "10px 0",
        }}>
          <DayStrip days={days} selected={selected} onSelect={setSelected} />
        </div>
      )}

      <div style={{ padding: "18px 20px 90px" }}>
        {days.length === 0 ? (
          <p style={{ textAlign: "center", color: C.light, marginTop: 40, fontSize: 13 }}>
            No upcoming menus published yet.
          </p>
        ) : (
          <>
            <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 19, fontWeight: 500, margin: "0 0 14px", color: "#1a1a1a" }}>
              {new Date(selected + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
            </h3>
            {SECTIONS.map(sec => {
              const list = recipes.filter(sec.match);
              if (list.length === 0) return null;
              return (
                <div key={sec.key} style={{ marginBottom: 16 }}>
                  <p style={{ margin: "0 0 6px 2px", fontSize: 11.5, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    {sec.title} <span style={{ color: C.light, fontWeight: 400 }}>· {list.length}</span>
                  </p>
                  <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: "0 14px" }}>
                    {list.map((r, i) => (
                      <div key={r.id} style={{ borderBottom: i < list.length - 1 ? `1px solid ${C.border}` : "none" }}>
                        <RecipeCard recipe={r} conflicts={conflictingAllergens(userAllergens, recipeAllergens[r.id])} onClick={() => setActiveRecipe(r)} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {activeRecipe && (
        <RecipeModal
          recipe={activeRecipe}
          conflicts={conflictingAllergens(userAllergens, recipeAllergens[activeRecipe.id])}
          onClose={() => setActiveRecipe(null)}
        />
      )}

      {/* Order now FAB */}
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
          Order now
        </button>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(40px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}
