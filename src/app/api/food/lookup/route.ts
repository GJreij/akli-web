import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/lib/supabase/types";
import { fetchFromOpenFoodFacts, fetchUsdaPortionWeights, type FoodCatalogItem } from "@/lib/foodCatalog";
import { searchFoodByName } from "@/lib/foodSearch";

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

  try {
    if (barcode) return await handleBarcodeLookup(barcode);
    if (q) return await handleNameSearch(q);
    if (usdaExternalId) return await handleUsdaDensity(usdaExternalId);
    return NextResponse.json({ error: "Provide a barcode, q, or usdaDensityFor parameter" }, { status: 400 });
  } catch (e) {
    // None of the OpenFoodFacts/USDA fetches below have their own try/catch —
    // a network failure or bad JSON from either third-party API used to
    // reach here as an unhandled rejection (bare 500, nothing logged, no way
    // to tell "USDA is down" from a real bug).
    console.error("food lookup failed:", { barcode, q, usdaExternalId, error: e });
    return NextResponse.json({ error: "Food lookup failed" }, { status: 500 });
  }
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

// Name search (local catalog + USDA, ranked) lives in @/lib/foodSearch —
// shared with /api/food/chat's search_food tool so both go through the
// exact same logic instead of drifting apart.
async function handleNameSearch(rawQ: string) {
  const items = await searchFoodByName(admin, rawQ);
  return NextResponse.json({ items });
}
