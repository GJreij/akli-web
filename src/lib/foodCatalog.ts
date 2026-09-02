import type { Database } from "@/lib/supabase/types";

export type FoodCatalogItem = Database["public"]["Tables"]["food_catalog_item"]["Row"];

// Per-100g/ml macros scaled to an actual logged quantity (grams/ml).
export function scaleMacros(item: FoodCatalogItem, quantity: number) {
  const factor = quantity / 100;
  const scale = (v: number | null) => (v == null ? null : Math.round(v * factor * 100) / 100);
  return {
    kcal: scale(item.kcal_per_100) ?? 0,
    protein_g: scale(item.protein_per_100) ?? 0,
    carbs_g: scale(item.carbs_per_100) ?? 0,
    fat_g: scale(item.fat_per_100) ?? 0,
    saturated_fat_g: scale(item.saturated_fat_per_100),
    fiber_g: scale(item.fiber_per_100),
    sugar_g: scale(item.sugar_per_100),
    sodium_mg: scale(item.sodium_mg_per_100),
  };
}

// ─── Search relevance ─────────────────────────────────────────────────────────
// USDA (and by convention, our own cached/user-submitted rows) name foods as
// "Head ingredient, descriptor, descriptor" — e.g. "Croissants, apple" vs.
// "Apples, raw, with skin". A query matching the head is the actual food
// someone means; a query only matching a later descriptor is a modifier hit
// (a dish that happens to contain/taste of that ingredient). Without this
// distinction, searching "apple" ranked "Croissants, apple" and "Strudel,
// apple" ahead of the plain fruit — technically all substring matches, but
// backwards from what a plain-ingredient query means.

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasWord(haystack: string, word: string) {
  return new RegExp(`\\b${escapeRegExp(word)}\\b`).test(haystack);
}

export function scoreFoodMatch(name: string, query: string): number {
  const n = name.toLowerCase().trim();
  const q = query.toLowerCase().trim();
  const segments = n.split(",");
  const head = segments[0].trim();
  const words = q.split(/\s+/).filter(Boolean);

  let tier: number;
  // Exact head match, allowing for simple pluralization either direction
  // ("apple" query vs. "Apples, raw" head) — the strongest possible signal.
  if (head === q || head === `${q}s` || head === `${q}es` || `${head}s` === q) tier = 100;
  else if (head.startsWith(q)) tier = 90;
  else if (hasWord(head, q) || words.every((w) => hasWord(head, w))) tier = 75;
  // Matches, but only in a descriptor — e.g. "apple" inside "Croissants, apple".
  else if (hasWord(n, q) || words.every((w) => hasWord(n, w))) tier = 45;
  else tier = 10; // raw substring only (e.g. mid-word) — still shown, ranked last

  // Tiebreak within a tier: fewer descriptors reads as the more "plain"/
  // default form of a food — "Apples, raw, without skin" over "Apples,
  // dried, sulfured, uncooked" for a bare "apple" query. Scaled small enough
  // to never cross tiers (tiers are 15+ apart).
  return tier - (segments.length - 1) * 0.1;
}

// ─── OpenFoodFacts ───────────────────────────────────────────────────────────

interface OffNutriments {
  "energy-kcal_100g"?: number;
  proteins_100g?: number;
  carbohydrates_100g?: number;
  fat_100g?: number;
  "saturated-fat_100g"?: number;
  fiber_100g?: number;
  sugars_100g?: number;
  sodium_100g?: number; // grams, per OFF convention
}

interface OffResponse {
  status: number;
  product?: {
    product_name?: string;
    brands?: string;
    nutriments?: OffNutriments;
    serving_quantity?: string;
    serving_size?: string;
  };
}

