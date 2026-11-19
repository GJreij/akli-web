// Per-dish availability inside a weekly menu (weekly_menu_recipe.available_dates).
// NULL / empty = every day of that menu. Mirrors the backend rule in
// mealplanner-flask services/weekly_menu_service.py::available_on.

export type AvailableDates = string[] | null | undefined;

export function isAvailableOn(availableDates: AvailableDates, date: string): boolean {
  if (!availableDates || availableDates.length === 0) return true;
  return availableDates.some(d => d.slice(0, 10) === date.slice(0, 10));
}

export function isRestricted(availableDates: AvailableDates): boolean {
  return !!availableDates && availableDates.length > 0;
}

/** Weekdays (Mon-Fri) from start to end inclusive, as YYYY-MM-DD. */
export function weekdaysBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(start + "T12:00:00");
  const last = new Date(end + "T12:00:00");
  for (; d <= last; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** "Mon 7 Dec" */
export function shortDay(date: string): string {
  return new Date(date.slice(0, 10) + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

/** "Only Tue 8 Dec" / "Mon 7 & Thu 10 Dec" / "Mon 7, Wed 9 & Fri 11 Dec" (null when every day). */
export function availabilityLabel(availableDates: AvailableDates): string | null {
  if (!isRestricted(availableDates)) return null;
  const dates = [...new Set(availableDates!.map(d => d.slice(0, 10)))].sort();
  if (dates.length === 1) return `Only ${shortDay(dates[0])}`;
  const parts = dates.map(d => new Date(d + "T12:00:00"));
  const sameMonth = parts.every(p => p.getMonth() === parts[0].getMonth());
  const labels = parts.map((p, i) =>
    sameMonth && i < parts.length - 1
      ? p.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" })
      : p.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }));
  return labels.slice(0, -1).join(", ") + " & " + labels[labels.length - 1];
}

/**
 * Flattens a weekly menu's weekly_menu_recipe rows into one entry per
 * recipe, carrying its available_dates. A recipe listed twice gets the
 * union of its dates, or every day if either row is unrestricted.
 */
export function collectMenuRecipes<R extends { id: number }>(
  rows: { available_dates?: string[] | null; recipe: R | null }[] | null | undefined,
): (R & { available_dates: string[] | null })[] {
  const out: (R & { available_dates: string[] | null })[] = [];
  const byId = new Map<number, R & { available_dates: string[] | null }>();
  for (const wmr of rows ?? []) {
    if (!wmr.recipe) continue;
    const dates = wmr.available_dates && wmr.available_dates.length ? wmr.available_dates : null;
    const existing = byId.get(wmr.recipe.id);
    if (!existing) {
      const row = { ...wmr.recipe, available_dates: dates };
      byId.set(row.id, row);
      out.push(row);
    } else if (existing.available_dates) {
      existing.available_dates = dates ? [...new Set([...existing.available_dates, ...dates])] : null;
    }
  }
  return out;
}

/** Dates in `availableDates` within [from, to], e.g. "later this week" for a swap sheet. */
export function datesWithin(availableDates: AvailableDates, from: string, to: string): string[] {
  if (!isRestricted(availableDates)) return [];
  return availableDates!.map(d => d.slice(0, 10)).filter(d => d >= from && d <= to).sort();
}
