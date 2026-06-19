"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconArrowLeft, IconLeaf, IconChevronDown } from "@tabler/icons-react";
import RecipeRater from "@/components/RecipeRater";
import { type PrefRating } from "@/lib/preferences";

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
  offWhite: "#eee9e6",
  muted:    "#5c5c5c",
  light:    "#9a9a9a",
  border:   "#e0dbd5",
  white:    "#ffffff",
};

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

function WeekSection({
  week, userId, prefs, defaultOpen,
}: {
  week: WeekGroup;
  userId: string;
  prefs: Record<number, PrefRating>;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const ratedCount = week.recipes.filter(r => prefs[r.id] != null).length;

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
            {week.recipes.length} dishes
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
          {week.recipes.map((recipe, i) => (
            <RecipeRow
              key={recipe.id}
              recipe={recipe}
              userId={userId}
              initialRating={prefs[recipe.id] ?? null}
              isLast={i === week.recipes.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RecipeRow({
  recipe, userId, initialRating, isLast,
}: {
  recipe: RecipeRow;
  userId: string;
  initialRating: PrefRating;
  isLast: boolean;
}) {
  const [imgErr, setImgErr] = useState(false);

  return (
    <div style={{
      display: "flex", gap: 12, alignItems: "center",
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
      </div>
    </div>
  );
}

export default function TastesManager({
  userId,
  weeks,
  initialPrefs,
}: {
  userId: string;
  weeks: WeekGroup[];
  initialPrefs: Record<number, PrefRating>;
}) {
  const router = useRouter();

  const totalRated = Object.values(initialPrefs).filter(v => v != null).length;
  const totalRecipes = new Set(weeks.flatMap(w => w.recipes.map(r => r.id))).size;

  return (
    <div style={{ minHeight: "100vh", background: C.offWhite }}>

      {/* Header */}
      <div style={{ background: C.primary, padding: "20px 20px 24px" }}>
        <button
          onClick={() => router.back()}
          style={{ background: "none", border: "none", padding: 0, color: "rgba(255,255,255,0.6)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, marginBottom: 16 }}
        >
          <IconArrowLeft size={16} /> Back
        </button>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 500, color: "#fff", margin: "0 0 4px" }}>
          My Tastes
        </h2>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", margin: 0 }}>
          Tell us what you love — the solver will prioritise your favourites
        </p>
      </div>

      {/* Legend */}
      <div style={{ padding: "14px 20px 0" }}>
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 14 }}>
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
        </div>
        {totalRecipes > 0 && (
          <p style={{ fontSize: 12, color: C.light, margin: "8px 0 0", textAlign: "right" }}>
            {totalRated}/{totalRecipes} rated
          </p>
        )}
      </div>

      {/* Week groups */}
      <div style={{ padding: "14px 20px 60px" }}>
        {weeks.length === 0 ? (
          <p style={{ textAlign: "center", color: C.light, marginTop: 40, fontSize: 13 }}>
            No upcoming menus published yet.
          </p>
        ) : (
          weeks.map((week, i) => (
            <WeekSection
              key={week.id}
              week={week}
              userId={userId}
              prefs={initialPrefs}
              defaultOpen={i === 0}
            />
          ))
        )}
      </div>
    </div>
  );
}
