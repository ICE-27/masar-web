"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/form";

export type { MapCircle, MapMarker, MapRoute } from "./route-map";

export const RouteMap = dynamic(() => import("./route-map"), {
  ssr: false,
  loading: () => <Skeleton className="h-full min-h-48 w-full rounded-2xl" />,
});

export function useIsDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const read = () => setDark(el.classList.contains("dark"));
    read();
    const mo = new MutationObserver(read);
    mo.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  return dark;
}

/** A tiny drawing of a route for result cards (no map tiles needed). */
export function RouteSketch({
  path,
  home,
  className,
  label,
}: {
  path: [number, number][];
  home?: { lat: number; lng: number } | null;
  className?: string;
  label?: string;
}) {
  const pts = [...path, ...(home ? [[home.lat, home.lng] as [number, number]] : [])];
  if (pts.length < 2) return null;
  const lats = pts.map((p) => p[0]);
  const lngs = pts.map((p) => p[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const w = 120;
  const h = 72;
  const pad = 10;
  const sx = (maxLng - minLng) || 0.001;
  const sy = (maxLat - minLat) || 0.001;
  const s = Math.min((w - 2 * pad) / sx, (h - 2 * pad) / sy);
  const ox = (w - sx * s) / 2;
  const oy = (h - sy * s) / 2;
  const xy = (p: [number, number]) => [ox + (p[1] - minLng) * s, h - (oy + (p[0] - minLat) * s)] as const;
  const d = path.map((p, i) => `${i ? "L" : "M"}${xy(p)[0].toFixed(1)},${xy(p)[1].toFixed(1)}`).join(" ");
  const [ex, ey] = xy(path[path.length - 1]);
  const [sx0, sy0] = xy(path[0]);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} role="img" aria-label={label}>
      <rect width={w} height={h} rx="12" className="fill-[var(--page-subtle)]" />
      <path d={d} fill="none" stroke="#009767" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={sx0} cy={sy0} r="4" fill="#009767" />
      <circle cx={ex} cy={ey} r="5.5" fill="#00704d" stroke="#fff" strokeWidth="2" />
      {home ? <circle cx={xy([home.lat, home.lng])[0]} cy={xy([home.lat, home.lng])[1]} r="4.5" fill="#f0b94f" stroke="#00301f" strokeWidth="1.5" /> : null}
    </svg>
  );
}
