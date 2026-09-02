import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/lib/supabase/types";
import { fetchFromOpenFoodFacts, searchUsdaFdc, fetchUsdaPortionWeights, type FoodCatalogItem } from "@/lib/foodCatalog";

export const runtime = "nodejs";

// Server-only — service role key never reaches the browser. This route's job
// is cross-user cache/dedup of third-party food data, which is a system-level
// concern, not a per-user RLS concern — the UI's own direct catalog reads
// still go through the anon-key client and its RLS policies.
const admin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const barcode = searchParams.get("barcode")?.trim();
  const q = searchParams.get("q")?.trim();
  const usdaExternalId = searchParams.get("usdaDensityFor")?.trim();

  if (barcode) return handleBarcodeLookup(barcode);
  if (q) return handleNameSearch(q);
  if (usdaExternalId) return handleUsdaDensity(usdaExternalId);
  return NextResponse.json({ error: "Provide a barcode, q, or usdaDensityFor parameter" }, { status: 400 });
}

// Separate from the catalog lookup above — this never touches the database,
// it just proxies USDA's per-food household-measure weights (used to offer
// tsp/tbsp/cup as logging units), fetched lazily only when someone opens a
// USDA item to log it, keeping the USDA_FDC_API_KEY server-side.
async function handleUsdaDensity(externalId: string) {
  const portions = await fetchUsdaPortionWeights(externalId);
  return NextResponse.json({ portions });
}

async function handleBarcodeLookup(barcode: string) {
  const { data: existing, error: existingError } = await (admin.from("food_catalog_item") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .select("*")
    .eq("barcode", barcode)
    .maybeSingle();

  if (existingError) {
    console.error("food_catalog_item lookup error:", existingError);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
  if (existing) return NextResponse.json({ found: true, item: existing as FoodCatalogItem });

  const off = await fetchFromOpenFoodFacts(barcode);
  if (!off) return NextResponse.json({ found: false });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: cached, error: upsertError } = await (admin.from("food_catalog_item") as any)
    .upsert(
      { barcode, external_id: barcode, source: "off", status: "verified", ...off },
      { onConflict: "barcode" }
    )
    .select("*")
    .single();

  if (upsertError) {
    console.error("food_catalog_item OFF upsert error:", upsertError);
    // Still return the fetched data even if caching failed — logging
    // shouldn't break because the cache write did.
    return NextResponse.json({ found: true, item: { barcode, source: "off", status: "verified", ...off } });
  }

  return NextResponse.json({ found: true, item: cached as FoodCatalogItem });
}

const SEARCH_RESULT_CAP = 8;

async function queryLocalCatalog(q: string, opts: { genericOnly?: boolean } = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (admin.from("food_catalog_item") as any)
    .select("*")
    .eq("status", "verified")
    .limit(SEARCH_RESULT_CAP);
  // Each word required as a separate substring, not the whole phrase as one
  // — USDA names are often ingredient-first ("Oil, olive, extra virgin"),
  // so a literal "%olive oil%" match misses it entirely even though both
  // words are right there.
  for (const word of q.trim().split(/\s+/).filter(Boolean)) {
    query = query.ilike("name", `%${word}%`);
  }
  if (opts.genericOnly) query = query.is("brand", null);
  const { data, error } = await query;
  if (error) console.error("food_catalog_item search error:", error);
  return (data ?? []) as FoodCatalogItem[];
}

async function cacheUsdaResults(items: Awaited<ReturnType<typeof searchUsdaFdc>>) {
  const cached: FoodCatalogItem[] = [];
  for (const item of items) {
    if (item.kcal_per_100 == null) continue; // unusable without calories
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin.from("food_catalog_item") as any)
      .upsert({ source: "usda", status: "verified", ...item }, { onConflict: "source,external_id" })
      .select("*")
      .single();
    if (error) {
      console.error("food_catalog_item USDA upsert error:", error);
      continue;
    }
    cached.push(data as FoodCatalogItem);
  }
  return cached;
}

// Generic (raw/unbranded) results only, unless and until none exist at all —
// searching "chicken breast" shouldn't surface a wall of near-duplicate
// brand variants when the plain ingredient is what most people mean.
async function handleNameSearch(q: string) {
  const genericLocal = await queryLocalCatalog(q, { genericOnly: true });
  // Only trust local cache alone once it's a genuinely full page — a single
  // weak/incidental local match (e.g. "Mayonnaise ... with olive oil"
  // matching a search for "olive oil") used to short-circuit here and
  // block a fresh USDA search that would have found the real match.
  if (genericLocal.length >= SEARCH_RESULT_CAP) return NextResponse.json({ items: genericLocal });

  const genericUsda = await cacheUsdaResults(await searchUsdaFdc(q, "generic", SEARCH_RESULT_CAP));
  const seenGeneric = new Set(genericLocal.map((i) => i.id));
  const combinedGeneric = [...genericLocal, ...genericUsda.filter((i) => !seenGeneric.has(i.id))];
  if (combinedGeneric.length > 0) return NextResponse.json({ items: combinedGeneric.slice(0, SEARCH_RESULT_CAP) });

  // Nothing generic exists anywhere for this query — only now fall back to
  // branded/packaged results.
  const brandedLocal = await queryLocalCatalog(q);
  const combined = [...brandedLocal];
  if (combined.length < SEARCH_RESULT_CAP) {
    const brandedUsda = await cacheUsdaResults(await searchUsdaFdc(q, "branded", SEARCH_RESULT_CAP));
    const seen = new Set(combined.map((i) => i.id));
    combined.push(...brandedUsda.filter((i) => !seen.has(i.id)));
  }
  return NextResponse.json({ items: combined.slice(0, SEARCH_RESULT_CAP) });
}
