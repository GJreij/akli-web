"use client";

import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Same CDN-icon workaround as LocationPickerMap.tsx — webpack doesn't resolve
// Leaflet's default marker images automatically.
const addressIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// Kitchen marker is fixed (not draggable) — tinted via CSS filter so it reads
// as a different point from the draggable address marker at a glance.
const kitchenIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
  className: "two-point-map-kitchen-marker",
});

function ClickToMove({ onMove }: { onMove: (lat: number, lng: number) => void }) {
  useMapEvents({ click(e) { onMove(e.latlng.lat, e.latlng.lng); } });
  return null;
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => { map.fitBounds(points, { padding: [30, 30] }); }, [map, points]);
  return null;
}

export default function TwoPointMap({ kitchen, address, onAddressMove }: {
  kitchen: { lat: number; lng: number };
  address: { lat: number; lng: number };
  onAddressMove: (lat: number, lng: number) => void;
}) {
  const kitchenPos = useMemo<[number, number]>(() => [kitchen.lat, kitchen.lng], [kitchen.lat, kitchen.lng]);
  const addressPos = useMemo<[number, number]>(() => [address.lat, address.lng], [address.lat, address.lng]);
  const bounds = useMemo<[number, number][]>(() => [kitchenPos, addressPos], [kitchenPos, addressPos]);

  return (
    <>
      <style>{".two-point-map-kitchen-marker{filter:hue-rotate(130deg) saturate(1.4)}"}</style>
      <MapContainer
        center={addressPos}
        zoom={13}
        style={{ width: "100%", height: 260, borderRadius: 12 }}
        attributionControl={true}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <Marker position={kitchenPos} icon={kitchenIcon}>
          <Popup>Kitchen</Popup>
        </Marker>
        <Marker
          position={addressPos}
          icon={addressIcon}
          draggable
          eventHandlers={{
            dragend(e) {
              const pos = e.target.getLatLng();
              onAddressMove(pos.lat, pos.lng);
            },
          }}
        >
          <Popup>Delivery address — drag to adjust</Popup>
        </Marker>
        <Polyline positions={bounds} pathOptions={{ color: "#437b7b", weight: 2, dashArray: "6 6" }} />
        <ClickToMove onMove={onAddressMove} />
        <FitBounds points={bounds} />
      </MapContainer>
    </>
  );
}
