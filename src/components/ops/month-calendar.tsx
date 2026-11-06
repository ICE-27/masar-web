"use client";

import type { ReactNode } from "react";
import { IconChevron } from "@/components/icons";
import { cn } from "@/components/ui";
import { addMonths, formatMonth, monthGrid, startOfMonth, weekdayNames, type IsoDate } from "@/lib/domain/dates";
import type { Locale } from "@/lib/i18n";

/**
 * A month grid. Each date renders through `cell`; tapping calls `onPick`.
 * Weeks start on Sunday (the Saudi school week).
 */
export function MonthCalendar({
  month,
  onMonth,
  locale,
  cell,
  onPick,
  isDisabled,
  minMonth,
  maxMonth,
  prevLabel,
  nextLabel,
  className,
}: {
  month: IsoDate;
  onMonth: (m: IsoDate) => void;
  locale: Locale;
  cell: (d: IsoDate) => { className?: string; label?: ReactNode; ariaLabel?: string; pressed?: boolean };
  onPick?: (d: IsoDate) => void;
  isDisabled?: (d: IsoDate) => boolean;
  minMonth?: IsoDate;
  maxMonth?: IsoDate;
  prevLabel: string;
  nextLabel: string;
  className?: string;
}) {
  const first = startOfMonth(month);
  const names = weekdayNames(locale, "short");
  const canPrev = !minMonth || first > startOfMonth(minMonth);
  const canNext = !maxMonth || first < startOfMonth(maxMonth);
  return (
    <div className={cn("w-full", className)}>
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          disabled={!canPrev}
          onClick={() => onMonth(addMonths(first, -1))}
          aria-label={prevLabel}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-[var(--page-subtle)] disabled:opacity-30"
        >
          <IconChevron width={18} height={18} className="rotate-180 rtl:rotate-0" />
        </button>
        <p className="font-semibold" aria-live="polite">{formatMonth(first, locale)}</p>
        <button
          type="button"
          disabled={!canNext}
          onClick={() => onMonth(addMonths(first, 1))}
          aria-label={nextLabel}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-[var(--page-subtle)] disabled:opacity-30"
        >
          <IconChevron width={18} height={18} className="rtl:rotate-180" />
        </button>
      </div>
      <div role="grid" className="grid grid-cols-7 gap-1 text-center">
        {names.map((n) => (
          <div key={n} role="columnheader" className="pb-1 text-[0.7rem] font-semibold text-muted">
            {n}
          </div>
        ))}
        {monthGrid(first).map((d, i) => {
          if (!d) return <div key={`x${i}`} />;
          const c = cell(d);
          const disabled = isDisabled?.(d) ?? false;
          const day = new Intl.NumberFormat(locale === "ar" ? "ar-SA-u-nu-arab" : "en-US").format(Number(d.slice(8)));
          return onPick ? (
            <button
              key={d}
              type="button"
              role="gridcell"
              disabled={disabled}
              aria-selected={c.pressed}
              aria-label={c.ariaLabel}
              onClick={() => onPick(d)}
              className={cn(
                "relative flex min-h-11 flex-col items-center justify-center rounded-xl text-sm transition-colors focus-visible:ring-4 focus-visible:ring-brand-500/30 disabled:cursor-not-allowed",
                c.className,
              )}
            >
              <span>{day}</span>
              {c.label ? <span className="text-[0.6rem] leading-tight">{c.label}</span> : null}
            </button>
          ) : (
            <div key={d} role="gridcell" aria-label={c.ariaLabel} className={cn("flex min-h-11 flex-col items-center justify-center rounded-xl text-sm", c.className)}>
              <span>{day}</span>
              {c.label ? <span className="text-[0.6rem] leading-tight">{c.label}</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
