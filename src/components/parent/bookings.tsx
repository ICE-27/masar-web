"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { Alert, Choice, Dialog, Field, Input, Skeleton } from "@/components/form";
import { IconBus, IconCar, IconChevron, IconFile, IconPhone, IconSearch, IconWallet } from "@/components/icons";
import { AppLink as Link } from "@/components/link";
import { RouteMap, useIsDark } from "@/components/map/route-map-lazy";
import { Countdown, EmptyState, ErrorNote, KeyRow, LoadingBlocks, PageTitle, Panel, PlatePreview, Sar, StatusBadge, Tabs, useLoad } from "@/components/ops/bits";
import { PriceTable } from "@/components/ops/price-table";
import { ButtonLink, cn } from "@/components/ui";
import type { Booking, BookingCard, CancelPreview, Wallet } from "@/lib/data";
import { formatDate, formatTime, riyadhToday } from "@/lib/domain/dates";
import { formatSar } from "@/lib/domain/money";
import { errorText, num, t } from "@/lib/format";
import { href, type Locale } from "@/lib/i18n";
import type { AppMessages } from "@/lib/messages/app.en";
import { useQueryParam } from "@/lib/nav";
import { formatSaudiMobile } from "@/lib/validation";
import { reasonText } from "@/components/driver/driver-area";

const ACTIVE = ["pending", "accepted", "confirmed"];

