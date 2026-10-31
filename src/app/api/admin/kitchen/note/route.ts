import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/requireAdmin";
import { anthropic, KITCHEN_FALLBACK, KITCHEN_MODEL } from "@/lib/kitchenAi";

export const runtime = "nodejs";
export const maxDuration = 60;

// Writes the next-day WhatsApp note together with the cook: each turn returns
// a short reply and the full updated note. The facts (freezer pulls, jobs)
// come from the Tomorrow card, computed from the orders.
const SYSTEM = `You help the head cook of Akli, a Lebanese meal-prep kitchen, write the WhatsApp message for the kitchen team about the next day. The message is read on a phone.

Rules:
- Keep every quantity, dish and date exactly as in the facts. Never invent or change numbers. If the cook asks for something that contradicts the facts, do it but mention it in your reply.
- Plain WhatsApp text: short lines, "•" bullets, an emoji or two at most, no markdown headings.
- Follow the cook's requests (shorter, add a reminder, a start time, a language). For Lebanese, write Lebanese Arabic in Arabizi (Latin letters and numbers) unless they ask for Arabic script.
- "reply" is one short sentence to the cook about what you changed, or one short question if their request is unclear. "note" is always the full message.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "note"],
  properties: { reply: { type: "string" }, note: { type: "string" } },
} as const;

type Turn = { role: "user" | "assistant"; content: string };

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "The assistant isn't configured (no ANTHROPIC_API_KEY)." }, { status: 500 });
  }

  let body: { facts?: string; note?: string; history?: Turn[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const history = (Array.isArray(body.history) ? body.history : [])
    .filter(t => (t.role === "user" || t.role === "assistant") && typeof t.content === "string" && t.content.trim())
    .slice(-20);
  if (history.length === 0 || history[history.length - 1].role !== "user") {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  // The current note travels with the latest request, so edits the cook made
  // by hand are kept.
  const last = history[history.length - 1];
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history.slice(0, -1).map(t => ({ role: t.role, content: t.content })),
    { role: "user", content: `Current note:\n${String(body.note ?? "").slice(0, 4000)}\n\nMy request: ${last.content}` },
  ];

  try {
    const response = await anthropic.beta.messages.create({
      model: KITCHEN_MODEL,
      max_tokens: 4000,
      ...KITCHEN_FALLBACK,
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA as unknown as Record<string, unknown> } },
      system: [
        { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
        { type: "text", text: `Facts for the next day:\n${String(body.facts ?? "").slice(0, 6000)}` },
      ],
      messages,
    });
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
      return NextResponse.json({ error: "The assistant couldn't finish that one — try again." }, { status: 502 });
    }
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map(b => b.text).join("");
    const parsed = JSON.parse(text) as { reply: string; note: string };
    return NextResponse.json({ reply: parsed.reply, note: parsed.note });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "Busy right now — try again in a moment." }, { status: 429 });
    }
    console.error("kitchen note failed:", e);
    return NextResponse.json({ error: "Couldn't reach the assistant — try again." }, { status: 502 });
  }
}
