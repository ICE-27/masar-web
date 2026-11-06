"use client";

import { useState } from "react";
import { IconPlus, IconTrash } from "@/components/icons";
import { Switch } from "@/components/ops/bits";
import { cn } from "@/components/ui";
import type { HoursRow } from "@/lib/data";
import { parseTime, timeInput, weekdayNames } from "@/lib/domain/dates";
import { num } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { AppMessages } from "@/lib/messages/app.en";

type Range = { startMin: number; endMin: number };

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

const sortRows = (rows: HoursRow[]) => [...rows].sort((a, b) => a.dow - b.dow || a.startMin - b.startMin);
const rangesOf = (rows: HoursRow[], d: number): Range[] =>
  rows.filter((x) => x.dow === d).sort((a, b) => a.startMin - b.startMin).map(({ startMin, endMin }) => ({ startMin, endMin }));
const sameRanges = (a: Range[], b: Range[]) => a.length === b.length && a.every((x, i) => x.startMin === b[i].startMin && x.endMin === b[i].endMin);

/** Every working day has the same times. */
function isUniform(rows: HoursRow[]) {
  const days = [...new Set(rows.map((r) => r.dow))];
  if (!days.length) return true;
  const first = rangesOf(rows, days[0]);
  return days.every((d) => sameRanges(rangesOf(rows, d), first));
}

/**
 * Working hours, simple first: pick the days, then the times that apply to
 * all of them. Drivers whose days differ switch to a day-by-day view.
 */
export function HoursEditor({ m, locale, value, onChange }: { m: AppMessages; locale: Locale; value: HoursRow[]; onChange: (v: HoursRow[]) => void }) {
  const [perDay, setPerDay] = useState(() => !isUniform(value));
  return perDay ? (
    <PerDayEditor
      m={m}
      locale={locale}
      value={value}
      onChange={onChange}
      onSimple={() => {
        // Back to one schedule: use the first working day's times for every working day
        const days = [...new Set(value.map((r) => r.dow))].sort();
        const times = days.length ? rangesOf(value, days[0]) : [{ startMin: 360, endMin: 480 }];
        onChange(sortRows((days.length ? days : SCHOOL_WEEK).flatMap((d) => times.map((t) => ({ dow: d, ...t })))));
        setPerDay(false);
      }}
    />
  ) : (
    <SimpleEditor m={m} locale={locale} value={value} onChange={onChange} onPerDay={() => setPerDay(true)} />
  );
}

function SimpleEditor({ m, locale, value, onChange, onPerDay }: { m: AppMessages; locale: Locale; value: HoursRow[]; onChange: (v: HoursRow[]) => void; onPerDay: () => void }) {
  const H = m.ops.dw.hours;
  const names = weekdayNames(locale, "long");
  const days = [...new Set(value.map((r) => r.dow))].sort();
  const [times, setTimes] = useState<Range[]>(() => (days.length ? rangesOf(value, days[0]) : [{ startMin: 360, endMin: 480 }]));
  const bad = hoursProblems(times.map((t) => ({ dow: 0, ...t }))).length > 0;

  const emit = (ds: number[], ts: Range[]) => onChange(sortRows(ds.flatMap((d) => ts.map((t) => ({ dow: d, ...t })))));
  const setDays = (ds: number[]) => emit(ds, times);
  const setT = (ts: Range[]) => {
    setTimes(ts);
    emit(days, ts);
  };

  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="mb-2 font-semibold">{H.days}</legend>
        <div className="flex flex-wrap gap-2">
          {names.map((n, d) => {
            const on = days.includes(d);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                onClick={() => setDays(on ? days.filter((x) => x !== d) : [...days, d].sort())}
                className={cn("min-h-11 rounded-full border px-4 text-sm transition-colors", on ? "border-brand-500 bg-brand-500 font-semibold text-white" : "border-[var(--line)] hover:border-brand-300")}
              >
                {n}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1 font-semibold">{H.times}</legend>
        <p className="mb-3 text-sm text-muted">{H.same}</p>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-muted">{H.examples}:</span>
          {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setT(PRESETS[k].map(([s, e]) => ({ startMin: s, endMin: e })))}
              className="min-h-10 rounded-full border border-[var(--line)] px-3.5 text-sm hover:border-brand-400"
            >
              {H[k]}
            </button>
          ))}
        </div>
        <div className={cn("space-y-2 rounded-2xl border border-[var(--line)] p-3 sm:p-4", bad && "border-red-300 bg-red-50/60 dark:border-red-900 dark:bg-red-950/20")}>
          {times.map((r, i) => (
            <RangeRow
              key={i}
              m={m}
              id={`t-${i}`}
              label={times.length > 1 ? num(i + 1, locale) : null}
              value={r}
              onChange={(v) => setT(times.map((x, j) => (j === i ? v : x)))}
              onRemove={times.length > 1 ? () => setT(times.filter((_, j) => j !== i)) : undefined}
            />
          ))}
          <button
            type="button"
            onClick={() => {
              const last = times[times.length - 1];
              const s = Math.min(1380, (last?.endMin ?? 720) + 60);
              setT([...times, { startMin: s, endMin: Math.min(1440, s + 120) }]);
            }}
            className="inline-flex min-h-10 w-fit items-center gap-1.5 rounded-full px-2 text-sm font-medium text-brand-600 dark:text-brand-300"
          >
            <IconPlus width={16} height={16} /> {H.addRange}
          </button>
        </div>
        {bad ? <p role="alert" className="mt-2 text-sm font-medium text-red-600 dark:text-red-400">{H.overlap}</p> : null}
      </fieldset>

      <button type="button" onClick={onPerDay} className="text-sm font-medium text-brand-600 underline underline-offset-4 dark:text-brand-300">
        {H.perDay}
      </button>
    </div>
  );
}

