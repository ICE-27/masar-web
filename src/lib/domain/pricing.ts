/**
 * The Masar money model. Mirrors public.calc_price in the database exactly,
 * so what the parent sees while choosing is what they are charged.
 *
 *   line    = booked days x rate x units  (+ days x attendant fee, whole bus)
 *   discount: more than t1 booked days -> t1%, more than t2 days -> t2%
 *   driver  = line - discount             (the driver gets 100% of this)
 *   VAT     = vatBp of the driver price   (+ VAT on the fee, if switched on)
 *   fee     = feeBp of the driver price   (Masar's 10%, added on top)
 *   total   = driver + VAT + fee
 */
import type { Halalas } from "./money";

export type ServiceType = "shared_car" | "exclusive_car" | "shared_bus" | "whole_bus";
export type Legs = "both" | "outbound" | "return";

export interface PricingSettings {
  vatBp: number;
  feeBp: number;
  vatOnFee: boolean;
  t1Days: number;
  t2Days: number;
}

export const DEFAULT_SETTINGS: PricingSettings = { vatBp: 1500, feeBp: 1000, vatOnFee: false, t1Days: 10, t2Days: 20 };

export interface PriceLines {
  lineH: Halalas;
  discountPct: number;
  discountH: Halalas;
  driverH: Halalas;
  vatBp: number;
  vatH: Halalas;
  feeBp: number;
  feeH: Halalas;
  totalH: Halalas;
}

/** Postgres round(): half away from zero. All our amounts are positive. */
const round = (x: number) => Math.round(x);

export function discountPctFor(days: number, t1Pct: number, t2Pct: number, s: PricingSettings = DEFAULT_SETTINGS): number {
  if (days > s.t2Days && t2Pct > 0) return t2Pct;
  if (days > s.t1Days && t1Pct > 0) return t1Pct;
  return 0;
}

export function calcPrice(
  args: { rateH: Halalas; units: number; days: number; attendantFeeH?: Halalas; t1Pct: number; t2Pct: number },
  s: PricingSettings = DEFAULT_SETTINGS,
): PriceLines {
  const line = args.days * args.rateH * args.units + args.days * (args.attendantFeeH ?? 0);
  const pctOff = discountPctFor(args.days, args.t1Pct, args.t2Pct, s);
  const disc = round((line * pctOff) / 100);
  const drv = line - disc;
  const fee = round((drv * s.feeBp) / 10000);
  const vat = round((drv * s.vatBp) / 10000) + (s.vatOnFee ? round((fee * s.vatBp) / 10000) : 0);
  return { lineH: line, discountPct: pctOff, discountH: disc, driverH: drv, vatBp: s.vatBp, vatH: vat, feeBp: s.feeBp, feeH: fee, totalH: drv + vat + fee };
}

export function isExclusive(t: ServiceType): boolean {
  return t === "exclusive_car" || t === "whole_bus";
}

export function typesForVehicle(v: "car" | "bus"): ServiceType[] {
  return v === "car" ? ["shared_car", "exclusive_car"] : ["shared_bus", "whole_bus"];
}

/** One-way trips default to 60% of the daily (two-trip) charge. */
export function defaultOneWay(dailyH: Halalas): Halalas {
  return Math.round(dailyH * 0.6);
}

export interface PriceRow {
  serviceType: ServiceType;
  dailyH: Halalas;
  oneWayH: Halalas | null;
  perTripH?: Halalas | null;
  maxChildren?: number | null;
  attendantAvailable?: boolean;
  attendantFeeH?: Halalas;
}

/** Rate per unit per day for the parent's district (base + surcharge). */
export function rateFor(row: PriceRow, legs: Legs, surchargeH: Halalas): Halalas {
  const base = legs === "both" ? row.dailyH : (row.oneWayH ?? defaultOneWay(row.dailyH));
  return base + surchargeH;
}

/** What the parent is charged for one booking, from the published prices. */
export function quoteFor(
  row: PriceRow,
  opts: { legs: Legs; surchargeH: Halalas; children: number; days: number; attendant: boolean; t1Pct: number; t2Pct: number },
  s: PricingSettings = DEFAULT_SETTINGS,
): PriceLines & { rateH: Halalas; units: number; attendantFeeH: Halalas } {
  const units = isExclusive(row.serviceType) ? 1 : opts.children;
  const rateH = rateFor(row, opts.legs, opts.surchargeH);
  const attendantFeeH = row.serviceType === "whole_bus" && opts.attendant ? (row.attendantFeeH ?? 0) : 0;
  return { ...calcPrice({ rateH, units, days: opts.days, attendantFeeH, t1Pct: opts.t1Pct, t2Pct: opts.t2Pct }, s), rateH, units, attendantFeeH };
}
