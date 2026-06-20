import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/lib/supabase/types";

export const runtime = "nodejs";

// Server-only — service role key never reaches the browser
const admin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      userId, name, last_name, phone_number, email, dob,
      tenant_id, kcal_target, protein_g, carbs_g, fat_g, diet_type,
      goal, sex, height_cm, weight_kg, activity_level, method,
    } = body;

    if (!userId || !name || !email) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Insert or upsert profile — cast needed because supabase-js generic inference
    // narrows upsert input too aggressively on some versions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: profileError } = await (admin.from("user") as any).upsert({
      id: userId,
      name,
      last_name,
      phone_number,
      email,
      DoB: dob || null,
      tenant_id,
      onboarding: false,
      role: "client",
      status: "active",
    });

    if (profileError) {
      console.error("Profile upsert error:", profileError);
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: macroError } = await (admin.from("daily_macro_target") as any).insert({
      user_id: userId,
      tenant_id,
      kcal_target,
      protein_g: Math.round(protein_g),
      carbs_g: Math.round(carbs_g),
      fat_g: Math.round(fat_g),
      diet_type,
      goal: goal || null,
      sex: sex || null,
      height_cm: height_cm ?? null,
      weight_kg: weight_kg ?? null,
      activity_level: activity_level ?? null,
      method: method || null,
      source: "onboarding",
    });

    if (macroError) {
      console.error("Macro insert error:", macroError);
      return NextResponse.json({ error: macroError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("create-profile error:", e);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
