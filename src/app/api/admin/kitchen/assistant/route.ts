import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/requireAdmin";
import { getKitchenDay, getKitchenWeek, type KitchenDay, type KitchenWeek } from "@/lib/flask";
import { beirutISODate } from "@/lib/dates";
import { anthropic, KITCHEN_FALLBACK, KITCHEN_MODEL } from "@/lib/kitchenAi";
import { loadDayPlan, type DayPlan } from "@/lib/kitchenPlan";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_LOOP_ITERATIONS = 8;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// The assistant never changes cook amounts, stock or settings itself: the
// propose_* tools hand a proposal back to the Kitchen Day screen, where the
// cook taps Apply. Only its own memory is written directly.
const SYSTEM_PROMPT = `You are the kitchen assistant for Akli, a Lebanese meal-prep business. You help the head cook plan and run each cooking day on the "Kitchen Day" screen.

The kitchen:
- Equipment: 5 stove burners and 1 home oven (not commercial). The oven is the bottleneck: one oven job at a time; at most 5 stove jobs at once.
- People: the team for the day is given below with names and hours (arrival–departure). Only schedule someone between their arrival and departure. Tasks the cook already gave to a person stay with that person. Assign every step to one team member by name ("who" = their name). If no team is given, ask who is working and their hours.
- Dishes are made of subrecipes. Each subrecipe has a type (cook = heat, assemble = no heat, ready = bought, just portion), how many days it keeps in the fridge, and whether it freezes.
- Cooked batches are tracked: "stock" is what's already cooked, with how much is left and its use-by date. "must_cook" is what today's deliveries still need after stock. Cook-ahead options cover later days while the batch keeps (until the day before the next cook day when cook days are set).
- Client comments are handled per subrecipe: "assembly" (leave out/add when portioning), "separate_pot" (cook that client's servings apart), or "ignore".

How to work:
1. Every number you mention must come from a tool result. Never estimate servings, stock or ingredient amounts yourself. Call get_kitchen_day (and get_kitchen_week for planning across days) before advising.
2. The cook decides amounts in step 1 of the screen and confirms them; the confirmed plan is given below and is what gets cooked. Organising the day: if something you need isn't already in memory or the conversation, ask at most 3 short questions in one message first (e.g. is the helper in today, what time do you start, anything off in the fridge). Then call propose_day_plan once. When the plan is confirmed, its choices must repeat the confirmed amounts (don't change them unless the cook asks) and the schedule covers exactly the confirmed dishes, their separate pots, the side salads and the assembling/ready-made items, skipping what's already done. When nothing is confirmed yet, give a choice for every cook subrecipe that still needs cooking (today_only, through, freeze, or custom with servings). Either way include a timed schedule that respects the oven and burner limits, starts long or oven jobs first, and gives assemble jobs to the helper. Prefer cooking ahead when it keeps, to avoid cooking the same thing every day; prefer freezing portions over leaving a small tail to recook later.
3. Stock: when the cook describes what's really in the fridge or freezer ("only 1 left", "the rice from Tuesday went off", "used up the chicken"), match it to batch ids from get_kitchen_day and call propose_stock_changes. Ask if it's ambiguous which batch is meant.
4. Cook days and margins: discuss them using get_kitchen_week; when the cook agrees, call propose_settings.
5. Memory: call remember for durable facts and decisions the cook tells you (cook days, equipment quirks, how each team member works, preferences, recurring rules). Don't store one-off facts about a single day. Check the memory list below before asking something you may already know. Use forget when something you remembered is no longer true.
6. Replies are shown in a small chat panel: keep them short and practical, plain text, short "-" lists at most, no markdown headings or bold. Reply in the language the cook writes in (English, French or Lebanese Arabic).
7. After a propose_* call, say in one line what you proposed; the cook reviews and applies it on screen.`;

