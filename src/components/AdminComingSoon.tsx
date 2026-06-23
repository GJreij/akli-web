const C = {
  primary: "#063330", light: "#9a9a9a", border: "#e0dbd5", white: "#ffffff",
};

export default function AdminComingSoon({ title }: { title: string }) {
  return (
    <div style={{ padding: "24px 20px 60px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 500, color: C.primary, margin: "0 0 16px" }}>
          {title}
        </h1>
        <div style={{
          background: C.white, border: `1px dashed ${C.border}`, borderRadius: 14,
          padding: "40px 20px", textAlign: "center",
        }}>
          <p style={{ margin: 0, fontSize: 13.5, color: C.light }}>Coming soon.</p>
        </div>
      </div>
    </div>
  );
}
