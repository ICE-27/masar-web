"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { Alert, Checkbox, Field, Input, Skeleton, SubmitButton, Textarea } from "@/components/form";
import { IconCheck, IconChevron, IconPin } from "@/components/icons";
import { AppLink as Link } from "@/components/link";
import { MonthCalendar } from "@/components/ops/month-calendar";
import { ErrorNote, Sar, useLoad } from "@/components/ops/bits";
import { PriceTable } from "@/components/ops/price-table";
import { ButtonLink, cn } from "@/components/ui";
import type { Address, Child, Quote, ServiceDetail } from "@/lib/data";
import { addDays, addMonths, dow, expandPattern, formatDate, formatTime, riyadhToday, startOfMonth, weekdayNames, type IsoDate } from "@/lib/domain/dates";
import { matchService } from "@/lib/domain/match";
import { isExclusive, quoteFor, type Legs, type ServiceType } from "@/lib/domain/pricing";
import { errorText, num, t } from "@/lib/format";
import { href, type Locale } from "@/lib/i18n";
import type { AppMessages } from "@/lib/messages/app.en";
import { useQueryParam, useNavigate } from "@/lib/nav";
import { ageFrom } from "@/lib/validation";
import { reasonDateText } from "./booking-text";

type Mode = "recurring" | "specific" | "once";
const STEPS = ["children", "trip", "dates", "pickup", "review"] as const;