function compactDay(day: KitchenDay) {
  return {
    cook_date: day.cook_date,
    is_cook_day: day.is_cook_day,
    next_planned_cook_day: day.next_planned_cook_day,
    next_delivery_day: day.next_cook_date,
    settings: day.settings,
    subrecipes: day.subrecipes.map(s => ({
      subrecipe_id: s.subrecipe_id,
      name: s.name,
      type: s.prep_type,
      who: s.skill,
      equipment: s.equipment,
      fridge_days: s.fridge_days,
      freezer_days: s.freezer_days,
      minutes: s.total_minutes ? { hands_on: s.active_minutes, total: s.total_minutes } : null,
      day_before_job: s.prep_ahead,
      dishes: s.recipes,
      today_servings: s.today.servings,
      already_covered_today: s.today.covered,
      must_cook: s.must_cook.servings,
      options: {
        today_only: s.must_cook.servings,
        through: s.suggested.servings > s.must_cook.servings ? { until: s.suggested.through, servings: s.suggested.servings, includes_late_order_margin: s.suggested.buffer } : null,
        freeze: s.freeze ? { extra_frozen: s.freeze.servings, until: s.freeze.through, total_with_through: s.suggested.servings + s.freeze.servings } : null,
      },
      later_days: s.suggested.by_date,
      stock: s.stock.map(b => ({
        batch_id: b.batch_id, storage: b.storage, cooked_on: b.cooked_on, servings_left: b.remaining,
        use_by: b.use_by, expired: b.expired, covers_open_servings: b.allocated_servings,
      })),
      comments: s.comments.map(c => ({
        client: c.name, comment: c.comment, dish: c.recipe_name, handling: c.handling, instruction: c.instruction,
        servings_today: c.servings_must, servings_through: c.servings_suggested,
      })),
    })),
  };
}

function compactTeam(plan: DayPlan) {
  if (plan.team.length === 0) return "Team today: not set yet.";
  const name = new Map(plan.team.map(m => [m.id, m.name]));
  const given = Object.entries(plan.assign).filter(([, id]) => name.has(id));
  return [
    `Team today: ${plan.team.map(m => `${m.name} (${m.from || "?"}–${m.to || "?"})`).join(", ")}`,
    given.length ? `Tasks the cook gave to someone (task key: person; dish:<subrecipe_id>, pot:<subrecipe_id>:<client>, salad:<subrecipe_id>, group:assemble|ready):\n${given.map(([k, id]) => `- ${k}: ${name.get(id)}`).join("\n")}` : "",
  ].filter(Boolean).join("\n");
}

function compactPlan(plan: DayPlan) {
  if (!plan.confirmed_at) return `Confirmed plan: none yet (the cook is still deciding in step 1).\n${compactTeam(plan)}`;
  return [
    compactTeam(plan),
    `Confirmed plan (confirmed ${plan.confirmed_at}), per subrecipe_id: plan (must = today only, suggested = through the fridge window, freeze = + freezer portions, custom), total servings, of which fridge / freezer:`,
    ...Object.entries(plan.choices).map(([id, c]) => `- ${id}: ${c.plan}, ${c.servings} servings (fridge ${c.fridge}, freezer ${c.freezer})`),
    "A subrecipe is already cooked today when get_kitchen_day shows a stock batch with cooked_on = the cook date.",
    Object.keys(plan.done).length ? `Separate pots already done: ${Object.keys(plan.done).join(", ")}` : "",
    plan.schedule?.length ? `Order of work currently saved:\n${plan.schedule.map(s => `${s.time} ${s.who} ${s.station}: ${s.task}`).join("\n")}` : "",
  ].filter(Boolean).join("\n");
}

