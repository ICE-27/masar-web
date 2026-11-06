"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { Alert, Dialog, Field, Input, Select, SubmitButton } from "@/components/form";
import { IconTrash } from "@/components/icons";
import { MonthCalendar } from "@/components/ops/month-calendar";
import { ErrorNote, LoadingBlocks, PageTitle, Panel, SwitchRow, useLoad } from "@/components/ops/bits";
import { cn } from "@/components/ui";
import type { CalendarDay, ConflictReport, HoursRow } from "@/lib/data";
import { addDays, addMonths, formatDate, riyadhToday, startOfMonth } from "@/lib/domain/dates";
import { errorText, num, t } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { AppMessages } from "@/lib/messages/app.en";
import { ConflictDialog, conflictFrom } from "./conflict-dialog";
import { HoursEditor, hoursProblems } from "./hours-editor";

export function ScheduleSection({ m, locale }: { m: AppMessages; locale: Locale }) {
  const S = m.ops.sch;
  const { backend } = useAuth();
  const app = useLoad(() => backend.driverApplication(), [backend]);
  if (app.error) return <ErrorNote m={m} error={app.error} />;
  if (!app.data) return <LoadingBlocks />;
  const approved = app.data.driver.status === "approved";
  return (
    <>
      <PageTitle title={S.title} subtitle={S.subtitle} />
      <div className="space-y-6">
        <HoursPanel m={m} locale={locale} initial={app.data.hours} future={app.data.futureHours} approved={approved} onSaved={app.reload} />
        {approved ? <DaysOffPanel m={m} locale={locale} /> : null}
        {approved ? <CalendarPanel m={m} locale={locale} /> : null}
      </div>
    </>
  );
}

