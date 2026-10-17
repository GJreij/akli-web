import Anthropic from "@anthropic-ai/sdk";
import type { createClient } from "@/lib/supabase/server";
import type { LabelData } from "@/lib/labels";

// Optional one-liner printed at the bottom of each meal label. Purely a fun
// extra — if anything here fails, labels still print, just without comments.
//
// Per batch of client days:
//   1. writer   — drafts one line per meal (one motivational per client day, rest mostly sarcastic)
//   2. checks   — code catches mechanical rule breaks (findProblems) and sends
//                 just those lines back for one rewrite
//   3. editor   — a second call scores every line 1-10; anything under
//                 KEEP_SCORE isn't printed (a blank label beats a weak joke)
// Then, across the whole print, near-duplicate lines are dropped (batches run
// in parallel and can't see each other).
//
// Every line is saved to label_comment with its score and whether it was
// printed: a reprint reuses the saved decision (same joke, or still blank, no
// extra cost), and each client's recent lines are fed back in so new ones
// don't repeat them.

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Overridable so other models can be tried without a code change.
const MODEL = process.env.LABEL_COMMENTS_MODEL || "claude-sonnet-5-5";
// Server-side refusal fallback is only offered on Sonnet/Opus.
const USE_FALLBACK = /^claude-(sonnet|opus)/.test(MODEL);
// A client's whole day always goes in the same request (so lines can
// reference each other); days are packed into requests of up to this many
// labels, which run in parallel.
const BATCH_SIZE = 12;
// Hard cap enforced after generation too — sized for a 52x52mm label.
export const MAX_COMMENT_CHARS = 90;
// Motivational lines can be an attributed quote, which needs a bit more room.
export const MAX_MOTIVATIONAL_CHARS = 115;
// Editor score (1-10) a line needs to be printed (kept separate for
// motivational lines in case their bar should differ).
const KEEP_SCORE = 6;
const MOTIVATIONAL_KEEP_SCORE = 6;
const HISTORY_PER_CLIENT = 25;
const RECENT_GLOBAL = 60;
// PostgREST silently caps unpaginated responses (~1000 rows), so .in()
// lookups go in chunks.
const ID_CHUNK = 200;

const STYLES = ["sarcastic", "funny", "motivational", "fun_fact"] as const;
// Every client day gets exactly one motivational line; of the rest, these
// shares are "funny" and "fun_fact", and everything else is sarcastic.
const FUNNY_SHARE = 0.07;
const FUN_FACT_SHARE = 0.1;
const MOTIVATIONAL_PREFIX = "Motivational: ";
// Share of motivational slots filled with an approved quote up front (the
// rest get an original line, which falls back to a quote if the editor cuts it).
const QUOTE_SHARE = 0.5;
type Style = (typeof STYLES)[number];

// Stock phrases the model leans on when it runs out of ideas. Listed in the
// prompt and enforced by findProblems.
const BANNED_PHRASES = [
  "main event", "heavy lifting", "zero drama", "no notes", "make it count",
  "showed up", "show up", "teta would", "teta approved", "teta-approved", "bold choice",
  "respect", "nobody asked", "know your role", "opening act", "warm-up act",
  "carry the afternoon", "you've got this", "you got this", "earned it",
  "unbothered", "living its best life", "living their best life", "the star",
  "finish line", "finish strong", "take the win", "owes you money", "crush", "champ",
  "the rest of your day", "the rest of your night",
  "email", "inbox", "that task", "that text", "keep dodging", "putting off", "coffee",
  "staring contest", "never once", "coup", "main character", "mirror", "power move", "held a vote", "on purpose",
  "adorable", "sit down", "iconic", "sweetheart", "the room was waiting", "revolutionary", "groundbreaking",
  "publicist", "red carpet", "spotlight", "headliner", "a personality", "just chicken", "just rice",
  "surprise party", "never been told no", "glad they ran into you", "co-stars", "crunches loudly",
];

