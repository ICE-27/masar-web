"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { Alert, Dialog, Field, Select, SubmitButton, Textarea } from "@/components/form";
import { IconCalendar, IconChart, IconHome, IconInbox, IconMoney, IconPhone, IconPin, IconRoute, IconUsers } from "@/components/icons";
import { AppLink as Link } from "@/components/link";
import { AreaShell, type AreaNavItem } from "@/components/ops/area-shell";
import {
  Avatar,
  Countdown,
  EmptyState,
  ErrorNote,
  KeyRow,
  LoadingBlocks,
  PageTitle,
  Panel,
  Sar,
  Stat,
  StatusBadge,
  Tabs,
  useLoad,
} from "@/components/ops/bits";
import { ButtonLink, cn } from "@/components/ui";
import type { Booking, BookingCard } from "@/lib/data";
import { formatDate, formatTime } from "@/lib/domain/dates";
import { errorText, num, t } from "@/lib/format";
import { href, type Locale } from "@/lib/i18n";
import type { AppMessages } from "@/lib/messages/app.en";
import { useQueryParam } from "@/lib/nav";
import { formatSaudiMobile } from "@/lib/validation";
import { ApplicationStatus } from "./driver-wizard";
import { ScheduleSection } from "./schedule";
import { ServicesSection } from "./services";

export type DriverSection = "home" | "requests" | "bookings" | "services" | "schedule" | "earnings";

export function DriverArea({ locale, m, section }: { locale: Locale; m: AppMessages; section: DriverSection }) {
  const N = m.ops.da.nav;
  const { backend, status } = useAuth();
  const reqs = useLoad(() => (status === "signed-in" ? backend.driverBookings("requests").catch(() => []) : Promise.resolve([])), [backend, status]);
  const pending = (reqs.data ?? []).filter((r) => r.status === "pending").length;
  const items: AreaNavItem[] = [
    { key: "home", path: "/driver", label: N.home, icon: (p) => <IconHome {...p} /> },
    { key: "requests", path: "/driver/requests", label: N.requests, icon: (p) => <IconInbox {...p} />, badge: pending },
    { key: "bookings", path: "/driver/bookings", label: N.bookings, icon: (p) => <IconUsers {...p} /> },
    { key: "services", path: "/driver/services", label: N.services, icon: (p) => <IconRoute {...p} /> },
    { key: "schedule", path: "/driver/schedule", label: N.schedule, icon: (p) => <IconCalendar {...p} /> },
    { key: "earnings", path: "/driver/earnings", label: N.earnings, icon: (p) => <IconMoney {...p} />, mobile: false },
  ];
  const here = items.find((i) => i.key === section)!.path;
  return (
    <AreaShell locale={locale} m={m} items={items} active={section} roles={["driver"]} label={m.ops.nav.driverHome} here={here}>
      {section === "home" ? <DriverHome m={m} locale={locale} onRequests={reqs.reload} /> : null}
      {section === "requests" ? <RequestsSection m={m} locale={locale} onChange={reqs.reload} /> : null}
      {section === "bookings" ? <DriverBookings m={m} locale={locale} /> : null}
      {section === "services" ? <ServicesSection m={m} locale={locale} /> : null}
      {section === "schedule" ? <ScheduleSection m={m} locale={locale} /> : null}
      {section === "earnings" ? <EarningsSection m={m} locale={locale} /> : null}
    </AreaShell>
  );
}

/* ---- Home ----------------------------------------------------------------- */

