export type Goal = "lose_weight" | "maintain" | "build_muscle" | "general_health";
export type Sex = "male" | "female";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type DietType = "high_protein" | "balanced" | "low_fat";

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

const GOAL_ADJUSTMENTS: Record<Goal, number> = {
  lose_weight: -500,
  maintain: 0,
  build_muscle: 300,
  general_health: 0,
};

export function calculateBMR(
  sex: Sex,
  weightKg: number,
  heightCm: number,
  ageYears: number
): number {
  if (sex === "male") {
    return 10 * weightKg + 6.25 * heightCm - 5 * ageYears + 5;
  }
  return 10 * weightKg + 6.25 * heightCm - 5 * ageYears - 161;
}

export function calculateTDEE(bmr: number, activity: ActivityLevel): number {
  return Math.round(bmr * ACTIVITY_MULTIPLIERS[activity]);
}

export function calculateKcalTarget(tdee: number, goal: Goal): number {
  const raw = tdee + GOAL_ADJUSTMENTS[goal];
  return Math.max(1200, Math.min(4000, Math.round(raw / 50) * 50));
}

export interface MacroTargets {
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  kcal: number;
}

export function calculateMacrosByWeight(
  kcal: number,
  weightKg: number,
  dietType: DietType
): MacroTargets {
  let proteinPerKg: number;
  let fatPerKg: number;

  switch (dietType) {
    case "high_protein":
      proteinPerKg = 2.2;
      fatPerKg = 0.9;
      break;
    case "low_fat":
      proteinPerKg = 1.8;
      fatPerKg = 0.6;
      break;
    default: // balanced
      proteinPerKg = 2.0;
      fatPerKg = 0.8;
  }

  const protein_g = Math.round(proteinPerKg * weightKg);
  const fat_g = Math.round(fatPerKg * weightKg);
  const proteinKcal = protein_g * 4;
  const fatKcal = fat_g * 9;
  const carbsKcal = Math.max(0, kcal - proteinKcal - fatKcal);
  const carbs_g = Math.round(carbsKcal / 4);

  return { protein_g, carbs_g, fat_g, kcal };
}

export function calculateMacrosByPercent(
  kcal: number,
  dietType: DietType
): MacroTargets {
  let proteinPct: number;
  let fatPct: number;

  switch (dietType) {
    case "high_protein":
      proteinPct = 0.35;
      fatPct = 0.25;
      break;
    case "low_fat":
      proteinPct = 0.30;
      fatPct = 0.20;
      break;
    default:
      proteinPct = 0.30;
      fatPct = 0.30;
  }

  const carbsPct = 1 - proteinPct - fatPct;
  const protein_g = Math.round((kcal * proteinPct) / 4);
  const fat_g = Math.round((kcal * fatPct) / 9);
  const carbs_g = Math.round((kcal * carbsPct) / 4);

  return { protein_g, carbs_g, fat_g, kcal };
}

export function estimatePriceFromMacros(
  macros: MacroTargets,
  priceTable: {
    proteing_g_price: number;
    carbs_g_price: number;
    fat_g_price: number;
    day_packaging_price: number;
    delivery_price: number;
  }
): number {
  const macrosCost =
    macros.protein_g * priceTable.proteing_g_price +
    macros.carbs_g * priceTable.carbs_g_price +
    macros.fat_g * priceTable.fat_g_price;
  return parseFloat(
    (macrosCost + priceTable.day_packaging_price + priceTable.delivery_price).toFixed(2)
  );
}

export function validateMacroCalories(
  protein_g: number,
  carbs_g: number,
  fat_g: number,
  declared_kcal: number
): { valid: boolean; computed_kcal: number; delta: number } {
  const computed_kcal = protein_g * 4 + carbs_g * 4 + fat_g * 9;
  const delta = Math.abs(computed_kcal - declared_kcal);
  return { valid: delta <= 50, computed_kcal: Math.round(computed_kcal), delta: Math.round(delta) };
}