// The only quotes motivational lines may use. Famous quotes are very often
// misattributed, so these are limited to ones whose wording and source are
// well documented (books, poems, speeches, on-record interviews). Add to this
// list rather than letting the model quote from memory.
const APPROVED_QUOTES: { quote: string; by: string }[] = [
  { quote: "You miss 100% of the shots you don't take.", by: "Wayne Gretzky" },
  { quote: "Work is love made visible.", by: "Kahlil Gibran" },
  { quote: "It ain't over till it's over.", by: "Yogi Berra" },
  { quote: "Tell me, what is it you plan to do with your one wild and precious life?", by: "Mary Oliver" },
  { quote: "The best way out is always through.", by: "Robert Frost" },
  { quote: "I dwell in possibility.", by: "Emily Dickinson" },
  { quote: "Hope is the thing with feathers.", by: "Emily Dickinson" },
  { quote: "Life is either a daring adventure or nothing at all.", by: "Helen Keller" },
  { quote: "The only way to do great work is to love what you do.", by: "Steve Jobs" },
  { quote: "Stay hungry. Stay foolish.", by: "Steve Jobs" },
  { quote: "If you want the rainbow, you gotta put up with the rain.", by: "Dolly Parton" },
  { quote: "Not all those who wander are lost.", by: "J.R.R. Tolkien" },
  { quote: "I am not afraid of storms, for I am learning how to sail my ship.", by: "Louisa May Alcott" },
  { quote: "Float like a butterfly, sting like a bee.", by: "Muhammad Ali" },
];
const normQuote = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const APPROVED_QUOTE_KEYS = new Set(APPROVED_QUOTES.map((q) => normQuote(q.quote)));

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MEAL_WORDS = ["breakfast", "lunch", "dinner", "snack"];

const WRITER_PROMPT = `You write the one-liner printed at the bottom of meal-prep labels for Akli, a Lebanese personalised-nutrition meal-prep service. A client grabs the box from their fridge, reads your line, and either laughs out loud, screenshots it for their group chat, or walks a little taller. That's the bar. An editor reviews every line after you and cuts anything weak — so write every line as if it has to survive a tough cut.

You get the labels grouped by client day: every meal one client eats that day, in order, with its macros, plus the weekday.

THE MIX — this service is known for its sarcasm. Each meal comes with an assigned style (each client day has exactly one motivational line):
- "sarcastic" (the vast majority): VERY sarcastic. Deadpan, dry, savage, eye-roll energy. Roast the food's ego, its delusions of grandeur, its rivalries with the other meals, its attitude, its dramatic backstory. Go further than feels polite. The roast is aimed at the food or the situation, never at the person eating it. Example energy: "This sandwich has the confidence of a man who has never been told no."
- "motivational" (one per client day, unless that day's slot is already filled with a quote): NOT about the food — a genuine lift for the person. Must start with "Motivational: ". Real hype with a wink, like a coach who is also a comedian — specific and surprising, never a poster slogan. Angles: self-belief, courage, enjoying the moment, being kind to yourself, good energy for others, small wins. Never assume they have a job, inbox, to-do list, gym, or plans. Never quote anyone. Example energy: "Motivational: somewhere today, someone's going to be glad they ran into you."
- "funny" (rare): absurd, playful, unexpected — personify the food, invent a tiny ridiculous scenario. Example energy: "The potatoes threw the chicken a surprise party. The chicken pretended not to cry."
- "fun_fact" (occasional): starts with "Fun fact:". Either light food-culture trivia about this dish or its ingredients that you are CERTAIN is true (where it comes from, a tradition around it), or an obviously absurd fake fact nobody could mistake for real, told with a straight face. Never scientific, nutritional, medical, or statistical, and no records or superlatives presented as real ("oldest", "most popular"). If you're not sure a fact is true, make it an obvious joke instead. Example energy: "Fun fact: hummus is legally allowed to end any argument at a Lebanese table."

THE WHOLE DAY — you see every meal the client eats today, in order. Play with it: the running order, rivalries, which meal is the biggest, a snack that's bigger than lunch, dinner outweighing breakfast, the carb-heaviest meal of the day. E.g. "Pancakes this morning, pasta tonight. This chicken is the only adult in the lineup." / "Bigger than lunch and not even slightly sorry about it." Mix these with lines that just roast their own dish. Numbers can be part of the joke now and then — don't lean on them in every line.

THE RULES:
1. Length: aim for 40-70 characters, hard max ${MAX_COMMENT_CHARS} including spaces (motivational lines: max ${MAX_MOTIVATIONAL_CHARS}) — longer gets chopped mid-sentence on the printed label. One punchline. Cut setup words; the shortest version of a joke is the funniest.
2. Don't lead with the label every time. The meal type and dish name are printed right above your line, so opening with them ("Halloumi melt at breakfast.") usually wastes the space. It's fine now and then when it sets up the joke — just not as a habit: at most one line per client day may open with its own dish or meal type. Naming a DIFFERENT meal of the day for a comparison is always fine.
3. Each line must make complete sense read on its own — a client might only read this one label. When you reference another meal, NAME it (its dish or meal type) and get it exactly right. Never refer vaguely to "that lunch" or "the sequel".
4. Never invent context you weren't given: no other weekdays, no "weekend" unless the given weekday is Saturday or Sunday, no clock times, no weather, seasons, events, or assumptions about the client's job, plans, gym, or life.
5. Portions and numbers: sizes are fair game. Be sarcastic about a meal's size compared with the others that day (the snack that's bigger than lunch, the tiny breakfast before a giant dinner), and a big or carb-heavy meal can be framed as loading up on energy ("All these carbs? Someone's charging up for something big."). Keep it about the food or about energy and momentum — never about the client's body, weight, appetite, or willpower, never guilt, and never tell them to eat less or more. Numbers must be exact from the list.
6. Roast the food's personality, never its worth. Teasing a meal for being small, simple, or extra is fine; calling it unwanted, boring, a letdown, or bad food is not — the client chose and paid for it.
7. Variety: no two lines in the same day share an opening, structure, or punchline. Never write "again", "back to", "another one", "once more", or "back for more". Never use these worn-out phrases: ${BANNED_PHRASES.map((p) => `"${p}"`).join(", ")}.
8. Do not repeat or lightly reword anything in that client's "already_used" list or the batch-wide "recently_used" list.
9. Facts only in "fun_fact" lines, following the rules above — never slip a fact into another style.
10. Kind to the human, always: no body-shaming, no weight, size, losing/gaining, "good/bad" eating, guilt, cheat meals, or willpower. No health or medical claims; never mention allergens or ingredients being safe.
11. Nothing about politics, religion, sex, alcohol, drugs, violence, or the news. No profanity, not even mild.
12. Never use a name or invent personal details.
13. English, written like a person talks (use contractions). At most ONE Lebanese word per client day ("yalla", "sahtein", "habibi", "ya3ne") — it lands harder when rare.
14. Plain text for a label printer: no emoji, no Arabic script, no hashtags, no quotation marks around the line, plain ASCII punctuation only.

Example lines show energy only — reusing their wording or punchlines is a failure.`;

