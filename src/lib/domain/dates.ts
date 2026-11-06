/**
 * Calendar dates as "YYYY-MM-DD" strings in Asia/Riyadh. Day of week:
 * 0 = Sunday ... 6 = Saturday (same as Postgres extract(dow)).
 */

export type IsoDate = string;

/** Today's date in Riyadh, whatever the device's time zone. */
export function riyadhToday(now: Date = new Date()): IsoDate {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function toUtc(d: IsoDate): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

function fromUtc(dt: Date): IsoDate {
  return dt.toISOString().slice(0, 10);
}

export function addDays(d: IsoDate, n: number): IsoDate {
  const dt = toUtc(d);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fromUtc(dt);
}

export function dow(d: IsoDate): number {
  return toUtc(d).getUTCDay();
}

export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / 86400000);
}

export function range(from: IsoDate, to: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function startOfMonth(d: IsoDate): IsoDate {
  return `${d.slice(0, 7)}-01`;
}

export function addMonths(d: IsoDate, n: number): IsoDate {
  const dt = toUtc(d);
  const day = dt.getUTCDate();
  dt.setUTCDate(1);
  dt.setUTCMonth(dt.getUTCMonth() + n);
  const last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(day, last));
  return fromUtc(dt);
}

/** 6 rows x 7 columns for a month view, weeks starting on Sunday. Days outside the month are null. */
export function monthGrid(month: IsoDate): (IsoDate | null)[] {
  const first = startOfMonth(month);
  const lead = dow(first);
  const daysIn = new Date(Date.UTC(Number(first.slice(0, 4)), Number(first.slice(5, 7)), 0)).getUTCDate();
  const cells: (IsoDate | null)[] = Array(lead).fill(null);
  for (let i = 0; i < daysIn; i++) cells.push(addDays(first, i));
  while (cells.length % 7) cells.push(null);
  return cells;
}

export interface RecurringPattern {
  start: IsoDate;
  end: IsoDate;
  days: number[]; // weekdays wanted
  exclude: IsoDate[];
  include?: IsoDate[]; // extra single dates
}

/** Every date the pattern produces, minus exclusions and anything `allowed` rejects. */
export function expandPattern(p: RecurringPattern, allowed: (d: IsoDate) => boolean = () => true): IsoDate[] {
  const ex = new Set(p.exclude);
  const out = new Set<IsoDate>();
  if (p.start <= p.end) {
    for (const d of range(p.start, p.end)) {
      if (p.days.includes(dow(d)) && !ex.has(d) && allowed(d)) out.add(d);
    }
  }
  for (const d of p.include ?? []) if (!ex.has(d) && allowed(d)) out.add(d);
  return [...out].sort();
}

export function formatDate(d: IsoDate, locale: "ar" | "en", style: "short" | "medium" | "long" | "weekday" = "medium"): string {
  const opts: Intl.DateTimeFormatOptions =
    style === "short"
      ? { day: "numeric", month: "short" }
      : style === "weekday"
        ? { weekday: "short", day: "numeric", month: "short" }
        : style === "long"
          ? { weekday: "long", day: "numeric", month: "long", year: "numeric" }
          : { day: "numeric", month: "short", year: "numeric" };
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory-nu-arab" : "en-GB", { ...opts, timeZone: "UTC" }).format(toUtc(d));
}

export function formatMonth(d: IsoDate, locale: "ar" | "en"): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory-nu-arab" : "en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(toUtc(d));
}

export function weekdayNames(locale: "ar" | "en", style: "short" | "long" = "short"): string[] {
  // 2026-11-01 is a Sunday
  return Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { weekday: style, timeZone: "UTC" }).format(toUtc(addDays("2026-11-01", i))),
  );
}

/** Minutes after midnight -> "06:45" (en) or "٦:٤٥ ص" (ar). */
export function formatTime(min: number | null | undefined, locale: "ar" | "en"): string {
  if (min == null) return "—";
  const dt = new Date(Date.UTC(2026, 0, 1, Math.floor(min / 60), min % 60));
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-arab" : "en-GB", {
    hour: "numeric",
    minute: "2-digit",
    hour12: locale === "ar",
    timeZone: "UTC",
  }).format(dt);
}

/** "06:45" -> 405 */
export function parseTime(v: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 24 || mi > 59) return null;
  return h * 60 + mi;
}

export function timeInput(min: number | null | undefined): string {
  if (min == null) return "";
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/** Time left until an ISO timestamp, as h/m. */
export function timeLeft(iso: string | null | undefined, now = Date.now()): { ms: number; h: number; m: number; s: number } {
  const ms = iso ? new Date(iso).getTime() - now : 0;
  const clamped = Math.max(0, ms);
  return { ms, h: Math.floor(clamped / 3600000), m: Math.floor((clamped % 3600000) / 60000), s: Math.floor((clamped % 60000) / 1000) };
}