function compactWeek(week: KitchenWeek) {
  return {
    start: week.start, end: week.end, orders_still_open_from: week.open_from, settings: week.settings,
    subrecipes: week.subrecipes.filter(r => r.prep_type !== "ready").map(r => ({
      subrecipe_id: r.subrecipe_id, name: r.name, type: r.prep_type, who: r.skill, equipment: r.equipment,
      fridge_days: r.fridge_days, freezer_days: r.freezer_days, servings_by_day: r.by_date,
    })),
  };
}

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "get_kitchen_day",
    description: "Everything for one cook date: per subrecipe what's still to cook, the cook-ahead options, cooked stock (batch ids, servings left, use-by), and client comments. Call before giving any numbers about a day.",
    input_schema: { type: "object", properties: { date: { type: "string", description: "YYYY-MM-DD" } }, required: ["date"] },
  },
  {
    name: "get_kitchen_week",
    description: "Ordered servings per subrecipe for each of 7 days from start (no stock), plus shelf life — for planning cook days and batches across the week.",
    input_schema: { type: "object", properties: { start: { type: "string", description: "YYYY-MM-DD" } }, required: ["start"] },
  },
  {
    name: "remember",
    description: "Save a durable fact or decision about this kitchen for future conversations (one short sentence).",
    input_schema: { type: "object", properties: { content: { type: "string" } }, required: ["content"] },
  },
  {
    name: "forget",
    description: "Remove a remembered item that's no longer true, by its id from the memory list.",
    input_schema: { type: "object", properties: { memory_id: { type: "integer" } }, required: ["memory_id"] },
  },
  {
    name: "propose_day_plan",
    description: "Show the cook a plan for the cook date: how much to make of each subrecipe (sets the choice on its card when applied) and a timed schedule.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "One or two sentences." },
        choices: {
          type: "array",
          items: {
            type: "object",
            properties: {
              subrecipe_id: { type: "integer" },
              option: { type: "string", enum: ["today_only", "through", "freeze", "custom"] },
              servings: { type: "number", description: "Only for custom." },
              reason: { type: "string" },
            },
            required: ["subrecipe_id", "option"],
          },
        },
        schedule: {
          type: "array",
          items: {
            type: "object",
            properties: {
              time: { type: "string", description: "e.g. 08:00" },
              who: { type: "string", description: "Name of the team member doing it." },
              station: { type: "string", enum: ["oven", "stove", "prep", "none"] },
              task: { type: "string" },
            },
            required: ["time", "who", "station", "task"],
          },
        },
      },
      required: ["summary", "choices", "schedule"],
    },
  },
  {
    name: "propose_stock_changes",
    description: "Show the cook corrections to cooked stock: set how many servings are really left, mark a batch used up, or thrown away.",
    input_schema: {
      type: "object",
      properties: {
        changes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              batch_id: { type: "integer" },
              action: { type: "string", enum: ["set_left", "used_up", "thrown_away"] },
              servings_left: { type: "number", description: "Only for set_left." },
              reason: { type: "string" },
            },
            required: ["batch_id", "action"],
          },
        },
      },
      required: ["changes"],
    },
  },
  {
    name: "propose_settings",
    description: "Show the cook new kitchen settings: cook days (0=Sun … 6=Sat; empty = every delivery day) and/or the late-order margin in percent.",
    input_schema: {
      type: "object",
      properties: {
        cook_days: { type: "array", items: { type: "integer", minimum: 0, maximum: 6 } },
        late_order_buffer_pct: { type: "integer", minimum: 0, maximum: 50 },
        reason: { type: "string" },
      },
    },
  },
];

type Proposal = { type: "day_plan" | "stock_changes" | "settings"; input: Record<string, unknown> };
type Turn = { role: "user" | "assistant"; content: string };
type Supabase = Awaited<ReturnType<typeof requireAdmin>>["supabase"];

