// Single source of truth for macro math, shared by onboarding (AkliApp) and
// the change-diet flow (DietWizard). Two input paths feed the same targets:
//  - byWeight: kcal target (from Mifflin-St Jeor) + bodyweight -> g/kg protein/fat, carbs = remainder
//  - byPercent: a user-chosen kcal target -> fixed % split
// The % tables below are tuned to land close to what byWeight produces for a
// ~70kg adult at a ~2000 kcal target, so the two paths agree instead of diverging.

export type DietType = "high-protein" | "balanced" | "low-carb" | "low-fat";

export const KCAL_FLOOR = 900, KCAL_CEIL = 4000, KCAL_STEP = 50;

// Minimum carbs the body actually needs, regardless of diet type — prevents
// byWeight from ever zeroing out carbs when protein+fat already consume the
// whole kcal budget (was previously Math.max(0, ...)).
const CARB_FLOOR_G_PER_KG = 0.75;

export const DIET_OPTIONS: {
  id: DietType; label: string; emoji: string;
  split: { p: number; c: number; f: number }; // percentages, must sum to 100
  forWho: string;
}[] = [
  { id: "high-protein", label: "High Protein", emoji: "💪", split: { p: 28, c: 47, f: 25 }, forWho: "Active people or anyone who gets hungry fast." },
  { id: "balanced",     label: "Balanced",     emoji: "⚖️", split: { p: 22, c: 46, f: 32 }, forWho: "Everyday health and maintenance." },
  { id: "low-carb",     label: "Low Carb",     emoji: "🔥", split: { p: 27, c: 36, f: 37 }, forWho: "Fewer energy spikes, steady focus." },
  { id: "low-fat",      label: "Low Fat",      emoji: "🥗", split: { p: 25, c: 59, f: 16 }, forWho: "Light meals, calorie-conscious eating." },
];

const PER_KG: Record<DietType, { pk: number; fk: number }> = {
  "high-protein": { pk: 2.0, fk: 0.8 },
  "low-fat":      { pk: 1.8, fk: 0.5 },
  "low-carb":     { pk: 1.9, fk: 1.2 },
  "balanced":     { pk: 1.6, fk: 1.0 },
};

export function ageFromDob(dob: string): number {
  const today = new Date();
  const birth = new Date(dob);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return Math.max(0, age);
}

export function byWeight(kcal: number, weight: number, diet: DietType) {
  const { pk, fk } = PER_KG[diet];
  let p = weight * pk;
  let f = weight * fk;
  const carbFloorG = weight * CARB_FLOOR_G_PER_KG;
  const maxPFKcal = kcal - carbFloorG * 4;
  const pfKcal = p * 4 + f * 9;
  if (maxPFKcal <= 0) {
    // kcal target is below what the carb floor alone needs — degenerate case
    p = 0; f = 0;
  } else if (pfKcal > maxPFKcal) {
    const scale = maxPFKcal / pfKcal;
    p *= scale; f *= scale;
  }
  const carbs = Math.max(carbFloorG, (kcal - p * 4 - f * 9) / 4);
  return { protein: p, fat: f, carbs };
}

export function byPercent(kcal: number, diet: DietType) {
  const d = DIET_OPTIONS.find(o => o.id === diet)!.split;
  return {
    protein: (kcal * d.p / 100) / 4,
    fat:     (kcal * d.f / 100) / 9,
    carbs:   (kcal * d.c / 100) / 4,
  };
}

export function macrosFromDiet(kcal: number, diet: DietType) {
  const d = DIET_OPTIONS.find(o => o.id === diet)!;
  return {
    protein: Math.round((kcal * d.split.p / 100) / 4),
    carbs:   Math.round((kcal * d.split.c / 100) / 4),
    fat:     Math.round((kcal * d.split.f / 100) / 9),
    split:   d.split,
  };
}

export function formatPrice(dayPrice: number | null, p: number, c: number, f: number) {
  if (dayPrice !== null) return `$${dayPrice.toFixed(2)}`;
  // Client-side fallback using same logic as Flask (midpoint per-gram rates)
  const estimate = p * 0.018 + c * 0.006 + f * 0.022 + 1.8; // macro cost + avg packaging
  return `~$${estimate.toFixed(2)}`;
}
