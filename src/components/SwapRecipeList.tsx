"use client";

import { useEffect, useState } from "react";
import { IconLeaf } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import { getChefsPicks, isChefsPick, type ChefsPicks } from "@/lib/flask";
import { isAvailableOn, isRestricted, shortDay, availabilityLabel } from "@/lib/menuAvailability";

const C = {
  teal: "#67b1b0", tealDark: "#437b7b", offWhite: "#eee9e6",
  muted: "#5c5c5c", light: "#9a9a9a", border: "#e0dbd5",
};

export type SwapListRecipe = {
  id: number; name: string | null; photo: string | null;
  available_dates?: string[] | null;
};

/**
 * Recipe list for a swap / add sheet. Dishes cooked on `date` come first
 * (today's chef's pick on top, badged); dishes on this week's menu but
 * cooked on other days follow, greyed and not pickable, with the days
 * they're available on.
 *
 * `availableIds`, when given, is the authoritative set for `date` (from the
 * backend); otherwise availability comes from each recipe's available_dates.
 * `datesById` overrides a recipe's available_dates (My orders loads them
 * separately from the full recipe list).
 */
export default function SwapRecipeList({
  recipes, date, mealType, onPick, availableIds, datesById,
}: {
  recipes: SwapListRecipe[];
  date: string;
  mealType: string;
  onPick: (id: number) => void;
  availableIds?: Set<number> | null;
  datesById?: Map<number, string[] | null> | null;
}) {
  const [picks, setPicks] = useState<ChefsPicks>({});
  useEffect(() => {
    let live = true;
    getChefsPicks(date, date).then(p => { if (live) setPicks(p); });
    return () => { live = false; };
  }, [date]);

  const datesOf = (r: SwapListRecipe) => (datesById?.has(r.id) ? datesById.get(r.id) : r.available_dates) ?? null;
  const onToday = (r: SwapListRecipe) => availableIds ? availableIds.has(r.id) : isAvailableOn(datesOf(r), date);

  const available = recipes.filter(onToday);
  available.sort((a, b) => Number(isChefsPick(picks, date, mealType, b.id)) - Number(isChefsPick(picks, date, mealType, a.id)));
  // Only dishes limited to other days of this week — not ones simply off the menu.
  const otherDays = recipes.filter(r => !onToday(r) && isRestricted(datesOf(r)));

  return (
    <>
      {available.length === 0 && (
        <p style={{ textAlign: "center", color: C.light, marginTop: 24, fontSize: 13 }}>
          Nothing else for {mealType} on {shortDay(date)}.
        </p>
      )}
      {available.map(r => {
        const pick = isChefsPick(picks, date, mealType, r.id);
        const label = availabilityLabel(datesOf(r));
        return (
          <button key={r.id} onClick={() => onPick(r.id)} style={rowStyle(true)}>
            <Thumb photo={r.photo} />
            <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{r.name}</span>
              {(pick || label) && (
                <span style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {pick && <Tag color={C.tealDark} bg="#e8f4f4">Chef&apos;s pick</Tag>}
                  {label && <Tag color="#8a5a00" bg="#fbf1dc">{label}</Tag>}
                </span>
              )}
            </span>
          </button>
        );
      })}

      {otherDays.length > 0 && (
        <>
          <p style={{ margin: "18px 0 2px", fontSize: 11, fontWeight: 600, color: C.light, textTransform: "uppercase", letterSpacing: 0.4 }}>
            Not cooked on {shortDay(date)}
          </p>
          {otherDays.map(r => (
            <div key={r.id} aria-disabled style={rowStyle(false)}>
              <Thumb photo={r.photo} dim />
              <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: C.light }}>{r.name}</span>
                <span style={{ fontSize: 11.5, color: C.muted }}>
                  Available {(availabilityLabel(datesOf(r)) ?? "").replace(/^Only /, "")}
                </span>
              </span>
            </div>
          ))}
        </>
      )}
    </>
  );
}

/**
 * available_dates of every dish on the weekly menu(s) covering `date`, for
 * screens that only get the date's recipe ids from the backend.
 */
export function useWeekMenuDates(date: string | null | undefined): Map<number, string[] | null> | null {
  const [map, setMap] = useState<Map<number, string[] | null> | null>(null);
  useEffect(() => {
    setMap(null);
    if (!date) return;
    let live = true;
    const supabase = createClient();
    (supabase.from("weekly_menu") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      .select("weekly_menu_recipe(recipe_id, available_dates)")
      .lte("week_start_date", date).gte("week_end_date", date)
      .then(({ data }: { data: { weekly_menu_recipe: { recipe_id: number; available_dates: string[] | null }[] }[] | null }) => {
        if (!live) return;
        const m = new Map<number, string[] | null>();
        for (const w of data ?? []) for (const row of w.weekly_menu_recipe ?? []) {
          const dates = row.available_dates && row.available_dates.length ? row.available_dates : null;
          if (!m.has(row.recipe_id)) m.set(row.recipe_id, dates);
          else { const prev = m.get(row.recipe_id); m.set(row.recipe_id, prev && dates ? [...new Set([...prev, ...dates])] : null); }
        }
        setMap(m);
      });
    return () => { live = false; };
  }, [date]);
  return map;
}

function rowStyle(enabled: boolean): React.CSSProperties {
  return {
    width: "100%", display: "flex", gap: 12, alignItems: "center", padding: "12px 0",
    background: "none", border: "none", borderBottom: `1px solid ${C.border}`,
    cursor: enabled ? "pointer" : "default", textAlign: "left",
  };
}

function Thumb({ photo, dim }: { photo: string | null; dim?: boolean }) {
  return (
    <div style={{ width: 52, height: 52, borderRadius: 9, overflow: "hidden", flexShrink: 0, background: C.offWhite, display: "flex", alignItems: "center", justifyContent: "center", opacity: dim ? 0.45 : 1, filter: dim ? "grayscale(1)" : undefined }}>
      {photo
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <IconLeaf size={18} color={C.light} />}
    </div>
  );
}

function Tag({ children, color, bg }: { children: React.ReactNode; color: string; bg: string }) {
  return <span style={{ fontSize: 10.5, fontWeight: 600, color, background: bg, padding: "2px 7px", borderRadius: 20, whiteSpace: "nowrap" }}>{children}</span>;
}
