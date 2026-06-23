"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconArrowLeft, IconLeaf, IconChevronDown, IconInfoCircle } from "@tabler/icons-react";
import RecipeRater from "@/components/RecipeRater";
import RecipeComment from "@/components/RecipeComment";
import { type PrefRating } from "@/lib/preferences";

type MealType = "breakfast" | "lunch" | "dinner" | "snack";

type RecipeRow = {
  id: number;
  name: string | null;
  photo: string | null;
  could_be_breakfast: boolean | null;
  could_be_lunch: boolean | null;
  could_be_dinner: boolean | null;
  could_be_snack: boolean | null;
};

type WeekGroup = {
  id: number;
  week_start_date: string;
  week_end_date: string;
  recipes: RecipeRow[];
};

const C = {
  primary:  "#063330",
  teal:     "#67b1b0",
  tealDark: "#437b7b",
  offWhite: "#eee9e6",
  muted:    "#5c5c5c",
  light:    "#9a9a9a",
  border:   "#e0dbd5",
  white:    "#ffffff",
};

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch:     "Lunch",
  dinner:    "Dinner",
  snack:     "Snack",
};

const ALL_MEALS: MealType[] = ["breakfast", "lunch", "snack", "dinner"];

function fmt(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function mealLabel(r: RecipeRow) {
  const labels = [];
  if (r.could_be_breakfast) labels.push("Breakfast");
  if (r.could_be_lunch)     labels.push("Lunch");
  if (r.could_be_dinner)    labels.push("Dinner");
  if (r.could_be_snack)     labels.push("Snack");
  return labels.join(" · ") || "Meal";
}

function RecipeItem({
  recipe, userId, initialRating, initialComment, isLast,
}: {
  recipe: RecipeRow;
  userId: string;
  initialRating: PrefRating;
  initialComment: string;
  isLast: boolean;
}) {
  const [imgErr, setImgErr] = useState(false);

  return (
    <div style={{
      display: "flex", gap: 12, alignItems: "flex-start",
      padding: "13px 0",
      borderBottom: isLast ? "none" : `1px solid ${C.border}`,
    }}>
      <div style={{ width: 52, height: 52, borderRadius: 9, overflow: "hidden", flexShrink: 0, background: C.offWhite, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {recipe.photo && !imgErr
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={recipe.photo} alt="" onError={() => setImgErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <IconLeaf size={18} color={C.light} />
        }
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {recipe.name}
        </p>
        <p style={{ fontSize: 11.5, color: C.light, margin: "0 0 7px" }}>{mealLabel(recipe)}</p>
        <RecipeRater userId={userId} recipeId={recipe.id} initialRating={initialRating} />
        <RecipeComment userId={userId} recipeId={recipe.id} initialComment={initialComment} />
      </div>
    </div>
  );
}

function WeekSection({
  week, userId, prefs, comments, activeFilter, defaultOpen,
}: {
  week: WeekGroup;
  userId: string;
  prefs: Record<number, PrefRating>;
  comments: Record<number, string>;
  activeFilter: MealType | null;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const filteredRecipes = activeFilter
    ? week.recipes.filter(r => r[`could_be_${activeFilter}` as keyof RecipeRow])
    : week.recipes;

  // Hide the whole section when nothing matches the active filter
  if (filteredRecipes.length === 0) return null;

  const ratedCount = filteredRecipes.filter(r => prefs[r.id] != null).length;
  const totalInWeek = week.recipes.length;
  const countLabel  = activeFilter
    ? `${filteredRecipes.length} of ${totalInWeek} dishes`
    : `${totalInWeek} dishes`;

  return (
    <div style={{ marginBottom: 14 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          background: C.white, border: `1px solid ${C.border}`,
          borderRadius: open ? "12px 12px 0 0" : 12,
          padding: "14px 16px", cursor: "pointer", transition: "border-radius 0.2s",
        }}
      >
        <div>
          <p style={{ margin: "0 0 2px", fontFamily: "'Playfair Display', serif", fontSize: 15, fontWeight: 500, color: "#1a1a1a", textAlign: "left" }}>
            {fmt(week.week_start_date)} – {fmt(week.week_end_date)}
          </p>
          <p style={{ margin: 0, fontSize: 11.5, color: C.light, textAlign: "left" }}>
            {countLabel}
            {ratedCount > 0 && ` · ${ratedCount} rated`}
          </p>
        </div>
        <IconChevronDown
          size={16} color={C.light}
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }}
        />
      </button>

      {open && (
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderTop: "none", borderRadius: "0 0 12px 12px", padding: "0 14px" }}>
          {filteredRecipes.map((recipe, i) => (
            <RecipeItem
              key={recipe.id}
              recipe={recipe}
              userId={userId}
              initialRating={prefs[recipe.id] ?? null}
              initialComment={comments[recipe.id] ?? ""}
              isLast={i === filteredRecipes.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function TastesManager({
  userId,
  weeks,
  initialPrefs,
  initialComments,
}: {
  userId: string;
  weeks: WeekGroup[];
  initialPrefs: Record<number, PrefRating>;
  initialComments: Record<number, string>;
}) {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState<MealType | null>(null);

  const totalRecipes = new Set(weeks.flatMap(w => w.recipes.map(r => r.id))).size;
  const totalRated   = Object.values(initialPrefs).filter(v => v != null).length;

  // Count how many recipes are visible under the active filter (across all weeks)
  const filteredTotal = activeFilter
    ? new Set(
        weeks.flatMap(w => w.recipes.filter(r => r[`could_be_${activeFilter}` as keyof RecipeRow]).map(r => r.id))
      ).size
    : totalRecipes;

  return (
    <div style={{ minHeight: "100vh", background: C.offWhite }}>

      {/* Header */}
      <div style={{ background: C.primary, padding: "20px 20px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <button
            onClick={() => router.back()}
            style={{ background: "none", border: "none", padding: 0, color: "rgba(255,255,255,0.6)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
          >
            <IconArrowLeft size={16} /> Back
          </button>
          <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 17, color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>akli</span>
        </div>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 500, color: "#fff", margin: "0 0 4px" }}>
          My Tastes
        </h2>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", margin: 0 }}>
          Tell us what you love — the solver will prioritise your favourites
        </p>
      </div>

      {/* Legend */}
      <div style={{ padding: "14px 20px 0" }}>
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 16px" }}>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {[
              { emoji: "❤️", label: "Love it — show me more" },
              { emoji: "👎", label: "Prefer less often" },
              { emoji: "✕",  label: "Skip it entirely" },
            ].map(({ emoji, label }) => (
              <div key={emoji} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ fontSize: 14 }}>{emoji}</span>
                <span style={{ fontSize: 11, color: C.muted }}>{label}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 7, alignItems: "flex-start", marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
            <IconInfoCircle size={14} color={C.light} style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 11, color: C.muted, margin: 0, lineHeight: 1.5 }}>
              Notes go straight to the kitchen — keep them to small swaps (e.g. &quot;no onions&quot;), so that meal macros aren&apos;t affected much and your goals stay on track.
            </p>
          </div>
        </div>

      </div>

      {/* Sticky filter bar */}
      <div style={{
        position: "sticky", top: 0, zIndex: 10,
        background: C.offWhite,
        padding: "10px 20px",
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", overflowX: "auto", paddingBottom: 2 }}>
          <button
            onClick={() => setActiveFilter(null)}
            style={{
              padding: "6px 14px", borderRadius: 20, fontSize: 12.5, fontWeight: 500, cursor: "pointer", flexShrink: 0,
              background: activeFilter === null ? C.primary : C.white,
              color: activeFilter === null ? C.white : C.muted,
              border: activeFilter === null ? "none" : `1px solid ${C.border}`,
            } as React.CSSProperties}
          >
            All
          </button>
          {ALL_MEALS.map(meal => (
            <button
              key={meal}
              onClick={() => setActiveFilter(f => f === meal ? null : meal)}
              style={{
                padding: "6px 14px", borderRadius: 20, fontSize: 12.5, fontWeight: 500, cursor: "pointer", flexShrink: 0,
                background: activeFilter === meal ? C.teal : C.white,
                color: activeFilter === meal ? C.white : C.muted,
                border: activeFilter === meal ? "none" : `1px solid ${C.border}`,
              } as React.CSSProperties}
            >
              {MEAL_LABELS[meal]}
            </button>
          ))}
          {totalRecipes > 0 && (
            <span style={{ fontSize: 12, color: C.light, marginLeft: "auto", flexShrink: 0, paddingLeft: 8 }}>
              {totalRated}/{activeFilter ? filteredTotal : totalRecipes} {activeFilter ? MEAL_LABELS[activeFilter].toLowerCase() : "rated"}
            </span>
          )}
        </div>
      </div>

      {/* Week groups */}
      <div style={{ padding: "14px 20px 60px" }}>
        {weeks.length === 0 ? (
          <p style={{ textAlign: "center", color: C.light, marginTop: 40, fontSize: 13 }}>
            No upcoming menus published yet.
          </p>
        ) : (
          <>
            {weeks.map((week, i) => (
              <WeekSection
                key={week.id}
                week={week}
                userId={userId}
                prefs={initialPrefs}
                comments={initialComments}
                activeFilter={activeFilter}
                defaultOpen={i === 0}
              />
            ))}
            {activeFilter && weeks.every(w => w.recipes.every(r => !r[`could_be_${activeFilter}` as keyof RecipeRow])) && (
              <p style={{ textAlign: "center", color: C.light, marginTop: 24, fontSize: 13 }}>
                No {MEAL_LABELS[activeFilter].toLowerCase()} recipes in any upcoming week.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
