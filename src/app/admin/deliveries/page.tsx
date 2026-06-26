import { Suspense } from "react";
import { PageHeader, Section, inputStyle, labelStyle, C } from "@/components/admin/ui";
import { getDeliveriesOverview, type DeliveryRow } from "@/lib/flask";

function ListFallback() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, height: 90 }} />
      ))}
    </div>
  );
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

async function DeliveryList({ start, end }: { start: string; end: string }) {
  const deliveries = await getDeliveriesOverview(start, end);

  if (deliveries.length === 0) {
    return (
      <Section title="Deliveries (0)">
        <p style={{ fontSize: 13, color: C.light, margin: 0 }}>No deliveries scheduled for this range.</p>
      </Section>
    );
  }

  const byDate = new Map<string, DeliveryRow[]>();
  for (const d of deliveries) {
    const key = d.delivery_date ?? "Unknown date";
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(d);
  }

  return (
    <Section title={`Deliveries (${deliveries.length})`}>
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
                      </p>
                      <p style={{ margin: "4px 0 0", fontSize: 12, color: C.muted }}>{d.address ?? "No address on file"}</p>
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
                          style={{
                            fontSize: 11.5, fontWeight: 600, color: C.white, background: C.primary,
                            borderRadius: 7, padding: "5px 10px", textDecoration: "none", whiteSpace: "nowrap",
                          }}
                        >
                          Open in Maps
                        </a>
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
