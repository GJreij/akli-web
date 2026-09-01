"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ALLERGENS, type AllergenKey, type AllergenFlags } from "@/lib/allergens";

const C = {
  primary: "#063330", tealDark: "#437b7b", muted: "#5c5c5c", light: "#9a9a9a",
  border: "#e0dbd5", white: "#ffffff", error: "#c0392b",
};

export default function AdminAllergensEditor({ userId, initialFlags }: {
  userId: string;
  initialFlags: AllergenFlags;
}) {
  const [editing, setEditing] = useState(false);
  const [flags, setFlags] = useState<Record<AllergenKey, boolean>>(() =>
    Object.fromEntries(ALLERGENS.map(a => [a.key, !!initialFlags[a.key]])) as Record<AllergenKey, boolean>
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const selectedLabels = ALLERGENS.filter(a => flags[a.key]).map(a => a.label);

  async function save() {
    setSaving(true); setErr(null);
    try {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("user") as any).update({ ...flags }).eq("id", userId);
      if (error) throw new Error(error.message);
      setEditing(false);
      setSaved(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save changes.");
    } finally { setSaving(false); }
  }

  if (!editing) {
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <p style={{ margin: 0, fontSize: 13, color: selectedLabels.length ? "#1a1a1a" : C.light }}>
            {selectedLabels.length ? selectedLabels.join(", ") : "None set"}
          </p>
          <button
            onClick={() => { setEditing(true); setSaved(false); }}
            style={{ flexShrink: 0, background: "none", border: "none", padding: 0, color: C.tealDark, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
          >
            Edit
          </button>
        </div>
        {saved && <p style={{ margin: "4px 0 0", fontSize: 11.5, color: C.tealDark }}>Saved</p>}
      </div>
    );
  }

  return (
    <div>
      <p style={{ fontSize: 11.5, color: C.light, margin: "0 0 10px" }}>
        Meals containing one of these will show a warning during ordering — optional, doesn&apos;t block anything.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 12 }}>
        {ALLERGENS.map(a => {
          const selected = flags[a.key];
          return (
            <button
              key={a.key}
              type="button"
              onClick={() => setFlags(f => ({ ...f, [a.key]: !f[a.key] }))}
              style={{
                padding: "6px 12px", borderRadius: 16,
                border: `1.5px solid ${selected ? C.tealDark : C.border}`,
                background: selected ? "#f0f7f7" : C.white,
                color: selected ? C.tealDark : "#1a1a1a",
                fontSize: 12.5, fontWeight: selected ? 600 : 500, cursor: "pointer",
              }}
            >
              {a.label}
            </button>
          );
        })}
      </div>
      {err && <p style={{ fontSize: 11.5, color: C.error, margin: "0 0 8px" }}>{err}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={save}
          disabled={saving}
          style={{ background: C.primary, color: C.white, border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 12.5, fontWeight: 600, cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1 }}
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button
          onClick={() => setEditing(false)}
          disabled={saving}
          style={{ background: "none", color: C.muted, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 16px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
