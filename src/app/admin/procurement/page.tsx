import { Suspense } from "react";
import { PageHeader, Section, inputStyle, labelStyle, C } from "@/components/admin/ui";
import CopyListButton from "@/components/admin/CopyListButton";
import { getIngredientsToBuy } from "@/lib/flask";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type UserRow = Pick<Database["public"]["Tables"]["user"]["Row"], "id" | "name" | "last_name">;
type RecipeRow = Pick<Database["public"]["Tables"]["recipe"]["Row"], "id" | "name">;

function ListFallback() {
  return <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, height: 240 }} />;
}

async function IngredientList({ start, end, recipe, client }: { start: string; end: string; recipe?: string; client?: string }) {
  const ingredients = await getIngredientsToBuy(start, end, { recipe: recipe || undefined, client: client || undefined });
  const text = ingredients.map(i => `${i.name}: ${i.total_quantity} ${i.unit ?? ""}`.trim()).join("\n");

  return (
    <Section title={`Shopping list (${ingredients.length})`} right={ingredients.length > 0 ? <CopyListButton text={text} /> : undefined}>
      {ingredients.length === 0 ? (
        <p style={{ fontSize: 13, color: C.light, margin: 0 }}>No ingredients needed for this range/filter.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {ingredients.map(i => (
            <div key={i.ingredient_id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, padding: "6px 0", borderBottom: `1px solid ${C.offWhite}` }}>
              <span>{i.name}</span>
              <span style={{ color: C.muted, fontWeight: 600 }}>{i.total_quantity} {i.unit ?? ""}</span>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

export default async function ProcurementPage({ searchParams }: { searchParams: Promise<{ start?: string; end?: string; recipe?: string; client?: string }> }) {
  const { start, end, recipe, client } = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const rangeStart = start ?? today;
  const rangeEnd = end ?? today;

  const supabase = await createClient();
  const deliveriesRes = await supabase.from("deliveries").select("user_id, meal_plan_day_id").gte("delivery_date", rangeStart).lte("delivery_date", rangeEnd);
  type DeliveryRow = Pick<Database["public"]["Tables"]["deliveries"]["Row"], "user_id" | "meal_plan_day_id">;
  const deliveries = (deliveriesRes.data ?? []) as DeliveryRow[];

  const clientIds = [...new Set(deliveries.map(d => d.user_id).filter((id): id is string => !!id))];
  const mpdIds = [...new Set(deliveries.map(d => d.meal_plan_day_id).filter((id): id is number => !!id))];

  const [usersRes, mpdrRes] = await Promise.all([
    clientIds.length
      ? supabase.from("user").select("id,name,last_name").in("id", clientIds).order("name")
      : Promise.resolve({ data: [] as UserRow[] }),
    mpdIds.length
      ? supabase.from("meal_plan_day_recipe").select("recipe_id").in("meal_plan_day_id", mpdIds)
      : Promise.resolve({ data: [] as { recipe_id: number | null }[] }),
  ]);

  const users = (usersRes.data ?? []) as UserRow[];
  const recipeIds = [...new Set((mpdrRes.data ?? []).map(r => r.recipe_id).filter((id): id is number => !!id))];
  const recipesRes = recipeIds.length
    ? await supabase.from("recipe").select("id,name").in("id", recipeIds).order("name")
    : { data: [] as RecipeRow[] };
  const recipes = (recipesRes.data ?? []) as RecipeRow[];

  return (
    <div style={{ padding: "24px 20px 60px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <PageHeader title="Procurement" />

        <Section>
          <form style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ ...labelStyle, flex: "0 1 150px" }}>Start date
              <input type="date" name="start" defaultValue={rangeStart} style={inputStyle} />
            </label>
            <label style={{ ...labelStyle, flex: "0 1 150px" }}>End date
              <input type="date" name="end" defaultValue={rangeEnd} style={inputStyle} />
            </label>
            <label style={{ ...labelStyle, flex: "1 1 180px" }}>Recipe
              <select name="recipe" defaultValue={recipe ?? ""} style={inputStyle}>
                <option value="">All recipes ({recipes.length})</option>
                {recipes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
            <label style={{ ...labelStyle, flex: "1 1 180px" }}>Client
              <select name="client" defaultValue={client ?? ""} style={inputStyle}>
                <option value="">All clients ({users.length})</option>
                {users.map(u => <option key={u.id} value={u.id}>{`${u.name ?? ""} ${u.last_name ?? ""}`.trim() || u.id}</option>)}
              </select>
            </label>
            <button type="submit" style={{ background: C.primary, color: C.white, border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              Apply
            </button>
          </form>
        </Section>

        <Suspense fallback={<ListFallback />} key={`${rangeStart}-${rangeEnd}-${recipe}-${client}`}>
          <IngredientList start={rangeStart} end={rangeEnd} recipe={recipe} client={client} />
        </Suspense>
      </div>
    </div>
  );
}
