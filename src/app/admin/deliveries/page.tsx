import { Suspense } from "react";
import { PageHeader, Section, inputStyle, labelStyle, C } from "@/components/admin/ui";
import { getDeliveriesOverview, type DeliveryRow } from "@/lib/flask";
import AkliLoader from "@/components/AkliLoader";

// Flask-backed, usually 1.5–3s — show the branded loader straight away.
function ListFallback() {
  return <AkliLoader message="Mapping out today's drops…" tone="dark" />;
}

function fmtSlot(slot: DeliveryRow["delivery_slot"]) {
  if (!slot) return "No slot";
  return `${slot.start_time?.slice(0, 5) ?? "?"}–${slot.end_time?.slice(0, 5) ?? "?"}`;
}

function PaymentBadge({ payment }: { payment: DeliveryRow["payment"] }) {
  if (!payment) {
    return <span style={{ fontSize: 11, color: C.light }}>No payment on file</span>;
  }
  if (payment.collect_cash) {
    return (
      <span style={{
        fontSize: 11.5, fontWeight: 700, color: C.error, background: `${C.error}14`,
        borderRadius: 6, padding: "3px 8px", textTransform: "uppercase", letterSpacing: "0.02em",
      }}>
        Collect cash: {payment.currency ?? "$"}{payment.amount?.toFixed(2) ?? "—"}
      </span>
    );
  }
  const paid = payment.status === "paid";
  return (
    <span style={{
      fontSize: 11.5, fontWeight: 600, color: paid ? C.tealDark : C.warn, background: paid ? `${C.tealDark}14` : `${C.warn}14`,
      borderRadius: 6, padding: "3px 8px",
    }}>
      {payment.provider ?? "—"} · {payment.status ?? "unknown"}
    </span>
  );
}

type Stop = DeliveryRow & { eat_dates: string[] };