export function BookingsSection({ m, locale }: { m: AppMessages; locale: Locale }) {
  const K = m.ops.bk;
  const { backend } = useAuth();
  const list = useLoad(() => backend.myBookings(), [backend]);
  const [tab, setTab] = useState<"active" | "past">("active");
  const rows = (list.data ?? []).filter((b) => (tab === "active" ? ACTIVE.includes(b.status) : !ACTIVE.includes(b.status)));
  return (
    <>
      <PageTitle title={K.title} subtitle={K.subtitle} action={<ButtonLink href={href(locale, "/search")}><IconSearch width={18} height={18} /> {K.find}</ButtonLink>} />
      <Tabs
        label={K.title}
        value={tab}
        onChange={setTab}
        items={[
          { value: "active", label: K.active, count: (list.data ?? []).filter((b) => ACTIVE.includes(b.status)).length },
          { value: "past", label: K.past },
        ]}
      />
      <ErrorNote m={m} error={list.error} className="mb-4" />
      {list.loading && !list.data ? (
        <LoadingBlocks />
      ) : !rows.length ? (
        <EmptyState text={K.empty} action={<ButtonLink href={href(locale, "/search")} variant="secondary">{K.find}</ButtonLink>} />
      ) : (
        <ul className="grid gap-3 xl:grid-cols-2">
          {rows.map((b) => (
            <li key={b.id}>
              <BookingRow b={b} m={m} locale={locale} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function BookingRow({ b, m, locale }: { b: BookingCard; m: AppMessages; locale: Locale }) {
  const K = m.ops.bk;
  const driver = b.driver ? (locale === "ar" ? b.driver.firstNameAr || b.driver.firstNameEn : b.driver.firstNameEn || b.driver.firstNameAr) : "";
  return (
    <Link href={`${href(locale, "/account/booking")}?id=${b.id}`} className="block rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 transition-colors hover:border-brand-300 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300">
            {b.driver?.vehicleType === "bus" ? <IconBus /> : <IconCar />}
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold">{b.serviceName}</p>
            <p className="text-sm text-muted">
              {driver} · {b.children.map((c) => c.firstName).join(locale === "ar" ? "، " : ", ")}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {formatDate(b.firstDate, locale, "short")} – {formatDate(b.lastDate, locale, "short")} · {num(b.bookedDays, locale)} {m.ops.common.days}
            </p>
          </div>
        </div>
        <div className="shrink-0 text-end">
          <StatusBadge status={b.status} label={m.ops.common.bookingStatus[b.status]} />
          <p className="mt-2 font-semibold"><Sar h={b.totalH} locale={locale} /></p>
        </div>
      </div>
      {b.status === "pending" ? (
        <p className="mt-3 text-sm text-sky-700 dark:text-sky-300"><Countdown iso={b.requestExpiresAt} m={m} locale={locale} template={t(K.pending, { driver, t: "{t}" })} /></p>
      ) : null}
      {b.status === "accepted" ? (
        <p className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm font-medium text-accent-700 dark:text-accent-300">
          <Countdown iso={b.paymentDueAt} m={m} locale={locale} template={t(K.accepted, { driver, t: "{t}" })} />
          <span className="rounded-full bg-brand-500 px-4 py-1.5 text-white">{K.payNow}</span>
        </p>
      ) : null}
    </Link>
  );
}

/* ---- Booking detail ------------------------------------------------------- */

export function BookingDetailSection({ m, locale }: { m: AppMessages; locale: Locale }) {
  const K = m.ops.bk;
  const C = m.ops.common;
  const { backend } = useAuth();
  const dark = useIsDark();
  const id = useQueryParam("id");
  const b = useLoad<Booking | null>(() => (id ? backend.getBooking(id) : Promise.resolve(null)), [backend, id]);
  const [cancelOpen, setCancelOpen] = useState(false);

  if (b.error) return <ErrorNote m={m} error={b.error} />;
  if (id === null || (id && !b.loading && !b.data)) return <Alert tone="info">{errorText(m, "not_found")}</Alert>;
  if (!b.data) return <LoadingBlocks n={4} />;
  const bk = b.data;
  const driver = bk.driver ? (locale === "ar" ? bk.driver.firstNameAr || bk.driver.firstNameEn : bk.driver.firstNameEn || bk.driver.firstNameAr) : "";
  const v = bk.driver?.vehicle;
  const today = riyadhToday();
  const next = bk.dates.find((d) => d.state === "scheduled" && d.date > today)?.date ?? null;
  const destName = bk.service?.destination ? (locale === "ar" ? bk.service.destination.nameAr : bk.service.destination.nameEn) : "";
  const p = bk.pickup;

  return (
    <>
      <Link href={href(locale, "/account/bookings")} className="mb-3 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-muted hover:text-[var(--ink)]">
        <IconChevron width={16} height={16} className="rotate-180 rtl:rotate-0" /> {K.title}
      </Link>
      <PageTitle title={bk.service?.name ?? K.title} subtitle={<span><bdi dir="ltr">{bk.code}</bdi> · {t(K.requestedOn, { date: formatDate(bk.createdAt.slice(0, 10), locale) })}</span>} action={<StatusBadge status={bk.status} label={C.bookingStatus[bk.status]} />} />

      {/* What happens next */}
      {bk.status === "pending" ? (
        <Alert tone="info" className="mb-5"><Countdown iso={bk.requestExpiresAt} m={m} locale={locale} template={t(K.pending, { driver, t: "{t}" })} /></Alert>
      ) : null}
      {bk.status === "accepted" ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent-200 bg-accent-50 p-4 dark:border-accent-700/50 dark:bg-accent-700/15">
          <p className="text-sm font-medium text-accent-700 dark:text-accent-200"><Countdown iso={bk.paymentDueAt} m={m} locale={locale} template={t(K.accepted, { driver, t: "{t}" })} /></p>
          <ButtonLink href={`${href(locale, "/checkout")}?booking=${bk.id}`}>{K.payNow} · {formatSar(bk.price.totalH, locale)}</ButtonLink>
        </div>
      ) : null}
      {bk.status === "confirmed" && !bk.endsOn ? <Alert tone="success" className="mb-5">{t(K.confirmed, { date: next ? formatDate(next, locale, "weekday") : "—" })}</Alert> : null}
      {bk.status === "confirmed" && bk.endsOn ? <Alert tone="warning" className="mb-5">{t(K.endsOn, { date: formatDate(bk.endsOn, locale) })}</Alert> : null}
      {bk.status === "rejected" ? (
        <Alert tone="error" className="mb-5">
          {t(K.rejected, { driver, reason: reasonText(m, bk.rejectReason) })}
          <ButtonLink href={href(locale, "/search")} variant="secondary" size="sm" className="mt-3">{K.findAnother}</ButtonLink>
        </Alert>
      ) : null}
      {bk.status === "expired" ? (
        <Alert tone="warning" className="mb-5">
          {t(K.expired, { reason: bk.respondedAt ? C.reasons.not_paid : C.reasons.no_response })}
          <ButtonLink href={href(locale, "/search")} variant="secondary" size="sm" className="mt-3">{K.findAnother}</ButtonLink>
        </Alert>
      ) : null}
      {bk.status === "cancelled" ? <Alert tone="info" className="mb-5">{K.cancelled} {bk.cancelReason ? `“${reasonText(m, bk.cancelReason)}”` : ""}</Alert> : null}

      <div className="grid gap-5 xl:grid-cols-[1fr_24rem]">
        <div className="space-y-5">
          <Panel title={K.trip}>
            <dl className="divide-y divide-[var(--line)]">
              <KeyRow label={m.ops.book.steps.trip}>{C.serviceTypes[bk.serviceType]} · {C.legs[bk.legs]}</KeyRow>
              <KeyRow label={m.ops.search.destination}>{destName}</KeyRow>
              {bk.service?.schedule?.outbound ? <KeyRow label={m.ops.svc.outbound}>{formatTime(bk.service.schedule.pickupStartMin, locale)} – {formatTime(bk.service.schedule.arriveMin, locale)}</KeyRow> : null}
              {bk.service?.schedule?.returnTrip ? <KeyRow label={m.ops.svc.returnTrip}>{formatTime(bk.service.schedule.returnDepartMin, locale)} – {formatTime(bk.service.schedule.returnEndMin, locale)}</KeyRow> : null}
              {bk.estPickupMin != null ? <KeyRow label={K.pickup}>{t(K.estPickup, { time: formatTime(bk.estPickupMin, locale) })}</KeyRow> : null}
              <KeyRow label={K.childrenTitle}>{bk.children.map((c) => c.firstName).join(locale === "ar" ? "، " : ", ")}</KeyRow>
            </dl>
          </Panel>

          {bk.service && bk.service.path.length > 1 ? (
            <div className="overflow-hidden rounded-2xl border border-[var(--line)]">
              <RouteMap
                routes={[{ id: "r", path: bk.service.path }]}
                markers={[
                  ...(bk.service.destination?.lat != null && bk.service.destination.lng != null ? [{ id: "d", lat: bk.service.destination.lat, lng: bk.service.destination.lng, kind: "dest" as const, label: destName }] : []),
                  ...(p.lat != null && p.lng != null ? [{ id: "h", lat: p.lat, lng: p.lng, kind: "home" as const }] : []),
                ]}
                fitKey={bk.id}
                label={K.trip}
                dark={dark}
                attribution={m.location.attribution}
                className="h-64"
              />
            </div>
          ) : null}

          <Panel title={K.calendar}>
            <div className="flex flex-wrap gap-1.5">
              {bk.dates.map((d) => (
                <span
                  key={d.date}
                  title={C.dateStates[d.state]}
                  className={cn(
                    "rounded-lg px-2 py-1 text-xs",
                    d.state === "scheduled"
                      ? d.date <= today
                        ? "bg-[var(--page-subtle)] text-muted"
                        : "bg-brand-50 font-medium text-brand-700 dark:bg-brand-900/40 dark:text-brand-200"
                      : d.state === "driver_unavailable"
                        ? "bg-accent-50 text-accent-700 line-through dark:bg-accent-700/20"
                        : "bg-[var(--page-subtle)] text-muted line-through",
                  )}
                >
                  {formatDate(d.date, locale, "weekday")}
                </span>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
              {(["scheduled", "cancelled", "driver_unavailable"] as const).map((st) => (
                <span key={st}>{C.dateStates[st]}: {num(bk.dates.filter((d) => d.state === st).length, locale)}</span>
              ))}
            </div>
          </Panel>

          <Panel title={K.driver}>
            <p className="font-semibold">{driver}</p>
            {v ? (
              <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
                {[v.make, v.model, v.year, v.color].filter(Boolean).join(" · ")}
                {v.plateDigits ? <PlatePreview digits={v.plateDigits} letters={v.plateLetters ?? ""} size="sm" /> : null}
              </p>
            ) : null}
            {bk.driver?.phone ? (
              <a href={`tel:${bk.driver.phone}`} className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-full border border-[var(--line)] px-4 text-sm font-medium">
                <IconPhone width={16} height={16} /> <bdi dir="ltr">{formatSaudiMobile(bk.driver.phone)}</bdi>
              </a>
            ) : null}
          </Panel>

          <Panel title={K.pickup}>
            <p className="text-sm">{[p.label ? m.location.labels[p.label as "home"] ?? p.label : null, p.street, p.buildingNo, p.district, p.city].filter(Boolean).join(locale === "ar" ? "، " : ", ")}</p>
            {p.landmark ? <p className="mt-1 text-sm text-muted">“{p.landmark}”</p> : null}
            {bk.note ? <p className="mt-2 text-sm">{m.ops.common.note}: “{bk.note}”</p> : null}
          </Panel>
        </div>

        <div className="space-y-5">
          <PriceTable
            m={m}
            locale={locale}
            serviceType={bk.serviceType}
            districtName={bk.district ? (locale === "ar" ? bk.district.nameAr : bk.district.nameEn) : null}
            baseRateH={bk.price.rateH - bk.price.surchargeH}
            surchargeH={bk.price.surchargeH}
            rateH={bk.price.rateH}
            units={bk.price.units}
            childrenCount={bk.price.childrenCount}
            days={bk.bookedDays}
            attendantFeeH={bk.price.attendantFeeH}
            price={bk.price}
          />
          {bk.invoices.length ? (
            <Panel title={K.invoices}>
              <ul className="space-y-2">
                {bk.invoices.map((i) => (
                  <li key={i.id}>
                    <Link href={`${href(locale, "/invoice")}?id=${i.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] px-3 py-2.5 text-sm hover:border-brand-300">
                      <span className="flex items-center gap-2"><IconFile width={18} height={18} className="text-brand-500" /> {i.kind === "invoice" ? K.invoice : K.creditNote} <bdi dir="ltr" className="text-muted">{i.number}</bdi></span>
                      <Sar h={i.totalH} locale={locale} className="font-medium" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
          {bk.payments.length ? (
            <Panel title={K.payments}>
              <ul className="space-y-2 text-sm">
                {bk.payments.map((py) => (
                  <li key={py.id} className="flex items-center justify-between gap-2">
                    <span className={py.status === "failed" ? "text-muted line-through" : ""}>
                      {m.ops.pay.methods[py.method]} {py.cardLast4 ? `•••• ${py.cardLast4}` : ""}
                      {py.status === "failed" ? ` · ${(m.ops.pay.errors as Record<string, string>)[py.failureCode ?? ""] ?? py.failureCode}` : ""}
                    </span>
                    <Sar h={py.amountH} locale={locale} />
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
          {bk.refunds.length ? (
            <Panel title={K.refunds}>
              <ul className="space-y-2 text-sm">
                {bk.refunds.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2">
                    <span>{formatDate(r.createdAt.slice(0, 10), locale)} · {num(r.days, locale)} {m.ops.common.days} · {r.destination === "wallet" ? m.ops.nav.wallet : m.ops.wallet.card}</span>
                    <Sar h={r.totalH} locale={locale} className="font-medium text-brand-600 dark:text-brand-300" />
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
          {["pending", "accepted"].includes(bk.status) || (bk.status === "confirmed" && !bk.endsOn) ? (
            <button type="button" onClick={() => setCancelOpen(true)} className="min-h-12 w-full rounded-full border border-red-300 font-medium text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/40">
              {K.cancel}
            </button>
          ) : null}
        </div>
      </div>
      <CancelDialog m={m} locale={locale} booking={cancelOpen ? bk : null} onClose={() => setCancelOpen(false)} onDone={(nb) => { setCancelOpen(false); b.setData(nb); }} />
    </>
  );
}

function CancelDialog({ m, locale, booking, onClose, onDone }: { m: AppMessages; locale: Locale; booking: Booking | null; onClose: () => void; onDone: (b: Booking) => void }) {
  const K = m.ops.bk;
  const { backend } = useAuth();
  const [pv, setPv] = useState<CancelPreview | null>(null);
  const [reason, setReason] = useState("");
  const [dest, setDest] = useState<"wallet" | "card">("wallet");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!booking) return;
    setPv(null);
    setError(null);
    backend.cancelPreview(booking.id).then(setPv).catch((e) => setError(errorText(m, e)));
  }, [booking, backend, m]);
  const refund = pv ? pv.refundDriverH + pv.refundVatH : 0;
  return (
    <Dialog open={!!booking} onClose={onClose} title={K.cancelTitle} closeLabel={m.common.close}>
      {!pv ? (
        error ? <Alert tone="error">{error}</Alert> : <Skeleton className="h-32" />
      ) : (
        <div className="space-y-4">
          {!pv.paid ? (
            <p className="text-sm">{K.cancelUnpaid}</p>
          ) : (
            <>
              <p className="text-sm">
                {t(K.cancelPaid, { remaining: num(pv.remainingDays, locale), inWindow: num(pv.inNoticeDays, locale), notice: num(pv.noticeDays, locale), refundDays: num(pv.refundDays, locale) })}
              </p>
              {refund > 0 ? (
                <Alert tone="info">{t(K.cancelRefund, { amount: formatSar(refund, locale, { compact: false }), fee: formatSar(pv.feeKeptH, locale, { compact: false }) })}</Alert>
              ) : (
                <Alert tone="warning">{t(K.cancelNoRefund, { notice: num(pv.noticeDays, locale) })}</Alert>
              )}
              {refund > 0 ? (
                <Choice<"wallet" | "card"> name="refund-to" legend={K.refundTo} value={dest} onChange={setDest} options={[{ value: "wallet", label: K.toWallet }, { value: "card", label: K.toCard }]} />
              ) : null}
            </>
          )}
          <Field label={K.reasonLabel} optional optionalText={m.common.optional}>
            {(p) => <Input {...p} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />}
          </Field>
          {error ? <Alert tone="error">{error}</Alert> : null}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} className="min-h-12 rounded-full px-5 font-medium text-muted">{K.keep}</button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                if (!booking) return;
                setBusy(true);
                setError(null);
                try {
                  onDone(await backend.cancelBooking(booking.id, reason.trim(), dest));
                } catch (e) {
                  setError(errorText(m, e));
                } finally {
                  setBusy(false);
                }
              }}
              className="min-h-12 rounded-full bg-red-600 px-6 font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            >
              {K.confirmCancel}
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

/* ---- Wallet --------------------------------------------------------------- */

export function WalletSection({ m, locale }: { m: AppMessages; locale: Locale }) {
  const W = m.ops.wallet;
  const { backend } = useAuth();
  const w = useLoad<Wallet>(() => backend.wallet(), [backend]);
  if (w.error) return <ErrorNote m={m} error={w.error} />;
  if (!w.data) return <LoadingBlocks />;
  const d = w.data;
  return (
    <>
      <PageTitle title={W.title} subtitle={W.subtitle} />
      <section className="relative overflow-hidden rounded-2xl bg-brand-600 p-6 text-white dark:bg-brand-800">
        <div aria-hidden className="absolute -end-10 -top-10 h-44 w-44 rounded-full bg-white/10" />
        <p className="relative flex items-center gap-2 text-sm text-white/85"><IconWallet width={18} height={18} /> {W.balance}</p>
        <p className="relative mt-2 text-3xl font-bold"><Sar h={d.balanceH} locale={locale} /></p>
        <p className="relative mt-2 max-w-md text-xs text-white/80">{W.demo}</p>
      </section>
      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <Panel title={W.activity}>
          {d.entries.length ? (
            <ul className="divide-y divide-[var(--line)]">
              {d.entries.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span>
                    <span className="font-medium">{W.kinds[e.kind]}</span>
                    <span className="text-muted"> · {e.memo === "demo_balance" ? W.demoTopup : <bdi dir="ltr">{e.memo}</bdi>} · {e.account === "parent_external" ? W.card : m.ops.nav.wallet}</span>
                    <span className="block text-xs text-muted">{formatDate(e.createdAt.slice(0, 10), locale)}</span>
                  </span>
                  <span className={cn("font-semibold tabular-nums", e.amountH > 0 ? "text-brand-600 dark:text-brand-300" : "")}>
                    {e.amountH > 0 ? "+" : "−"}<Sar h={Math.abs(e.amountH)} locale={locale} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">{W.none}</p>
          )}
        </Panel>
        <Panel title={W.invoices}>
          {d.invoices.length ? (
            <ul className="space-y-2">
              {d.invoices.map((i) => (
                <li key={i.id}>
                  <Link href={`${href(locale, "/invoice")}?id=${i.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] px-3 py-2.5 text-sm hover:border-brand-300">
                    <span>
                      <span className="font-medium">{i.kind === "invoice" ? m.ops.bk.invoice : m.ops.bk.creditNote}</span> <bdi dir="ltr" className="text-muted">{i.number}</bdi>
                      <span className="block text-xs text-muted"><bdi dir="ltr">{i.bookingCode}</bdi> · {formatDate(i.issuedAt.slice(0, 10), locale)}</span>
                    </span>
                    <Sar h={i.totalH} locale={locale} className="font-semibold" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">{W.none}</p>
          )}
        </Panel>
      </div>
    </>
  );
}
