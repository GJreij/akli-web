import { Suspense } from "react";
import { PageHeader, Section, inputStyle, labelStyle, C } from "@/components/admin/ui";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { getCookingOverview } from "@/lib/flask";
import CookingBoard from "@/components/admin/cooking/CookingBoard";

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

function addDays(date: string, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function CookingResults({ start, end, subrecipe_id, client_id }: { start: string; end: string; subrecipe_id?: string; client_id?: string }) {
  const recipes = await getCookingOverview(start, end, {
    subrecipe_id: subrecipe_id || undefined,
    client_id: client_id || undefined,
  });
  return <CookingBoard recipes={recipes} />;
}

export default async function CookingPage({ searchParams }: { searchParams: Promise<{ start?: string; end?: string; subrecipe_id?: string; client_id?: string }> }) {
  const { start, end, subrecipe_id, client_id } = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const rangeStart = start ?? today;
  const rangeEnd = end ?? today;

  // /cooking/overview treats the input range as the *cooking* date and shifts
  // +1 day internally to match the *eating* date — mirror that here so the
  // client dropdown lines up with what the overview actually returns.
  const eatingStart = addDays(rangeStart, 1);
  const eatingEnd = addDays(rangeEnd, 1);

  const supabase = await createClient();
  const [unfilteredOverview, deliveriesRes] = await Promise.all([
    getCookingOverview(rangeStart, rangeEnd),
    supabase.from("deliveries").select("user_id").gte("delivery_date", eatingStart).lte("delivery_date", eatingEnd),
  ]);

  const availableSubrecipes = [...new Map(
    unfilteredOverview.flatMap(r => r.subrecipes.map(s => [s.subrecipe_id, s.name] as const))
  ).entries()].sort((a, b) => a[1].localeCompare(b[1]));

  const deliveryUsers = (deliveriesRes.data ?? []) as Pick<Database["public"]["Tables"]["deliveries"]["Row"], "user_id">[];
  const clientIds = [...new Set(deliveryUsers.map(d => d.user_id).filter((id): id is string => !!id))];
  const usersRes = clientIds.length
    ? await supabase.from("user").select("id,name,last_name").in("id", clientIds).order("name")
    : { data: [] as UserRow[] };
  const users = (usersRes.data ?? []) as UserRow[];

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
            <label style={{ ...labelStyle, flex: "1 1 180px" }}>Subrecipe
              <select name="subrecipe_id" defaultValue={subrecipe_id ?? ""} style={inputStyle}>
                <option value="">All subrecipes ({availableSubrecipes.length})</option>
                {availableSubrecipes.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </label>
            <label style={{ ...labelStyle, flex: "1 1 180px" }}>Client
              <select name="client_id" defaultValue={client_id ?? ""} style={inputStyle}>
                <option value="">All clients ({users.length})</option>
                {users.map(u => <option key={u.id} value={u.id}>{`${u.name ?? ""} ${u.last_name ?? ""}`.trim() || u.id}</option>)}
              </select>
            </label>
            <button type="submit" style={{ background: C.primary, color: C.white, border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              Apply
            </button>
          </form>
        </Section>

        <Suspense fallback={<BoardFallback />} key={`${rangeStart}-${rangeEnd}-${subrecipe_id}-${client_id}`}>
          <CookingResults start={rangeStart} end={rangeEnd} subrecipe_id={subrecipe_id} client_id={client_id} />
        </Suspense>
      </div>
    </div>
  );
}
