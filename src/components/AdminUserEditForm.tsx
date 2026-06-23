"use client";

import { useState, useTransition } from "react";
import { updateUserRoleStatus } from "@/app/admin/users/[id]/actions";

const C = {
  primary: "#063330", teal: "#67b1b0", muted: "#5c5c5c", border: "#e0dbd5", white: "#ffffff",
};

export default function AdminUserEditForm({
  userId, initialRole, initialStatus,
}: { userId: string; initialRole: string | null; initialStatus: string | null }) {
  const [role, setRole] = useState(initialRole ?? "client");
  const [status, setStatus] = useState(initialStatus ?? "active");
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setSaved(false);
    startTransition(async () => {
      await updateUserRoleStatus(userId, role, status);
      setSaved(true);
    });
  }

  const selectStyle: React.CSSProperties = {
    padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, color: C.primary, background: C.white,
  };

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <label style={{ fontSize: 12.5, color: C.muted, display: "flex", flexDirection: "column", gap: 4 }}>
        Role
        <select value={role} onChange={e => setRole(e.target.value)} style={selectStyle}>
          <option value="client">client</option>
          <option value="admin">admin</option>
          <option value="partner">partner</option>
        </select>
      </label>
      <label style={{ fontSize: 12.5, color: C.muted, display: "flex", flexDirection: "column", gap: 4 }}>
        Status
        <select value={status} onChange={e => setStatus(e.target.value)} style={selectStyle}>
          <option value="active">active</option>
          <option value="inactive">inactive</option>
          <option value="suspended">suspended</option>
        </select>
      </label>
      <button
        onClick={handleSave}
        disabled={pending}
        style={{
          background: C.primary, color: C.white, border: "none", borderRadius: 8,
          padding: "9px 16px", fontSize: 12.5, fontWeight: 600, cursor: pending ? "default" : "pointer",
          opacity: pending ? 0.6 : 1, alignSelf: "flex-end",
        }}
      >
        {pending ? "Saving…" : "Save"}
      </button>
      {saved && !pending && (
        <span style={{ fontSize: 12, color: C.teal, alignSelf: "flex-end", marginBottom: 9 }}>Saved</span>
      )}
    </div>
  );
}