// One drop = one stop. A client can get several days in one bag (several
// deliveries rows, same night, same address) — merge them so the driver sees
// one stop with the combined cash to collect, not the same name twice.
function mergeStops(rows: DeliveryRow[]): Stop[] {
  const byKey = new Map<string, Stop>();
  for (const d of rows) {
    const key = `${d.delivery_date}|${d.client?.id ?? d.id}|${d.delivery_slot?.id ?? ""}|${(d.address ?? "").trim().toLowerCase()}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...d, eat_dates: d.eat_date ? [d.eat_date] : [], payment: d.payment ? { ...d.payment } : null });
      continue;
    }
    if (d.eat_date) existing.eat_dates.push(d.eat_date);
    existing.needs_cutlery = existing.needs_cutlery || d.needs_cutlery;
    if (d.payment) {
      if (!existing.payment) existing.payment = { ...d.payment };
      else {
        const p = existing.payment;
        if (d.payment.collect_cash) {
          p.amount = (p.collect_cash ? (p.amount ?? 0) : 0) + (d.payment.amount ?? 0);
          p.collect_cash = true;
        } else if (!p.collect_cash) {
          p.amount = (p.amount ?? 0) + (d.payment.amount ?? 0);
        }
      }
    }
  }
  for (const s of byKey.values()) s.eat_dates.sort();
  return [...byKey.values()];
}

function fmtShortDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" });
}

async function DeliveryList({ start, end }: { start: string; end: string }) {
  const deliveries = mergeStops(await getDeliveriesOverview(start, end));

  if (deliveries.length === 0) {
    return (
      <Section title="Deliveries (0)">
        <p style={{ fontSize: 13, color: C.light, margin: 0 }}>No deliveries scheduled for this range.</p>
      </Section>
    );
  }

  const cutleryCount = deliveries.filter(d => d.needs_cutlery).length;
  const byDate = new Map<string, Stop[]>();
  for (const d of deliveries) {
    const key = d.delivery_date ?? "Unknown date";
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(d);
  }

  return (
    <Section title={`Deliveries (${deliveries.length})`}>
      <p style={{ margin: "0 0 12px", fontSize: 12.5, color: C.muted }}>
        🍴 Cutlery requested: <strong style={{ color: C.primary }}>{cutleryCount}</strong> of {deliveries.length}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {[...byDate.entries()].map(([date, rows]) => (
          <div key={date}>
            <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700, color: C.primary }}>
              {date !== "Unknown date" ? new Date(date).toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long" }) : date}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {rows.map(d => (
                <div key={d.id} style={{ background: C.offWhite, borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: C.primary }}>
                        {d.client ? `${d.client.name ?? ""} ${d.client.last_name ?? ""}`.trim() || "Unknown client" : "Unknown client"}
                        <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: C.muted }}>{fmtSlot(d.delivery_slot)}</span>
                        {d.eat_dates.length > 1 && (
                          <span style={{
                            marginLeft: 8, fontSize: 11, fontWeight: 800, color: "#b45309", background: "#fff8e6",
                            borderRadius: 20, padding: "2px 8px", textTransform: "uppercase", letterSpacing: "0.03em",
                          }}>
                            📦 {d.eat_dates.length} days · {d.eat_dates.map(fmtShortDay).join(" + ")}
                          </span>
                        )}
                      </p>
                      {d.address_label && (
                        <p style={{ margin: "4px 0 0", fontSize: 12.5, fontWeight: 600, color: C.primary }}>{d.address_label}</p>
                      )}
                      <p style={{ margin: "2px 0 0", fontSize: 12, color: C.muted }}>{d.address ?? "No address on file"}</p>
                      {d.client?.phone_number && (
                        <a href={`tel:${d.client.phone_number}`} style={{ fontSize: 12, color: C.tealDark, textDecoration: "none" }}>
                          📞 {d.client.phone_number}
                        </a>
                      )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                      {d.maps_link && (
                        <a
                          href={d.maps_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={d.maps_is_precise ? "Opens the client's saved pin" : "No verified pin — searches Google Maps for the address text"}
                          style={{
                            fontSize: 11.5, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap",
                            borderRadius: 7, padding: "5px 10px",
                            color: d.maps_is_precise ? C.white : C.primary,
                            background: d.maps_is_precise ? C.primary : "transparent",
                            border: d.maps_is_precise ? "none" : `1px solid ${C.border}`,
                          }}
                        >
                          {d.maps_is_precise ? "Open in Maps" : "Search on Maps"}
                        </a>
                      )}
                      {d.needs_cutlery && (
                        <span style={{
                          fontSize: 11.5, fontWeight: 700, color: C.white, background: C.tealDark,
                          borderRadius: 6, padding: "3px 8px", textTransform: "uppercase", letterSpacing: "0.02em", whiteSpace: "nowrap",
                        }}>
                          🍴 Cutlery
                        </span>
                      )}
                      <PaymentBadge payment={d.payment} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

export default async function DeliveriesPage({ searchParams }: { searchParams: Promise<{ start?: string; end?: string }> }) {
  const { start, end } = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const rangeStart = start ?? today;
  const rangeEnd = end ?? today;

  return (
    <div style={{ padding: "24px 20px 60px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <PageHeader title="Deliveries" />

        <Section>
          <form style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ ...labelStyle, flex: "0 1 160px" }}>Start date
              <input type="date" name="start" defaultValue={rangeStart} style={inputStyle} />
            </label>
            <label style={{ ...labelStyle, flex: "0 1 160px" }}>End date
              <input type="date" name="end" defaultValue={rangeEnd} style={inputStyle} />
            </label>
            <button type="submit" style={{ background: C.primary, color: C.white, border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              Apply
            </button>
          </form>
        </Section>

        <Suspense fallback={<ListFallback />} key={`${rangeStart}-${rangeEnd}`}>
          <DeliveryList start={rangeStart} end={rangeEnd} />
        </Suspense>
      </div>
    </div>
  );
}
