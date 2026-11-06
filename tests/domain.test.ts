import { describe, expect, it } from "vitest";
import { DEMO_CARDS, cardBrand, expiryInFuture, luhnValid, parseExpiry } from "@/lib/domain/cards";
import { addDays, addMonths, dow, expandPattern, monthGrid, parseTime, riyadhToday } from "@/lib/domain/dates";
import { pathProject, resolveDistrict, type District } from "@/lib/domain/geo";
import { matchService, type MatchService } from "@/lib/domain/match";
import { formatSar, parseSar } from "@/lib/domain/money";
import { calcPrice, quoteFor, type PriceRow } from "@/lib/domain/pricing";
import { bankFromIban, ibanValid, normalizePlateLetters, plateLettersAr, validPlate } from "@/lib/domain/vehicle";

describe("the Masar money model", () => {
  it("matches the brief's worked example exactly", () => {
    // 2 children x 22 booked days x (SAR 20 + SAR 5 district surcharge)
    const p = calcPrice({ rateH: 2500, units: 2, days: 22, t1Pct: 5, t2Pct: 10 });
    expect(p.lineH).toBe(110000);
    expect(p.discountPct).toBe(10);
    expect(p.discountH).toBe(11000);
    expect(p.driverH).toBe(99000); // SAR 990 to the driver
    expect(p.vatH).toBe(14850); // SAR 148.50
    expect(p.feeH).toBe(9900); // SAR 99, added on top
    expect(p.totalH).toBe(123750); // SAR 1,237.50
  });

  it("drops to the 5% tier when Thursdays are removed below 21 booked days", () => {
    const p = calcPrice({ rateH: 2500, units: 2, days: 18, t1Pct: 5, t2Pct: 10 });
    expect(p.discountPct).toBe(5);
    expect(p.totalH).toBe(p.driverH + p.vatH + p.feeH);
  });

  it("counts 'more than' days: exactly 10 or 20 days don't earn the higher tier", () => {
    expect(calcPrice({ rateH: 2000, units: 1, days: 10, t1Pct: 5, t2Pct: 10 }).discountPct).toBe(0);
    expect(calcPrice({ rateH: 2000, units: 1, days: 11, t1Pct: 5, t2Pct: 10 }).discountPct).toBe(5);
    expect(calcPrice({ rateH: 2000, units: 1, days: 20, t1Pct: 5, t2Pct: 10 }).discountPct).toBe(5);
    expect(calcPrice({ rateH: 2000, units: 1, days: 21, t1Pct: 5, t2Pct: 10 }).discountPct).toBe(10);
  });

  it("lets a driver switch discounts off", () => {
    expect(calcPrice({ rateH: 2000, units: 2, days: 30, t1Pct: 0, t2Pct: 0 }).discountH).toBe(0);
  });

  it("can charge VAT on the Masar fee when that setting is on", () => {
    const p = calcPrice({ rateH: 2000, units: 1, days: 5, t1Pct: 5, t2Pct: 10 }, { vatBp: 1500, feeBp: 1000, vatOnFee: true, t1Days: 10, t2Days: 20 });
    expect(p.vatH).toBe(1500 + 150);
  });

  it("prices the four service types independently", () => {
    const sharedCar: PriceRow = { serviceType: "shared_car", dailyH: 2000, oneWayH: 1200 };
    const exclusiveCar: PriceRow = { serviceType: "exclusive_car", dailyH: 9000, oneWayH: 5400, maxChildren: 4 };
    const sharedBus: PriceRow = { serviceType: "shared_bus", dailyH: 1800, oneWayH: 1100 };
    const wholeBus: PriceRow = { serviceType: "whole_bus", dailyH: 65000, oneWayH: 40000, attendantAvailable: true, attendantFeeH: 8000 };
    const o = { legs: "both" as const, surchargeH: 0, children: 3, days: 5, attendant: true, t1Pct: 5, t2Pct: 10 };
    expect(quoteFor(sharedCar, o).lineH).toBe(5 * 2000 * 3); // per child
    expect(quoteFor(exclusiveCar, o).lineH).toBe(5 * 9000); // whole car
    expect(quoteFor(sharedBus, o).lineH).toBe(5 * 1800 * 3);
    expect(quoteFor(wholeBus, o).lineH).toBe(5 * 65000 + 5 * 8000); // + attendant fee line
    expect(quoteFor(wholeBus, { ...o, attendant: false }).lineH).toBe(5 * 65000);
  });

  it("uses the one-way price (default 60%) for single-leg bookings, plus the district surcharge", () => {
    expect(quoteFor({ serviceType: "shared_car", dailyH: 2000, oneWayH: null }, { legs: "outbound", surchargeH: 500, children: 1, days: 1, attendant: false, t1Pct: 5, t2Pct: 10 }).rateH).toBe(1200 + 500);
  });
});

