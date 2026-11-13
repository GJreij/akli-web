import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export interface LabelData {
  client_name: string;
  client_last_name: string;
  meal_type: string;
  recipe_name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  production_date: string; // D/M/YYYY, unpadded
  batch_code: string;
  comment?: string; // optional AI one-liner, filled in by the PDF route when requested
  // Identity of the meal behind the label — used to group a client's day
  // for the AI comments and to save/reuse them per meal.
  meal_plan_day_recipe_id: number;
  recipe_id: number | null;
  user_id: string;
  consumption_date: string; // ISO
  // Set only when this bag holds more than one day for the client (e.g.
  // "Tuesday"), so they know which box to eat when. Null for normal bags.
  eat_day: string | null;
}

export interface ClientOption {
  user_id: string;
  name: string;
  last_name: string;
}

const MEAL_ORDER: Record<string, number> = { breakfast: 0, lunch: 1, snack: 2, dinner: 3 };

function parseIso(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function isoAddDays(date: string, days: number): string {
  const d = parseIso(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isoToUnpaddedDMY(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return `${d}/${m}/${y}`;
}

function isoToYyyymmdd(isoDate: string): string {
  return isoDate.replace(/-/g, "");
}

function datesInRange(startDate: string, endDate: string): string[] {
  const start = parseIso(startDate);
  const end = parseIso(endDate);
  const dates: string[] = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

type MealPlanDayRow = { id: number; date: string | null; meal_plan_id: number | null; status: string | null };
type DeliveryRow = { meal_plan_day_id: number | null; delivery_date: string | null };

type LabelDay = { meal_plan_day_id: number; consumption_date: string; production_date: string; user_id: string };

// The range is in "eat dates" for a normal one-day bag: picking the 17th gives
// the bags cooked and delivered on the 16th. A label belongs to the night its
// bag is cooked and delivered (deliveries.delivery_date), not to the day it's
// eaten — a client can get two days in one bag, and both days' labels must
// print together and carry the real production date.
async function fetchMealPlanDaysInRange(
  supabase: SupabaseServerClient,
  startDate: string,
  endDate: string
): Promise<LabelDay[]> {
  const deliveryDates = datesInRange(isoAddDays(startDate, -1), isoAddDays(endDate, -1));

  const delRes = await (supabase.from("deliveries") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .select("meal_plan_day_id, delivery_date")
    .in("delivery_date", deliveryDates)
    .not("status", "in", "(cancelled,cancellation_pending)")
    .not("meal_plan_day_id", "is", null);
  const productionByMpd = new Map<number, string>();
  for (const d of (delRes.data ?? []) as DeliveryRow[]) {
    if (d.meal_plan_day_id == null || !d.delivery_date) continue;
    const prev = productionByMpd.get(d.meal_plan_day_id);
    if (!prev || d.delivery_date < prev) productionByMpd.set(d.meal_plan_day_id, d.delivery_date.slice(0, 10));
  }
  if (productionByMpd.size === 0) return [];

  const mpdRes = await (supabase.from("meal_plan_day") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .select("id, date, meal_plan_id, status")
    .in("id", [...productionByMpd.keys()]);
  const mpdRows = ((mpdRes.data ?? []) as MealPlanDayRow[]).filter(
    (row) => !["cancelled", "cancellation_pending"].includes(row.status ?? "")
  );
  if (mpdRows.length === 0) return [];

  const mealPlanIds = [...new Set(mpdRows.map((r) => r.meal_plan_id).filter((id): id is number => id != null))];
  const mpRes = await (supabase.from("meal_plan") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .select("id, user_id")
    .in("id", mealPlanIds);
  const userIdByMealPlanId = new Map(
    (mpRes.data ?? []).map((mp: { id: number; user_id: string | null }) => [mp.id, mp.user_id] as const)
  );

  return mpdRows
    .filter((row) => row.meal_plan_id != null && row.date != null)
    .map((row) => ({
      meal_plan_day_id: row.id,
      consumption_date: row.date as string,
      production_date: productionByMpd.get(row.id) as string,
      user_id: userIdByMealPlanId.get(row.meal_plan_id as number) ?? null,
    }))
    .filter((row): row is LabelDay => row.user_id != null);
}

export async function fetchClientsInRange(
  supabase: SupabaseServerClient,
  startDate: string,
  endDate: string
): Promise<ClientOption[]> {
  const mpdRows = await fetchMealPlanDaysInRange(supabase, startDate, endDate);
  const userIds = [...new Set(mpdRows.map((r) => r.user_id))];
  if (userIds.length === 0) return [];

  const usersRes = await (supabase.from("user") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .select("id, name, last_name")
    .in("id", userIds);
  const clients = (usersRes.data ?? []).map((u: { id: string; name: string | null; last_name: string | null }) => ({
    user_id: u.id,
    name: u.name ?? "",
    last_name: u.last_name ?? "",
  }));

  clients.sort((a: ClientOption, b: ClientOption) => `${a.name} ${a.last_name}`.localeCompare(`${b.name} ${b.last_name}`));
  return clients;
}

export async function fetchLabelsForRange(
  supabase: SupabaseServerClient,
  startDate: string,
  endDate: string,
  userIds?: string[]
): Promise<LabelData[]> {
  let mpdRows = await fetchMealPlanDaysInRange(supabase, startDate, endDate);
  if (userIds && userIds.length > 0) {
    const userIdSet = new Set(userIds);
    mpdRows = mpdRows.filter((row) => userIdSet.has(row.user_id));
  }
  if (mpdRows.length === 0) return [];

  const mealPlanDayIds = mpdRows.map((r) => r.meal_plan_day_id);
  const uniqueUserIds = [...new Set(mpdRows.map((r) => r.user_id))];

  type MpdrRow = { id: number; meal_plan_day_id: number | null; meal_type: string | null; recipe_id: number | null };

  const [usersRes, mpdrRes] = await Promise.all([
    (supabase.from("user") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      .select("id, name, last_name")
      .in("id", uniqueUserIds),
    (supabase.from("meal_plan_day_recipe") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      .select("id, meal_plan_day_id, meal_type, recipe_id")
      .in("meal_plan_day_id", mealPlanDayIds),
  ]);

  type UserRow = { id: string; name: string | null; last_name: string | null };
  const userById = new Map<string, UserRow>(
    (usersRes.data ?? []).map((u: UserRow) => [u.id, u] as const)
  );
  const mpdrRows = (mpdrRes.data ?? []) as MpdrRow[];

  const recipeIds = [...new Set(mpdrRows.map((r) => r.recipe_id).filter((id): id is number => id != null))];
  const recipesRes = recipeIds.length
    ? await (supabase.from("recipe") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
        .select("id, name")
        .in("id", recipeIds)
    : { data: [] };
  const recipeNameById = new Map<number, string>(
    ((recipesRes.data ?? []) as { id: number; name: string | null }[]).map((r) => [r.id, r.name ?? ""] as const)
  );

  const mpdrIds = mpdrRows.map((r) => r.id);
  const servingsRes = mpdrIds.length
    ? await (supabase.from("meal_plan_day_recipe_serving") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
        .select("meal_plan_day_recipe_id, kcal_calculated, protein_calculated, carbs_calculated, fat_calculated")
        .in("meal_plan_day_recipe_id", mpdrIds)
    : { data: [] };

  const servingsByMpdrId = new Map<number, { kcal: number; protein: number; carbs: number; fat: number }>();
  type ServingRow = {
    meal_plan_day_recipe_id: number | null;
    kcal_calculated: number | null;
    protein_calculated: number | null;
    carbs_calculated: number | null;
    fat_calculated: number | null;
  };
  for (const s of (servingsRes.data ?? []) as ServingRow[]) {
    const mpdrId = s.meal_plan_day_recipe_id as number;
    const acc = servingsByMpdrId.get(mpdrId) ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 };
    acc.kcal += s.kcal_calculated ?? 0;
    acc.protein += s.protein_calculated ?? 0;
    acc.carbs += s.carbs_calculated ?? 0;
    acc.fat += s.fat_calculated ?? 0;
    servingsByMpdrId.set(mpdrId, acc);
  }

  const mpdrByMealPlanDayId = new Map<number, MpdrRow[]>();
  for (const r of mpdrRows) {
    const key = r.meal_plan_day_id as number;
    const list = mpdrByMealPlanDayId.get(key) ?? [];
    list.push(r);
    mpdrByMealPlanDayId.set(key, list);
  }

  // Bags (client + delivery night) that carry more than one eating day.
  const daysPerBag = new Map<string, number>();
  for (const r of mpdRows) {
    const k = `${r.user_id}|${r.production_date}`;
    daysPerBag.set(k, (daysPerBag.get(k) ?? 0) + 1);
  }
  const multiDayBag = new Set([...daysPerBag].filter(([, n]) => n > 1).map(([k]) => k));

  const labels: LabelData[] = [];

  for (const mpdRow of mpdRows) {
    const user = userById.get(mpdRow.user_id);
    if (!user) continue;

    const productionDateIso = mpdRow.production_date;
    const eatDay = multiDayBag.has(`${mpdRow.user_id}|${productionDateIso}`)
      ? parseIso(mpdRow.consumption_date).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" })
      : null;
    const productionDate = isoToUnpaddedDMY(productionDateIso);
    const batchCode = `${isoToYyyymmdd(productionDateIso)}-${mpdRow.meal_plan_day_id}`;

    const recipes = mpdrByMealPlanDayId.get(mpdRow.meal_plan_day_id) ?? [];
    for (const r of recipes) {
      const macros = servingsByMpdrId.get(r.id) ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 };
      labels.push({
        consumption_date: mpdRow.consumption_date,
        meal_plan_day_recipe_id: r.id,
        recipe_id: r.recipe_id,
        user_id: mpdRow.user_id,
        client_name: user.name ?? "",
        client_last_name: user.last_name ?? "",
        meal_type: r.meal_type ?? "",
        recipe_name: recipeIds.length ? recipeNameById.get(r.recipe_id as number) ?? "" : "",
        kcal: Math.round(macros.kcal),
        protein: Math.round(macros.protein),
        carbs: Math.round(macros.carbs),
        fat: Math.round(macros.fat),
        production_date: productionDate,
        batch_code: batchCode,
        eat_day: eatDay,
      });
    }
  }

  // Grouped by production night, then client, then eating day, then meal —
  // so a client's two-day bag prints as one run of labels.
  labels.sort((a, b) => {
    if (a.batch_code.slice(0, 8) !== b.batch_code.slice(0, 8)) return a.batch_code < b.batch_code ? -1 : 1;
    const nameCompare = `${a.client_name} ${a.client_last_name}`.localeCompare(`${b.client_name} ${b.client_last_name}`);
    if (nameCompare !== 0) return nameCompare;
    if (a.consumption_date !== b.consumption_date) return a.consumption_date < b.consumption_date ? -1 : 1;
    const orderA = MEAL_ORDER[a.meal_type.toLowerCase()] ?? 99;
    const orderB = MEAL_ORDER[b.meal_type.toLowerCase()] ?? 99;
    return orderA - orderB;
  });

  return labels;
}
