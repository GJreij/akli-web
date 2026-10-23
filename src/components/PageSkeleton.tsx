// Instant placeholder shown by each route's loading.tsx while the server
// renders the real page. Without it, a tap left the previous screen frozen
// on-screen until every query had finished, which read as the app hanging.
// Plain server component (no client JS) so it can paint immediately.
// If the wait drags past LOADER_DELAY_MS, the branded AkliLoader fades in
// over the skeleton with a message for the page being opened.

import AkliLoader from "./AkliLoader";

const LOADER_DELAY_MS = 600;

const C = {
  primary:  "#063330",
  offWhite: "#eee9e6",
  border:   "#e0dbd5",
  white:    "#ffffff",
};

const pulse = `@keyframes akliPulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.55 } }`;

function Block({ height, width = "100%", radius = 14, dark = false }: {
  height: number; width?: number | string; radius?: number; dark?: boolean;
}) {
  return (
    <div style={{
      height, width, borderRadius: radius,
      background: dark ? "rgba(255,255,255,0.12)" : C.white,
      border: dark ? "none" : `1px solid ${C.border}`,
      animation: "akliPulse 1.4s ease-in-out infinite",
    }} />
  );
}

export function ClientPageSkeleton({ message, cards = 3 }: { message: string; cards?: number }) {
  return (
    <div style={{ minHeight: "100vh", background: C.offWhite }} aria-busy="true" aria-label="Loading">
      <style>{pulse}</style>
      <AkliLoader message={message} delayMs={LOADER_DELAY_MS} overlay="screen" />
      <div style={{ background: C.primary, padding: "20px 20px 28px" }}>
        <div style={{ maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
          <Block height={34} radius={10} dark />
          <Block height={18} width="55%" radius={6} dark />
          <Block height={108} radius={16} dark />
        </div>
      </div>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "16px 16px 40px", display: "flex", flexDirection: "column", gap: 12 }}>
        {Array.from({ length: cards }).map((_, i) => <Block key={i} height={i === 0 ? 120 : 90} />)}
      </div>
    </div>
  );
}

// slow: the page is known to wait on Flask (1.5–3s), so skip the delay and
// show the branded loader straight away instead of the skeleton.
export function AdminPageSkeleton({ message = "Loading…", slow = false }: { message?: string; slow?: boolean }) {
  if (slow) {
    return (
      <div style={{ padding: "24px 20px 60px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <AkliLoader message={message} tone="dark" />
        </div>
      </div>
    );
  }
  return (
    <div style={{ padding: "24px 20px 60px" }} aria-busy="true" aria-label="Loading">
      <style>{pulse}</style>
      <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12, position: "relative" }}>
        <AkliLoader message={message} tone="dark" delayMs={LOADER_DELAY_MS} overlay="parent" />
        <Block height={28} width={200} radius={8} />
        <Block height={64} />
        {Array.from({ length: 4 }).map((_, i) => <Block key={i} height={90} />)}
      </div>
    </div>
  );
}
