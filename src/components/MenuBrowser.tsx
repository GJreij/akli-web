"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconArrowLeft, IconLeaf, IconChevronDown } from "@tabler/icons-react";

type RecipeRow = {
  id: number; name: string | null; description: string | null; photo: string | null;
  could_be_breakfast: boolean | null; could_be_lunch: boolean | null;
  could_be_dinner: boolean | null; could_be_snack: boolean | null;
};

type WeekMenu = {
  id: number;
  week_start_date: string;
  week_end_date: string;
  recipes: RecipeRow[];
};

type Filter = "all" | "breakfast" | "lunch" | "dinner" | "snack";

const C = {
  primary: "#063330", teal: "#67b1b0", offWhite: "#eee9e6",
  muted: "#5c5c5c", light: "#9a9a9a", border: "#e0dbd5", white: "#ffffff",
};

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function isCurrentWeek(start: string, end: string) {
  const now = new Date();
  return new Date(start) <= now && new Date(end) >= now;
}

function matchesFilter(r: RecipeRow, filter: Filter) {
  if (filter === "all")       return true;
  if (filter === "breakfast") return !!r.could_be_breakfast;
  if (filter === "lunch")     return !!r.could_be_lunch;
  if (filter === "dinner")    return !!r.could_be_dinner;
  if (filter === "snack")     return !!r.could_be_snack;
  return true;
}

function mealLabel(r: RecipeRow): string {
  const labels = [];
  if (r.could_be_breakfast) labels.push("Breakfast");
  if (r.could_be_lunch)     labels.push("Lunch");
  if (r.could_be_dinner)    labels.push("Dinner");
  if (r.could_be_snack)     labels.push("Snack");
  return labels.join(" · ") || "Meal";
}

// ── Filter bar (used both in header and sticky float) ─────────────────────────

function FilterBar({ filter, setFilter }: { filter: Filter; setFilter: (f: Filter) => void }) {
  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "breakfast", label: "Breakfast" },
    { id: "lunch", label: "Lunch" },
    { id: "dinner", label: "Dinner" },
    { id: "snack", label: "Snack" },
  ];
  return (
    <div style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 2 }}>
      {filters.map(f => (
        <button
          key={f.id}
          onClick={() => setFilter(f.id)}
          style={{
            flexShrink: 0,
            padding: "6px 14px", borderRadius: 20,
            border: `1px solid ${filter === f.id ? C.teal : C.border}`,
            background: filter === f.id ? C.teal : C.white,
            color: filter === f.id ? C.primary : C.muted,
            fontSize: 12.5, fontWeight: filter === f.id ? 600 : 400,
            cursor: "pointer", transition: "all 0.15s",
          }}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

// ── Recipe modal ──────────────────────────────────────────────────────────────

function RecipeModal({ recipe, onClose }: { recipe: RecipeRow; onClose: () => void }) {
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
          {recipe.description && (
            <p style={{ fontSize: 13.5, color: C.muted, margin: 0, lineHeight: 1.65 }}>{recipe.description}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Recipe card ───────────────────────────────────────────────────────────────

function RecipeCard({ recipe, onClick }: { recipe: RecipeRow; onClick: () => void }) {
  const [imgErr, setImgErr] = useState(false);
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", gap: 12, alignItems: "center",
        width: "100%", padding: "12px 0",
        background: "none", border: "none",
        cursor: "pointer", textAlign: "left",
      }}
    >
      <div style={{ width: 62, height: 62, borderRadius: 10, overflow: "hidden", flexShrink: 0, background: C.offWhite, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {recipe.photo && !imgErr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={recipe.photo} alt="" onError={() => setImgErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <IconLeaf size={22} color={C.light} />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13.5, fontWeight: 600, margin: "0 0 3px", color: "#1a1a1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {recipe.name}
        </p>
        <p style={{ fontSize: 11.5, color: C.light, margin: 0 }}>{mealLabel(recipe)}</p>
      </div>
    </button>
  );
}

// ── Collapsible week section ──────────────────────────────────────────────────

function WeekSection({
  week, filter, onRecipeClick, defaultOpen,
}: {
  week: WeekMenu;
  filter: Filter;
  onRecipeClick: (r: RecipeRow) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const visible = week.recipes.filter(r => matchesFilter(r, filter));
  const current = isCurrentWeek(week.week_start_date, week.week_end_date);

  if (visible.length === 0) return null;

  return (
    <div style={{ marginBottom: 14 }}>
      {/* Collapsible header */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          background: C.white, border: `1px solid ${C.border}`,
          borderRadius: open ? "12px 12px 0 0" : 12,
          padding: "14px 16px", cursor: "pointer", transition: "border-radius 0.2s",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 15, fontWeight: 500, color: "#1a1a1a" }}>
            {fmt(week.week_start_date)} – {fmt(week.week_end_date)}
          </span>
          {current && (
            <span style={{ fontSize: 10.5, fontWeight: 600, color: "#437b7b", background: "#e8f4f4", padding: "2px 8px", borderRadius: 20 }}>
              This week
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11.5, color: C.light }}>{visible.length} dishes</span>
          <IconChevronDown
            size={16}
            color={C.light}
            style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
          />
        </div>
      </button>

      {/* Collapsible body */}
      {open && (
        <div style={{
          background: C.white,
          border: `1px solid ${C.border}`, borderTop: "none",
          borderRadius: "0 0 12px 12px",
          padding: "0 14px",
        }}>
          {visible.map((r, i) => (
            <div key={r.id} style={{ borderBottom: i < visible.length - 1 ? `1px solid ${C.border}` : "none" }}>
              <RecipeCard recipe={r} onClick={() => onRecipeClick(r)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function MenuBrowser({ menus }: { menus: WeekMenu[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [activeRecipe, setActiveRecipe] = useState<RecipeRow | null>(null);

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
          Upcoming menus
        </h2>
      </div>

      {/* Sticky floating filter bar */}
      <div style={{
        position: "sticky", top: 0, zIndex: 20,
        background: "rgba(238,233,230,0.88)",
        backdropFilter: "blur(10px)",
        borderBottom: `1px solid ${C.border}`,
        padding: "10px 20px",
      }}>
        <FilterBar filter={filter} setFilter={setFilter} />
      </div>

      {/* Weeks */}
      <div style={{ padding: "20px 20px 90px" }}>
        {menus.length === 0 && (
          <p style={{ textAlign: "center", color: C.light, marginTop: 40, fontSize: 13 }}>
            No upcoming menus published yet.
          </p>
        )}
        {menus.map((week, i) => (
          <WeekSection
            key={week.id}
            week={week}
            filter={filter}
            onRecipeClick={setActiveRecipe}
            defaultOpen={i === 0}
          />
        ))}
      </div>

      {activeRecipe && <RecipeModal recipe={activeRecipe} onClose={() => setActiveRecipe(null)} />}

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