async function loadMemory(supabase: Supabase) {
  const { data } = await (supabase.from("kitchen_ai_memory") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .select("id, content, created_at").eq("active", true).order("created_at");
  return (data ?? []) as { id: number; content: string; created_at: string }[];
}

async function runTool(name: string, input: Record<string, unknown>, supabase: Supabase, proposals: Proposal[]): Promise<unknown> {
  switch (name) {
    case "get_kitchen_day":
      return compactDay(await getKitchenDay(String(input.date)));
    case "get_kitchen_week":
      return compactWeek(await getKitchenWeek(String(input.start)));
    case "remember": {
      const content = String(input.content ?? "").trim().slice(0, 500);
      if (!content) return { error: "empty" };
      const { data, error } = await (supabase.from("kitchen_ai_memory") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
        .insert({ content }).select("id").single();
      return error ? { error: error.message } : { saved: true, memory_id: data.id };
    }
    case "forget": {
      const { error } = await (supabase.from("kitchen_ai_memory") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
        .update({ active: false }).eq("id", Number(input.memory_id));
      return error ? { error: error.message } : { forgotten: true };
    }
    case "propose_day_plan":
      proposals.push({ type: "day_plan", input });
      return { shown_to_cook: true };
    case "propose_stock_changes":
      proposals.push({ type: "stock_changes", input });
      return { shown_to_cook: true };
    case "propose_settings":
      proposals.push({ type: "settings", input });
      return { shown_to_cook: true };
    default:
      return { error: `unknown tool ${name}` };
  }
}

async function runAssistant(history: Turn[], cookDate: string, supabase: Supabase) {
  const [memory, plan] = await Promise.all([loadMemory(supabase), loadDayPlan(supabase, cookDate)]);
  const context = [
    `Today (Beirut): ${beirutISODate(0)} (${DAYS[new Date(`${beirutISODate(0)}T00:00:00`).getDay()]}). The cook has the Kitchen Day screen open on ${cookDate} (${DAYS[new Date(`${cookDate}T00:00:00`).getDay()]}).`,
    `Orders for ${beirutISODate(2)} and later can still come in (48h lead time).`,
    compactPlan(plan),
    memory.length
      ? `Memory (id: fact):\n${memory.map(m => `${m.id}: ${m.content}`).join("\n")}`
      : "Memory: nothing saved yet.",
  ].join("\n");

  const messages: Anthropic.Beta.BetaMessageParam[] = history.map(t => ({ role: t.role, content: t.content }));
  const proposals: Proposal[] = [];

  for (let i = 0; i < MAX_LOOP_ITERATIONS; i++) {
    const response = await anthropic.beta.messages.create({
      model: KITCHEN_MODEL,
      max_tokens: 16000,
      ...KITCHEN_FALLBACK,
      output_config: { effort: "medium" },
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
        { type: "text", text: context },
      ],
      tools: TOOLS,
      messages,
    });

    if (response.stop_reason === "refusal") {
      return { text: "I can't help with that one.", proposals };
    }
    if (response.stop_reason === "max_tokens") {
      return { text: "That got too long — try asking for one thing at a time.", proposals };
    }

    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (toolUses.length === 0) {
      const text = response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map(b => b.text).join("\n").trim();
      return { text: text || (proposals.length ? "Here's my proposal." : "…"), proposals };
    }

    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = await Promise.all(toolUses.map(async b => {
      try {
        const out = await runTool(b.name, (b.input ?? {}) as Record<string, unknown>, supabase, proposals);
        return { type: "tool_result" as const, tool_use_id: b.id, content: JSON.stringify(out) };
      } catch (e) {
        return { type: "tool_result" as const, tool_use_id: b.id, is_error: true, content: e instanceof Error ? e.message : "failed" };
      }
    }));
    messages.push({ role: "user", content: results });
  }
  return { text: "That took too many steps — try a simpler question.", proposals };
}

export async function POST(req: NextRequest) {
  let supabase: Supabase;
  try {
    ({ supabase } = await requireAdmin());
  } catch {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "The assistant isn't configured (no ANTHROPIC_API_KEY)." }, { status: 500 });
  }

  let body: { date?: string; history?: Turn[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const history = (Array.isArray(body.history) ? body.history : [])
    .filter(t => (t.role === "user" || t.role === "assistant") && typeof t.content === "string" && t.content.trim())
    .slice(-30);
  if (!body.date || history.length === 0 || history[history.length - 1].role !== "user") {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  try {
    return NextResponse.json(await runAssistant(history, body.date, supabase));
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "Busy right now — try again in a moment." }, { status: 429 });
    }
    if (e instanceof Anthropic.APIError) {
      console.error("kitchen assistant API error:", e.status, e.message);
      return NextResponse.json({ error: "Couldn't reach the assistant — try again." }, { status: 502 });
    }
    console.error("kitchen assistant failed:", e);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
