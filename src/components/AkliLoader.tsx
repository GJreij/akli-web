// Branded loader: the "akli" wordmark draws itself inside the same
// protein/carbs/fat macro ring as the Home dashboard, with a fixed,
// page-specific message underneath. Pure CSS (no client JS), so it paints
// from the server-streamed HTML before any bundle has loaded.
//
// Two ways it's used:
//  - overlay + delayMs: sits on top of a page skeleton and only fades in
//    if the wait passes the delay, so quick navigations never flash it.
//    "screen" covers the whole viewport (client pages); "parent" covers
//    only the nearest positioned parent (admin, so the nav stays visible).
//  - inline, no delay: for waits that are known to be slow (admin pages
//    backed by Flask), shown straight away.

const RING = [
  { color: "#e8a87c", share: 0.34 }, // protein — same palette as HomeDashboard's MacroRing
  { color: "#c9a84c", share: 0.40 }, // carbs
  { color: "#7abfbe", share: 0.26 }, // fat
];

const R = 62;
const CIRC = 2 * Math.PI * R;

const css = `
@keyframes akliDraw { from { stroke-dashoffset: 260 } to { stroke-dashoffset: 0 } }
@keyframes akliFill { from { fill-opacity: 0 } to { fill-opacity: 1 } }
@keyframes akliSeg  { 0% { stroke-dashoffset: var(--akli-len) } 40%, 100% { stroke-dashoffset: 0 } }
@keyframes akliSpin { to { transform: rotate(360deg) } }
@keyframes akliIn   { from { opacity: 0 } to { opacity: 1 } }
@keyframes akliMsg  { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: none } }
@media (prefers-reduced-motion: reduce) {
  .akli-loader * { animation: none !important; stroke-dashoffset: 0 !important; fill-opacity: 1 !important; }
}
`;

export default function AkliLoader({ message, tone = "light", delayMs = 0, overlay }: {
  message: string;
  tone?: "light" | "dark";
  delayMs?: number;
  overlay?: "screen" | "parent";
}) {
  const dark = tone === "dark";
  const ink = dark ? "#eee9e6" : "#063330";
  const track = dark ? "rgba(255,255,255,0.14)" : "rgba(6,51,48,0.10)";
  const bg = dark ? "#063330" : "#eee9e6";
  // Everything inside starts once the loader itself appears.
  const t = (s: number) => `${delayMs / 1000 + s}s`;

  let offset = 0;
  const segments = RING.map(({ color, share }, i) => {
    const len = CIRC * share - 6;
    const rotate = -90 + offset * 360;
    offset += share;
    return (
      <circle
        key={color}
        cx="80" cy="80" r={R} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
        strokeDasharray={`${len} ${CIRC}`}
        transform={`rotate(${rotate} 80 80)`}
        style={{
          ["--akli-len" as string]: len,
          strokeDashoffset: len,
          animation: `akliSeg 2.4s ${t(0.9 + i * 0.35)} ease-out infinite`,
        }}
      />
    );
  });

  return (
    <div
      className="akli-loader"
      role="status"
      aria-live="polite"
      style={{
        ...(overlay === "screen" ? { position: "fixed", inset: 0, zIndex: 50 }
          : overlay === "parent" ? { position: "absolute", inset: 0, zIndex: 5, borderRadius: 14 }
          : { minHeight: 320, borderRadius: 14 }),
        background: bg,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 22,
        opacity: delayMs ? 0 : 1,
        animation: delayMs ? `akliIn 0.25s ${t(0)} ease-out forwards` : undefined,
      }}
    >
      <style>{css}</style>
      <svg width="160" height="160" viewBox="0 0 160 160" aria-hidden="true">
        <circle cx="80" cy="80" r={R} fill="none" stroke={track} strokeWidth="7" />
        <g style={{ transformOrigin: "80px 80px", animation: "akliSpin 7s linear infinite" }}>{segments}</g>
        <text
          x="80" y="92" textAnchor="middle"
          fontFamily="'Playfair Display', Georgia, serif" fontSize="36" fontWeight="500"
          fill={ink} stroke={ink} strokeWidth="0.8" strokeDasharray="260"
          style={{
            fillOpacity: 0,
            animation: `akliDraw 1.1s ${t(0)} ease-in-out forwards, akliFill 0.5s ${t(0.9)} ease-out forwards`,
          }}
        >
          akli
        </text>
      </svg>
      <p style={{
        margin: 0, padding: "0 24px", textAlign: "center",
        fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 14,
        color: dark ? "rgba(238,233,230,0.75)" : "#5c5c5c",
        animation: `akliMsg 0.4s ${t(0.6)} ease-out both`,
      }}>
        {message}
      </p>
    </div>
  );
}
