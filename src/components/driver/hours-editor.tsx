"use client";

import { IconPlus, IconTrash } from "@/components/icons";
import { Switch } from "@/components/ops/bits";
import { cn } from "@/components/ui";
import type { HoursRow } from "@/lib/data";
import { parseTime, timeInput, weekdayNames } from "@/lib/domain/dates";
import type { Locale } from "@/lib/i18n";
import type { AppMessages } from "@/lib/messages/app.en";

export const PRESETS = {
  schoolMornings: [[360, 480]],
  schoolAfternoons: [[750, 930]],
  both: [[360, 480], [750, 930]],
  evenings: [[945, 1230]],
} as const;

const SCHOOL_WEEK = [0, 1, 2, 3, 4];

export function hoursProblems(rows: HoursRow[]): number[] {
  const bad = new Set<number>();
  for (let d = 0; d < 7; d++) {
    const r = rows.filter((x) => x.dow === d).sort((a, b) => a.startMin - b.startMin);
    r.forEach((x, i) => {
      if (x.endMin <= x.startMin) bad.add(d);
      if (i > 0 && x.startMin < r[i - 1].endMin) bad.add(d);
    });
  }
  return [...bad];
}

/** Weekly working hours: each day on or off, with one or more time ranges. */
export function HoursEditor({ m, locale, value, onChange }: { m: AppMessages; locale: Locale; value: HoursRow[]; onChange: (v: HoursRow[]) => void }) {
  const H = m.ops.dw.hours;
  const names = weekdayNames(locale, "long");
  const bad = hoursProblems(value);

  const setDay = (d: number, rows: HoursRow[]) => onChange([...value.filter((x) => x.dow !== d), ...rows].sort((a, b) => a.dow - b.dow || a.startMin - b.startMin));
  const preset = (ranges: readonly (readonly [number, number])[]) =>
    onChange(SCHOOL_WEEK.flatMap((d) => ranges.map(([s, e]) => ({ dow: d, startMin: s, endMin: e }))));
  const copySunday = () => {
    const sun = value.filter((x) => x.dow === 0);
    onChange([...value.filter((x) => !SCHOOL_WEEK.includes(x.dow) || x.dow === 0), ...[1, 2, 3, 4].flatMap((d) => sun.map((r) => ({ ...r, dow: d })))].sort((a, b) => a.dow - b.dow || a.startMin - b.startMin));
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-muted">{H.presets}:</span>
        {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((k) => (
          <button key={k} type="button" onClick={() => preset(PRESETS[k])} className="min-h-10 rounded-full border border-[var(--line)] px-3.5 text-sm hover:border-brand-400">
            {H[k]}
          </button>
        ))}
        <button type="button" onClick={copySunday} className="min-h-10 rounded-full px-3.5 text-sm font-medium text-brand-600 underline underline-offset-4 dark:text-brand-300">
          {H.copySunday}
        </button>
      </div>
      <ul className="divide-y divide-[var(--line)] rounded-2xl border border-[var(--line)]">
        {names.map((name, d) => {
          const rows = value.filter((x) => x.dow === d).sort((a, b) => a.startMin - b.startMin);
          const on = rows.length > 0;
          return (
            <li key={d} className={cn("flex flex-col gap-3 p-3 sm:flex-row sm:items-start sm:p-4", bad.includes(d) && "bg-red-50/60 dark:bg-red-950/20")}>
              <div className="flex w-full items-center justify-between gap-3 sm:w-44 sm:shrink-0 sm:pt-2">
                <span className="font-medium">{name}</span>
                <Switch
                  checked={on}
                  label={`${name}: ${on ? H.on : H.off}`}
                  onChange={(v) => setDay(d, v ? [{ dow: d, startMin: 360, endMin: 480 }] : [])}
                />
              </div>
              {on ? (
                <div className="flex flex-1 flex-col gap-2">
                  {rows.map((r, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <label className="sr-only" htmlFor={`h-${d}-${i}-s`}>{H.fromTime}</label>
                      <input
                        id={`h-${d}-${i}-s`}
                        type="time"
                        step={300}
                        value={timeInput(r.startMin)}
                        onChange={(e) => {
                          const v = parseTime(e.target.value);
                          if (v == null) return;
                          setDay(d, rows.map((x, j) => (j === i ? { ...x, startMin: v } : x)));
                        }}
                        className="min-h-11 rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 text-sm"
                      />
                      <span className="text-muted">–</span>
                      <label className="sr-only" htmlFor={`h-${d}-${i}-e`}>{H.toTime}</label>
                      <input
                        id={`h-${d}-${i}-e`}
                        type="time"
                        step={300}
                        value={timeInput(r.endMin)}
                        onChange={(e) => {
                          const v = parseTime(e.target.value);
                          if (v == null) return;
                          setDay(d, rows.map((x, j) => (j === i ? { ...x, endMin: v === 0 ? 1440 : v } : x)));
                        }}
                        className="min-h-11 rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 text-sm"
                      />
                      <button
                        type="button"
                        aria-label={H.remove}
                        onClick={() => setDay(d, rows.filter((_, j) => j !== i))}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                      >
                        <IconTrash width={18} height={18} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      const last = rows[rows.length - 1];
                      const s = Math.min(1380, (last?.endMin ?? 720) + 60);
                      setDay(d, [...rows, { dow: d, startMin: s, endMin: Math.min(1440, s + 120) }]);
                    }}
                    className="inline-flex min-h-10 w-fit items-center gap-1.5 rounded-full px-2 text-sm font-medium text-brand-600 dark:text-brand-300"
                  >
                    <IconPlus width={16} height={16} /> {H.addRange}
                  </button>
                </div>
              ) : (
                <span className="text-sm text-muted sm:pt-2">{H.off}</span>
              )}
            </li>
          );
        })}
      </ul>
      {bad.length ? <p role="alert" className="mt-2 text-sm font-medium text-red-600 dark:text-red-400">{H.overlap}</p> : null}
    </div>
  );
}
