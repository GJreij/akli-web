import { Suspense } from "react";
import { PageHeader, Section, inputStyle, labelStyle, C } from "@/components/admin/ui";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { getCookingOverview, mergeCookingOverviews, type CookingRecipe } from "@/lib/flask";
import CookingBoard from "@/components/admin/cooking/CookingBoard";
import ClientMultiSelect from "@/components/admin/cooking/ClientMultiSelect";

type UserRow = Pick<Database["public"]["Tables"]["user"]["Row"], "id" | "name" | "last_name">;

function BoardFallback() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, height: 64 }} />
      ))}
    </div>
  );
}

async function CookingResults({ start, end, subrecipe_id, client_ids, recipe_id, preFetched }: { start: string; end: string; subrecipe_id?: string; client_ids: string[]; recipe_id?: string; preFetched?: CookingRecipe[] }) {
  // When no filter is active, this would be an identical call to the
  // unfiltered fetch the page already made (for the filter dropdown
  // options) — reuse that instead of hitting the Flask backend twice for
  // the same data on every single page load.
  let recipes: CookingRecipe[];
  if (preFetched) {
    recipes = preFetched;
  } else if (client_ids.length > 1) {
    // Flask only filters /cooking/overview by a single client_id — fetch
    // once per selected client in parallel and sum the totals client-side.
    const perClient = await Promise.all(
      client_ids.map(id => getCookingOverview(start, end, {
        subrecipe_id: subrecipe_id || undefined,
        recipe_id: recipe_id || undefined,
        client_id: id,
      }))
    );
    recipes = mergeCookingOverviews(perClient);
  } else {
    recipes = await getCookingOverview(start, end, {
      subrecipe_id: subrecipe_id || undefined,
      client_id: client_ids[0],
      recipe_id: recipe_id || undefined,
    });
  }
  return <CookingBoard recipes={recipes} />;
}

export default async function CookingPage({ searchParams }: { searchParams: Promise<{ start?: string; end?: string; subrecipe_id?: string; client_id?: string | string[]; recipe_id?: string }> }) {
  const { start, end, subrecipe_id, client_id, recipe_id } = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const rangeStart = start ?? today;
  const rangeEnd = end ?? today;

  const selectedClientIds = client_id ? (Array.isArray(client_id) ? client_id : [client_id]) : [];

  const hasFilter = Boolean(subrecipe_id || selectedClientIds.length || recipe_id);

  const supabase = await createClient();
  const [unfilteredOverview, deliveriesRes] = await Promise.all([
    getCookingOverview(rangeStart, rangeEnd),
    supabase.from("deliveries").select("user_id").gte("delivery_date", rangeStart).lte("delivery_date", rangeEnd),
  ]);

  const availableSubrecipes = [...new Map(
    unfilteredOverview.flatMap(r => r.subrecipes.map(s => [s.subrecipe_id, s.name] as const))
  ).entries()].sort((a, b) => a[1].localeCompare(b[1]));

  const availableRecipes = [...new Map(
    unfilteredOverview.map(r => [r.recipe_id, r.name] as const)
  ).entries()].sort((a, b) => a[1].localeCompare(b[1]));

  const deliveryUsers = (deliveriesRes.data ?? []) as Pick<Database["public"]["Tables"]["deliveries"]["Row"], "user_id">[];
  const deliveryUserIds = [...new Set(deliveryUsers.map(d => d.user_id).filter((id): id is string => !!id))];
  const usersRes = deliveryUserIds.length
    ? await supabase.from("user").select("id,name,last_name").in("id", deliveryUserIds).order("name")
    : { data: [] as UserRow[] };
  const users = (usersRes.data ?? []) as UserRow[];
  const userOptions = users.map(u => ({ id: u.id, label: `${u.name ?? ""} ${u.last_name ?? ""}`.trim() || u.id }));

  return (
    <div style={{ padding: "24px 20px 60px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <PageHeader title="Cooking" />

        <Section>
          <form style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ ...labelStyle, flex: "0 1 150px" }}>Start date
              <input type="date" name="start" defaultValue={rangeStart} style={inputStyle} />
            </label>
            <label style={{ ...labelStyle, flex: "0 1 150px" }}>End date
              <input type="date" name="end" defaultValue={rangeEnd} style={inputStyle} />
            </label>
            <label style={{ ...labelStyle, flex: "1 1 180px" }}>Recipe
              <select name="recipe_id" defaultValue={recipe_id ?? ""} style={inputStyle}>
                <option value="">All recipes ({availableRecipes.length})</option>
                {availableRecipes.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </label>
            <label style={{ ...labelStyle, flex: "1 1 180px" }}>Subrecipe
              <select name="subrecipe_id" defaultValue={subrecipe_id ?? ""} style={inputStyle}>
                <option value="">All subrecipes ({availableSubrecipes.length})</option>
                {availableSubrecipes.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </label>
            <ClientMultiSelect options={userOptions} defaultSelected={selectedClientIds} />
            <button type="submit" style={{ background: C.primary, color: C.white, border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              Apply
            </button>
          </form>
        </Section>

        <Suspense fallback={<BoardFallback />} key={`${rangeStart}-${rangeEnd}-${subrecipe_id}-${selectedClientIds.join(",")}-${recipe_id}`}>
          <CookingResults
            start={rangeStart}
            end={rangeEnd}
            subrecipe_id={subrecipe_id}
            client_ids={selectedClientIds}
            recipe_id={recipe_id}
            preFetched={hasFilter ? undefined : unfilteredOverview}
          />
        </Suspense>
      </div>
    </div>
  );
}