describe("money formatting", () => {
  it("reads amounts typed in either script", () => {
    expect(parseSar("22.5")).toBe(2250);
    expect(parseSar("٢٢٫٥")).toBe(2250);
    expect(parseSar("abc")).toBeNull();
  });
  it("formats SAR per language", () => {
    expect(formatSar(123750, "en", { compact: false })).toBe("SAR 1,237.50");
    expect(formatSar(2000, "ar")).toContain("ر.س");
  });
});

describe("dates in Riyadh", () => {
  it("knows the weekday (0 = Sunday)", () => {
    expect(dow("2026-11-08")).toBe(0);
    expect(dow("2026-11-12")).toBe(4);
  });
  it("adds days and months across month ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addMonths("2027-01-31", 1)).toBe("2027-02-28");
  });
  it("expands a weekly pattern, minus removed days", () => {
    // 2026-11-08 (Sun) .. 2026-11-28: Sun-Thu without Thursdays, minus one Tuesday
    const d = expandPattern({ start: "2026-11-08", end: "2026-11-28", days: [0, 1, 2, 3], exclude: ["2026-11-10"] });
    expect(d).toHaveLength(11);
    expect(d).not.toContain("2026-11-10");
    expect(d.every((x) => dow(x) !== 4)).toBe(true);
  });
  it("builds a Sunday-first month grid", () => {
    const g = monthGrid("2026-11-01");
    expect(g[0]).toBe("2026-11-01"); // Nov 2026 starts on a Sunday
    expect(g.length % 7).toBe(0);
  });
  it("parses times", () => {
    expect(parseTime("06:45")).toBe(405);
    expect(parseTime("bad")).toBeNull();
  });
  it("gives a Riyadh date string", () => {
    expect(riyadhToday(new Date("2026-11-06T22:30:00Z"))).toBe("2026-11-07"); // already the 7th in Riyadh
  });
});

const D: District[] = [
  { id: "khb-aqrabiyah", city: "Khobar", nameEn: "Al Aqrabiyah", nameAr: "العقربية", lat: 26.293, lng: 50.195 },
  { id: "khb-thuqbah", city: "Khobar", nameEn: "Ath Thuqbah", nameAr: "الثقبة", lat: 26.285, lng: 50.178 },
];

describe("route geometry and districts", () => {
  it("measures the distance from a home to a path (same maths as the database)", () => {
    const path: [number, number][] = [[26.285, 50.2], [26.293, 50.195], [26.285, 50.178]];
    const p = pathProject(path, { lat: 26.2925, lng: 50.1958 });
    expect(p.distanceM).toBeLessThan(80);
    expect(p.totalM).toBeGreaterThan(2000);
  });
  it("resolves a district by Arabic name or by coordinates", () => {
    expect(resolveDistrict(D, { lat: 26.294, lng: 50.194 }, "العقربية")?.id).toBe("khb-aqrabiyah");
    expect(resolveDistrict(D, { lat: 26.286, lng: 50.179 }, null)?.id).toBe("khb-thuqbah");
    expect(resolveDistrict(D, { lat: 27.5, lng: 49.0 }, null)).toBeNull();
  });
});