export async function fetchFromOpenFoodFacts(barcode: string) {
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`, {
    headers: { "User-Agent": "AkliWeb/1.0 (contact@akli-lb.org)" },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as OffResponse;
  if (json.status !== 1 || !json.product) return null;

  const n = json.product.nutriments ?? {};
  const name = json.product.product_name?.trim();
  if (!name) return null; // unusable without a name, treat as a miss

  return {
    name,
    brand: json.product.brands?.split(",")[0]?.trim() || null,
    kcal_per_100: n["energy-kcal_100g"] ?? null,
    protein_per_100: n.proteins_100g ?? null,
    carbs_per_100: n.carbohydrates_100g ?? null,
    fat_per_100: n.fat_100g ?? null,
    saturated_fat_per_100: n["saturated-fat_100g"] ?? null,
    fiber_per_100: n.fiber_100g ?? null,
    sugar_per_100: n.sugars_100g ?? null,
    sodium_mg_per_100: n.sodium_100g != null ? n.sodium_100g * 1000 : null,
    default_serving_qty: json.product.serving_quantity ? Number(json.product.serving_quantity) : null,
    default_serving_label: json.product.serving_size ?? null,
  };
}

// ─── USDA FoodData Central ───────────────────────────────────────────────────

interface UsdaNutrient {
  nutrientName: string;
  unitName: string;
  value: number;
}

interface UsdaFood {
  fdcId: number;
  description: string;
  brandOwner?: string;
  dataType?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  householdServingFullText?: string;
  foodNutrients: UsdaNutrient[];
}

interface UsdaSearchResponse {
  foods?: UsdaFood[];
}

function usdaValue(nutrients: UsdaNutrient[], name: string, unit?: string) {
  const hit = nutrients.find(
    (n) => n.nutrientName === name && (!unit || n.unitName?.toUpperCase() === unit.toUpperCase())
  );
  return hit ? hit.value : null;
}

// Two distinct tiers, queried separately rather than merged-and-sorted —
// Branded outnumbers Foundation/SR Legacy by orders of magnitude, so even a
// "generic first" sort still let branded results flood in once generic ran
// out. Callers ask for one tier at a time and only fall back to "branded" if
// "generic" truly comes up empty.
export type UsdaTier = "generic" | "branded";
const USDA_DATA_TYPES: Record<UsdaTier, string> = {
  generic: "Foundation,SR Legacy",
  branded: "Branded",
};

export async function searchUsdaFdc(query: string, tier: UsdaTier, pageSize = 8) {
  const apiKey = process.env.USDA_FDC_API_KEY;
  if (!apiKey) {
    // Silent before this — a missing key meant every search just quietly
    // fell back to whatever was already cached, indistinguishable from "no
    // matches" from the outside. Confirmed live: production was missing
    // this var entirely and nothing anywhere logged it.
    console.warn("searchUsdaFdc: USDA_FDC_API_KEY is not set — USDA results are unavailable");
    return [];
  }

  const params = new URLSearchParams({
    query,
    pageSize: String(pageSize),
    dataType: USDA_DATA_TYPES[tier],
    api_key: apiKey,
  });
  const res = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?${params.toString()}`);
  if (!res.ok) {
    console.error(`searchUsdaFdc: USDA search failed (${res.status})`, await res.text().catch(() => ""));
    return [];
  }
  const json = (await res.json()) as UsdaSearchResponse;

  return (json.foods ?? []).map((food) => {
    const n = food.foodNutrients ?? [];
    return {
      external_id: String(food.fdcId),
      name: food.description,
      brand: food.brandOwner ?? null,
      kcal_per_100: usdaValue(n, "Energy", "KCAL"),
      protein_per_100: usdaValue(n, "Protein"),
      carbs_per_100: usdaValue(n, "Carbohydrate, by difference"),
      fat_per_100: usdaValue(n, "Total lipid (fat)"),
      saturated_fat_per_100: usdaValue(n, "Fatty acids, total saturated"),
      fiber_per_100: usdaValue(n, "Fiber, total dietary"),
      sugar_per_100: usdaValue(n, "Sugars, total including NLEA") ?? usdaValue(n, "Total Sugars"),
      sodium_mg_per_100: usdaValue(n, "Sodium, Na"),
      // "1 slice", "1 cup", etc. when USDA reports one — lets someone log
      // "3 of these" instead of doing the gram math themselves.
      default_serving_qty: food.servingSize ?? null,
      default_serving_unit: food.servingSizeUnit ?? "g",
      default_serving_label: food.householdServingFullText ?? null,
    };
  });
}

// ─── Household-measure weights (for tsp/tbsp/cup/ml conversion) ─────────────
// Only USDA's *detail* endpoint carries this — the search results above
// don't — so it's fetched on demand, once, when someone actually opens a
// USDA item to log it (not during search, to keep that fast and avoid
// spending USDA's rate limit on items nobody ends up picking).
//
// USDA reports the unit name in two different places depending on how old
// the entry is: newer "Foundation" entries use measureUnit.name cleanly
// ("milliliter"); older "SR Legacy" entries leave measureUnit as
// "undetermined" and put the real unit ("tablespoon", "tsp") in `modifier`
// instead. Both are checked — verified against a real SR Legacy olive oil
// entry where measureUnit alone missed the tbsp/tsp/cup weights entirely
// even though they were right there in `modifier`.

