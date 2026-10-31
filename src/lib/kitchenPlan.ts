// The saved plan for one cook date (kitchen_day_plan): what the cook decided
// in "1 · Decide", shared with the helper's phone and the kitchen assistant.

export type PlanKey = "must" | "suggested" | "freeze" | "custom";

export interface SavedChoice {
  plan: PlanKey;
  // Frozen at confirm time, so Prep doesn't move when new orders come in.
  servings: number;
  fridge: number;
  freezer: number;
}

export interface ScheduleItem { time: string; who: string; station: string; task: string }
export interface NoteTurn { role: "user" | "assistant"; content: string }

export interface DayPlan {
  cook_date: string;
  choices: Record<string, SavedChoice>;
  confirmed_at: string | null;
  done: Record<string, { at: string; servings: number | null }>;
  schedule: ScheduleItem[] | null;
  note: string | null;
  note_chat: NoteTurn[];
  note_final: boolean;
}

export function emptyPlan(cookDate: string): DayPlan {
  return { cook_date: cookDate, choices: {}, confirmed_at: null, done: {}, schedule: null, note: null, note_chat: [], note_final: false };
}

type Supabase = { from: (table: string) => unknown };

export async function loadDayPlan(supabase: Supabase, cookDate: string): Promise<DayPlan> {
  const { data, error } = await (supabase.from("kitchen_day_plan") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .select("cook_date, choices, confirmed_at, done, schedule, note, note_chat, note_final")
    .eq("tenant_id", 1).eq("cook_date", cookDate).maybeSingle();
  if (error) throw new Error(`Couldn't load the day plan: ${error.message}`);
  return data ? { ...emptyPlan(cookDate), ...data } : emptyPlan(cookDate);
}
