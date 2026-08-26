// Canonical meal-of-day order, matching the convention already used in
// labels.ts, OrderHistory.tsx, and OrderFlow.tsx for client-facing views.
export const MEAL_TYPE_ORDER = ["breakfast", "lunch", "snack", "dinner"] as const;

export function mealTypeRank(mealType: string | null | undefined): number {
  if (!mealType) return 99;
  const i = MEAL_TYPE_ORDER.indexOf(mealType.toLowerCase() as (typeof MEAL_TYPE_ORDER)[number]);
  return i === -1 ? 99 : i;
}