function DriverHome({ m, locale }: { m: AppMessages; locale: Locale; onRequests: () => void }) {
  const A = m.ops.da;
  const { backend } = useAuth();
  const app = useLoad(() => backend.driverApplication(), [backend]);
  const approved = app.data?.driver.status === "approved";
  const services = useLoad(() => (approved ? backend.driverServices() : Promise.resolve([])), [backend, approved]);
  const reqs = useLoad(() => (approved ? backend.driverBookings("requests") : Promise.resolve([])), [backend, approved]);
  const active = useLoad(() => (approved ? backend.driverBookings("active") : Promise.resolve([])), [backend, approved]);
  const earn = useLoad(() => (approved ? backend.earnings() : Promise.resolve(null)), [backend, approved]);

  if (app.error) return <ErrorNote m={m} error={app.error} />;
  if (!app.data) return <LoadingBlocks />;
  const d = app.data.driver;
  const name = (locale === "ar" ? d.nameAr : d.nameEn)?.split(" ")[0] ?? "";

  return (
    <>
      <PageTitle title={t(A.hello, { name })} />
      {!approved ? (
        <ApplicationStatus m={m} locale={locale} app={app.data} compact />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={A.pendingRequests} value={num((reqs.data ?? []).filter((r) => r.status === "pending").length, locale)} tone={(reqs.data ?? []).some((r) => r.status === "pending") ? "accent" : "plain"} />
            <Stat label={A.activeBookings} value={num(active.data?.length ?? 0, locale)} />
            <Stat label={A.services} value={num((services.data ?? []).filter((s) => s.status === "active").length, locale)} />
            <Stat label={A.owed} value={<Sar h={earn.data?.owedH ?? 0} locale={locale} />} tone="brand" />
          </div>
          {services.data && !services.data.length ? (
            <section className="relative overflow-hidden rounded-2xl bg-brand-600 p-6 text-white dark:bg-brand-800">
              <div aria-hidden className="absolute -end-10 -top-10 h-44 w-44 rounded-full bg-white/10" />
              <h2 className="relative text-xl font-bold">{A.firstServiceTitle}</h2>
              <p className="relative mt-1.5 max-w-lg text-sm text-white/85">{A.firstServiceText}</p>
              <ButtonLink href={`${href(locale, "/driver/services")}?new=1`} variant="accent" className="relative mt-4">
                {A.createService}
              </ButtonLink>
            </section>
          ) : null}
          {(reqs.data ?? []).length ? (
            <Panel title={m.ops.req.title} action={<Link href={href(locale, "/driver/requests")} className="text-sm font-medium text-brand-600 dark:text-brand-300">{A.seeRequests}</Link>}>
              <div className="space-y-3">
                {(reqs.data ?? []).slice(0, 3).map((b) => (
                  <RequestSummary key={b.id} b={b} m={m} locale={locale} />
                ))}
              </div>
            </Panel>
          ) : null}
        </div>
      )}
    </>
  );
}

function RequestSummary({ b, m, locale }: { b: BookingCard; m: AppMessages; locale: Locale }) {
  const R = m.ops.req;
  return (
    <Link href={href(locale, "/driver/requests")} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] p-3 hover:border-brand-300">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">
          {b.children.map((c) => c.firstName).join(locale === "ar" ? "، " : ", ")} · {b.district ? (locale === "ar" ? b.district.nameAr : b.district.nameEn) : ""}
        </p>
        <p className="text-xs text-muted">
          {b.status === "pending" ? <Countdown iso={b.requestExpiresAt} m={m} locale={locale} template={R.answerWithin} /> : <Countdown iso={b.paymentDueAt} m={m} locale={locale} template={R.waitingPayment} />}
        </p>
      </div>
      <Sar h={b.driverH} locale={locale} className="shrink-0 font-semibold" />
    </Link>
  );
}

/* ---- Requests ------------------------------------------------------------- */

