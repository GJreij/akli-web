import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type EventRow = Database["public"]["Tables"]["analytics_event"]["Row"];

const C = {
  primary: "#063330", teal: "#67b1b0", tealDark: "#437b7b",
  offWhite: "#eee9e6", muted: "#5c5c5c", light: "#9a9a9a",
  border: "#e0dbd5", white: "#ffffff", error: "#c0392b",
};

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", flex: "1 1 140px" }}>
      <p style={{ margin: "0 0 4px", fontSize: 11, color: C.light, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</p>
      <p style={{ margin: 0, fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 500, color: C.primary }}>{value}</p>
      {sub && <p style={{ margin: "2px 0 0", fontSize: 11.5, color: C.light }}>{sub}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px", marginBottom: 16 }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600, color: C.primary }}>{title}</h3>
      {children}
    </div>
  );
}

function Bar({ label, count, max }: { label: string; count: number; max: number }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 3 }}>
        <span style={{ color: "#1a1a1a" }}>{label}</span>
        <span style={{ color: C.muted, fontWeight: 600 }}>{count}</span>
      </div>
      <div style={{ height: 7, background: C.offWhite, borderRadius: 4, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: C.teal, borderRadius: 4 }} />
      </div>
    </div>
  );
}

export default async function AnalyticsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const profileRes = await supabase.from("user").select("*").eq("id", user.id).single();
  const profile = profileRes.data as Database["public"]["Tables"]["user"]["Row"] | null;
  if (profile?.role !== "admin") redirect("/home");

  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const since7  = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000).toISOString();

  const [eventsRes, recentRes] = await Promise.all([
    supabase.from("analytics_event").select("*").gte("created_at", since30).order("created_at", { ascending: false }).limit(10000),
    supabase.from("analytics_event").select("*").order("created_at", { ascending: false }).limit(100),
  ]);

  const events = (eventsRes.data ?? []) as EventRow[];
  const recent = (recentRes.data ?? []) as EventRow[];
  const events7 = events.filter(e => e.created_at >= since7);

  function stats(rows: EventRow[]) {
    const anonIds = new Set(rows.map(r => r.anon_id).filter(Boolean));
    const sessionIds = new Set(rows.map(r => r.session_id).filter(Boolean));
    const userIds = new Set(rows.map(r => r.user_id).filter(Boolean));
    return { visitors: anonIds.size, sessions: sessionIds.size, identifiedUsers: userIds.size };
  }
  const s30 = stats(events);
  const s7 = stats(events7);

  // Funnel — count of distinct anon_ids that ever fired each milestone event, in the last 30 days
  const FUNNEL_STEPS: { event: string; label: string }[] = [
    { event: "page_view",          label: "Visited the site" },
    { event: "landing_cta_click",  label: "Clicked “Build my plan”" },
    { event: "signup_completed",   label: "Completed sign-up" },
    { event: "order_step",         label: "Reached checkout" },
    { event: "order_confirmed",    label: "Confirmed an order" },
  ];
  const funnel = FUNNEL_STEPS.map(({ event, label }) => {
    const matching = events.filter(e =>
      e.event_name === event &&
      (event !== "order_step" || (e.metadata as { step?: string } | null)?.step === "checkout")
    );
    return { label, count: new Set(matching.map(e => e.anon_id)).size };
  });
  const funnelMax = funnel[0]?.count ?? 0;

  // Top pages
  const pageCounts = new Map<string, number>();
  for (const e of events) {
    if (e.event_name !== "page_view" || !e.page) continue;
    pageCounts.set(e.page, (pageCounts.get(e.page) ?? 0) + 1);
  }
  const topPages = [...pageCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const topPagesMax = topPages[0]?.[1] ?? 0;

  // Device breakdown
  const deviceCounts = new Map<string, number>();
  for (const e of events) {
    if (!e.device_type) continue;
    deviceCounts.set(e.device_type, (deviceCounts.get(e.device_type) ?? 0) + 1);
  }
  const deviceMax = Math.max(1, ...deviceCounts.values());

  // Geolocation grant rate
  const geoGranted = events.filter(e => e.event_name === "geolocation_granted").length;
  const geoDenied = events.filter(e => e.event_name === "geolocation_denied").length;
  const geoTotal = geoGranted + geoDenied;

  // Event name leaderboard (excluding page_view, which dominates)
  const eventCounts = new Map<string, number>();
  for (const e of events) {
    if (e.event_name === "page_view") continue;
    eventCounts.set(e.event_name, (eventCounts.get(e.event_name) ?? 0) + 1);
  }
  const topEvents = [...eventCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  const topEventsMax = topEvents[0]?.[1] ?? 0;

  return (
    <div style={{ minHeight: "100vh", background: C.offWhite, padding: "24px 20px 60px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 18 }}>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 500, color: C.primary, margin: 0 }}>
            Analytics
          </h1>
          <span style={{ fontSize: 12, color: C.light }}>Last 30 days</span>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
          <Card label="Visitors (30d)" value={String(s30.visitors)} sub={`${s7.visitors} in last 7d`} />
          <Card label="Sessions (30d)" value={String(s30.sessions)} sub={`${s7.sessions} in last 7d`} />
          <Card label="Signed-in users seen" value={String(s30.identifiedUsers)} />
          <Card label="Events logged" value={String(events.length)} sub="capped at 10,000" />
        </div>

        <Section title="Funnel — landing to confirmed order">
          {funnel.map(f => <Bar key={f.label} label={f.label} count={f.count} max={funnelMax} />)}
          <p style={{ margin: "8px 0 0", fontSize: 11, color: C.light }}>
            Counts are unique visitors who reached each step at least once — not total clicks.
          </p>
        </Section>

        <Section title="Top events">
          {topEvents.length === 0
            ? <p style={{ fontSize: 13, color: C.light, margin: 0 }}>No events yet.</p>
            : topEvents.map(([name, count]) => <Bar key={name} label={name} count={count} max={topEventsMax} />)}
        </Section>

        <Section title="Top pages">
          {topPages.length === 0
            ? <p style={{ fontSize: 13, color: C.light, margin: 0 }}>No page views yet.</p>
            : topPages.map(([page, count]) => <Bar key={page} label={page} count={count} max={topPagesMax} />)}
        </Section>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 280px" }}>
            <Section title="Devices">
              {deviceCounts.size === 0
                ? <p style={{ fontSize: 13, color: C.light, margin: 0 }}>No data yet.</p>
                : [...deviceCounts.entries()].map(([d, c]) => <Bar key={d} label={d} count={c} max={deviceMax} />)}
            </Section>
          </div>
          <div style={{ flex: "1 1 280px" }}>
            <Section title="Location permission">
              {geoTotal === 0 ? (
                <p style={{ fontSize: 13, color: C.light, margin: 0 }}>No attempts yet.</p>
              ) : (
                <>
                  <Bar label="Granted" count={geoGranted} max={geoTotal} />
                  <Bar label="Denied / failed" count={geoDenied} max={geoTotal} />
                  <p style={{ margin: "4px 0 0", fontSize: 11.5, color: C.light }}>
                    {Math.round((geoGranted / geoTotal) * 100)}% of attempts succeeded
                  </p>
                </>
              )}
            </Section>
          </div>
        </div>

        <Section title="Recent activity (raw log)">
          <div style={{ maxHeight: 420, overflowY: "auto" }}>
            <table style={{ width: "100%", fontSize: 11.5, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", color: C.light, borderBottom: `1px solid ${C.border}` }}>
                  <th style={{ padding: "4px 6px" }}>Time</th>
                  <th style={{ padding: "4px 6px" }}>Event</th>
                  <th style={{ padding: "4px 6px" }}>Page</th>
                  <th style={{ padding: "4px 6px" }}>Who</th>
                </tr>
              </thead>
              <tbody>
                {recent.map(e => (
                  <tr key={e.id} style={{ borderBottom: `1px solid ${C.offWhite}` }}>
                    <td style={{ padding: "4px 6px", color: C.light, whiteSpace: "nowrap" }}>
                      {new Date(e.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td style={{ padding: "4px 6px", fontWeight: 600 }}>{e.event_name}</td>
                    <td style={{ padding: "4px 6px", color: C.muted }}>{e.page ?? "—"}</td>
                    <td style={{ padding: "4px 6px", color: C.muted, fontFamily: "monospace", fontSize: 10.5 }}>
                      {e.user_id ? `user:${e.user_id.slice(0, 8)}` : e.anon_id ? `anon:${e.anon_id.slice(0, 8)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </div>
  );
}
