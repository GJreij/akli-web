"use client";

import type { KitchenDay, KitchenIngredient, KitchenSubrecipe } from "@/lib/flask";
import CopyListButton from "../CopyListButton";
import { C } from "../ui";
import { buildPrepLines } from "./PrepList";
import { choiceCustom, defaultChoice, fmtDay, fmtQty, fmtServings, planIngredients, planServings, smallBtn } from "./KitchenDayBoard";

function Block({ title, sub, children, right }: { title: string; sub?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: "12px 14px", marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: C.primary }}>{title}</p>
        {right}
      </div>
      {sub && <p style={{ margin: "2px 0 6px", fontSize: 11.5, color: C.light }}>{sub}</p>}
      {children}
    </div>
  );
}

const row = { display: "flex", justifyContent: "space-between", gap: 8, padding: "6px 0", borderTop: `1px solid ${C.offWhite}`, fontSize: 13 } as const;

// The next cook day, seen from today: what to pull from the freezer tonight
// and day-before jobs. Buying lives on the Procurement page. Cook amounts use
// each dish's default choice on that day (through its fridge window), since
// they aren't picked yet.
export default function TomorrowPanel({ day }: { day: KitchenDay }) {
  const toWork = day.subrecipes.filter(s => s.prep_type !== "ready" && s.must_cook.servings > 0.01);
  const ready = day.subrecipes.filter(s => s.prep_type === "ready" && s.today.servings > 0);

  const cookIngredients = (s: KitchenSubrecipe): KitchenIngredient[] => {
    const c = defaultChoice(s);
    return planIngredients(s, c.plan, choiceCustom(c));
  };
  const readyIngredients = (s: KitchenSubrecipe): KitchenIngredient[] =>
    s.ingredients_per_serving.map(i => ({ ...i, quantity: Math.round(i.quantity * s.today.servings * 10) / 10 }));

  const lines = buildPrepLines([...toWork, ...ready], s => s.prep_type === "ready" ? readyIngredients(s) : cookIngredients(s));
  const freezerPulls = day.subrecipes.flatMap(s => s.stock
    .filter(b => b.storage === "freezer" && b.allocated_today_servings > 0)
    .map(b => ({ s, b })));
  const thaw = lines.filter(l => l.stored_frozen);
  const jobs = toWork.filter(s => s.prep_ahead?.trim());

  const dayLabel = fmtDay(day.cook_date);
  const cookLines = toWork.map(s => {
    const c = defaultChoice(s);
    return `- ${s.name}: ${fmtServings(planServings(s, c.plan, choiceCustom(c)))} servings`;
  });
  const freezerLines = [
    ...freezerPulls.map(({ s, b }) => `- ${s.name}: ${fmtServings(b.allocated_today_servings)} portions (cooked ${fmtDay(b.cooked_on)})`),
    ...thaw.map(l => `- ${l.name}: ${fmtQty(l)}${l.thaw_hours ? ` (${l.thaw_hours}h to thaw)` : ""}`),
  ];
  const jobLines = jobs.map(s => `- ${s.name}: ${s.prep_ahead}`);
  const note = [
    `Akli kitchen: ${dayLabel}`,
    cookLines.length ? ["", "COOK / ASSEMBLE", ...cookLines].join("\n") : "",
    freezerLines.length ? ["", "TAKE OUT OF THE FREEZER TONIGHT", ...freezerLines].join("\n") : "",
    jobLines.length ? ["", "DAY BEFORE", ...jobLines].join("\n") : "",
  ].filter(Boolean).join("\n");

  return (
    <div id="sec-tomorrow" style={{ scrollMarginTop: 12, marginTop: 26 }}>
      <h2 style={{ margin: "0 0 2px", fontSize: 15, fontWeight: 700, color: C.primary }}>Next cook day: {dayLabel}</h2>
      <p style={{ margin: "0 0 10px", fontSize: 12, color: C.light }}>
        Amounts assume you cook each dish through its fridge window that day. Log today&apos;s batches first: anything they cover drops off here.
      </p>

      <Block title="❄️ Take out of the freezer tonight" sub={freezerPulls.length || thaw.length ? undefined : "Nothing frozen is needed."}>
        {freezerPulls.map(({ s, b }) => (
          <div key={`b${b.batch_id}`} style={row}>
            <span style={{ color: C.primary }}>{s.name} <span style={{ color: C.light, fontSize: 11.5 }}>· portions cooked {fmtDay(b.cooked_on)}</span></span>
            <strong style={{ color: C.primary }}>{fmtServings(b.allocated_today_servings)}</strong>
          </div>
        ))}
        {thaw.map(l => (
          <div key={`i${l.ingredient_id}`} style={row}>
            <span style={{ color: C.primary }}>{l.name} <span style={{ color: C.light, fontSize: 11.5 }}>· raw{l.thaw_hours ? `, ${l.thaw_hours}h to thaw` : ""}</span></span>
            <strong style={{ color: C.primary }}>{fmtQty(l)}</strong>
          </div>
        ))}
        <p style={{ margin: "6px 0 0", fontSize: 11.5, color: C.light }}>
          Raw meat/chicken shows here once its ingredient is marked “Kept frozen” in Catalog → Ingredients.
        </p>
      </Block>

      {jobs.length > 0 && (
        <Block title="🌙 Day-before jobs">
          {jobs.map(s => (
            <div key={s.subrecipe_id} style={row}>
              <span style={{ color: C.primary }}>{s.name}</span>
              <span style={{ color: C.muted }}>{s.prep_ahead}</span>
            </div>
          ))}
        </Block>
      )}

      <Block
        title="📝 Note for tomorrow"
        right={
          <span style={{ display: "flex", gap: 6 }}>
            <CopyListButton label="Copy" text={note} />
            <a
              href={`https://wa.me/?text=${encodeURIComponent(note)}`}
              target="_blank" rel="noreferrer"
              style={{ ...smallBtn, textDecoration: "none", background: "#25d366", color: C.white, border: "none" }}
            >
              WhatsApp
            </a>
          </span>
        }
      >
        <pre style={{ margin: "6px 0 0", whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 12, color: C.muted }}>{note}</pre>
      </Block>
    </div>
  );
}
