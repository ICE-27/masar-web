"use client";

import { cn } from "@/components/ui";
import type { PriceBreakdown } from "@/lib/data";
import { formatSar, pct } from "@/lib/domain/money";
import { isExclusive, type ServiceType } from "@/lib/domain/pricing";
import { num, t } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { AppMessages } from "@/lib/messages/app.en";

/**
 * The itemised price, always in the same order (brief §8):
 * children · daily charge for the district · days x rate x children ·
 * discount · driver's price · VAT · Masar fee · total.
 */
export function PriceTable({
  m,
  locale,
  serviceType,
  districtName,
  baseRateH,
  surchargeH,
  rateH,
  units,
  childrenCount,
  days,
  attendantFeeH,
  price,
  showDriverLine,
  className,
}: {
  m: AppMessages;
  locale: Locale;
  serviceType: ServiceType;
  districtName: string | null;
  baseRateH: number;
  surchargeH: number;
  rateH: number;
  units: number;
  childrenCount: number;
  days: number;
  attendantFeeH: number;
  price: PriceBreakdown;
  showDriverLine?: boolean;
  className?: string;
}) {
  const P = m.ops.price;
  const sar = (h: number) => formatSar(h, locale, { compact: false });
  const exclusive = isExclusive(serviceType);
  const rows: { label: string; value: string; strong?: boolean; minus?: boolean; muted?: boolean }[] = [
    {
      label: P.children,
      value: exclusive ? `${num(childrenCount, locale)} · ${P.vehicle}` : t(P.childrenEach, { n: num(childrenCount, locale) }),
    },
    {
      label: districtName ? t(P.dailyCharge, { district: districtName }) : P.dailyChargeNoDistrict,
      value:
        surchargeH > 0
          ? `${t(P.surcharge, { base: sar(baseRateH), extra: sar(surchargeH) })} = ${t(exclusive ? P.perVehicle : P.perChild, { amount: sar(rateH) })}`
          : t(exclusive ? P.perVehicle : P.perChild, { amount: sar(rateH) }),
    },
    {
      label: exclusive ? P.daysLineVehicle : P.daysLine,
      value: exclusive
        ? t(P.daysValueVehicle, { days: num(days, locale), rate: sar(rateH), total: sar(days * rateH * units) })
        : t(P.daysValue, { days: num(days, locale), rate: sar(rateH), units: num(units, locale), total: sar(days * rateH * units) }),
    },
  ];
  if (attendantFeeH > 0) rows.push({ label: t(P.attendant, { days: num(days, locale), fee: sar(attendantFeeH) }), value: `+ ${sar(days * attendantFeeH)}` });
  rows.push(
    price.discountPct > 0
      ? { label: t(P.discount, { days: num(days, locale), pct: num(price.discountPct, locale) }), value: `− ${sar(price.discountH)}`, minus: true }
      : { label: P.noDiscount, value: "—", muted: true },
  );
  rows.push({ label: P.driverPrice, value: sar(price.driverH), strong: true });
  rows.push({ label: t(P.vat, { pct: pct(price.vatBp, locale) }), value: `+ ${sar(price.vatH)}` });
  rows.push({ label: t(P.fee, { pct: pct(price.feeBp, locale) }), value: `+ ${sar(price.feeH)}` });

  return (
    <div className={cn("overflow-hidden rounded-2xl border border-[var(--line)]", className)}>
      <table className="w-full text-sm">
        <caption className="sr-only">{P.title}</caption>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={cn("border-b border-[var(--line)]", r.strong && "bg-[var(--page-subtle)]")}>
              <th scope="row" className={cn("px-4 py-2.5 text-start font-normal", r.strong ? "font-semibold" : "text-muted")}>
                {r.label}
              </th>
              <td className={cn("px-4 py-2.5 text-end tabular-nums", r.strong && "font-semibold", r.minus && "text-brand-600 dark:text-brand-300", r.muted && "text-muted")}>
                <bdi>{r.value}</bdi>
              </td>
            </tr>
          ))}
          <tr className="bg-brand-50 dark:bg-brand-900/30">
            <th scope="row" className="px-4 py-3 text-start text-base font-bold">
              {P.total}
            </th>
            <td className="px-4 py-3 text-end text-base font-bold tabular-nums text-brand-700 dark:text-brand-200">
              <bdi>{sar(price.totalH)}</bdi>
            </td>
          </tr>
          {showDriverLine ? (
            <tr>
              <th scope="row" className="px-4 py-2 text-start text-xs font-normal text-muted">
                {P.driverGets}
              </th>
              <td className="px-4 py-2 text-end text-xs tabular-nums text-muted">
                <bdi>{sar(price.driverH)}</bdi>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