export function BookingWizard({ locale, m }: { locale: Locale; m: AppMessages }) {
  const B = m.ops.book;
  const C = m.ops.common;
  const { backend, status, profile } = useAuth();
  const navigate = useNavigate();
  const serviceId = useQueryParam("service");
  const here = `${href(locale, "/book")}?service=${serviceId ?? ""}`;

  useEffect(() => {
    if (status === "signed-out") navigate(`${href(locale, "/login")}?next=${encodeURIComponent(here)}`, { replace: true });
  }, [status, navigate, locale, here]);

  const ready = status === "signed-in" && profile?.role === "parent";
  const detail = useLoad<ServiceDetail | null>(() => (serviceId ? backend.getService(serviceId) : Promise.resolve(null)), [backend, serviceId]);
  const kids = useLoad<Child[]>(() => (ready ? backend.listChildren() : Promise.resolve([])), [backend, ready]);
  const addrs = useLoad<Address[]>(() => (ready ? backend.listAddresses() : Promise.resolve([])), [backend, ready]);

  const [step, setStep] = useState(0);
  const [childIds, setChildIds] = useState<string[]>([]);
  const [legs, setLegs] = useState<Legs>("both");
  const [type, setType] = useState<ServiceType | null>(null);
  const [attendant, setAttendant] = useState(false);
  const [mode, setMode] = useState<Mode>("recurring");
  const [start, setStart] = useState<IsoDate>(addDays(riyadhToday(), 1));
  const [end, setEnd] = useState<IsoDate>(addMonths(addDays(riyadhToday(), 1), 1));
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [exclude, setExclude] = useState<IsoDate[]>([]);
  const [picked, setPicked] = useState<IsoDate[]>([]);
  const [month, setMonth] = useState(startOfMonth(addDays(riyadhToday(), 1)));
  const [addressId, setAddressId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteErr, setQuoteErr] = useState<unknown>(null);
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);

  const s = detail.data?.service;
  const settings = detail.data?.settings;

  // Defaults once the service is loaded
  useEffect(() => {
    if (!s) return;
    if (!type) {
      const shared = s.pricing.find((p) => !isExclusive(p.serviceType));
      const excl = s.pricing.find((p) => isExclusive(p.serviceType));
      setType((s.sharedEnabled && shared ? shared.serviceType : excl?.serviceType) ?? s.pricing[0]?.serviceType ?? null);
    }
    if (!weekdays.length && s.schedule) setWeekdays(s.schedule.days);
    if (s.schedule && !(s.schedule.outbound && s.schedule.returnTrip)) setLegs(s.schedule.outbound ? "outbound" : "return");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s]);
  useEffect(() => {
    if (addressId === null && addrs.data?.length) setAddressId(addrs.data.find((a) => a.isDefault)?.id ?? addrs.data[0].id);
  }, [addrs.data, addressId]);

  const byDate = useMemo(() => new Map((s?.seatsByDate ?? []).map((x) => [x.date, x])), [s]);
  const children = (kids.data ?? []).filter((c) => childIds.includes(c.id));
  const exclusive = type ? isExclusive(type) : false;
  const need = exclusive ? 0 : Math.max(1, children.length);
  const tomorrow = addDays(riyadhToday(), 1);
  const lastDay = addDays(riyadhToday(), 180);
  const holidays = settings?.holidays ?? [];

  const dateState = (d: IsoDate): "ok" | "off" | "full" => {
    if (d < tomorrow || d > lastDay || !s?.schedule) return "off";
    if (!s.schedule.days.includes(dow(d))) return "off";
    if (holidays.some((h) => d >= h.from && d <= h.to)) return "off";
    const x = byDate.get(d);
    if (!x) return "ok"; // beyond the 90-day seat view: the server checks
    if (x.closed || x.capacity === 0) return "off";
    if (exclusive ? x.taken > 0 : x.capacity - x.taken < need) return "full";
    return "ok";
  };

  const dates: IsoDate[] = useMemo(() => {
    if (mode === "recurring") return expandPattern({ start, end, days: weekdays, exclude }, (d) => dateState(d) === "ok");
    return [...picked].filter((d) => dateState(d) === "ok").sort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, start, end, weekdays, exclude, picked, byDate, need, exclusive, s]);

  const address = (addrs.data ?? []).find((a) => a.id === addressId) ?? null;
  const mr = s && address ? matchService(s, address, { districts: detail.data!.districts, districtName: address.district }) : null;
  const row = s?.pricing.find((p) => p.serviceType === type) ?? null;
  const preview =
    row && settings
      ? quoteFor(row, { legs, surchargeH: mr?.surchargeH ?? 0, children: Math.max(1, children.length), days: dates.length, attendant, t1Pct: s!.discounts.t1Pct, t2Pct: s!.discounts.t2Pct }, settings)
      : null;

  // Server quote for the review step: the authoritative price
  useEffect(() => {
    if (step !== 4 || !s || !type || !addressId) return;
    setQuote(null);
    setQuoteErr(null);
    backend
      .quoteBooking({ serviceId: s.id, serviceType: type, legs, childIds, addressId, dates, attendant })
      .then(setQuote)
      .catch(setQuoteErr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  if (status !== "signed-in" || !profile) return <Frame m={m} locale={locale}><Skeleton className="h-64" /></Frame>;
  if (profile.role !== "parent") return <Frame m={m} locale={locale}><Alert tone="info">{errorText(m, "parents_only")}</Alert></Frame>;
  if (detail.error) return <Frame m={m} locale={locale}><ErrorNote m={m} error={detail.error} /></Frame>;
  if (serviceId === null || (serviceId && !detail.loading && !detail.data)) return <Frame m={m} locale={locale}><Alert tone="info">{errorText(m, "not_found")}</Alert></Frame>;
  if (!s || !kids.data || !addrs.data) return <Frame m={m} locale={locale}><Skeleton className="h-64" /></Frame>;

  const childOk = (c: Child): string | null => {
    const age = ageFrom(c.dateOfBirth);
    if ((s.accepts === "boys" && c.gender === "girl") || (s.accepts === "girls" && c.gender === "boy")) return t(B.genderOut, { accepts: C.accepts[s.accepts] });
    if (age != null && (age < s.ageMin || age > s.ageMax)) return t(B.ageOut, { age: num(age, locale), min: num(s.ageMin, locale), max: num(s.ageMax, locale) });
    return null;
  };
  const maxKids = exclusive && row?.maxChildren ? Math.min(row.maxChildren, s.maxChildrenPerFamily) : s.maxChildrenPerFamily;
  const stepValid = [
    children.length > 0 && children.length <= maxKids,
    !!type,
    dates.length > 0,
    !!address,
    !!quote && quote.problems.length === 0 && quote.bookedDays > 0,
  ];
  const go = (n: number) => {
    setStep(n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const legOptions: Legs[] = s.schedule ? ([...(s.schedule.outbound && s.schedule.returnTrip ? ["both"] : []), ...(s.schedule.outbound ? ["outbound"] : []), ...(s.schedule.returnTrip ? ["return"] : [])] as Legs[]) : ["both"];
  const typeOptions = s.pricing.filter((p) => (isExclusive(p.serviceType) ? s.exclusiveEnabled : s.sharedEnabled));
  const names = weekdayNames(locale, "short");
  const district = mr?.district ?? null;

  async function send() {
    if (!s || !type || !addressId) return;
    setSending(true);
    setSendErr(null);
    try {
      const b = await backend.createBooking({ serviceId: s.id, serviceType: type, legs, childIds, addressId, dates: quote?.dates ?? dates, attendant, note: note.trim() || undefined });
      navigate(`${href(locale, "/account/booking")}?id=${b.id}&new=1`);
    } catch (e) {
      setSendErr(errorText(m, e));
      setSending(false);
    }
  }

  return (
    <Frame m={m} locale={locale} title={t(B.title, { name: s.name })}>
      <ol className="mb-6 grid grid-cols-5 gap-1.5" aria-label={B.title}>
        {STEPS.map((k, i) => (
          <li key={k} aria-current={i === step ? "step" : undefined}>
            <button type="button" disabled={i > step && !stepValid.slice(0, i).every(Boolean)} onClick={() => go(i)} className="block w-full text-start disabled:cursor-default">
              <span className={cn("block h-1.5 rounded-full", i <= step ? "bg-brand-500" : "bg-[var(--line)]")} />
              <span className={cn("mt-1.5 block truncate text-[0.7rem]", i === step ? "font-semibold" : "text-muted")}>{B.steps[k]}</span>
            </button>
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <section>
          <h2 className="text-xl font-bold">{B.childrenTitle}</h2>
          <p className="mt-1 text-sm text-muted">{B.childrenHint}</p>
          {kids.data.length === 0 ? (
            <div className="mt-5">
              <Alert tone="info">{B.noChildren}</Alert>
              <ButtonLink href={href(locale, "/account/children")} className="mt-3">{B.addChild}</ButtonLink>
            </div>
          ) : (
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {kids.data.map((c) => {
                const why = childOk(c);
                const on = childIds.includes(c.id);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      disabled={!!why}
                      aria-pressed={on}
                      onClick={() => setChildIds(on ? childIds.filter((x) => x !== c.id) : [...childIds, c.id])}
                      className={cn("flex w-full items-center gap-3 rounded-2xl border-2 p-4 text-start disabled:opacity-60", on ? "border-brand-500 bg-brand-50 dark:bg-brand-900/30" : "border-[var(--line)]")}
                    >
                      <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2", on ? "border-brand-500 bg-brand-500 text-white" : "border-[var(--line)]")}>{on ? <IconCheck width={14} height={14} /> : null}</span>
                      <span>
                        <span className="block font-semibold">{c.fullName}</span>
                        <span className="block text-xs text-muted">{C.genders[c.gender]} · {num(ageFrom(c.dateOfBirth) ?? 0, locale)}</span>
                        {why ? <span className="mt-1 block text-xs font-medium text-red-600">{B.notAccepted}: {why}</span> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {children.length > maxKids ? <Alert tone="warning" className="mt-3">{t(B.tooMany, { n: num(maxKids, locale) })}</Alert> : null}
          <p className="mt-4 text-xs text-muted">{C.noSibling}</p>
        </section>
      ) : null}

      {step === 1 ? (
        <section className="space-y-6">
          <div>
            <h2 className="text-xl font-bold">{B.tripTitle}</h2>
            <div className="mt-3 grid gap-2">
              {legOptions.map((l) => (
                <OptionCard key={l} on={legs === l} onClick={() => setLegs(l)} title={C.legs[l]} />
              ))}
            </div>
          </div>
          <div>
            <h2 className="text-xl font-bold">{B.typeTitle}</h2>
            <div className="mt-3 grid gap-2">
              {typeOptions.map((p) => (
                <OptionCard key={p.serviceType} on={type === p.serviceType} onClick={() => setType(p.serviceType)} title={C.serviceTypes[p.serviceType]} text={C.serviceTypeHints[p.serviceType]} />
              ))}
            </div>
            {type === "whole_bus" && row?.attendantAvailable ? (
              <div className="mt-3">
                <Checkbox checked={attendant} onChange={setAttendant}>
                  {B.withAttendant} (+<Sar h={row.attendantFeeH ?? 0} locale={locale} /> {C.perDay})
                </Checkbox>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section>
          <h2 className="text-xl font-bold">{B.datesTitle}</h2>
          <div className="mt-3 inline-flex rounded-full border border-[var(--line)] p-1">
            {(["recurring", "specific", "once"] as Mode[]).map((md) => (
              <button
                key={md}
                type="button"
                aria-pressed={mode === md}
                onClick={() => {
                  setMode(md);
                  if (md !== "recurring") setPicked([]);
                }}
                className={cn("min-h-10 rounded-full px-4 text-sm", mode === md ? "bg-brand-500 font-semibold text-white" : "text-muted")}
              >
                {B.modes[md]}
              </button>
            ))}
          </div>
          {mode === "recurring" ? (
            <div className="mt-5 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={B.start}>{(p) => <Input {...p} type="date" min={tomorrow} max={lastDay} value={start} onChange={(e) => { setStart(e.target.value); setMonth(startOfMonth(e.target.value)); }} />}</Field>
                <Field label={B.end}>{(p) => <Input {...p} type="date" min={start} max={lastDay} value={end} onChange={(e) => setEnd(e.target.value)} />}</Field>
              </div>
              <div className="flex flex-wrap gap-2">
                {([["w2", 13], ["m1", 0], ["m3", 0]] as const).map(([k, days]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setEnd(k === "w2" ? addDays(start, days) : addDays(addMonths(start, k === "m1" ? 1 : 3), -1))}
                    className="min-h-10 rounded-full border border-[var(--line)] px-4 text-sm hover:border-brand-400"
                  >
                    {B.presets[k]}
                  </button>
                ))}
              </div>
              <fieldset>
                <legend className="mb-2 text-sm font-medium">{B.weekdays}</legend>
                <div className="flex flex-wrap gap-2">
                  {(s.schedule?.days ?? []).map((d) => {
                    const on = weekdays.includes(d);
                    return (
                      <button key={d} type="button" aria-pressed={on} onClick={() => setWeekdays(on ? weekdays.filter((x) => x !== d) : [...weekdays, d])} className={cn("min-h-11 min-w-14 rounded-full border px-3 text-sm", on ? "border-brand-500 bg-brand-500 font-semibold text-white" : "border-[var(--line)] text-muted line-through")}>
                        {names[d]}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <p className="text-sm text-muted">{B.tapToExclude}</p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted">{B.tapToPick}</p>
          )}
          <div className="mt-4 max-w-md">
            <MonthCalendar
              month={month}
              onMonth={setMonth}
              locale={locale}
              prevLabel={m.ops.sch.prevMonth}
              nextLabel={m.ops.sch.nextMonth}
              minMonth={tomorrow}
              maxMonth={lastDay}
              isDisabled={(d) => dateState(d) !== "ok" && !(mode === "recurring" && exclude.includes(d))}
              onPick={(d) => {
                if (mode === "recurring") {
                  if (d < start || d > end || !weekdays.includes(dow(d))) return;
                  setExclude((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]));
                } else if (mode === "once") setPicked([d]);
                else setPicked((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]));
              }}
              cell={(d) => {
                const st = dateState(d);
                const isPicked = dates.includes(d);
                const isExcluded = mode === "recurring" && exclude.includes(d);
                return {
                  pressed: isPicked,
                  className: isPicked
                    ? "bg-brand-500 font-semibold text-white"
                    : isExcluded
                      ? "bg-red-50 text-red-600 line-through dark:bg-red-950/40"
                      : st === "full"
                        ? "bg-slate-100 text-red-500 dark:bg-slate-800"
                        : st === "off"
                          ? "text-muted/40"
                          : "hover:bg-brand-50 dark:hover:bg-brand-900/30",
                  label: st === "full" ? "×" : undefined,
                };
              }}
            />
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
              <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-brand-500" /> {B.legend.picked}</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-red-100" /> {B.legend.excluded}</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-slate-200" /> {B.legend.full}</span>
            </div>
          </div>
          <p className="mt-4 font-semibold">{dates.length ? t(B.selected, { n: num(dates.length, locale) }) : B.noDates}</p>
        </section>
      ) : null}

      {step === 3 ? (
        <section>
          <h2 className="text-xl font-bold">{B.pickupTitle}</h2>
          <ul className="mt-4 space-y-2">
            {addrs.data.map((a) => (
              <li key={a.id}>
                <OptionCard
                  on={addressId === a.id}
                  onClick={() => setAddressId(a.id)}
                  title={a.customLabel || m.location.labels[a.label]}
                  text={[a.street, a.district, a.city].filter(Boolean).join(locale === "ar" ? "، " : ", ")}
                  icon={<IconPin width={18} height={18} />}
                />
              </li>
            ))}
          </ul>
          <Link href={href(locale, "/account/addresses")} className="mt-3 inline-flex min-h-10 items-center text-sm font-medium text-brand-600 underline underline-offset-4 dark:text-brand-300">
            {B.addAddress}
          </Link>
          {mr ? (
            mr.pickupDistanceM > 2 * s.limits.maxPickupM ? (
              <Alert tone="error" className="mt-4">{t(B.farOff, { km: num(Math.round(mr.pickupDistanceM / 100) / 10, locale) })}</Alert>
            ) : mr.pickupDistanceM > s.limits.maxPickupM ? (
              <Alert tone="warning" className="mt-4">{t(B.outsideRoute, { km: num(Math.round(mr.pickupDistanceM / 100) / 10, locale) })}</Alert>
            ) : !mr.covered ? (
              <Alert tone="warning" className="mt-4">{B.notCovered}</Alert>
            ) : mr.estPickupMin != null ? (
              <Alert tone="success" className="mt-4">{t(B.pickedUpAround, { time: formatTime(mr.estPickupMin, locale), arrive: formatTime(s.schedule?.arriveMin, locale) })}</Alert>
            ) : null
          ) : null}
          <div className="mt-5">
            <Field label={B.noteLabel} hint={B.noteHint}>
              {(p) => <Textarea {...p} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />}
            </Field>
          </div>
        </section>
      ) : null}

      {step === 4 ? (
        <section>
          <h2 className="text-xl font-bold">{B.reviewTitle}</h2>
          {quoteErr ? <ErrorNote m={m} error={quoteErr} className="mt-4" /> : null}
          {!quote && !quoteErr ? <Skeleton className="mt-4 h-72" /> : null}
          {quote ? (
            <div className="mt-4 space-y-4">
              {quote.problems.length ? (
                <Alert tone="error" title={B.fixProblems}>
                  {quote.problems.map((p) => t(errorText(m, p.code), { s: String(p.detail ?? "") })).join(" ")}
                </Alert>
              ) : null}
              {quote.unavailable.length ? (
                <Alert tone="warning" title={t(B.unavailableDates, { n: num(quote.unavailable.length, locale) })}>
                  {quote.unavailable.map((u) => reasonDateText(m, locale, u)).join(locale === "ar" ? "، " : ", ")}
                </Alert>
              ) : null}
              <div className="rounded-2xl border border-[var(--line)] p-4 text-sm">
                <p className="font-semibold">{children.map((c) => c.fullName.split(" ")[0]).join(locale === "ar" ? "، " : ", ")} · {C.legs[legs]}</p>
                <p className="mt-1 text-muted">
                  {C.serviceTypes[quote.serviceType]} · {num(quote.bookedDays, locale)} {C.days} · {formatDate(quote.dates[0] ?? dates[0], locale, "short")} – {formatDate(quote.dates[quote.dates.length - 1] ?? dates[dates.length - 1], locale, "short")}
                </p>
                {quote.estPickupMin != null ? <p className="mt-1">{t(B.pickedUpAround, { time: formatTime(quote.estPickupMin, locale), arrive: formatTime(s.schedule?.arriveMin, locale) })}</p> : null}
                {quote.outsideRoute ? <p className="mt-1 text-accent-700 dark:text-accent-300">{quote.covered ? t(B.outsideRoute, { km: num(Math.round(quote.pickupDistanceM / 100) / 10, locale) }) : B.notCovered}</p> : null}
              </div>
              <PriceTable
                m={m}
                locale={locale}
                serviceType={quote.serviceType}
                districtName={district ? (locale === "ar" ? district.nameAr : district.nameEn) : null}
                baseRateH={quote.baseRateH}
                surchargeH={quote.surchargeH}
                rateH={quote.rateH}
                units={quote.units}
                childrenCount={quote.childrenCount}
                days={quote.bookedDays}
                attendantFeeH={quote.attendantFeeH}
                price={quote.price}
              />
              <ul className="space-y-1.5 text-sm text-muted">
                <li>• {t(B.paySchedule, { h: num(settings!.paymentHoldHours, locale) })}</li>
                <li>• {t(B.cancelPolicy, { n: num(settings!.cancelNoticeDays, locale) })}</li>
                {quote.requestExpiresAt ? <li>• {t(B.deadline, { time: new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-arab" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(quote.requestExpiresAt)) })}</li> : null}
                <li>• {C.noSibling}</li>
              </ul>
              {sendErr ? <Alert tone="error">{sendErr}</Alert> : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Footer: running price and navigation */}
      <div className="sticky bottom-0 -mx-5 mt-8 border-t border-[var(--line)] bg-[var(--card)]/95 px-5 py-4 backdrop-blur sm:-mx-8 sm:px-8">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            {preview && dates.length && step < 4 ? (
              <>
                <p className="text-lg font-bold"><Sar h={preview.totalH} locale={locale} /></p>
                <p className="text-xs text-muted">{num(dates.length, locale)} {C.days}{preview.discountPct ? ` · −${num(preview.discountPct, locale)}%` : ""}</p>
              </>
            ) : step === 4 && quote ? (
              <p className="text-lg font-bold"><Sar h={quote.price.totalH} locale={locale} /></p>
            ) : null}
          </div>
          <div className="flex gap-2">
            {step > 0 ? (
              <button type="button" onClick={() => go(step - 1)} className="inline-flex min-h-12 items-center gap-1 rounded-full px-4 font-medium text-muted">
                <IconChevron width={18} height={18} className="rotate-180 rtl:rotate-0" /> {m.common.back}
              </button>
            ) : null}
            {step < 4 ? (
              <button type="button" disabled={!stepValid[step]} onClick={() => go(step + 1)} className="min-h-12 rounded-full bg-brand-500 px-6 font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
                {m.common.continue}
              </button>
            ) : (
              <SubmitButton type="button" busy={sending} busyText={B.sending} disabled={!stepValid[4]} onClick={send}>
                {B.send}
              </SubmitButton>
            )}
          </div>
        </div>
      </div>
    </Frame>
  );
}

function Frame({ m, locale, title, children }: { m: AppMessages; locale: Locale; title?: string; children: React.ReactNode }) {
  return (
    <div className="mesh-hero min-h-[calc(100dvh-4rem)] pb-10">
      <div className="container-page max-w-3xl pt-6 sm:pt-10">
        <Link href={href(locale, "/search")} className="mb-3 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-muted hover:text-[var(--ink)]">
          <IconChevron width={16} height={16} className="rotate-180 rtl:rotate-0" /> {m.ops.service.back}
        </Link>
        {title ? <h1 className="mb-5 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1> : null}
        <div className="rounded-3xl border border-[var(--line)] bg-[var(--card)] p-5 shadow-[var(--shadow-soft)] sm:p-8">{children}</div>
      </div>
    </div>
  );
}

function OptionCard({ on, onClick, title, text, icon }: { on: boolean; onClick: () => void; title: string; text?: string; icon?: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={cn("flex w-full items-start gap-3 rounded-2xl border-2 p-4 text-start", on ? "border-brand-500 bg-brand-50 dark:bg-brand-900/30" : "border-[var(--line)] hover:border-brand-300")}>
      <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2", on ? "border-brand-500 bg-brand-500 text-white" : "border-[var(--line)]")}>{on ? <span className="h-2 w-2 rounded-full bg-white" /> : null}</span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 font-semibold">{icon}{title}</span>
        {text ? <span className="mt-0.5 block text-sm text-muted">{text}</span> : null}
      </span>
    </button>
  );
}
