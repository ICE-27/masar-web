"use client";

/**
 * Leaflet map for routes: paths, start/stop/destination/home markers and
 * district circles. Loaded only in the browser (see route-map-lazy.tsx).
 */
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo } from "react";
import { Circle, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { DEFAULT_CENTER, type LatLng } from "@/lib/geo";

const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export interface MapRoute {
  id: string;
  path: [number, number][];
  color?: string;
  weight?: number;
  dashed?: boolean;
  onClick?: () => void;
  label?: string;
}

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  kind: "start" | "stop" | "dest" | "home" | "pin";
  label?: string;
  n?: number;
  draggable?: boolean;
  onDrag?: (p: LatLng) => void;
}

export interface MapCircle {
  id: string;
  lat: number;
  lng: number;
  radius: number;
  active?: boolean;
  label?: string;
  onClick?: () => void;
}

function icon(kind: MapMarker["kind"], n?: number) {
  const html =
    kind === "dest"
      ? `<svg viewBox="0 0 64 80" width="38" height="48" aria-hidden="true"><path d="M32 3C20.4 3 11 12.4 11 24c0 14.9 18.1 34.3 18.9 35.1a2.9 2.9 0 0 0 4.2 0C34.9 58.3 53 38.9 53 24 53 12.4 43.6 3 32 3Z" fill="#00704d" stroke="#fff" stroke-width="2.5"/><circle cx="32" cy="24" r="9" fill="#f0b94f"/></svg>`
      : kind === "home"
        ? `<svg viewBox="0 0 64 80" width="40" height="50" aria-hidden="true"><path d="M32 3C20.4 3 11 12.4 11 24c0 14.9 18.1 34.3 18.9 35.1a2.9 2.9 0 0 0 4.2 0C34.9 58.3 53 38.9 53 24 53 12.4 43.6 3 32 3Z" fill="#f0b94f" stroke="#fff" stroke-width="2.5"/><path d="M22 27l10-9 10 9v9H22z" fill="#00301f"/></svg>`
        : kind === "pin"
          ? `<svg viewBox="0 0 64 80" width="40" height="50" aria-hidden="true"><path d="M32 3C20.4 3 11 12.4 11 24c0 14.9 18.1 34.3 18.9 35.1a2.9 2.9 0 0 0 4.2 0C34.9 58.3 53 38.9 53 24 53 12.4 43.6 3 32 3Z" fill="#009767" stroke="#fff" stroke-width="2.5"/><circle cx="32" cy="24" r="8" fill="#fff"/></svg>`
          : `<span style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:999px;background:${kind === "start" ? "#009767" : "#fff"};color:${kind === "start" ? "#fff" : "#00704d"};border:3px solid #009767;font:700 12px/1 system-ui;box-shadow:0 2px 6px rgb(0 0 0/.25)">${kind === "start" ? "●" : (n ?? "")}</span>`;
  const big = kind === "dest" || kind === "home" || kind === "pin";
  return L.divIcon({
    className: "masar-pin",
    html,
    iconSize: big ? [40, 50] : [26, 26],
    iconAnchor: big ? [20, 48] : [13, 13],
  });
}

function Fit({ points, padding = 32, fitKey }: { points: [number, number][]; padding?: number; fitKey: string }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) {
      map.setView(points[0], 14);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [padding, padding], maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, map]);
  return null;
}

function Clicks({ onClick }: { onClick?: (p: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onClick?.({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

function KeepSized() {
  const map = useMap();
  useEffect(() => {
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(map.getContainer());
    return () => ro.disconnect();
  }, [map]);
  return null;
}

export default function RouteMap({
  routes = [],
  markers = [],
  circles = [],
  onMapClick,
  fitKey = "",
  label,
  dark = false,
  attribution,
  className = "h-72",
  center,
}: {
  routes?: MapRoute[];
  markers?: MapMarker[];
  circles?: MapCircle[];
  onMapClick?: (p: LatLng) => void;
  fitKey?: string;
  label: string;
  dark?: boolean;
  attribution: string;
  className?: string;
  center?: LatLng | null;
}) {
  const points = useMemo<[number, number][]>(
    () => [...routes.flatMap((r) => r.path), ...markers.map((m) => [m.lat, m.lng] as [number, number])],
    [routes, markers],
  );
  const c = center ?? DEFAULT_CENTER;
  return (
    <div dir="ltr" className={className} role="application" aria-label={label}>
      <MapContainer center={[c.lat, c.lng]} zoom={12} className="masar-map h-full w-full" attributionControl zoomControl>
        <TileLayer url={TILES} maxZoom={19} attribution={attribution} className={dark ? "masar-dark-tiles" : undefined} />
        <KeepSized />
        <Fit points={points} fitKey={fitKey} />
        <Clicks onClick={onMapClick} />
        {circles.map((ci) => (
          <Circle
            key={ci.id}
            center={[ci.lat, ci.lng]}
            radius={ci.radius}
            pathOptions={{
              color: ci.active ? "#009767" : "#94a3b8",
              weight: ci.active ? 2 : 1,
              fillColor: ci.active ? "#009767" : "#94a3b8",
              fillOpacity: ci.active ? 0.15 : 0.05,
              dashArray: ci.active ? undefined : "4 4",
            }}
            eventHandlers={ci.onClick ? { click: (e) => { L.DomEvent.stopPropagation(e); ci.onClick!(); } } : undefined}
          >
            {ci.label ? <Tooltip direction="center" permanent={false}>{ci.label}</Tooltip> : null}
          </Circle>
        ))}
        {routes.map((r) => (
          <Polyline
            key={r.id}
            positions={r.path}
            pathOptions={{ color: r.color ?? "#009767", weight: r.weight ?? 5, opacity: 0.9, dashArray: r.dashed ? "8 8" : undefined, lineCap: "round" }}
            eventHandlers={r.onClick ? { click: (e) => { L.DomEvent.stopPropagation(e); r.onClick!(); } } : undefined}
          >
            {r.label ? <Tooltip sticky>{r.label}</Tooltip> : null}
          </Polyline>
        ))}
        {markers.map((mk) => (
          <Marker
            key={mk.id}
            position={[mk.lat, mk.lng]}
            icon={icon(mk.kind, mk.n)}
            draggable={!!mk.draggable}
            eventHandlers={
              mk.onDrag
                ? {
                    dragend(e) {
                      const ll = (e.target as L.Marker).getLatLng();
                      mk.onDrag!({ lat: ll.lat, lng: ll.lng });
                    },
                  }
                : undefined
            }
          >
            {mk.label ? <Tooltip direction="top" offset={[0, -24]}>{mk.label}</Tooltip> : null}
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
