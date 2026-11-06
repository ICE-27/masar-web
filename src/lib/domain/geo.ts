/**
 * Route geometry and the matching engine. pathProject mirrors
 * public.path_project in the database (same projection, same answers).
 * A path is an array of [lat, lng] points.
 */
import type { LatLng } from "@/lib/geo";

export type Path = [number, number][];

export function distanceM(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const s =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function pathLengthM(path: Path): number {
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    total += distanceM({ lat: path[i][0], lng: path[i][1] }, { lat: path[i + 1][0], lng: path[i + 1][1] });
  }
  return total;
}

export interface Projection {
  distanceM: number | null;
  alongM: number;
  totalM: number;
}

export function pathProject(path: Path, p: LatLng): Projection {
  const n = path.length;
  const kx = 111320 * Math.cos((p.lat * Math.PI) / 180);
  const ky = 110540;
  const px = p.lng * kx;
  const py = p.lat * ky;
  if (n === 0) return { distanceM: null, alongM: 0, totalM: 0 };
  if (n === 1) {
    const ax = path[0][1] * kx;
    const ay = path[0][0] * ky;
    return { distanceM: Math.round(Math.hypot(ax - px, ay - py)), alongM: 0, totalM: 0 };
  }
  let best: number | null = null;
  let bestAlong = 0;
  let acc = 0;
  for (let i = 0; i < n - 1; i++) {
    const ax = path[i][1] * kx;
    const ay = path[i][0] * ky;
    const bx = path[i + 1][1] * kx;
    const by = path[i + 1][0] * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const seg = Math.hypot(dx, dy);
    const t = seg === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (seg * seg)));
    const d = Math.hypot(ax + t * dx - px, ay + t * dy - py);
    if (best === null || d < best) {
      best = d;
      bestAlong = acc + t * seg;
    }
    acc += seg;
  }
  return { distanceM: Math.round(best!), alongM: Math.round(bestAlong), totalM: Math.round(acc) };
}

export interface District {
  id: string;
  city: string;
  nameEn: string;
  nameAr: string;
  lat: number;
  lng: number;
}

/** Same rule as public.resolve_district: a name match nearby, else the nearest centre within 6 km. */
export function resolveDistrict(districts: District[], p: LatLng, name?: string | null): District | null {
  const byDist = (a: District, b: District) => distanceM(p, a) - distanceM(p, b);
  const n = (name ?? "").trim();
  if (n.length > 2) {
    const lower = n.toLowerCase();
    const hit = districts
      .filter(
        (d) =>
          (d.nameEn.toLowerCase().includes(lower) ||
            lower.includes(d.nameEn.replaceAll("Al ", "").toLowerCase()) ||
            d.nameAr === n ||
            n.includes(d.nameAr)) &&
          distanceM(p, d) < 15000,
      )
      .sort(byDist)[0];
    if (hit) return hit;
  }
  return districts.filter((d) => distanceM(p, d) < 6000).sort(byDist)[0] ?? null;
}

/** Average speed used to turn extra distance into minutes (30 km/h in town). */
export const METRES_PER_MIN = 500;