function service(over: Partial<MatchService> = {}): MatchService {
  const today = "2026-11-08";
  return {
    path: [[26.285, 50.2], [26.293, 50.195], [26.285, 50.178], [26.3105, 50.1315]],
    start: { lat: 26.285, lng: 50.2 },
    limits: { maxPickupM: 2000, maxDetourM: 3000, maxDetourPct: 15, maxStops: 10, maxJourneyMin: 45 },
    coverage: [{ districtId: "khb-aqrabiyah", surchargeH: 500 }],
    schedule: { days: [0, 1, 2, 3, 4], outbound: true, pickupStartMin: 380, pickupEndMin: 410, arriveMin: 425 },
    families: 2,
    accepts: "both",
    ageMin: 4,
    ageMax: 17,
    maxChildrenPerFamily: 4,
    seatsByDate: Array.from({ length: 28 }, (_, i) => ({ date: addDays(today, i), capacity: 6, taken: 2, closed: null })),
    ...over,
  };
}

describe("the matching engine", () => {
  const home = { lat: 26.2925, lng: 50.1958 };
  it("matches a home on the route, in coverage, with seats", () => {
    const r = matchService(service(), home, { districts: D, districtName: "Al Aqrabiyah", children: [{ gender: "girl", age: 9 }] });
    expect(r.status).toBe("match");
    expect(r.surchargeH).toBe(500);
    expect(r.estPickupMin).toBeGreaterThanOrEqual(380);
    expect(r.estPickupMin).toBeLessThanOrEqual(410);
  });
  it("excludes a home 3 km off the route when the driver's limit is 2 km... into the near group", () => {
    const off = { lat: 26.2925 + 0.027, lng: 50.1958 + 0.012 }; // ~3 km away
    const r = matchService(service(), off, { districts: D });
    expect(r.pickupDistanceM).toBeGreaterThan(2000);
    expect(r.status).toBe("near");
  });
  it("hides a home more than twice the limit away", () => {
    const far = { lat: 26.36, lng: 50.25 };
    expect(matchService(service(), far, { districts: D }).status).toBe("none");
  });
  it("respects seats, gender, age and stops", () => {
    expect(matchService(service({ seatsByDate: [] }), home, { districts: D }).status).toBe("none");
    expect(matchService(service({ accepts: "girls" }), home, { districts: D, children: [{ gender: "boy", age: 9 }] }).status).toBe("none");
    expect(matchService(service(), home, { districts: D, children: [{ gender: "boy", age: 2 }] }).status).toBe("none");
    expect(matchService(service({ families: 10 }), home, { districts: D }).status).toBe("none");
  });
});

describe("plates, IBANs and cards", () => {
  it("keeps only the 17 Saudi plate letters, typed in either script", () => {
    expect(normalizePlateLetters("abd")).toBe("ABD");
    expect(normalizePlateLetters("ابد")).toBe("ABD");
    expect(normalizePlateLetters("FMQ")).toBe("");
    expect(plateLettersAr("ABD")).toBe("ا ب د");
    expect(validPlate("4721", "ABD")).toBe(true);
    expect(validPlate("12345", "AB")).toBe(false);
  });
  it("checks IBAN checksums and finds the bank", () => {
    expect(ibanValid("SA03 8000 0000 6080 1016 7519")).toBe(true);
    expect(ibanValid("SA0380000000608010167518")).toBe(false);
    expect(bankFromIban("SA0380000000608010167519")?.en).toBe("Al Rajhi Bank");
  });
  it("accepts only Luhn-valid numbers and every demo card is valid", () => {
    for (const c of DEMO_CARDS) expect(luhnValid(c.number)).toBe(true);
    expect(luhnValid("4242 4242 4242 4241")).toBe(false);
    expect(cardBrand("4464 0400 0000 0007")).toBe("mada");
    expect(cardBrand("5555 5555 5555 4444")).toBe("mastercard");
  });
  it("checks expiry dates", () => {
    expect(parseExpiry("12/30")).toEqual({ month: 12, year: 2030 });
    expect(parseExpiry("13/30")).toBeNull();
    expect(expiryInFuture({ month: 1, year: 2020 })).toBe(false);
  });
});
