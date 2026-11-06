/**
 * The matching engine (brief §7): match on real geography, not district
 * names. For each service, against the family's actual pickup point:
 *   - distance from the home to the driver's path      (<= maxPickupM)
 *   - extra distance to collect this child (detour)    (<= max(maxDetourM, pct of route))
 *   - stops already on the route                       (< maxStops)
 *   - longest time on board                            (<= maxJourneyMin)
 *   - free seats on the days wanted                    (>= children)
 *   - the children's gender and ages
 * Breaking a geographic limit by up to 2x puts a service in the "slightly
 * outside their route" group (the driver may still accept); the database
 * refuses anything further.
 */
import type { District, Path } from "./geo";
import { METRES_PER_MIN, pathProject, resolveDistrict } from "./geo";
import { dow } from "./dates";
import type { LatLng } from "@/lib/geo";

export interface MatchService {
  path: Path;
  start: { lat: number; lng: number };
  limits: { maxPickupM: number; maxDetourM: number; maxDetourPct: number; maxStops: number; maxJourneyMin: number };
  coverage: { districtId: string; surchargeH: number }[];
  schedule: { days: number[]; outbound: boolean; pickupStartMin: number | null; pickupEndMin: number | null; arriveMin: number | null } | null;
  families: number;
  accepts: "boys" | "girls" | "both";
  ageMin: number;
  ageMax: number;
  maxChildrenPerFamily: number;
  seatsByDate: { date: string; capacity: number; taken: number; closed: string | null }[];
}

export interface MatchChild {
  gender: "boy" | "girl";
  age: number | null;
}

export interface MatchResult {
  status: "match" | "near" | "none";
  reasons: string[];
  pickupDistanceM: number;
  detourM: number;
  addedMin: number;
  journeyMin: number | null;
  estPickupMin: number | null;
  district: District | null;
  covered: boolean;
  surchargeH: number;
  minFreeSeats: number;
}

export function matchService(
  s: MatchService,
  pickup: LatLng,
  opts: { districts: District[]; districtName?: string | null; children?: MatchChild[]; days?: number[]; seatsNeeded?: number; maxJourneyMin?: number | null; horizonDays?: number },
): MatchResult {
  const reasons: string[] = [];
  const proj = pathProject(s.path, pickup);
  const dist = proj.distanceM ?? 1e9;
  const routeM = Math.max(proj.totalM, 1);
  const detourM = 2 * dist;
  const allowedDetour = Math.max(s.limits.maxDetourM, (routeM * s.limits.maxDetourPct) / 100);
  const addedMin = Math.round(detourM / METRES_PER_MIN);
  const journeyMin = proj.totalM ? Math.round((proj.totalM - proj.alongM + dist) / METRES_PER_MIN) : null;

  const sch = s.schedule;
  const estPickupMin =
    sch && sch.outbound && sch.pickupStartMin != null && sch.pickupEndMin != null && proj.totalM > 0
      ? sch.pickupStartMin + Math.round((proj.alongM / proj.totalM) * (sch.pickupEndMin - sch.pickupStartMin))
      : null;

  const district = resolveDistrict(opts.districts, pickup, opts.districtName);
  const cov = district ? s.coverage.find((c) => c.districtId === district.id) : undefined;
  const covered = !!cov;

  // Seats: the fewest free seats over the coming running days the family wants
  const wanted = opts.days?.length ? opts.days : sch?.days ?? [];
  const horizon = s.seatsByDate.slice(0, opts.horizonDays ?? 28).filter((d) => wanted.includes(dow(d.date)) && !d.closed && d.capacity > 0);
  const minFree = horizon.length ? Math.min(...horizon.map((d) => d.capacity - d.taken)) : 0;
  const need = opts.seatsNeeded ?? Math.max(1, opts.children?.length ?? 1);

  let hard = false;
  let soft = false;
  if (dist > s.limits.maxPickupM) {
    reasons.push("distance");
    soft = true;
  }
  if (detourM > allowedDetour) {
    reasons.push("detour");
    soft = true;
  }
  if (dist > 2 * s.limits.maxPickupM) hard = true;
  if (!covered) {
    reasons.push("coverage");
    soft = true;
  }
  if (s.families >= s.limits.maxStops) {
    reasons.push("stops");
    hard = true;
  }
  const maxJourney = Math.min(s.limits.maxJourneyMin, opts.maxJourneyMin ?? Infinity);
  if (journeyMin != null && journeyMin > maxJourney) {
    reasons.push("journey");
    if (journeyMin > maxJourney * 1.5) hard = true;
    else soft = true;
  }
  if (opts.days?.length && sch && !opts.days.every((d) => sch.days.includes(d))) {
    reasons.push("days");
    hard = true;
  }
  if (minFree < need) {
    reasons.push("seats");
    hard = true;
  }
  for (const c of opts.children ?? []) {
    if ((s.accepts === "boys" && c.gender === "girl") || (s.accepts === "girls" && c.gender === "boy")) {
      reasons.push("gender");
      hard = true;
    }
    if (c.age != null && (c.age < s.ageMin || c.age > s.ageMax)) {
      reasons.push("age");
      hard = true;
    }
  }
  if ((opts.children?.length ?? 0) > s.maxChildrenPerFamily) {
    reasons.push("family");
    hard = true;
  }
  return {
    status: hard ? "none" : soft ? "near" : "match",
    reasons,
    pickupDistanceM: dist,
    detourM,
    addedMin,
    journeyMin,
    estPickupMin,
    district,
    covered,
    surchargeH: cov?.surchargeH ?? 0,
    minFreeSeats: Math.max(0, minFree),
  };
}
