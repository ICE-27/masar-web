/**
 * Maps and places, all on free OpenStreetMap services (no API key):
 *   - search:  Photon (komoot) and Nominatim together, plus pasted coordinates
 *              and Google Maps links
 *   - reverse: Nominatim, which returns Arabic or English address parts
 * Swap in Google Maps later by implementing Geocoder again.
 */
import type { Locale } from "./i18n";
import { COVERAGE_BOUNDS } from "./validation";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface PlaceResult extends LatLng {
  id: string;
  title: string;
  subtitle: string;
}

export interface ReverseResult {
  city: string;
  district: string;
  street: string;
  buildingNo: string;
}

export interface Geocoder {
  search(query: string, locale: Locale, signal?: AbortSignal): Promise<PlaceResult[]>;
  reverse(point: LatLng, locale: Locale, signal?: AbortSignal): Promise<ReverseResult>;
}

/** Khobar corniche: the middle of the launch area. */
export const DEFAULT_CENTER: LatLng = { lat: 26.3, lng: 50.13 };

const b = COVERAGE_BOUNDS;

/**
 * Coordinates typed or pasted directly: "26.2921, 50.1953", or a Google Maps
 * link containing them (…/@26.29,50.19,17z or …?q=26.29,50.19).
 */
export function parseCoordinates(input: string): LatLng | null {
  const s = input.trim();
  const m =
    s.match(/@(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/) ||
    s.match(/[?&](?:q|query|ll|destination)=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/) ||
    s.match(/!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/) ||
    s.match(/^(-?\d{1,2}\.\d+)\s*[,،\s]\s*(-?\d{1,3}\.\d+)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

type Feature = { geometry: { coordinates: [number, number] }; properties: Record<string, string | undefined> };

async function photonSearch(query: string, locale: Locale, signal?: AbortSignal): Promise<PlaceResult[]> {
  const params = new URLSearchParams({
    q: query,
    limit: "6",
    lat: String(DEFAULT_CENTER.lat),
    lon: String(DEFAULT_CENTER.lng),
    bbox: `${b.west},${b.south},${b.east},${b.north}`,
  });
  if (locale === "en") params.set("lang", "en");
  const res = await fetch(`https://photon.komoot.io/api/?${params}`, { signal });
  if (!res.ok) throw new Error(`search ${res.status}`);
  const data = (await res.json()) as { features: Feature[] };
  return data.features.map((f, i) => {
    const p = f.properties;
    const title = p.name || [p.street, p.housenumber].filter(Boolean).join(" ") || p.district || p.city || "";
    const subtitle = [p.district ?? p.locality, p.city ?? p.county, p.state]
      .filter((x) => x && x !== title)
      .join(locale === "ar" ? "، " : ", ");
    return { id: `p${p.osm_type ?? ""}${p.osm_id ?? i}`, title, subtitle, lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] };
  });
}

async function nominatimSearch(query: string, locale: Locale, signal?: AbortSignal): Promise<PlaceResult[]> {
  const params = new URLSearchParams({
    format: "jsonv2",
    q: query,
    limit: "6",
    countrycodes: "sa",
    addressdetails: "1",
    "accept-language": locale,
    viewbox: `${b.west},${b.north},${b.east},${b.south}`,
  });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { signal });
  if (!res.ok) throw new Error(`search ${res.status}`);
  const data = (await res.json()) as { place_id: number; lat: string; lon: string; name?: string; display_name: string; address?: Record<string, string> }[];
  return data.map((r) => {
    const a = r.address ?? {};
    const title = r.name || r.display_name.split(",")[0];
    const subtitle = [a.suburb || a.neighbourhood || a.quarter, a.city || a.town || a.village, a.state]
      .filter((x) => x && x !== title)
      .join(locale === "ar" ? "، " : ", ");
    return { id: `n${r.place_id}`, title, subtitle, lat: Number(r.lat), lng: Number(r.lon) };
  });
}

export const osmGeocoder: Geocoder = {
  /** Both free OpenStreetMap search engines at once (they know different places), plus pasted coordinates or Google Maps links. */
  async search(query, locale, signal) {
    const coords = parseCoordinates(query);
    if (coords) {
      return [{ id: "coords", title: `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`, subtitle: locale === "ar" ? "إحداثيات" : "Coordinates", ...coords }];
    }
    const [ph, no] = await Promise.allSettled([photonSearch(query, locale, signal), nominatimSearch(query, locale, signal)]);
    if (ph.status === "rejected" && no.status === "rejected") throw ph.reason;
    const all = [...(no.status === "fulfilled" ? no.value : []), ...(ph.status === "fulfilled" ? ph.value : [])];
    const seen = new Set<string>();
    return all
      .filter((r) => {
        // One result per name and spot (~100 m)
        const key = `${r.title}|${r.lat.toFixed(3)},${r.lng.toFixed(3)}`;
        if (!r.title || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 8);
  },

  async reverse({ lat, lng }, locale, signal) {
    const params = new URLSearchParams({
      format: "jsonv2",
      lat: lat.toFixed(6),
      lon: lng.toFixed(6),
      zoom: "18",
      addressdetails: "1",
      "accept-language": locale,
    });
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, { signal });
    if (!res.ok) throw new Error(`reverse ${res.status}`);
    const data = (await res.json()) as { address?: Record<string, string> };
    const a = data.address ?? {};
    return {
      city: a.city || a.town || a.village || a.county || "",
      district: a.suburb || a.neighbourhood || a.quarter || a.city_district || a.residential || "",
      street: a.road || a.pedestrian || "",
      buildingNo: a.house_number || "",
    };
  },
};

export type GeoErrorCode = "denied" | "unavailable" | "timeout" | "unsupported" | "insecure";

export class GeoError extends Error {
  constructor(public code: GeoErrorCode) {
    super(code);
  }
}

/** High-accuracy browser location, with errors the UI can explain. */
export function detectLocation(): Promise<LatLng & { accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      reject(new GeoError("unsupported"));
      return;
    }
    if (!window.isSecureContext) {
      reject(new GeoError("insecure"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
        }),
      (err) => {
        reject(
          new GeoError(
            err.code === err.PERMISSION_DENIED
              ? "denied"
              : err.code === err.TIMEOUT
                ? "timeout"
                : "unavailable",
          ),
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}
