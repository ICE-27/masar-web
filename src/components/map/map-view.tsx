"use client";

/**
 * The Leaflet map itself. Loaded only in the browser (see map-picker.tsx),
 * because Leaflet touches window on import.
 */
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import { Circle, MapContainer, Marker, useMap, useMapEvents } from "react-leaflet";
import { BaseLayerTiles, LayerToggle, type BaseLayer } from "./base-layers";
import type { LatLng } from "@/lib/geo";
import { DEFAULT_CENTER } from "@/lib/geo";

// The Masar pin, as a map marker
const pinIcon = L.divIcon({
  className: "masar-pin",
  html: `<svg viewBox="0 0 64 80" width="44" height="55" aria-hidden="true">
    <ellipse cx="32" cy="76" rx="10" ry="3" fill="rgb(0 0 0 / .25)"/>
    <path d="M32 3C20.4 3 11 12.4 11 24c0 14.9 18.1 34.3 18.9 35.1a2.9 2.9 0 0 0 4.2 0C34.9 58.3 53 38.9 53 24 53 12.4 43.6 3 32 3Z" fill="#009767" stroke="#fff" stroke-width="2.5"/>
    <circle cx="32" cy="24" r="8" fill="#fff"/>
    <circle cx="32" cy="24" r="4" fill="#f0b94f"/>
  </svg>`,
  iconSize: [44, 55],
  iconAnchor: [22, 52],
});

function ClickToPlace({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

/** Fly to the point whenever `focusKey` changes (detect, search result). */
function FlyTo({ point, focusKey }: { point: LatLng | null; focusKey: number }) {
  const map = useMap();
  const last = useRef(focusKey);
  useEffect(() => {
    if (!point || focusKey === last.current) return;
    last.current = focusKey;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    map.flyTo([point.lat, point.lng], Math.max(map.getZoom(), 17), { duration: reduce ? 0 : 0.8 });
  }, [focusKey, point, map]);
  return null;
}

/** Leaflet needs a nudge when its container changes size (dialogs, steps). */
function KeepSized() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);
  return null;
}

export default function MapView({
  point,
  accuracy,
  focusKey,
  onPick,
  dark,
  label,
  attribution,
}: {
  point: LatLng | null;
  accuracy: number | null;
  focusKey: number;
  onPick: (p: LatLng) => void;
  dark: boolean;
  label: string;
  attribution: string;
}) {
  const initial = useMemo(() => point ?? DEFAULT_CENTER, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [layer, setLayer] = useState<BaseLayer>("map");
  return (
    <div dir="ltr" className="relative h-full w-full" role="application" aria-label={label}>
      <LayerToggle value={layer} onChange={setLayer} />
      <MapContainer
        center={[initial.lat, initial.lng]}
        zoom={point ? 17 : 11}
        className="masar-map h-full w-full"
        attributionControl
        zoomControl
      >
        <BaseLayerTiles layer={layer} dark={dark} attribution={attribution} />
        <ClickToPlace onPick={onPick} />
        <FlyTo point={point} focusKey={focusKey} />
        <KeepSized />
        {point && accuracy && accuracy > 15 && accuracy < 2000 ? (
          <Circle
            center={[point.lat, point.lng]}
            radius={accuracy}
            pathOptions={{ color: "#009767", weight: 1, fillColor: "#009767", fillOpacity: 0.08 }}
          />
        ) : null}
        {point ? (
          <Marker
            position={[point.lat, point.lng]}
            icon={pinIcon}
            draggable
            autoPan
            eventHandlers={{
              dragend(e) {
                const ll = (e.target as L.Marker).getLatLng();
                onPick({ lat: ll.lat, lng: ll.lng });
              },
            }}
          />
        ) : null}
      </MapContainer>
    </div>
  );
}