const EDITOR_PROMPT = `You are the head writer at Akli, a Lebanese meal-prep service, doing the final cut on the one-liners printed at the bottom of each client's meal labels. The brand voice is very sarcastic — roasting the FOOD like an insufferable celebrity, never the person — plus one motivational line per client day and the occasional fun fact. A label with no line is fine; a confusing or hurtful line makes the brand look worse. You decide which lines get printed.

You get each client's day: every meal in order (meal type, dish, macros) with the line written for it and its style. The meal type and dish are already printed on the label above the line.

Score every line 1-10:
- 9-10: genuinely funny or clever — the client would laugh out loud or screenshot it.
- 7-8: lands well — clear, on-voice, gets a real smile.
- 6: decent — clear and on-voice, a mild smile. Printable.
- 4-5: flat, generic, forced, or a bit hard to follow.
- 1-3: must not print.

Score 1-3 if the line: could hurt, embarrass, or worry the client; comments on their body, weight, appetite, or willpower; guilts them or tells them to eat less or more; calls the meal bad, boring, or unwanted; makes no sense read on its own; gets another meal of the day wrong (check the dish, meal type, and numbers against the list carefully before deciding); invents context (a weekday, a time, plans, a job); states a "fact" that sounds real but you're not sure is true, or anything scientific, nutritional, or medical; or touches politics, religion, sex, alcohol, drugs, violence, or profanity.
These are welcome — don't mark them down for it: referencing another meal of the day (when accurate); sarcasm about a meal's size compared with the others that day; framing a big or carb-heavy meal as loading up on energy; teasing a meal for being small or simple; an occasional line that opens with its own dish name when it sets up the joke; obviously absurd fake fun facts.
Motivational lines are meant to be about the person, not the food — judge whether they genuinely lift the reader. Quotes in the form "quote" - Name come from a pre-verified list, so don't question their accuracy; judge only whether they suit the moment. Original motivational lines need some wit; poster slogans score 5 or below.
Be honest and consistent: judge each line on its own merit.

Give a short reason (max 12 words) for every score.`;

