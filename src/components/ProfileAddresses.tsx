"use client";

import { useState } from "react";
import { IconMapPin, IconPlus, IconTrash, IconStar, IconStarFilled } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import AddressForm from "@/components/AddressForm";
import type { Database } from "@/lib/supabase/types";

type AddressRow = Database["public"]["Tables"]["user_delivery_address"]["Row"];

const C = {
  tealDark: "#437b7b",
  muted:    "#5c5c5c",
  light:    "#9a9a9a",
  border:   "#e0dbd5",
  white:    "#ffffff",
  error:    "#c0392b",
};

export default function ProfileAddresses({ userId, initialAddresses }: {
  userId: string;
  initialAddresses: AddressRow[];
}) {
  const [addresses, setAddresses] = useState<AddressRow[]>(initialAddresses);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function makeDefault(id: number) {
    setBusyId(id);
    setErr(null);
    try {
      const supabase = createClient();
      await (supabase.from("user_delivery_address") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
        .update({ is_default: false }).eq("user_id", userId).eq("is_default", true);
      const { error } = await (supabase.from("user_delivery_address") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
        .update({ is_default: true }).eq("id", id);
      if (error) throw new Error(error.message);
      setAddresses(prev => prev.map(a => ({ ...a, is_default: a.id === id })));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not update default address.");
    } finally { setBusyId(null); }
  }

  async function remove(id: number) {
    if (!window.confirm("Remove this delivery address?")) return;
    setBusyId(id);
    setErr(null);
    try {
      const supabase = createClient();
      const removed = addresses.find(a => a.id === id);
      const { error } = await supabase.from("user_delivery_address").delete().eq("id", id).eq("user_id", userId);
      if (error) throw new Error(error.message);

      const remaining = addresses.filter(a => a.id !== id);
      if (removed?.is_default && remaining.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("user_delivery_address") as any).update({ is_default: true }).eq("id", remaining[0].id);
        setAddresses(remaining.map((a, i) => ({ ...a, is_default: i === 0 })));
      } else {
        setAddresses(remaining);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not remove address.");
    } finally { setBusyId(null); }
  }

  return (
    <div>
      {addresses.length === 0 && !adding && (
        <p style={{ fontSize: 13, color: C.light, margin: "0 0 14px" }}>
          No saved delivery addresses yet.
        </p>
      )}

      {addresses.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          {addresses.map(a => (
            <div key={a.id} style={{
              display: "flex", alignItems: "flex-start", gap: 10,
              padding: "11px 12px", borderRadius: 10, border: `1px solid ${C.border}`,
              opacity: busyId === a.id ? 0.5 : 1,
            }}>
              <button
                onClick={() => !a.is_default && makeDefault(a.id)}
                disabled={busyId === a.id || a.is_default}
                title={a.is_default ? "Default address" : "Set as default"}
                style={{ flexShrink: 0, background: "none", border: "none", padding: 2, color: a.is_default ? "#caa15a" : C.light, cursor: a.is_default ? "default" : "pointer", display: "flex" }}
              >
                {a.is_default ? <IconStarFilled size={16} /> : <IconStar size={16} />}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                  <IconMapPin size={13} color={C.light} />
                  {a.label || "Address"} {a.is_default && <span style={{ fontSize: 10.5, color: C.tealDark, fontWeight: 500 }}>· Default</span>}
                </p>
                <p style={{ margin: 0, fontSize: 12.5, color: C.muted }}>{a.address_text}</p>
                {a.lat != null && a.lng != null && (
                  <a href={`https://maps.google.com/?q=${a.lat},${a.lng}`} target="_blank" rel="noreferrer"
                    style={{ fontSize: 11, color: C.tealDark, textDecoration: "underline" }}>
                    View pinned location
                  </a>
                )}
              </div>
              <button
                onClick={() => remove(a.id)}
                disabled={busyId === a.id}
                title="Remove address"
                style={{ flexShrink: 0, background: "none", border: "none", padding: 4, color: C.light, cursor: "pointer", display: "flex" }}
              >
                <IconTrash size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      {err && <p style={{ fontSize: 11.5, color: C.error, margin: "0 0 10px" }}>{err}</p>}

      {!adding ? (
        <button onClick={() => setAdding(true)} style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "none", border: "none", padding: 0, color: C.tealDark, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
        }}>
          <IconPlus size={14} /> Add new address
        </button>
      ) : (
        <AddressForm
          userId={userId}
          existingCount={addresses.length}
          onCancel={() => setAdding(false)}
          onSaved={(a) => {
            setAddresses(prev => [a, ...(a.is_default ? prev.map(p => ({ ...p, is_default: false })) : prev)]);
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}