function RequestsSection({ m, locale, onChange }: { m: AppMessages; locale: Locale; onChange: () => void }) {
  const R = m.ops.req;
  const { backend } = useAuth();
  const list = useLoad(() => backend.driverBookings("requests"), [backend]);
  const [rejecting, setRejecting] = useState<BookingCard | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function accept(b: BookingCard) {
    setBusyId(b.id);
    setError(null);
    try {
      await backend.respond(b.id, true);
      setNotice(t(R.accepted, { h: num(12, locale) }));
      await list.reload();
      onChange();
    } catch (e) {
      setError(e);
      await list.reload();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageTitle title={R.title} subtitle={R.subtitle} />
      <ErrorNote m={m} error={error ?? list.error} className="mb-4" />
      {notice ? <Alert tone="success" className="mb-4">{notice}</Alert> : null}
      {list.loading && !list.data ? (
        <LoadingBlocks />
      ) : !list.data?.length ? (
        <EmptyState text={R.empty} icon={<IconInbox />} />
      ) : (
        <ul className="grid gap-4 xl:grid-cols-2">
          {list.data.map((b) => (
            <li key={b.id} className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-muted"><bdi dir="ltr">{b.code}</bdi> · {b.serviceName}</p>
                  <p className="mt-1 font-semibold">
                    {b.children.map((c) => `${c.firstName} (${num(c.age ?? 0, locale)}, ${m.ops.common.genders[c.gender]})`).join(locale === "ar" ? "، " : ", ")}
                  </p>
                </div>
                <StatusBadge status={b.status} label={m.ops.common.bookingStatus[b.status]} />
              </div>
              <dl className="mt-3 divide-y divide-[var(--line)] text-sm">
                <KeyRow label={R.district}>{b.district ? `${locale === "ar" ? b.district.nameAr : b.district.nameEn}` : "—"}</KeyRow>
                <KeyRow label={m.ops.common.days}>
                  {t(R.dates, { n: num(b.bookedDays, locale), from: formatDate(b.firstDate, locale, "short"), to: formatDate(b.lastDate, locale, "short") })}
                </KeyRow>
                <KeyRow label={m.ops.book.steps.trip}>
                  {m.ops.common.serviceTypes[b.serviceType]} · {m.ops.common.legsShort[b.legs]}
                </KeyRow>
                {b.estPickupMin != null ? <KeyRow label={m.ops.req.pickup}>{t(R.pickupAround, { time: formatTime(b.estPickupMin, locale) })}</KeyRow> : null}
                <KeyRow label={R.youReceive} strong>
                  <Sar h={b.driverH} locale={locale} />
                </KeyRow>
              </dl>
              {b.outsideRoute ? (
                <Alert tone="warning" className="mt-3">
                  {t(R.outside, { km: num(Math.round(((b.pickupDistanceM ?? 0) / 1000) * 10) / 10, locale) })}
                </Alert>
              ) : null}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4">
                <p className="text-sm font-medium text-accent-700 dark:text-accent-300">
                  {b.status === "pending" ? (
                    <Countdown iso={b.requestExpiresAt} m={m} locale={locale} template={R.answerWithin} />
                  ) : (
                    <Countdown iso={b.paymentDueAt} m={m} locale={locale} template={R.waitingPayment} />
                  )}
                </p>
                {b.status === "pending" ? (
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setRejecting(b)} className="min-h-11 rounded-full border border-[var(--line)] px-5 text-sm font-medium hover:border-red-300 hover:text-red-600">
                      {R.reject}
                    </button>
                    <button type="button" disabled={busyId === b.id} onClick={() => accept(b)} className="min-h-11 rounded-full bg-brand-500 px-6 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
                      {R.accept}
                    </button>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <RejectDialog
        m={m}
        booking={rejecting}
        onClose={() => setRejecting(null)}
        onDone={async () => {
          setRejecting(null);
          await list.reload();
          onChange();
        }}
      />
    </>
  );
}

function RejectDialog({ m, booking, onClose, onDone }: { m: AppMessages; booking: BookingCard | null; onClose: () => void; onDone: () => void }) {
  const R = m.ops.req;
  const { backend } = useAuth();
  const [reason, setReason] = useState("full");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open={!!booking} onClose={onClose} title={R.rejectTitle} closeLabel={m.common.close}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!booking) return;
          setBusy(true);
          setError(null);
          try {
            await backend.respond(booking.id, false, note.trim() ? `${reason}: ${note.trim()}` : reason);
            onDone();
          } catch (err) {
            setError(errorText(m, err));
          } finally {
            setBusy(false);
          }
        }}
        className="space-y-5"
      >
        <Field label={R.rejectReason}>
          {(p) => (
            <Select {...p} value={reason} onChange={(e) => setReason(e.target.value)}>
              {(["full", "route", "time", "other"] as const).map((r) => (
                <option key={r} value={r}>{m.ops.common.reasons[r]}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={R.rejectNote} optional optionalText={m.common.optional}>
          {(p) => <Textarea {...p} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="min-h-12 rounded-full px-5 font-medium text-muted">
            {m.common.cancel}
          </button>
          <SubmitButton variant="danger" busy={busy}>
            {R.reject}
          </SubmitButton>
        </div>
      </form>
    </Dialog>
  );
}

/** "full: the bus is full" -> localized reason text. */
export function reasonText(m: AppMessages, raw: string | null | undefined): string {
  if (!raw) return "";
  const [code, ...rest] = raw.split(":");
  const known = (m.ops.common.reasons as Record<string, string>)[code.trim()];
  return known ? (rest.length ? `${known} — ${rest.join(":").trim()}` : known) : raw;
}

/* ---- Bookings (confirmed) ------------------------------------------------- */

function DriverBookings({ m, locale }: { m: AppMessages; locale: Locale }) {
  const R = m.ops.req;
  const { backend } = useAuth();
  const [tab, setTab] = useState<"active" | "past">("active");
  const list = useLoad(() => backend.driverBookings(tab), [backend, tab]);
  const [open, setOpen] = useState<string | null>(null);
  const qId = useQueryParam("id");
  useEffect(() => {
    if (qId) setOpen(qId);
  }, [qId]);
  return (
    <>
      <PageTitle title={R.active} />
      <Tabs
        label={R.active}
        value={tab}
        onChange={setTab}
        items={[
          { value: "active", label: m.ops.bk.active },
          { value: "past", label: m.ops.bk.past },
        ]}
      />
      <ErrorNote m={m} error={list.error} className="mb-4" />
      {list.loading && !list.data ? (
        <LoadingBlocks />
      ) : !list.data?.length ? (
        <EmptyState text={R.activeEmpty} icon={<IconUsers />} />
      ) : (
        <ul className="grid gap-3 xl:grid-cols-2">
          {list.data.map((b) => (
            <li key={b.id}>
              <button type="button" onClick={() => setOpen(b.id)} className="w-full rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 text-start hover:border-brand-300">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{b.children.map((c) => c.firstName).join(locale === "ar" ? "، " : ", ")} · {b.parentFirstName}</p>
                    <p className="mt-0.5 text-sm text-muted">{b.serviceName}</p>
                    <p className="mt-1 text-xs text-muted">
                      {b.nextDate ? t(R.nextTrip, { date: formatDate(b.nextDate, locale, "weekday") }) : formatDate(b.lastDate, locale)} · {t(R.tripsLeft, { n: num(b.bookedDays, locale) })}
                    </p>
                  </div>
                  <div className="text-end">
                    <StatusBadge status={b.status} label={m.ops.common.bookingStatus[b.status]} />
                    <p className="mt-2 text-sm font-semibold"><Sar h={b.driverH} locale={locale} /></p>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
      <PassengerDialog m={m} locale={locale} id={open} onClose={() => setOpen(null)} />
    </>
  );
}

function PassengerDialog({ m, locale, id, onClose }: { m: AppMessages; locale: Locale; id: string | null; onClose: () => void }) {
  const R = m.ops.req;
  const { backend } = useAuth();
  const b = useLoad<Booking | null>(() => (id ? backend.getBooking(id) : Promise.resolve(null)), [backend, id]);
  const bk = b.data;
  const p = bk?.pickup;
  const maps = p?.lat ? `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}` : null;
  const waze = p?.lat ? `https://waze.com/ul?ll=${p.lat},${p.lng}&navigate=yes` : null;
  return (
    <Dialog open={!!id} onClose={onClose} title={bk ? t(m.ops.bk.code, { code: bk.code }) : m.common.loading} closeLabel={m.common.close} wide>
      {!bk ? (
        <LoadingBlocks n={2} />
      ) : (
        <div className="space-y-5">
          <section>
            <h3 className="mb-2 text-sm font-semibold">{R.passengers}</h3>
            <ul className="space-y-3">
              {bk.children.map((c, i) => (
                <li key={i} className="rounded-xl border border-[var(--line)] p-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={c.firstName} size={40} />
                    <div>
                      <p className="font-semibold">{c.firstName}</p>
                      <p className="text-xs text-muted">{m.ops.common.genders[c.gender]} · {num(c.age ?? 0, locale)}</p>
                    </div>
                  </div>
                  {c.driverNotes ? <p className="mt-2 text-sm"><span className="font-medium">{R.notes}: </span>{c.driverNotes}</p> : null}
                  {c.medicalNotes ? <p className="mt-1 text-sm text-red-700 dark:text-red-300"><span className="font-medium">{R.medical}: </span>{c.medicalNotes}</p> : null}
                  {c.authorizedPickups?.length ? (
                    <p className="mt-1 text-sm"><span className="font-medium">{R.pickups}: </span>{c.authorizedPickups.map((x) => `${x.name} (${formatSaudiMobile(x.phone)})`).join(locale === "ar" ? "، " : ", ")}</p>
                  ) : null}
                  {c.emergencyName ? <p className="mt-1 text-sm"><span className="font-medium">{R.emergency}: </span>{c.emergencyName} <bdi dir="ltr">{formatSaudiMobile(c.emergencyPhone)}</bdi></p> : null}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="mb-2 text-sm font-semibold">{R.pickup}</h3>
            {p?.lat ? (
              <div className="rounded-xl border border-[var(--line)] p-3 text-sm">
                <p className="flex items-start gap-2"><IconPin width={18} height={18} className="mt-0.5 shrink-0 text-brand-500" /> {[p.street, p.buildingNo, p.district, p.city].filter(Boolean).join(locale === "ar" ? "، " : ", ")}</p>
                {p.floorApt ? <p className="mt-1 text-muted">{p.floorApt}</p> : null}
                {p.landmark ? <p className="mt-1 text-muted">“{p.landmark}”</p> : null}
                {bk.estPickupMin != null ? <p className="mt-1 font-medium">{t(R.pickupAround, { time: formatTime(bk.estPickupMin, locale) })}</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {maps ? <a href={maps} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center rounded-full bg-brand-500 px-4 text-sm font-semibold text-white">{R.viewMap}</a> : null}
                  {waze ? <a href={waze} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center rounded-full border border-[var(--line)] px-4 text-sm font-medium">{R.viewWaze}</a> : null}
                  {bk.parent?.phone ? (
                    <a href={`tel:${bk.parent.phone}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-[var(--line)] px-4 text-sm font-medium">
                      <IconPhone width={16} height={16} /> {m.ops.common.callParent}
                    </a>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted">{bk.district ? (locale === "ar" ? bk.district.nameAr : bk.district.nameEn) : "—"}</p>
            )}
          </section>
          {bk.note ? <Alert tone="info">“{bk.note}”</Alert> : null}
          <section>
            <h3 className="mb-2 text-sm font-semibold">{m.ops.bk.calendar}</h3>
            <div className="flex flex-wrap gap-1.5">
              {bk.dates.map((d) => (
                <span key={d.date} className={cn("rounded-lg px-2 py-1 text-xs", d.state === "scheduled" ? "bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200" : "bg-[var(--page-subtle)] text-muted line-through")}>
                  {formatDate(d.date, locale, "short")}
                </span>
              ))}
            </div>
          </section>
        </div>
      )}
    </Dialog>
  );
}

/* ---- Earnings ------------------------------------------------------------- */

function EarningsSection({ m, locale }: { m: AppMessages; locale: Locale }) {
  const E = m.ops.earn;
  const { backend } = useAuth();
  const e = useLoad(() => backend.earnings(), [backend]);
  if (e.error) return <ErrorNote m={m} error={e.error} />;
  if (!e.data) return <LoadingBlocks />;
  const d = e.data;
  return (
    <>
      <PageTitle title={E.title} subtitle={E.subtitle} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={E.owed} value={<Sar h={d.owedH} locale={locale} />} tone="brand" />
        <Stat label={E.earned} value={<Sar h={d.earnedToDateH} locale={locale} />} hint={E.earnedHint} />
        <Stat label={E.paidOut} value={<Sar h={d.paidOutH} locale={locale} />} />
        <Stat label={E.fee} value={<Sar h={d.feeH} locale={locale} />} hint={<>{E.gross}: <Sar h={d.grossH} locale={locale} /></>} />
      </div>
      <Panel className="mt-6" title={E.payoutTo}>
        {d.payout.ibanMasked ? (
          <p className="text-sm">
            {d.payout.bankName} · <bdi dir="ltr" className="font-mono">{d.payout.ibanMasked}</bdi> · {d.payout.accountHolder}
          </p>
        ) : (
          <p className="text-sm text-muted">{E.noIban}</p>
        )}
        <Alert tone="info" className="mt-3">{E.demo}</Alert>
      </Panel>
      <Panel className="mt-6" title={E.bookings}>
        {d.bookings.length ? (
          <ul className="divide-y divide-[var(--line)]">
            {d.bookings.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <div>
                  <p className="font-medium"><bdi dir="ltr">{b.code}</bdi> · {b.serviceName}</p>
                  <p className="text-xs text-muted">{formatDate(b.firstDate, locale, "short")} – {formatDate(b.lastDate, locale, "short")} · {num(b.bookedDays, locale)} {m.ops.common.days}</p>
                </div>
                <div className="text-end">
                  <Sar h={b.driverH} locale={locale} className="font-semibold" />
                  {b.refundedDriverH ? <p className="text-xs text-muted">{t(E.refunded, { amount: "" })}<Sar h={b.refundedDriverH} locale={locale} /></p> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{m.ops.wallet.none}</p>
        )}
      </Panel>
      <Panel className="mt-6" title={E.payouts}>
        {d.payouts.length ? (
          <ul className="divide-y divide-[var(--line)]">
            {d.payouts.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-3 text-sm">
                <span>{formatDate(p.createdAt.slice(0, 10), locale)} · <IconChart width={14} height={14} className="inline" /> {p.status}</span>
                <Sar h={p.amountH} locale={locale} className="font-semibold" />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{E.noPayouts}</p>
        )}
      </Panel>
    </>
  );
}
