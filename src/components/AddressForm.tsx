"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { IconMapPin } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

type AddressRow = Database["public"]["Tables"]["user_delivery_address"]["Row"];

const LocationPickerMap = dynamic(() => import("@/components/LocationPickerMap"), {
  ssr: false,
  loading: () => (
    <div style={{ width: "100%", height: 260, borderRadius: 12, background: "#eee9e6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, color: "#9a9a9a" }}>
      Loading map…
    </div>
  ),
});

// Beirut — default map center when we don't yet know the user's location
const DEFAULT_MAP_CENTER = { lat: 33.8938, lng: 35.5018 };

const C = {
  primary:  "#063330",
  teal:     "#67b1b0",
  tealDark: "#437b7b",
  offWhite: "#eee9e6",
  muted:    "#5c5c5c",
  light:    "#9a9a9a",
  border:   "#e0dbd5",
  white:    "#ffffff",
  error:    "#c0392b",
};

export default function AddressForm({ userId, existingCount, onSaved, onCancel }: {
  userId: string;
  existingCount: number;
  onSaved: (address: AddressRow) => void;
  onCancel?: () => void;
}) {
  const [label, setLabel]     = useState("");
  const [text, setText]       = useState("");
  const [pin, setPin]         = useState<{ lat: number; lng: number } | null>(null);
  const [pinning, setPinning] = useState(false);
  const [pinErr, setPinErr]   = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [makeDefault, setMakeDefault] = useState(existingCount === 0);
  const [saving, setSaving]   = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching]     = useState(false);
  const [searchErr, setSearchErr]     = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<{ lat: string; lon: string; display_name: string }[]>([]);

  async function reverseGeocode(lat: number, lng: number) {
    setGeocoding(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
        { headers: { Accept: "application/json" } }
      );
      if (!res.ok) return;
      const data = await res.json();
      if (data?.display_name) setText(data.display_name as string);
    } catch {
      // silent — reverse geocoding is a convenience, not required to save the address
    } finally { setGeocoding(false); }
  }

  function placePin(lat: number, lng: number) {
    setPin({ lat, lng });
    reverseGeocode(lat, lng);
  }

  async function runSearch(query: string) {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=lb&q=${encodeURIComponent(query)}`,
      { headers: { Accept: "application/json" } }
    );
    return res.ok ? await res.json() : [];
  }

  async function searchAddress() {
    const q = searchQuery.trim();
    if (!q) return;
    setSearching(true);
    setSearchErr(null);
    setSearchResults([]);
    try {
      let results = await runSearch(q);
      // Lebanese towns are often missing/mistyped in OSM — retry with the country
      // name appended, which helps Nominatim's fuzzy matching find a result.
      if (!results?.length && !/lebanon/i.test(q)) {
        results = await runSearch(`${q}, Lebanon`);
      }
      if (!results?.length) {
        setSearchErr("Couldn't find that place on the map. No problem — just type the address in the box above.");
        return;
      }
      setSearchResults(results);
    } catch {
      setSearchErr("Couldn't search right now. No problem — just type the address in the box above.");
    } finally { setSearching(false); }
  }

  function pickSearchResult(r: { lat: string; lon: string; display_name: string }) {
    setMapOpen(true);
    setPin({ lat: Number(r.lat), lng: Number(r.lon) });
    setText(r.display_name);
    setSearchResults([]);
    setSearchQuery("");
  }

  function pinMyLocation() {
    if (!navigator.geolocation) { setPinErr("Location isn't available on this device — just type your address above instead."); return; }
    if (!window.isSecureContext) {
      setPinErr("Location only works over HTTPS (or localhost) — just type your address above instead.");
      return;
    }
    setPinning(true);
    setPinErr(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => { placePin(pos.coords.latitude, pos.coords.longitude); setPinning(false); },
      (err) => {
        const messages: Record<number, string> = {
          1: "Location is blocked for this site. Check your phone's location settings — both the device-wide location toggle and the per-site/per-browser permission for this app — and make sure it's allowed. Then come back and try again, or just type your address above.",
          2: "Your device couldn't determine a location right now. Try again, ideally outdoors or near a window — or just type your address above.",
          3: "Getting your location took too long. Try again, or just type your address above.",
        };
        setPinErr(messages[err.code] ?? `Couldn't get your location (${err.message || "unknown error"}). Just type your address above instead.`);
        setPinning(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  async function save() {
    if (!text.trim()) return;
    setSaving(true);
    setSaveErr(null);
    try {
      const supabase = createClient();
      if (makeDefault) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("user_delivery_address") as any).update({ is_default: false }).eq("user_id", userId).eq("is_default", true);
      }
      const { data, error } = await (supabase.from("user_delivery_address") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
        .insert({
          user_id: userId,
          label: label.trim() || null,
          address_text: text.trim(),
          lat: pin?.lat ?? null,
          lng: pin?.lng ?? null,
          is_default: makeDefault || existingCount === 0,
        }).select().single();
      if (error || !data) throw new Error(error?.message ?? "Could not save address.");
      onSaved(data as AddressRow);
      setLabel(""); setText(""); setPin(null); setMakeDefault(false); setMapOpen(false);
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Could not save address.");
    } finally { setSaving(false); }
  }

  return (
    <div>
      <input type="text" placeholder="Label (e.g. Home, Office)" value={label}
        onChange={e => setLabel(e.target.value)} style={{ marginBottom: 4 }} />
      <p style={{ fontSize: 11, color: C.light, margin: "0 0 8px" }}>Optional — helps you tell addresses apart later.</p>
      <textarea rows={2} placeholder="Building, street, area" value={text}
        onChange={e => setText(e.target.value)} style={{ resize: "none", marginBottom: 4 }} />
      <p style={{ fontSize: 11, color: C.light, margin: "0 0 10px" }}>
        This is what we&apos;ll use to deliver — the map below is just an optional way to pin it more precisely.
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={pinMyLocation} disabled={pinning} style={{
          display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 9,
          border: `1px solid ${pin ? C.tealDark : C.border}`, background: pin ? "#f0f7f7" : C.white,
          fontSize: 12.5, color: pin ? C.tealDark : C.muted, cursor: "pointer",
        }}>
          <IconMapPin size={14} />
          {pinning ? "Pinning…" : pin ? "Location pinned ✓" : "Use my current location"}
        </button>
        <button type="button" onClick={() => { setMapOpen(o => !o); if (!pin) setPin(DEFAULT_MAP_CENTER); }} style={{
          display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 9,
          border: `1px solid ${mapOpen ? C.tealDark : C.border}`, background: mapOpen ? "#f0f7f7" : C.white,
          fontSize: 12.5, color: mapOpen ? C.tealDark : C.muted, cursor: "pointer",
        }}>
          <IconMapPin size={14} />
          {mapOpen ? "Hide map" : "Pin on map"}
        </button>
        {pin && !mapOpen && (
          <a href={`https://maps.google.com/?q=${pin.lat},${pin.lng}`} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: C.tealDark, textDecoration: "underline" }}>
            View on map
          </a>
        )}
      </div>
      {pinErr && <p style={{ fontSize: 11.5, color: C.error, margin: "0 0 8px" }}>{pinErr}</p>}

      {mapOpen && pin && (
        // isolation:isolate contains Leaflet's internal z-indexes inside this box, so the
        // map can never visually float above page chrome like a fixed checkout footer.
        <div style={{ marginBottom: 10, position: "relative", isolation: "isolate" }}>
          <p style={{ fontSize: 11.5, color: C.muted, margin: "0 0 6px" }}>
            Drag the pin (or tap anywhere on the map) to move it — e.g. set it to your home even if you&apos;re ordering from somewhere else.
          </p>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <input type="text" placeholder="Search for a place (e.g. Dekwaneh, Sin el Fil)" value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && (e.preventDefault(), searchAddress())}
              style={{ flex: 1, fontSize: 12.5, padding: "8px 10px" }} />
            <button type="button" onClick={searchAddress} disabled={searching || !searchQuery.trim()}
              style={{ padding: "8px 12px", fontSize: 12.5, flexShrink: 0 }}>
              {searching ? "…" : "Search"}
            </button>
          </div>
          {searchErr && <p style={{ fontSize: 11.5, color: C.error, margin: "0 0 8px" }}>{searchErr}</p>}
          {searchResults.length > 0 && (
            <div style={{ marginBottom: 8, border: `1px solid ${C.border}`, borderRadius: 9, overflow: "hidden" }}>
              {searchResults.map((r, i) => (
                <button
                  key={`${r.lat}-${r.lon}`}
                  type="button"
                  onClick={() => pickSearchResult(r)}
                  style={{
                    display: "block", width: "100%", textAlign: "left", padding: "9px 11px",
                    fontSize: 12, fontWeight: 400, border: "none", borderRadius: 0,
                    borderBottom: i < searchResults.length - 1 ? `1px solid ${C.border}` : "none",
                    background: C.white, color: C.muted,
                  }}
                >
                  {r.display_name}
                </button>
              ))}
            </div>
          )}
          <LocationPickerMap
            lat={pin.lat}
            lng={pin.lng}
            onChange={placePin}
          />
        </div>
      )}
      {geocoding && <p style={{ fontSize: 11.5, color: C.muted, margin: "0 0 8px" }}>Looking up the address for that pin…</p>}

      <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: C.muted, marginBottom: 10, cursor: "pointer" }}>
        <input type="checkbox" checked={makeDefault} onChange={e => setMakeDefault(e.target.checked)} disabled={existingCount === 0} />
        Set as default address
      </label>

      {saveErr && <p style={{ fontSize: 11.5, color: C.error, margin: "0 0 8px" }}>{saveErr}</p>}

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={save} disabled={saving || !text.trim()} style={{ flex: 1, padding: "9px 0", fontSize: 13 }}>
          {saving ? "Saving…" : "Save address"}
        </button>
        {onCancel && existingCount > 0 && (
          <button onClick={onCancel} style={{ padding: "9px 14px", fontSize: 13, background: "none", border: `1px solid ${C.border}` }}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