function HoursPanel({ m, locale, initial, future, approved, onSaved }: { m: AppMessages; locale: Locale; initial: HoursRow[]; future: (HoursRow & { validFrom: string })[]; approved: boolean; onSaved: () => void }) {
  const S = m.ops.sch;
  const { backend } = useAuth();
  const [hours, setHours] = useState<HoursRow[]>(initial);
  const tomorrow = addDays(riyadhToday(), 1);
  const [from, setFrom] = useState(tomorrow);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ConflictReport | null>(null);

  async function save(applyFrom = from) {
    setError(null);
    setNotice(null);
    if (hoursProblems(hours).length) {
      setError(m.ops.dw.hours.overlap);
      return;
    }
    setBusy(true);
    try {
      await backend.saveHours(hours, approved ? applyFrom : null);
      setConflict(null);
      setNotice(t(S.hoursSaved, { date: formatDate(approved ? applyFrom : riyadhToday(), locale) }));
      onSaved();
    } catch (e) {
      const c = conflictFrom(e);
      if (c) setConflict(c);
      else setError(errorText(m, e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title={S.hours}>
      {future.length ? (
        <Alert tone="info" className="mb-4">
          {t(S.hoursSaved, { date: formatDate(future[0].validFrom, locale) })}
        </Alert>
      ) : null}
      <HoursEditor m={m} locale={locale} value={hours} onChange={setHours} />
      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        {approved ? (
          <Field label={S.applyFrom} className="w-48">
            {(p) => <Input {...p} type="date" min={tomorrow} value={from} onChange={(e) => setFrom(e.target.value)} />}
          </Field>
        ) : (
          <span />
        )}
        <button type="button" disabled={busy} onClick={() => save()} className="min-h-12 rounded-full bg-brand-500 px-6 font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
          {busy ? m.common.saving : S.saveHours}
        </button>
      </div>
      {error ? <Alert tone="error" className="mt-4">{error}</Alert> : null}
      {notice ? <Alert tone="success" className="mt-4">{notice}</Alert> : null}
      <ConflictDialog
        m={m}
        locale={locale}
        report={conflict}
        busy={busy}
        onClose={() => setConflict(null)}
        onApplyFrom={(d) => {
          setFrom(d);
          void save(d);
        }}
      />
    </Panel>
  );
}

function DaysOffPanel({ m, locale }: { m: AppMessages; locale: Locale }) {
  const S = m.ops.sch;
  const { backend } = useAuth();
  const list = useLoad(() => backend.blockedDates(), [backend]);
  const tomorrow = addDays(riyadhToday(), 1);
  const [start, setStart] = useState(tomorrow);
  const [end, setEnd] = useState(tomorrow);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ConflictReport | null>(null);

  async function add(cancelConfirmed: boolean) {
    setBusy(true);
    setError(null);
    try {
      list.setData(await backend.blockDates(start, end < start ? start : end, reason.trim(), cancelConfirmed));
      setConflict(null);
      setReason("");
    } catch (e) {
      const c = conflictFrom(e);
      if (c) setConflict(c);
      else setError(errorText(m, e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title={S.daysOff}>
      <p className="mb-4 text-sm text-muted">{S.daysOffHint}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void add(false);
        }}
        className="grid gap-3 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-end"
      >
        <Field label={S.fromDate}>{(p) => <Input {...p} type="date" min={tomorrow} value={start} onChange={(e) => { setStart(e.target.value); if (end < e.target.value) setEnd(e.target.value); }} />}</Field>
        <Field label={S.toDate}>{(p) => <Input {...p} type="date" min={start} value={end} onChange={(e) => setEnd(e.target.value)} />}</Field>
        <Field label={S.reason}>{(p) => <Input {...p} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
        <SubmitButton busy={busy} className="sm:mb-0">{S.addDaysOff}</SubmitButton>
      </form>
      {error ? <Alert tone="error" className="mt-3">{error}</Alert> : null}
      <ul className="mt-4 divide-y divide-[var(--line)]">
        {(list.data ?? []).length === 0 ? <li className="py-2 text-sm text-muted">{S.none}</li> : null}
        {(list.data ?? []).map((b) => (
          <li key={b.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span>
              {formatDate(b.startDate, locale)}
              {b.endDate !== b.startDate ? ` – ${formatDate(b.endDate, locale)}` : ""}
              {b.reason ? <span className="text-muted"> · {b.reason}</span> : null}
            </span>
            <button type="button" aria-label={S.remove} onClick={async () => list.setData(await backend.unblock(b.id))} className="inline-flex h-10 w-10 items-center justify-center rounded-full text-muted hover:text-red-600">
              <IconTrash width={16} height={16} />
            </button>
          </li>
        ))}
      </ul>
      <ConflictDialog m={m} locale={locale} report={conflict} busy={busy} onClose={() => setConflict(null)} onCancelTrips={() => void add(true)} />
    </Panel>
  );
}

function CalendarPanel({ m, locale }: { m: AppMessages; locale: Locale }) {
  const S = m.ops.sch;
  const { backend } = useAuth();
  const today = riyadhToday();
  const [month, setMonth] = useState(startOfMonth(addDays(today, 1)));
  const end = addDays(addMonths(month, 1), -1);
  const cal = useLoad(() => backend.driverCalendar(month, end), [backend, month]);
  const [svcId, setSvcId] = useState<string | null>(null);
  const [day, setDay] = useState<CalendarDay | null>(null);

  useEffect(() => {
    if (!svcId && cal.data?.length) setSvcId(cal.data[0].serviceId);
  }, [cal.data, svcId]);

  if (cal.data && !cal.data.length) return <Panel title={S.calendar}><p className="text-sm text-muted">{S.noService}</p></Panel>;
  const svc = cal.data?.find((s) => s.serviceId === svcId) ?? cal.data?.[0];
  const byDate = new Map((svc?.days ?? []).map((d) => [d.date, d]));

  return (
    <Panel title={S.calendar}>
      <p className="mb-4 text-sm text-muted">{S.calendarHint}</p>
      {cal.data && cal.data.length > 1 ? (
        <Field label={S.service} className="mb-4 max-w-md">
          {(p) => (
            <Select {...p} value={svcId ?? ""} onChange={(e) => setSvcId(e.target.value)}>
              {cal.data!.map((s) => <option key={s.serviceId} value={s.serviceId}>{s.serviceName}</option>)}
            </Select>
          )}
        </Field>
      ) : null}
      <div className="mb-3 flex flex-wrap gap-3 text-xs">
        {[
          ["bg-brand-500", S.legend.paid],
          ["bg-accent-400", S.legend.held],
          ["bg-sky-400", S.legend.pending],
          ["bg-brand-100 dark:bg-brand-900/50", S.legend.free],
          ["bg-slate-300 dark:bg-slate-600", S.legend.closed],
        ].map(([c, l]) => (
          <span key={l} className="inline-flex items-center gap-1.5"><span className={cn("h-3 w-3 rounded", c)} /> {l}</span>
        ))}
      </div>
      <div className="max-w-xl">
        <MonthCalendar
          month={month}
          onMonth={setMonth}
          locale={locale}
          prevLabel={S.prevMonth}
          nextLabel={S.nextMonth}
          minMonth={today}
          isDisabled={(d) => d <= today || !byDate.get(d)?.runs}
          onPick={(d) => {
            const x = byDate.get(d);
            if (x) setDay(x);
          }}
          cell={(d) => {
            const x = byDate.get(d);
            if (!x || !x.runs) return { className: "text-muted/60" };
            if (x.closed) return { className: "bg-slate-200 text-muted line-through dark:bg-slate-700", label: "—" };
            const full = x.capacity > 0 && x.paid + x.held >= x.capacity;
            return {
              className: cn(
                d === today && "ring-2 ring-brand-500",
                x.paid > 0 ? (full ? "bg-brand-500 text-white" : "bg-brand-200 dark:bg-brand-800") : x.held > 0 ? "bg-accent-200 dark:bg-accent-700/40" : "bg-brand-50 dark:bg-brand-900/30",
                x.override ? "outline outline-2 outline-offset-[-2px] outline-accent-400" : "",
              ),
              label: `${num(x.paid + x.held, locale)}/${num(x.capacity, locale)}${x.pending ? "•" : ""}`,
              ariaLabel: `${formatDate(d, locale)}: ${t(S.booked, { n: num(x.paid, locale) })}, ${t(S.held, { n: num(x.held, locale) })}, ${num(x.capacity, locale)}`,
            };
          }}
        />
      </div>
      {svc ? <DayDialog m={m} locale={locale} serviceId={svc.serviceId} day={day} onClose={() => setDay(null)} onSaved={() => { setDay(null); void cal.reload(); }} /> : null}
    </Panel>
  );
}

function DayDialog({ m, locale, serviceId, day, onClose, onSaved }: { m: AppMessages; locale: Locale; serviceId: string; day: CalendarDay | null; onClose: () => void; onSaved: () => void }) {
  const S = m.ops.sch;
  const { backend } = useAuth();
  const [seats, setSeats] = useState("");
  const [off, setOff] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ConflictReport | null>(null);
  useEffect(() => {
    if (!day) return;
    setSeats(String(day.override?.seats ?? day.capacity));
    setOff(!!day.override?.unavailable);
    setReason(day.override?.reason ?? "");
    setError(null);
  }, [day]);

  async function save(reset = false, cancelConfirmed = false) {
    if (!day) return;
    setBusy(true);
    setError(null);
    try {
      await backend.setDay(serviceId, day.date, reset || off ? null : Number(seats), reset ? false : off, reason.trim(), cancelConfirmed);
      setConflict(null);
      onSaved();
    } catch (e) {
      const c = conflictFrom(e);
      if (c) setConflict(c);
      else setError(errorText(m, e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Dialog open={!!day && !conflict} onClose={onClose} title={day ? formatDate(day.date, locale, "long") : ""} closeLabel={m.common.close}>
        {day ? (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              {t(S.booked, { n: num(day.paid, locale) })} · {t(S.held, { n: num(day.held, locale) })}
            </p>
            <SwitchRow label={S.unavailable} checked={off} onChange={setOff} />
            {off ? (
              <Field label={S.reason}>{(p) => <Input {...p} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
            ) : (
              <Field label={S.seatsThatDay}>
                {(p) => <Input {...p} type="number" min={day.paid + day.held} max={60} dir="ltr" value={seats} onChange={(e) => setSeats(e.target.value)} />}
              </Field>
            )}
            {error ? <Alert tone="error">{error}</Alert> : null}
            <div className="flex flex-wrap justify-between gap-3">
              {day.override ? (
                <button type="button" disabled={busy} onClick={() => save(true)} className="min-h-12 rounded-full px-4 text-sm font-medium text-muted underline underline-offset-4">
                  {S.reset}
                </button>
              ) : (
                <span />
              )}
              <button type="button" disabled={busy} onClick={() => save()} className="min-h-12 rounded-full bg-brand-500 px-6 font-semibold text-white disabled:opacity-60">
                {busy ? m.common.saving : m.common.save}
              </button>
            </div>
          </div>
        ) : null}
      </Dialog>
      <ConflictDialog m={m} locale={locale} report={conflict} busy={busy} onClose={() => setConflict(null)} onCancelTrips={() => void save(false, true)} />
    </>
  );
}
