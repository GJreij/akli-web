"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const supabase = createClient();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [done, setDone]         = useState(false);
  const [ready, setReady]       = useState(false);
  const [linkError, setLinkError] = useState(false);

  const C = {
    primary: "#063330", teal: "#67b1b0", tealDark: "#437b7b",
    muted: "#5c5c5c", light: "#9a9a9a", border: "#e0dbd5",
    offWhite: "#eee9e6", white: "#ffffff", error: "#c0392b",
  };

  useEffect(() => {
    async function init() {
      // 1. Already have a valid session?
      const { data: { session } } = await supabase.auth.getSession();
      if (session) { setReady(true); return; }

      // 2. Try to exchange the ?code= from the URL
      const code = new URLSearchParams(window.location.search).get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) { setReady(true); return; }
      }

      // 3. Nothing worked — link expired or already used
      setLinkError(true);
    }
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setError(null); setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setDone(true);
    setTimeout(() => { window.location.href = "/home"; }, 2000);
  }

  return (
    <div style={{ minHeight: "100vh", background: C.offWhite, display: "flex", flexDirection: "column" }}>
      <div style={{ background: C.primary, padding: "14px 20px" }}>
        <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 22, color: "#fff", fontWeight: 500 }}>
          akli
        </span>
      </div>

      <div style={{ flex: 1, padding: "32px 20px" }}>
        {done ? (
          <div style={{ textAlign: "center", paddingTop: 24 }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>✅</div>
            <h3 style={{ margin: "0 0 8px", fontSize: 20, color: C.primary }}>Password updated</h3>
            <p style={{ fontSize: 13, color: C.muted }}>Taking you to your dashboard…</p>
          </div>

        ) : linkError ? (
          <div style={{ textAlign: "center", paddingTop: 40 }}>
            <div style={{ fontSize: 36, marginBottom: 16 }}>🔗</div>
            <h3 style={{ margin: "0 0 8px", fontSize: 20, color: C.primary }}>Link expired or already used</h3>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 24, lineHeight: 1.6 }}>
              Reset links can only be used once and expire after an hour.<br />Request a new one below.
            </p>
            <a href="/" style={{ fontSize: 13.5, fontWeight: 600, color: C.teal, textDecoration: "none" }}>
              ← Back to sign in
            </a>
          </div>

        ) : !ready ? (
          <div style={{ textAlign: "center", paddingTop: 60 }}>
            <p style={{ fontSize: 13, color: C.muted }}>Verifying your link…</p>
          </div>

        ) : (
          <>
            <h3 style={{ margin: "0 0 4px", fontSize: 22, color: C.primary }}>Set a new password</h3>
            <p style={{ fontSize: 13, color: C.muted, margin: "0 0 24px" }}>Choose something you&apos;ll remember.</p>

            <form onSubmit={handleSubmit} noValidate>
              <div style={{ position: "relative", marginBottom: 10 }}>
                <input
                  type={showPw ? "text" : "password"}
                  placeholder="New password (min. 8 characters)"
                  autoComplete="new-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  style={{ paddingRight: 44 }}
                />
                <button type="button" onClick={() => setShowPw(v => !v)} style={{
                  position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 12, color: C.light, fontWeight: 500, padding: 0,
                }}>
                  {showPw ? "Hide" : "Show"}
                </button>
              </div>

              <div style={{ marginBottom: 18 }}>
                <input
                  type={showPw ? "text" : "password"}
                  placeholder="Confirm new password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                />
              </div>

              {error && (
                <div style={{ fontSize: 12.5, color: C.error, background: "#fdf0ef", padding: "8px 12px", borderRadius: 7, marginBottom: 12 }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: "100%", padding: "14px", borderRadius: 12, border: "none",
                  background: C.primary, color: "#fff", fontSize: 15, fontWeight: 600,
                  cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? "Updating…" : "Update password"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
