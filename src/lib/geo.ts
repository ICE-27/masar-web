/**
 * Maps and places, all on free OpenStreetMap services (no API key):
 *   - search:  Photon (komoot), built for type-ahead search
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

export const osmGeocoder: Geocoder = {
  async search(query, locale, signal) {
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
    const data = (await res.json()) as {
      features: {
        geometry: { coordinates: [number, number] };
        properties: Record<string, string | undefined>;
      }[];
    };
    const seen = new Set<string>();
    return data.features
      .map((f, i) => {
        const p = f.properties;
        const title = p.name || [p.street, p.housenumber].filter(Boolean).join(" ") || p.district || p.city || "";
        const subtitle = [p.district ?? p.locality, p.city ?? p.county, p.state]
          .filter((x) => x && x !== title)
          .join(locale === "ar" ? "، " : ", ");
        return {
          id: `${p.osm_type ?? ""}${p.osm_id ?? i}`,
          title,
          subtitle,
          lng: f.geometry.coordinates[0],
          lat: f.geometry.coordinates[1],
        };
      })
      .filter((r) => {
        const key = `${r.title}|${r.subtitle}`;
        if (!r.title || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
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
