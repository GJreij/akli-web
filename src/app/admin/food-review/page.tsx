import { createClient } from "@/lib/supabase/server";
import { PageHeader, Section, C } from "@/components/admin/ui";
import FoodReviewRow, { type PendingFoodItem } from "./FoodReviewRow";

type RawItem = {
  id: number;
  name: string;
  brand: string | null;
  barcode: string | null;
  kcal_per_100: number | null;
  protein_per_100: number | null;
  carbs_per_100: number | null;
  fat_per_100: number | null;
  created_at: string;
  submitted_by: string | null;
};

export default async function FoodReviewPage() {
  const supabase = await createClient();

  const itemsRes = await supabase
    .from("food_catalog_item")
    .select("id, name, brand, barcode, kcal_per_100, protein_per_100, carbs_per_100, fat_per_100, created_at, submitted_by")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const items = (itemsRes.data ?? []) as RawItem[];

  if (items.length === 0) {
    return (
      <div style={{ padding: "24px 20px 60px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <PageHeader title="Food review" />
          <Section>
            <p style={{ margin: 0, fontSize: 13, color: C.light }}>No pending food submissions.</p>
          </Section>
        </div>
      </div>
    );
  }

  const userIds = [...new Set(items.map(i => i.submitted_by).filter((id): id is string => !!id))];
  const usersRes = userIds.length
    ? await supabase.from("user").select("id, name, last_name").in("id", userIds)
    : { data: [] as { id: string; name: string | null; last_name: string | null }[] };
  const userMap = new Map((usersRes.data ?? []).map(u => [u.id, u]));

  const pending: PendingFoodItem[] = items.map(i => {
    const user = i.submitted_by ? userMap.get(i.submitted_by) : null;
    return {
      id: i.id, name: i.name, brand: i.brand, barcode: i.barcode,
      kcal_per_100: i.kcal_per_100, protein_per_100: i.protein_per_100, carbs_per_100: i.carbs_per_100, fat_per_100: i.fat_per_100,
      created_at: i.created_at,
      submittedByName: user ? `${user.name ?? ""} ${user.last_name ?? ""}`.trim() || "Unknown client" : "Unknown client",
    };
  });

  return (
    <div style={{ padding: "24px 20px 60px" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <PageHeader title="Food review" />
        <Section title={`Pending review (${pending.length})`}>
          {pending.map(item => <FoodReviewRow key={item.id} item={item} />)}
        </Section>
      </div>
    </div>
  );
}