const WRITER_SCHEMA = {
  type: "object",
  properties: {
    comments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          style: { type: "string", enum: [...STYLES] },
          comment: { type: "string" },
        },
        required: ["index", "style", "comment"],
        additionalProperties: false,
      },
    },
  },
  required: ["comments"],
  additionalProperties: false,
};

const EDITOR_SCHEMA = {
  type: "object",
  properties: {
    reviews: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          score: { type: "integer" },
          reason: { type: "string" },
        },
        required: ["index", "score", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["reviews"],
  additionalProperties: false,
};

const anthropic = new Anthropic();

function clean(comment: string, max = MAX_COMMENT_CHARS): string {
  const text = comment
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, " - ")
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // soufflé -> souffle, not "souffl"
    .replace(/[^\x20-\x7E]/g, "") // printable ASCII only — the label font has no emoji/Arabic glyphs
    .replace(/^["']+|["']+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 3);
  return cut.slice(0, cut.lastIndexOf(" ") > 40 ? cut.lastIndexOf(" ") : cut.length) + "...";
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function weekdayOf(isoDate: string): string {
  const name = WEEKDAYS[new Date(`${isoDate}T00:00:00Z`).getUTCDay()];
  return name[0].toUpperCase() + name.slice(1);
}

// Motivational: "quote" - Name
const isQuote = (line: string) => /^motivational\s*:\s*".+"\s*-\s*[A-Z]/i.test(line);

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9' ]/g, " ").split(/\s+/).filter(Boolean);

// Mechanical rule checks — returns a short reason per problem, or [] if the
// line is fine. Only things code can judge reliably; tone is left to the editor.
// Does the line open with its own dish name or meal type (or mention its
// own meal type without comparing to another meal)? Fine occasionally,
// limited to once per client day.
function namesItself(line: string, label: LabelData): boolean {
  const lineWords = words(line.replace(/^motivational\s*:\s*/i, ""));
  const opening = lineWords.slice(0, 4);
  const ownMeal = label.meal_type.toLowerCase();
  // The dish name = its first two significant words (or its only one);
  // mentioning a single ingredient ("the potatoes...") doesn't count.
  const dishName = words(label.recipe_name).filter((w) => w.length >= 4).slice(0, 2);
  return opening.includes(ownMeal)
    || (dishName.length > 0 && dishName.every((w) => opening.includes(w)))
    || (lineWords.includes(ownMeal) && !MEAL_WORDS.some((m) => m !== ownMeal && lineWords.includes(m)));
}

type DayLine = { line: string; label: LabelData };

function findProblems(line: string, label: LabelData, sameDay: DayLine[]): string[] {
  const problems: string[] = [];
  const lower = line.toLowerCase();
  const lineWords = words(line.replace(/^motivational\s*:\s*/i, ""));
  const opening = lineWords.slice(0, 4);

  if (!line) problems.push("empty");
  if (line.endsWith("...")) problems.push("too long — it got cut off");
  // A quoted line is someone else's words: it must be on the approved list,
  // and only the factual checks apply.
  if (isQuote(line)) {
    const quoted = line.match(/"(.+)"/)?.[1] ?? "";
    if (!APPROVED_QUOTE_KEYS.has(normQuote(quoted))) problems.push("quote is not on the approved list (or was reworded) - use one exactly as listed, or write an original line");
    return problems;
  }

  // Only the second+ line of a day that leads with its own dish/meal type.
  if (namesItself(line, label)) {
    const mine = sameDay.findIndex((d) => d.label === label);
    if (sameDay.some((d, i) => i < mine && d.line && namesItself(d.line, d.label))) {
      problems.push("another line today already opens with its own dish or meal type - lead with the joke instead");
    }
  }

  const banned = BANNED_PHRASES.find((p) => new RegExp(`\\b${p.replace(/[-']/g, ".")}\\b`).test(lower));
  if (banned) problems.push(`uses the banned phrase "${banned}"`);
  if (/\b(again|another one|once more|back to|back for more)\b/.test(lower)) problems.push("implies repetition");

  const weekday = weekdayOf(label.consumption_date).toLowerCase();
  const otherDay = WEEKDAYS.find((d) => d !== weekday && lineWords.includes(d));
  if (otherDay) problems.push(`mentions ${otherDay} but it's ${weekday}`);
  if (/\bweekends?\b/.test(lower) && !["saturday", "sunday"].includes(weekday)) problems.push(`mentions the weekend but it's ${weekday}`);
  if (/\b\d{1,2}\s?(am|pm)\b/.test(lower)) problems.push("invents a clock time");

  const opener = opening.slice(0, 2).join(" ");
  if (opener && sameDay.some((d) => d.line && d.line !== line && words(d.line.replace(/^motivational\s*:\s*/i, "")).slice(0, 2).join(" ") === opener)) {
    problems.push("same opening as another line that day");
  }
  return problems;
}

type SavedRow = {
  meal_plan_day_recipe_id: number | null;
  recipe_id: number | null;
  user_id: string | null;
  comment: string;
  printed: boolean | null;
  created_at: string;
};

// Latest saved decision per meal — its line, or blank if the editor cut it —
// kept only if the meal still has the same recipe (a swapped meal gets a
// fresh line).
async function fetchSavedForMeals(supabase: SupabaseServerClient, labels: LabelData[]): Promise<Map<number, string>> {
  const recipeByMpdr = new Map(labels.map((l) => [l.meal_plan_day_recipe_id, l.recipe_id] as const));
  const saved = new Map<number, string>();
  for (const ids of chunk([...recipeByMpdr.keys()], ID_CHUNK)) {
    const res = await (supabase.from("label_comment") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      .select("meal_plan_day_recipe_id, recipe_id, comment, printed, created_at")
      .in("meal_plan_day_recipe_id", ids)
      .order("created_at", { ascending: false });
    if (res.error) throw res.error;
    for (const row of (res.data ?? []) as SavedRow[]) {
      const mpdrId = row.meal_plan_day_recipe_id as number;
      if (saved.has(mpdrId) || row.recipe_id !== recipeByMpdr.get(mpdrId)) continue;
      saved.set(mpdrId, row.printed === false ? "" : row.comment);
    }
  }
  return saved;
}

async function fetchHistory(supabase: SupabaseServerClient, userIds: string[]) {
  const perClient = new Map<string, string[]>();
  for (const ids of chunk(userIds, 50)) {
    const res = await (supabase.from("label_comment") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      .select("user_id, comment, created_at")
      .in("user_id", ids)
      .order("created_at", { ascending: false })
      .limit(ids.length * HISTORY_PER_CLIENT);
    if (res.error) throw res.error;
    for (const row of (res.data ?? []) as SavedRow[]) {
      const list = perClient.get(row.user_id as string) ?? [];
      if (list.length < HISTORY_PER_CLIENT) list.push(row.comment);
      perClient.set(row.user_id as string, list);
    }
  }
  const recentRes = await (supabase.from("label_comment") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .select("comment")
    .order("created_at", { ascending: false })
    .limit(RECENT_GLOBAL);
  const recent = ((recentRes.data ?? []) as { comment: string }[]).map((r) => r.comment);
  return { perClient, recent };
}

interface Day {
  userId: string;
  date: string;
  labelIndexes: number[]; // indexes into the full labels array
}

interface Line {
  comment: string;
  style: Style;
  score: number | null;
  printed: boolean;
  note: string | null;
}

async function callModel<T>(system: string, schema: object, content: string, effort: "medium" | "high" = "medium"): Promise<T> {
  const response = await anthropic.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    ...(USE_FALLBACK ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    output_config: { effort, format: { type: "json_schema", schema: schema as Record<string, unknown> } },
    system,
    messages: [{ role: "user", content }],
  });
  if (process.env.LABEL_COMMENTS_DEBUG) console.log("label comments usage:", JSON.stringify(response.usage));

  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
    throw new Error(`label comments stopped early: ${response.stop_reason}`);
  }

  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return JSON.parse(text) as T;
}

type Draft = { index: number; style: Style; comment: string };

type QuotePicker = (clientHistory: string[]) => string | null;

// Hands out approved quotes for one print: never one the client has already
// had, and unique across the print while the list lasts. Picking happens
// synchronously, so parallel batches can share it safely.
function makeQuotePicker(): QuotePicker {
  const usedInPrint = new Set<string>();
  return (clientHistory) => {
    const seen = new Set(clientHistory.map((l) => normQuote(l.match(/"(.+)"/)?.[1] ?? "")));
    const fresh = APPROVED_QUOTES.filter((q) => !seen.has(normQuote(q.quote)));
    const unused = fresh.filter((q) => !usedInPrint.has(q.quote));
    const choices = unused.length ? unused : fresh;
    if (choices.length === 0) return null;
    const q = choices[Math.floor(Math.random() * choices.length)];
    usedInPrint.add(q.quote);
    return clean(`${MOTIVATIONAL_PREFIX}"${q.quote}" - ${q.by}`, MAX_MOTIVATIONAL_CHARS);
  };
}

async function generateBatch(
  labels: LabelData[],
  days: Day[],
  history: { perClient: Map<string, string[]>; recent: string[] },
  pickQuote: QuotePicker,
): Promise<Map<number, Line>> {
  // Indexes sent to the model are local to this request.
  const localToGlobal: number[] = [];
  const payload = days.map((day, d) => ({
    day: d + 1,
    weekday: weekdayOf(day.date),
    already_used: history.perClient.get(day.userId) ?? [],
    meals: day.labelIndexes.map((gi) => {
      const l = labels[gi];
      localToGlobal.push(gi);
      return {
        index: localToGlobal.length - 1,
        meal_type: l.meal_type,
        recipe: l.recipe_name,
        kcal: l.kcal,
        protein_g: l.protein,
        carbs_g: l.carbs,
        fat_g: l.fat,
      };
    }),
  }));
  // Code assigns styles (left to itself the model drifts): exactly one
  // motivational line per client day, a few funny ones, the rest sarcastic.
  // Some motivational slots get an approved quote straight away (fixed —
  // the models never write or review those).
  const assigned = new Map<number, Style>(); // local index -> style
  const fixed = new Map<number, string>(); // local index -> quote line
  const motivationalByDay: number[] = []; // local index of each day's motivational meal
  payload.forEach((day, d) => {
    const motivational = day.meals[Math.floor(Math.random() * day.meals.length)];
    motivationalByDay[d] = motivational.index;
    for (const meal of day.meals) {
      const roll = Math.random();
      const style: Style = meal === motivational ? "motivational"
        : roll < FUNNY_SHARE ? "funny"
        : roll < FUNNY_SHARE + FUN_FACT_SHARE ? "fun_fact"
        : "sarcastic";
      assigned.set(meal.index, style);
      Object.assign(meal, { style });
    }
    if (Math.random() < QUOTE_SHARE) {
      const quote = pickQuote(history.perClient.get(days[d].userId) ?? []);
      if (quote) {
        fixed.set(motivational.index, quote);
        Object.assign(motivational, { fixed_line: quote });
      }
    }
  });
  const context = `recently_used (whole service, don't repeat): ${JSON.stringify(history.recent)}\n\nDays:\n${JSON.stringify(payload)}`;

  const result = new Map<number, Line>();
  for (const [local, quote] of fixed) {
    result.set(localToGlobal[local], { comment: quote, style: "motivational", score: null, printed: true, note: "approved quote" });
  }
  const store = (rows: Draft[]) => {
    for (const c of rows) {
      if (fixed.has(c.index)) continue;
      const gi = localToGlobal[c.index];
      const style: Style = assigned.get(c.index) ?? "sarcastic";
      const max = style === "motivational" ? MAX_MOTIVATIONAL_CHARS : MAX_COMMENT_CHARS;
      let comment = clean(c.comment ?? "", max);
      if (style !== "motivational") comment = comment.replace(/^motivational\s*:\s*/i, "");
      // The prefix is part of the format — guarantee it in code.
      if (style === "motivational" && comment && !/^motivational\s*:/i.test(comment)) comment = clean(MOTIVATIONAL_PREFIX + comment, max);
      if (gi !== undefined && comment) result.set(gi, { comment, style, score: null, printed: true, note: null });
    }
  };

  // 1. Writer
  const draft = await callModel<{ comments: Draft[] }>(
    WRITER_PROMPT, WRITER_SCHEMA,
    `Write one line per meal. Each meal has a "style" — write that meal's line in exactly that style. Meals with a "fixed_line" already have their line: don't write or return those, but you may use them as context. Return every other index exactly once.\n\n${context}`,
  );
  store(draft.comments ?? []);

  // 2. One rewrite pass for lines that broke a rule code can check.
  const dayLines = (gi: number): DayLine[] => {
    const day = days.find((d) => d.labelIndexes.includes(gi))!;
    return day.labelIndexes.map((i) => ({ line: result.get(i)?.comment ?? "", label: labels[i] }));
  };
  const toFix = localToGlobal
    .map((gi, local) => {
      if (fixed.has(local)) return { local, gi, line: "", problems: [] as string[] };
      const line = result.get(gi)?.comment ?? "";
      return { local, gi, line, problems: findProblems(line, labels[gi], dayLines(gi)) };
    })
    .filter((f) => f.problems.length > 0);

  if (toFix.length > 0) {
    try {
      const fixes = toFix.map((f) => ({ index: f.local, current_line: f.line, problems: f.problems }));
      const before = new Map(toFix.map((f) => [f.gi, result.get(f.gi)]));
      const rewrite = await callModel<{ comments: Draft[] }>(
        WRITER_PROMPT, WRITER_SCHEMA,
        `Some lines broke the rules. Rewrite ONLY these indexes with a completely new, funnier line in the same style, and return only these indexes.\n\n${JSON.stringify(fixes)}\n\nFor context, every line already written for these days: ${JSON.stringify(Object.fromEntries(localToGlobal.map((gi, local) => [local, result.get(gi)?.comment ?? ""])))}\n\n${context}`,
      );
      store(rewrite.comments ?? []);
      // Keep a rewrite only if it's at least as clean as the original.
      for (const f of toFix) {
        const after = result.get(f.gi);
        const old = before.get(f.gi);
        if (old && after && findProblems(after.comment, labels[f.gi], dayLines(f.gi)).length > f.problems.length) result.set(f.gi, old);
      }
    } catch (e) {
      console.error("label comments rewrite pass failed, keeping first drafts:", e);
    }
  }

  // 3. Editor — decides what's worth printing. If the editor call fails,
  // print nothing from this batch rather than unreviewed lines.
  const forReview = days.map((day, d) => ({
    day: d + 1,
    weekday: weekdayOf(day.date),
    // Quote slots stay in as context (the editor must see the whole day to
    // check cross-meal references) but are marked as not for scoring.
    meals: payload[d].meals.map((m) => ({
      ...m,
      line: result.get(localToGlobal[m.index])?.comment ?? "",
      ...(fixed.has(m.index) ? { already_final: true } : {}),
    })),
  }));
  try {
    const review = await callModel<{ reviews: { index: number; score: number; reason: string }[] }>(
      EDITOR_PROMPT, EDITOR_SCHEMA,
      `Review every line below. Meals marked "already_final" are part of the day (use them to check references) but are not yours to score — skip them. Return every other index exactly once.\n\n${JSON.stringify(forReview)}`,
      "high",
    );
    const reviewed = new Set<number>();
    for (const r of review.reviews ?? []) {
      if (fixed.has(r.index)) continue;
      const line = result.get(localToGlobal[r.index]);
      if (!line) continue;
      reviewed.add(r.index);
      line.score = Math.max(1, Math.min(10, Math.round(r.score)));
      line.note = clean(r.reason ?? "").slice(0, 120) || null;
      const bar = line.style === "motivational" ? MOTIVATIONAL_KEEP_SCORE : KEEP_SCORE;
      line.printed = line.score >= bar && findProblems(line.comment, labels[localToGlobal[r.index]], []).length === 0;
    }
    // Anything the editor skipped isn't printed.
    localToGlobal.forEach((gi, local) => {
      const line = result.get(gi);
      if (line && !reviewed.has(local) && !fixed.has(local)) { line.printed = false; line.note = "not reviewed"; }
    });
  } catch (e) {
    console.error("label comments editor pass failed, printing none from this batch:", e);
    localToGlobal.forEach((gi, local) => {
      const line = result.get(gi);
      if (line && !fixed.has(local)) { line.printed = false; line.note = "editor failed"; }
    });
  }

  // Every client day gets a motivational line: if the editor cut the
  // original one, an approved quote takes its place.
  payload.forEach((_, d) => {
    const local = motivationalByDay[d];
    const gi = localToGlobal[local];
    const line = result.get(gi);
    if (line?.printed) return;
    const quote = pickQuote(history.perClient.get(days[d].userId) ?? []);
    if (!quote) return;
    result.set(gi, { comment: quote, style: "motivational", score: null, printed: true, note: line ? `quote replaced cut line: ${line.comment}`.slice(0, 200) : "approved quote" });
  });
  return result;
}

/**
 * Returns one comment per label (same order; "" where none). Reuses saved
 * decisions for meals already printed, generates the rest, and saves them.
 */
export async function generateLabelComments(
  supabase: SupabaseServerClient,
  labels: LabelData[],
  generatedBy: string,
): Promise<{ comments: string[]; failedBatches: number; reused: number; skipped: number }> {
  const comments = labels.map(() => "");

  let saved = new Map<number, string>();
  try {
    saved = await fetchSavedForMeals(supabase, labels);
  } catch (e) {
    console.error("label_comment lookup failed:", e);
  }
  const done = new Set<number>();
  labels.forEach((l, i) => {
    if (!saved.has(l.meal_plan_day_recipe_id)) return;
    comments[i] = saved.get(l.meal_plan_day_recipe_id) ?? "";
    done.add(i);
  });
  const reused = done.size;

  // Group the meals still needing a line into client days.
  const dayMap = new Map<string, Day>();
  labels.forEach((l, i) => {
    if (done.has(i)) return;
    const key = `${l.user_id}|${l.consumption_date}`;
    const day = dayMap.get(key) ?? { userId: l.user_id, date: l.consumption_date, labelIndexes: [] };
    day.labelIndexes.push(i);
    dayMap.set(key, day);
  });
  if (dayMap.size === 0) return { comments, failedBatches: 0, reused, skipped: 0 };

  let history = { perClient: new Map<string, string[]>(), recent: [] as string[] };
  try {
    history = await fetchHistory(supabase, [...new Set([...dayMap.values()].map((d) => d.userId))]);
  } catch (e) {
    console.error("label_comment history lookup failed:", e);
  }

  // Pack whole days into batches — a day is never split across requests.
  const batches: Day[][] = [];
  let current: Day[] = [];
  let size = 0;
  for (const day of dayMap.values()) {
    if (size > 0 && size + day.labelIndexes.length > BATCH_SIZE) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(day);
    size += day.labelIndexes.length;
  }
  if (current.length) batches.push(current);

  let failedBatches = 0;
  const pickQuote = makeQuotePicker();
  const results = await Promise.all(
    batches.map(async (days) => {
      try {
        return await generateBatch(labels, days, history, pickQuote);
      } catch (e) {
        failedBatches++;
        if (e instanceof Anthropic.APIError) console.error("label comments API error:", e.status, e.message);
        else console.error("label comments failed:", e);
        return new Map<number, Line>();
      }
    })
  );

  // Batches ran in parallel, so the same joke can come out twice across the
  // print. Keep the best-scored copy of anything that opens with the same
  // five words; the rest go unprinted.
  const all = results.flatMap((r) => [...r.entries()]);
  const bestByKey = new Map<string, [number, Line]>();
  for (const [i, line] of all) {
    if (!line.printed || isQuote(line.comment)) continue;
    const key = words(line.comment.replace(/^motivational\s*:\s*/i, "")).slice(0, 5).join(" ");
    const prev = bestByKey.get(key);
    if (!prev) { bestByKey.set(key, [i, line]); continue; }
    const [loser, winner] = (line.score ?? 0) > (prev[1].score ?? 0) ? [prev[1], [i, line] as [number, Line]] : [line, prev];
    loser.printed = false;
    loser.note = "duplicate of another line in this print";
    bestByKey.set(key, winner);
  }

  const rows: Record<string, unknown>[] = [];
  let skipped = 0;
  for (const [i, line] of all) {
    comments[i] = line.printed ? line.comment : "";
    if (!line.printed) skipped++;
    const l = labels[i];
    rows.push({
      meal_plan_day_recipe_id: l.meal_plan_day_recipe_id,
      user_id: l.user_id,
      recipe_id: l.recipe_id,
      consumption_date: l.consumption_date,
      meal_type: l.meal_type,
      recipe_name: l.recipe_name,
      comment: line.comment,
      style: line.style,
      score: line.score,
      printed: line.printed,
      editor_note: line.note,
      model: MODEL,
      generated_by: generatedBy,
    });
  }
  for (const part of chunk(rows, 500)) {
    const { error } = await (supabase.from("label_comment") as any).insert(part); // eslint-disable-line @typescript-eslint/no-explicit-any
    if (error) console.error("label_comment insert failed:", error);
  }

  return { comments, failedBatches, reused, skipped };
}
