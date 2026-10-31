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

// Who's in the kitchen that day; hours are "HH:MM".
export interface TeamMember { id: string; name: string; from: string; to: string }

// The usual team; each day can change it in step 1.
export const DEFAULT_TEAM: TeamMember[] = [
  { id: "georges", name: "Georges", from: "09:00", to: "17:00" },
  { id: "guitta", name: "Guitta", from: "11:00", to: "17:00" },
];

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
  team: TeamMember[];
  // Prep task key -> TeamMember id.
  assign: Record<string, string>;
}

export function emptyPlan(cookDate: string): DayPlan {
  return { cook_date: cookDate, choices: {}, confirmed_at: null, done: {}, schedule: null, note: null, note_chat: [], note_final: false, team: [], assign: {} };
}

type Supabase = { from: (table: string) => unknown };

export async function loadDayPlan(supabase: Supabase, cookDate: string): Promise<DayPlan> {
  const { data, error } = await (supabase.from("kitchen_day_plan") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .select("cook_date, choices, confirmed_at, done, schedule, note, note_chat, note_final, team, assign")
    .eq("tenant_id", 1).eq("cook_date", cookDate).maybeSingle();
  if (error) throw new Error(`Couldn't load the day plan: ${error.message}`);
  const plan: DayPlan = data ? { ...emptyPlan(cookDate), ...data } : emptyPlan(cookDate);
  // A day nobody set a team for starts with the usual team.
  if (plan.team.length === 0) plan.team = DEFAULT_TEAM.map(m => ({ ...m }));
  return plan;
}
