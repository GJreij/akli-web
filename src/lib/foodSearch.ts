import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { scoreFoodMatch, searchUsdaFdc, type FoodCatalogItem } from "@/lib/foodCatalog";

// Server-only catalog name search — shared by /api/food/lookup (the existing
// Search tab) and /api/food/chat's search_food tool, so both go through the
// exact same local-cache/USDA logic and ranking instead of drifting apart.
// Logic moved here unchanged from the original /api/food/lookup route.

const SEARCH_RESULT_CAP = 8;
// How many candidates to pull from local cache / USDA before ranking and
// trimming to SEARCH_RESULT_CAP. USDA's own relevance order isn't reliable
// for plain-ingredient queries — pulling only 8 and trusting that order meant
// a good match ranked #15 by USDA never even reached the reranker.
const CANDIDATE_POOL_SIZE = 25;
// A local match is only "good enough to skip USDA" if it's at least a
// head-term match — a pile of modifier-only local matches shouldn't block a
// fresh USDA search that might find the real ingredient.
const STRONG_MATCH_THRESHOLD = 75;

async function queryLocalCatalog(
  admin: SupabaseClient<Database>,
  q: string,
  opts: { genericOnly?: boolean; limit?: number } = {}
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (admin.from("food_catalog_item") as any)
    .select("*")
    .eq("status", "verified")
    .limit(opts.limit ?? SEARCH_RESULT_CAP);
  // Each word required as a separate substring, not the whole phrase as one.
  for (const word of q.trim().split(/\s+/).filter(Boolean)) {
    query = query.ilike("name", `%${word}%`);
  }
  if (opts.genericOnly) query = query.is("brand", null);
  const { data, error } = await query;
  if (error) console.error("food_catalog_item search error:", error);
  return (data ?? []) as FoodCatalogItem[];
}

// Single batched upsert rather than one round trip per item.
async function cacheUsdaResults(admin: SupabaseClient<Database>, items: Awaited<ReturnType<typeof searchUsdaFdc>>) {
  const usable = items.filter((item) => item.kcal_per_100 != null); // unusable without calories
  if (usable.length === 0) return [];
  const rows = usable.map((item) => ({ source: "usda", status: "verified", ...item }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin.from("food_catalog_item") as any)
    .upsert(rows, { onConflict: "source,external_id" })
    .select("*");
  if (error) {
    console.error("food_catalog_item USDA upsert error:", error);
    return [];
  }
  return (data ?? []) as FoodCatalogItem[];
}

function rankAndSlice(items: FoodCatalogItem[], q: string) {
  return [...items]
    .sort((a, b) => scoreFoodMatch(b.name, q) - scoreFoodMatch(a.name, q))
    .slice(0, SEARCH_RESULT_CAP);
}

// Treats "-", ",", "/" and "_" the same as a space between words.
function normalizeQuery(q: string) {
  return q.replace(/[-,_/]+/g, " ").replace(/\s+/g, " ").trim();
}

// Generic (raw/unbranded) results only, unless and until none exist at all —
// searching "chicken breast" shouldn't surface a wall of near-duplicate
// brand variants when the plain ingredient is what most people mean.
export async function searchFoodByName(admin: SupabaseClient<Database>, rawQ: string): Promise<FoodCatalogItem[]> {
  const q = normalizeQuery(rawQ);
  if (!q) return [];

  const genericLocal = await queryLocalCatalog(admin, q, { genericOnly: true, limit: CANDIDATE_POOL_SIZE });
  const strongLocal = genericLocal.filter((i) => scoreFoodMatch(i.name, q) >= STRONG_MATCH_THRESHOLD);
  if (strongLocal.length >= SEARCH_RESULT_CAP) return rankAndSlice(genericLocal, q);

  const genericUsda = await cacheUsdaResults(admin, await searchUsdaFdc(q, "generic", CANDIDATE_POOL_SIZE));
  const seenGeneric = new Set(genericLocal.map((i) => i.id));
  const combinedGeneric = [...genericLocal, ...genericUsda.filter((i) => !seenGeneric.has(i.id))];
  if (combinedGeneric.length > 0) return rankAndSlice(combinedGeneric, q);

  // Nothing generic exists anywhere for this query — only now fall back to
  // branded/packaged results.
  const brandedLocal = await queryLocalCatalog(admin, q, { limit: CANDIDATE_POOL_SIZE });
  const combined = [...brandedLocal];
  if (combined.length < CANDIDATE_POOL_SIZE) {
    const brandedUsda = await cacheUsdaResults(admin, await searchUsdaFdc(q, "branded", CANDIDATE_POOL_SIZE));
    const seen = new Set(combined.map((i) => i.id));
    combined.push(...brandedUsda.filter((i) => !seen.has(i.id)));
  }
  return rankAndSlice(combined, q);
}
