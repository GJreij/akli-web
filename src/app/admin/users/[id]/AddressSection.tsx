"use client";

import { useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { setDeliveryFeeOverride, estimateDeliveryDistance } from "./actions";
import { KITCHEN_LOCATION } from "@/lib/constants";

const TwoPointMap = dynamic(() => import("@/components/TwoPointMap"), {
  ssr: false,
  loading: () => <div style={{ width: "100%", height: 260, borderRadius: 12, background: "#eee9e6" }} />,
});

const C = {
  primary: "#063330", tealDark: "#437b7b", muted: "#5c5c5c", light: "#9a9a9a",
  border: "#e0dbd5", white: "#ffffff", offWhite: "#eee9e6", warn: "#b8860b", error: "#c0392b",
};

type OverrideInfo = { fee_per_day: number; note: string | null };
type AddressRow = {
  id: number; label: string | null; is_default: boolean; address_text: string;
  lat: number | null; lng: number | null;
};
type Estimate = { distance_km: number; duration_min: number | null; mode: "routing" | "straight_line" };

function AddressRowEditor({ userId, address, override, defaultFee }: {
  userId: string; address: AddressRow; override: OverrideInfo | null; defaultFee: number;
}) {
  const [expanded, setExpanded]   = useState(false);
  const [pin, setPin]             = useState<{ lat: number; lng: number }>({
    lat: address.lat ?? KITCHEN_LOCATION.lat, lng: address.lng ?? KITCHEN_LOCATION.lng,
  });
  const [feeInput, setFeeInput]   = useState(override ? String(override.fee_per_day) : "");
  const [estimate, setEstimate]   = useState<Estimate | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [err, setErr]             = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const effectiveFee = override?.fee_per_day ?? defaultFee;

  async function runEstimate() {
    setEstimating(true);
    try { setEstimate(await estimateDeliveryDistance(pin.lat, pin.lng)); }
    catch { setEstimate(null); }
    finally { setEstimating(false); }
  }

  function saveOverride() {
    setErr(null);
    const fee = feeInput.trim() === "" ? null : Number(feeInput);
    if (fee !== null && (Number.isNaN(fee) || fee < 0)) { setErr("Enter a valid fee."); return; }
    startTransition(async () => {
      try { await setDeliveryFeeOverride({ addressId: address.id, userId, fee }); }
      catch (e) { setErr(e instanceof Error ? e.message : "Could not save fee."); }
    });
  }

  function clearOverride() {
    setErr(null); setFeeInput("");
    startTransition(async () => {
      try { await setDeliveryFeeOverride({ addressId: address.id, userId, fee: null }); }
      catch (e) { setErr(e instanceof Error ? e.message : "Could not clear override."); }
    });
  }

  return (
    <div style={{ padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 6 }}>
        <div style={{ fontSize: 13 }}>
          <strong>{address.label ?? "Address"}</strong>{address.is_default ? " (default)" : ""}
          <br /><span style={{ color: C.muted }}>{address.address_text}</span>
        </div>
        <button onClick={() => setExpanded(e => !e)} style={{ fontSize: 11.5, color: C.tealDark, background: "none", border: "none", cursor: "pointer", flexShrink: 0, padding: 0 }}>
          {expanded ? "Close" : "Edit delivery fee"}
        </button>
      </div>

      <span style={{ fontSize: 12.5, color: C.muted }}>
        Charged:{" "}
        <strong style={{ color: override ? C.warn : C.primary }}>${effectiveFee}</strong>
        {override ? <span style={{ color: C.light }}> (override)</span> : <span style={{ color: C.light }}> (default)</span>}
      </span>

      {err && <p style={{ fontSize: 11.5, color: C.error, margin: "6px 0 0" }}>{err}</p>}

      {expanded && (
        <div style={{ marginTop: 12, background: C.offWhite, borderRadius: 10, padding: 12 }}>
          {(address.lat == null || address.lng == null) && (
            <p style={{ fontSize: 11.5, color: C.light, margin: "0 0 8px" }}>
              This address has no pinned location — drag the marker below to roughly where it is before estimating.
            </p>
          )}
          <TwoPointMap
            kitchen={KITCHEN_LOCATION}
            address={pin}
            onAddressMove={(lat, lng) => { setPin({ lat, lng }); setEstimate(null); }}
          />
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
            <button onClick={runEstimate} disabled={estimating} style={{ padding: "7px 12px", fontSize: 12, borderRadius: 7, border: `1px solid ${C.border}`, background: C.white, cursor: "pointer" }}>
              {estimating ? "Estimating…" : "Get distance estimate"}
            </button>
            {estimate && (
              <span style={{ fontSize: 12, color: C.muted }}>
                ~{estimate.distance_km} km{estimate.duration_min != null ? `, ${estimate.duration_min} min` : ""}
                {estimate.mode === "straight_line" && <span style={{ color: C.light }}> (straight-line estimate — routing unavailable)</span>}
              </span>
            )}
          </div>
          <p style={{ fontSize: 11, color: C.light, margin: "6px 0 0" }}>
            Advisory only — it doesn&apos;t save anything. Type the actual fee below and confirm it yourself.
          </p>

          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12.5, color: C.muted }}>$</span>
            <input
              type="text" inputMode="decimal" placeholder={String(defaultFee)}
              value={feeInput} onChange={e => setFeeInput(e.target.value.replace(/[^0-9.]/g, ""))}
              style={{ width: 80, padding: "7px 8px", fontSize: 13, borderRadius: 7, border: `1px solid ${C.border}` }}
            />
            <button onClick={saveOverride} disabled={pending} style={{ padding: "7px 12px", fontSize: 12, borderRadius: 7, border: "none", background: C.primary, color: C.white, cursor: "pointer" }}>
              {pending ? "Saving…" : "Set fee"}
            </button>
            {override && (
              <button onClick={clearOverride} disabled={pending} style={{ padding: "7px 12px", fontSize: 12, borderRadius: 7, border: `1px solid ${C.border}`, background: "none", color: C.muted, cursor: "pointer" }}>
                Clear override
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AddressSection({ userId, addresses, overridesByAddressId, defaultFee }: {
  userId: string;
  addresses: AddressRow[];
  overridesByAddressId: Record<number, OverrideInfo>;
  defaultFee: number;
}) {
  if (addresses.length === 0) {
    return <p style={{ fontSize: 13, color: C.light, margin: 0 }}>No saved addresses.</p>;
  }
  return (
    <div>
      {addresses.map(a => (
        <AddressRowEditor key={a.id} userId={userId} address={a} override={overridesByAddressId[a.id] ?? null} defaultFee={defaultFee} />
      ))}
    </div>
  );
}