function RangeRow({ m, id, label, value, onChange, onRemove }: { m: AppMessages; id: string; label: string | null; value: Range; onChange: (v: Range) => void; onRemove?: () => void }) {
  const H = m.ops.dw.hours;
  const input = "min-h-11 w-full min-w-0 rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 text-sm sm:w-auto";
  return (
    <div className="flex items-center gap-2">
      {label ? <span className="w-4 shrink-0 text-center text-xs font-semibold text-muted">{label}</span> : null}
      <div className="grid flex-1 grid-cols-2 gap-2 sm:flex sm:flex-none">
      <label className="flex min-w-0 flex-col gap-1 text-xs sm:flex-row sm:items-center sm:gap-1.5 sm:text-sm">
        <span className="text-muted">{H.fromTime}</span>
        <input
          id={`${id}-s`}
          type="time"
          step={300}
          value={timeInput(value.startMin)}
          onChange={(e) => {
            const v = parseTime(e.target.value);
            if (v != null) onChange({ ...value, startMin: v });
          }}
          className={input}
        />
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-xs sm:flex-row sm:items-center sm:gap-1.5 sm:text-sm">
        <span className="text-muted">{H.toTime}</span>
        <input
          id={`${id}-e`}
          type="time"
          step={300}
          value={timeInput(value.endMin)}
          onChange={(e) => {
            const v = parseTime(e.target.value);
            if (v != null) onChange({ ...value, endMin: v === 0 ? 1440 : v });
          }}
          className={input}
        />
      </label>
      </div>
      {onRemove ? (
        <button
          type="button"
          aria-label={H.remove}
          onClick={onRemove}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
        >
          <IconTrash width={18} height={18} />
        </button>
      ) : null}
    </div>
  );
}

/** Day by day, for drivers whose times change from one day to the next. */
function PerDayEditor({ m, locale, value, onChange, onSimple }: { m: AppMessages; locale: Locale; value: HoursRow[]; onChange: (v: HoursRow[]) => void; onSimple: () => void }) {
  const H = m.ops.dw.hours;
  const names = weekdayNames(locale, "long");
  const bad = hoursProblems(value);
  const setDay = (d: number, rows: Range[]) => onChange(sortRows([...value.filter((x) => x.dow !== d), ...rows.map((r) => ({ dow: d, ...r }))]));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">{H.perDayHint}</p>
        <button type="button" onClick={onSimple} className="text-sm font-medium text-brand-600 underline underline-offset-4 dark:text-brand-300">
          {H.same}
        </button>
      </div>
      <ul className="divide-y divide-[var(--line)] rounded-2xl border border-[var(--line)]">
        {names.map((name, d) => {
          const rows = rangesOf(value, d);
          const on = rows.length > 0;
          return (
            <li key={d} className={cn("flex flex-col gap-3 p-3 sm:flex-row sm:items-start sm:p-4", bad.includes(d) && "bg-red-50/60 dark:bg-red-950/20")}>
              <div className="flex w-full items-center justify-between gap-3 sm:w-40 sm:shrink-0 sm:pt-2">
                <span className="font-medium">{name}</span>
                <Switch checked={on} label={`${name}: ${on ? H.on : H.off}`} onChange={(v) => setDay(d, v ? [{ startMin: 360, endMin: 480 }] : [])} />
              </div>
              {on ? (
                <div className="flex flex-1 flex-col gap-2">
                  {rows.map((r, i) => (
                    <RangeRow
                      key={i}
                      m={m}
                      id={`h-${d}-${i}`}
                      label={null}
                      value={r}
                      onChange={(v) => setDay(d, rows.map((x, j) => (j === i ? v : x)))}
                      onRemove={() => setDay(d, rows.filter((_, j) => j !== i))}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      const last = rows[rows.length - 1];
                      const s = Math.min(1380, (last?.endMin ?? 720) + 60);
                      setDay(d, [...rows, { startMin: s, endMin: Math.min(1440, s + 120) }]);
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
