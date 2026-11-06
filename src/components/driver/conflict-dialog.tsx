"use client";

import { Alert, Dialog } from "@/components/form";
import type { ConflictReport } from "@/lib/data";
import { formatDate } from "@/lib/domain/dates";
import { num, t } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { AppMessages } from "@/lib/messages/app.en";

/**
 * What a schedule change would break, and the safe ways forward:
 * keep things as they are, or start the change after the affected bookings.
 * For days off, the alternative is cancelling those trips with a full refund.
 */
export function ConflictDialog({
  m,
  locale,
  report,
  onClose,
  onApplyFrom,
  onCancelTrips,
  busy,
}: {
  m: AppMessages;
  locale: Locale;
  report: ConflictReport | null;
  onClose: () => void;
  onApplyFrom?: (date: string) => void;
  onCancelTrips?: () => void;
  busy?: boolean;
}) {
  const S = m.ops.svc;
  const list = (items: ConflictReport["confirmed"]) => (
    <ul className="mt-2 space-y-2">
      {items.map((c) => (
        <li key={c.bookingId} className="rounded-xl border border-[var(--line)] p-3 text-sm">
          <p className="font-semibold">
            <bdi dir="ltr">{c.code}</bdi> · {c.parentName} · {(c.children ?? []).join(locale === "ar" ? "، " : ", ")}
          </p>
          <p className="mt-0.5 text-muted">
            {t(S.datesCount, { n: num(c.count, locale) })}: {c.dates.slice(0, 6).map((d) => formatDate(d, locale, "short")).join(locale === "ar" ? "، " : ", ")}
            {c.dates.length > 6 ? "…" : ""}
          </p>
        </li>
      ))}
    </ul>
  );
  return (
    <Dialog open={!!report} onClose={onClose} title={onCancelTrips ? m.ops.sch.cancelTripsTitle : S.conflictTitle} closeLabel={m.common.close} wide>
      {report ? (
        <div className="space-y-5">
          <p className="text-sm text-muted">{onCancelTrips ? m.ops.sch.cancelTripsText : S.conflictText}</p>
          {report.confirmed.length ? (
            <div>
              <h3 className="text-sm font-semibold">{S.confirmedList}</h3>
              {list(report.confirmed)}
            </div>
          ) : null}
          {report.pending.length ? (
            <div>
              <h3 className="text-sm font-semibold">{S.pendingList}</h3>
              {list(report.pending)}
            </div>
          ) : null}
          <div className="flex flex-col gap-3 border-t border-[var(--line)] pt-5 sm:flex-row sm:flex-wrap sm:justify-end">
            <button type="button" onClick={onClose} className="min-h-12 rounded-full border border-[var(--line)] px-5 font-medium hover:border-brand-400">
              {S.keep}
            </button>
            {onApplyFrom ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => onApplyFrom(report.earliestDate)}
                className="min-h-12 rounded-full bg-brand-500 px-5 font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
              >
                {t(S.applyFrom, { date: formatDate(report.earliestDate, locale, "medium") })}
              </button>
            ) : null}
            {onCancelTrips ? (
              <button type="button" disabled={busy} onClick={onCancelTrips} className="min-h-12 rounded-full bg-red-600 px-5 font-semibold text-white hover:bg-red-700 disabled:opacity-60">
                {m.ops.sch.cancelTrips}
              </button>
            ) : null}
          </div>
          {onApplyFrom ? <Alert tone="info">{S.applyFromText}</Alert> : null}
        </div>
      ) : null}
    </Dialog>
  );
}

/** A schedule_conflict error carries its report as JSON in the detail. */
export function conflictFrom(e: unknown): ConflictReport | null {
  if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "schedule_conflict") {
    try {
      return JSON.parse((e as { detail?: string }).detail ?? "") as ConflictReport;
    } catch {
      return null;
    }
  }
  return null;
}