interface UsdaFoodPortion {
  amount: number;
  gramWeight: number;
  modifier?: string;
  measureUnit?: { name?: string };
}

export interface UsdaPortionWeights {
  gPerTsp?: number;
  gPerTbsp?: number;
  gPerCup?: number;
  gPerMl?: number;
}

function normalizeUnitName(raw: string | undefined | null): keyof UsdaPortionWeights | null {
  const s = raw?.toLowerCase().trim();
  if (!s) return null;
  if (s === "tsp" || s.startsWith("teaspoon")) return "gPerTsp";
  if (s === "tbsp" || s.startsWith("tablespoon")) return "gPerTbsp";
  if (s === "cup" || s === "cups") return "gPerCup";
  if (s === "ml" || s.startsWith("millilit")) return "gPerMl";
  return null;
}

export async function fetchUsdaPortionWeights(externalId: string): Promise<UsdaPortionWeights | null> {
  const apiKey = process.env.USDA_FDC_API_KEY;
  if (!apiKey) {
    console.warn("fetchUsdaPortionWeights: USDA_FDC_API_KEY is not set — portion weights are unavailable");
    return null;
  }
  const res = await fetch(`https://api.nal.usda.gov/fdc/v1/food/${externalId}?api_key=${apiKey}`);
  if (!res.ok) {
    console.error(`fetchUsdaPortionWeights: USDA detail fetch failed (${res.status})`, await res.text().catch(() => ""));
    return null;
  }
  const json = (await res.json()) as { foodPortions?: UsdaFoodPortion[] };

  const weights: UsdaPortionWeights = {};
  for (const p of json.foodPortions ?? []) {
    if (!p.amount || p.amount <= 0 || !p.gramWeight) continue;
    const key = normalizeUnitName(p.measureUnit?.name) ?? normalizeUnitName(p.modifier);
    if (!key || weights[key] != null) continue;
    weights[key] = p.gramWeight / p.amount;
  }

  // Fill in whatever wasn't directly reported using the ml weight as a
  // density, if USDA gave one — still food-specific, not a generic guess.
  if (weights.gPerMl != null) {
    weights.gPerTsp ??= weights.gPerMl * 4.929;
    weights.gPerTbsp ??= weights.gPerMl * 14.787;
    weights.gPerCup ??= weights.gPerMl * 236.588;
  }

  return Object.keys(weights).length > 0 ? weights : null;
}

// ─── Unit options for logging a catalog item ─────────────────────────────────

export interface FoodUnitOption {
  key: string;
  label: string;
  gramsPerUnit: number;
}

// Grams is always available (it's what's actually stored). The food's own
// serving ("1 slice", "1 bottle") is added when the source reports one.
// tsp/tbsp/cup/ml only appear for whichever ones USDA actually reported for
// this specific food — no generic 1g≈1ml assumption, which would be wrong
// for oil, flour, etc.
export function buildUnitOptions(item: FoodCatalogItem, portions: UsdaPortionWeights | null): FoodUnitOption[] {
  const options: FoodUnitOption[] = [{ key: "g", label: "g", gramsPerUnit: 1 }];

  if (item.default_serving_qty && item.default_serving_qty > 0) {
    options.push({
      key: "serving",
      label: item.default_serving_label?.trim() || `serving (${item.default_serving_qty}${item.default_serving_unit ?? "g"})`,
      gramsPerUnit: item.default_serving_qty,
    });
  }

  if (portions?.gPerMl) options.push({ key: "ml", label: "ml", gramsPerUnit: portions.gPerMl });
  if (portions?.gPerTsp) options.push({ key: "tsp", label: "tsp", gramsPerUnit: portions.gPerTsp });
  if (portions?.gPerTbsp) options.push({ key: "tbsp", label: "tbsp", gramsPerUnit: portions.gPerTbsp });
  if (portions?.gPerCup) options.push({ key: "cup", label: "cup", gramsPerUnit: portions.gPerCup });

  return options;
}
