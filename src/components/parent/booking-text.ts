import { formatDate } from "@/lib/domain/dates";
import type { Locale } from "@/lib/i18n";
import type { AppMessages } from "@/lib/messages/app.en";

/** "Sun 8 Nov (full)" for a date the quote left out. */
export function reasonDateText(m: AppMessages, locale: Locale, u: { date: string; reason: string }): string {
  const labels: Record<string, string> = {
    full: m.ops.book.legend.full,
    not_running: m.ops.book.legend.off,
    leg_not_offered: m.ops.book.legend.off,
    out_of_range: m.ops.book.legend.off,
    blocked: m.ops.book.legend.off,
    unavailable: m.ops.book.legend.off,
    holiday: m.ops.book.legend.off,
  };
  return `${formatDate(u.date, locale, "weekday")} (${labels[u.reason] ?? u.reason})`;
}
