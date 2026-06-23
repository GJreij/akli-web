export const C = {
  primary: "#063330", teal: "#67b1b0", tealDark: "#437b7b",
  offWhite: "#eee9e6", muted: "#5c5c5c", light: "#9a9a9a",
  border: "#e0dbd5", white: "#ffffff", error: "#c0392b", warn: "#b8860b",
};

export function PageHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 18 }}>
      <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 500, color: C.primary, margin: 0 }}>
        {title}
      </h1>
      {right}
    </div>
  );
}

export function Section({ title, children, right }: { title?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px", marginBottom: 16 }}>
      {title && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: C.primary }}>{title}</h3>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export const inputStyle: React.CSSProperties = {
  padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`,
  fontSize: 13, color: C.primary, background: C.white, width: "100%",
};

export const labelStyle: React.CSSProperties = {
  fontSize: 11.5, color: C.muted, display: "flex", flexDirection: "column", gap: 4,
};

export const primaryButton: React.CSSProperties = {
  background: C.primary, color: C.white, border: "none", borderRadius: 8,
  padding: "9px 16px", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
};

export const dangerButton: React.CSSProperties = {
  background: "transparent", color: C.error, border: `1px solid ${C.error}40`, borderRadius: 8,
  padding: "8px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
};

export const subtleButton: React.CSSProperties = {
  background: C.offWhite, color: C.primary, border: "none", borderRadius: 8,
  padding: "8px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
};

export const th: React.CSSProperties = { padding: "8px 10px", textAlign: "left", color: C.light, fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.03em" };
export const td: React.CSSProperties = { padding: "8px 10px", fontSize: 13, borderTop: `1px solid ${C.offWhite}` };
