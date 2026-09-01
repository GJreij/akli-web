"use client";

import { useState, useTransition } from "react";
import { createGuestUser } from "@/app/admin/users/actions";

const C = {
  primary: "#063330", teal: "#67b1b0", tealDark: "#437b7b",
  muted: "#5c5c5c", light: "#9a9a9a", border: "#e0dbd5", white: "#ffffff", error: "#c0392b",
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.border}`,
  fontSize: 13, color: C.primary, background: C.white,
};

export default function NewGuestUserForm() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await createGuestUser({ name, last_name: lastName, phone_number: phone, email });
        // On success the action redirects (throws NEXT_REDIRECT) — nothing left to do here.
      } catch (err) {
        // Next's redirect() throws a special error that must be allowed to propagate.
        if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
        setError(err instanceof Error ? err.message : "Could not create this client.");
      }
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          background: C.primary, color: C.white, border: "none", borderRadius: 10,
          padding: "10px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer",
        }}
      >
        + New guest client
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: C.white, border: `1px solid ${C.border}`, borderRadius: 14,
        padding: 16, marginBottom: 16, flexBasis: "100%",
      }}
    >
      <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600, color: C.primary }}>New guest client</p>
      <p style={{ margin: "0 0 14px", fontSize: 12, color: C.light }}>
        Creates a profile with no password set — the client can&apos;t sign in until they claim
        it later. You can place orders for them right away.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <label style={{ fontSize: 12, color: C.muted, display: "flex", flexDirection: "column", gap: 4 }}>
          First name
          <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} required />
        </label>
        <label style={{ fontSize: 12, color: C.muted, display: "flex", flexDirection: "column", gap: 4 }}>
          Last name
          <input value={lastName} onChange={e => setLastName(e.target.value)} style={inputStyle} required />
        </label>
        <label style={{ fontSize: 12, color: C.muted, display: "flex", flexDirection: "column", gap: 4 }}>
          Phone
          <input value={phone} onChange={e => setPhone(e.target.value)} style={inputStyle} required />
        </label>
        <label style={{ fontSize: 12, color: C.muted, display: "flex", flexDirection: "column", gap: 4 }}>
          Email
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} required />
        </label>
      </div>

      {error && (
        <p style={{ fontSize: 12, color: C.error, background: "#fdf0ef", borderRadius: 7, padding: "8px 10px", margin: "0 0 10px" }}>
          {error}
        </p>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="submit"
          disabled={pending}
          style={{
            background: C.primary, color: C.white, border: "none", borderRadius: 8,
            padding: "9px 16px", fontSize: 12.5, fontWeight: 600, cursor: pending ? "default" : "pointer",
            opacity: pending ? 0.6 : 1,
          }}
        >
          {pending ? "Creating…" : "Create client"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          style={{
            background: "none", color: C.muted, border: `1px solid ${C.border}`, borderRadius: 8,
            padding: "9px 16px", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
