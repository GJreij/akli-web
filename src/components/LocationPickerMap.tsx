"use client";

import { useMemo } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Default marker icons ship as separate image files that webpack doesn't resolve
// automatically for Leaflet — point at the CDN copies instead of bundling them.
const markerIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function ClickToMove({ onMove }: { onMove: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) { onMove(e.latlng.lat, e.latlng.lng); },
  });
  return null;
}

export default function LocationPickerMap({ lat, lng, onChange }: {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
}) {
  const center = useMemo<[number, number]>(() => [lat, lng], [lat, lng]);

  return (
    <MapContainer
      center={center}
      zoom={16}
      style={{ width: "100%", height: 260, borderRadius: 12 }}
      attributionControl={true}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      <Marker
        position={center}
        icon={markerIcon}
        draggable
        eventHandlers={{
          dragend(e) {
            const pos = e.target.getLatLng();
            onChange(pos.lat, pos.lng);
          },
        }}
      />
      <ClickToMove onMove={onChange} />
    </MapContainer>
  );
}
