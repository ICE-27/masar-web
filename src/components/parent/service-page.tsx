"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { Alert } from "@/components/form";
import { IconBus, IconCar, IconCheck, IconChevron, IconClock, IconShield } from "@/components/icons";
import { AppLink as Link } from "@/components/link";
import { RouteMap, useIsDark } from "@/components/map/route-map-lazy";
import { MonthCalendar } from "@/components/ops/month-calendar";
import { Avatar, ErrorNote, LoadingBlocks, Panel, VerifiedBadge, useLoad } from "@/components/ops/bits";
import { ButtonLink, cn } from "@/components/ui";
import type { ServiceDetail } from "@/lib/data";
import { addDays, formatDate, formatTime, riyadhToday, startOfMonth, weekdayNames } from "@/lib/domain/dates";
import { matchService } from "@/lib/domain/match";
import { formatSar } from "@/lib/domain/money";
import { defaultOneWay, isExclusive } from "@/lib/domain/pricing";
import { errorText, num, t } from "@/lib/format";
import { href, type Locale } from "@/lib/i18n";
import type { AppMessages } from "@/lib/messages/app.en";
import { useQueryParam } from "@/lib/nav";
import { savedPickup, type PickupPoint } from "./search";

export function ServicePage({ locale, m }: { locale: Locale; m: AppMessages }) {
  const S = m.ops.service;
  const C = m.ops.common;
  const { backend, status } = useAuth();
  const dark = useIsDark();
  const id = useQueryParam("id");
  const detail = useLoad<ServiceDetail | null>(() => (id ? backend.getService(id) : Promise.resolve(null)), [backend, id]);
  const [pickup, setPickup] = useState<PickupPoint | null>(null);
  const [month, setMonth] = useState(startOfMonth(addDays(riyadhToday(), 1)));
  useEffect(() => setPickup(savedPickup()), []);

  if (detail.error) {
    return (
      <div className="container-page max-w-3xl py-10">
        <ErrorNote m={m} error={detail.error} />
        <ButtonLink href={href(locale, "/search")} className="mt-4">{S.back}</ButtonLink>
      </div>
    );
  }
  if (id === null || (id && !detail.loading && !detail.data)) {
    return (
      <div className="container-page max-w-3xl py-10">
        <Alert tone="info">{errorText(m, "not_found")}</Alert>
        <ButtonLink href={href(locale, "/search")} className="mt-4">{S.back}</ButtonLink>
      </div>
    );
  }
  if (!detail.data) return <div className="container-page max-w-5xl py-10"><LoadingBlocks n={4} /></div>;

  const { service: s, settings, districts } = detail.data;
  const d = s.driver!;
  const v = d.vehicle;
  const name = locale === "ar" ? d.firstNameAr || d.firstNameEn : d.firstNameEn || d.firstNameAr;
  const mr = pickup ? matchService(s, pickup, { districts, districtName: pickup.districtName }) : null;
  const days = weekdayNames(locale, "long");
  const sch = s.schedule;
  const byDate = new Map(s.seatsByDate.map((x) => [x.date, x]));
  const bookHref = `${href(locale, "/book")}?service=${s.id}`;
  const destName = locale === "ar" ? s.destination.nameAr : s.destination.nameEn;
  const sar = (h: number) => formatSar(h, locale, { compact: false });

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-[var(--page-subtle)] pb-28">
      <div className="container-page max-w-5xl pt-6">
        <Link href={href(locale, "/search")} className="mb-4 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-muted hover:text-[var(--ink)]">
          <IconChevron width={16} height={16} className="rotate-180 rtl:rotate-0" /> {S.back}
        </Link>

        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-6">
            <header className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5 sm:p-6">
              <p className="text-sm font-semibold text-brand-600 dark:text-brand-300">{C.kinds[s.kind]}</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{s.name}</h1>
              <p className="mt-1 text-muted">{destName}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-[var(--page-subtle)] px-2.5 py-1">{C.accepts[s.accepts]}</span>
                <span className="rounded-full bg-[var(--page-subtle)] px-2.5 py-1">{t(S.ages, { min: num(s.ageMin, locale), max: num(s.ageMax, locale) })}</span>
                <span className="rounded-full bg-[var(--page-subtle)] px-2.5 py-1">{t(S.perFamily, { n: num(s.maxChildrenPerFamily, locale) })}</span>
              </div>
            </header>

            <Panel title={S.route} className="overflow-hidden !p-0">
              <div className="px-5 pb-4 sm:px-6">
                {mr ? (
                  <p className="text-sm text-muted">
                    {mr.pickupDistanceM < 150 ? m.ops.search.onRoute : t(m.ops.search.fromRoute, { km: num(Math.round(mr.pickupDistanceM / 100) / 10, locale) })}
                    {mr.estPickupMin != null ? ` · ${t(m.ops.search.pickedUp, { time: formatTime(mr.estPickupMin, locale) })}` : ""}
                  </p>
                ) : null}
              </div>
              <RouteMap
                routes={[{ id: "r", path: s.path }]}
                markers={[
                  { id: "start", lat: s.start.lat, lng: s.start.lng, kind: "start" },
                  ...s.stops.map((x, i) => ({ id: `s${i}`, lat: x.lat, lng: x.lng, kind: "stop" as const, n: i + 1, label: x.label })),
                  ...(s.destination.lat != null && s.destination.lng != null ? [{ id: "d", lat: s.destination.lat, lng: s.destination.lng, kind: "dest" as const, label: destName }] : []),
                  ...(pickup ? [{ id: "home", lat: pickup.lat, lng: pickup.lng, kind: "home" as const, label: pickup.label }] : []),
                ]}
                fitKey={s.id}
                label={S.route}
                dark={dark}
                attribution={m.location.attribution}
                className="h-72 sm:h-96"
              />
            </Panel>

            <Panel title={S.schedule}>
              {sch ? (
                <div className="space-y-3 text-sm">
                  <p className="font-medium">{sch.days.map((x) => days[x]).join(locale === "ar" ? "، " : ", ")}</p>
                  {sch.outbound ? (
                    <p className="flex items-start gap-2">
                      <IconClock width={18} height={18} className="mt-0.5 shrink-0 text-brand-500" />
                      <span>
                        <span className="font-medium">{t(S.outbound, { dest: destName })}: </span>
                        {t(S.pickups, { from: formatTime(sch.pickupStartMin, locale), to: formatTime(sch.pickupEndMin, locale), arrive: formatTime(sch.arriveMin, locale) })}
                      </span>
                    </p>
                  ) : null}
                  {sch.returnTrip ? (
                    <p className="flex items-start gap-2">
                      <IconClock width={18} height={18} className="mt-0.5 shrink-0 text-brand-500" />
                      <span>
                        <span className="font-medium">{S.returnLeg}: </span>
                        {t(S.returnTimes, { depart: formatTime(sch.returnDepartMin, locale), end: formatTime(sch.returnEndMin, locale) })}
                      </span>
                    </p>
                  ) : null}
                </div>
              ) : null}
              <h3 className="mb-3 mt-6 text-sm font-semibold">{S.seatsCalendar}</h3>
              <div className="max-w-md">
                <MonthCalendar
                  month={month}
                  onMonth={setMonth}
                  locale={locale}
                  prevLabel={m.ops.sch.prevMonth}
                  nextLabel={m.ops.sch.nextMonth}
                  minMonth={riyadhToday()}
                  maxMonth={addDays(riyadhToday(), 85)}
                  cell={(day) => {
                    const x = byDate.get(day);
                    if (!x) return { className: "text-muted/50" };
                    if (x.closed || x.capacity === 0) return { className: "bg-slate-100 text-muted line-through dark:bg-slate-800", label: "—" };
                    const free = x.capacity - x.taken;
                    return { className: free > 0 ? "bg-brand-50 text-brand-800 dark:bg-brand-900/30 dark:text-brand-100" : "bg-red-50 text-red-700 dark:bg-red-950/30", label: num(free, locale) };
                  }}
                />
              </div>
            </Panel>

            <Panel title={S.vehicle}>
              <p className="flex items-center gap-2 font-medium">
                {v.type === "bus" ? <IconBus /> : <IconCar />} {[v.make, v.model, v.year].filter(Boolean).join(" ")} · {v.color ? `${v.color} · ` : ""}{t(C.seats, { n: num(v.seats ?? 0, locale) })}
              </p>
              <p className="mt-1 text-sm text-muted">{v.type === "car" ? (v.carCategory ? C.carCategories[v.carCategory] : "") : v.busType ? C.busTypes[v.busType] : ""}</p>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {(["ac", "seatbelts", "gps", "cameras", "femaleAttendant", "wheelchair"] as const).map((k) => (
                  <li key={k} className={cn("flex items-center gap-2 text-sm", !v[k] && "text-muted line-through")}>
                    <IconCheck width={16} height={16} className={v[k] ? "text-brand-500" : "opacity-30"} /> {C.amenities[k]}
                  </li>
                ))}
              </ul>
              {d.carPhotos.length ? (
                <div className="mt-4 flex gap-2 overflow-x-auto">
                  {d.carPhotos.map((p) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={p} src={backend.mediaUrl(p) ?? ""} alt="" className="h-24 w-32 shrink-0 rounded-xl object-cover" />
                  ))}
                </div>
              ) : null}
            </Panel>

            <Panel title={S.driver}>
              <div className="flex items-start gap-4">
                <Avatar name={name} url={backend.mediaUrl(d.photo)} size={64} />
                <div>
                  <p className="flex flex-wrap items-center gap-2 text-lg font-bold">
                    {name} {d.verified ? <VerifiedBadge m={m} /> : null}
                  </p>
                  <p className="text-sm text-muted">
                    {C.genders[d.gender]}
                    {d.yearsExperience ? ` · ${t(C.yearsExp, { n: num(d.yearsExperience, locale) })}` : ""}
                    {d.memberSince ? ` · ${t(S.memberSince, { date: formatDate(d.memberSince.slice(0, 10), locale) })}` : ""}
                  </p>
                  {d.languages?.length ? <p className="text-sm text-muted">{t(S.languages, { list: d.languages.map((l) => (m.ops.dw.account.langs as Record<string, string>)[l] ?? l).join(locale === "ar" ? "، " : ", ") })}</p> : null}
                  {d.bio ? <p className="mt-2 text-sm">“{d.bio}”</p> : null}
                  <p className="mt-2 text-xs font-medium text-accent-700 dark:text-accent-300">{C.newDriver}</p>
                </div>
              </div>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {d.checks.map((c) => (
                  <li key={c} className="flex items-center gap-2 text-sm">
                    <IconShield width={16} height={16} className="text-brand-500" /> {(S.checks as Record<string, string>)[c] ?? c}
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          {/* Prices and booking */}
          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <Panel title={S.prices}>
              <ul className="space-y-4">
                {s.pricing
                  .filter((p) => (isExclusive(p.serviceType) ? s.exclusiveEnabled : s.sharedEnabled))
                  .map((p) => {
                    const sur = mr?.surchargeH ?? 0;
                    return (
                      <li key={p.serviceType}>
                        <p className="text-sm font-semibold">{C.serviceTypes[p.serviceType]}</p>
                        <p className="mt-1 text-xl font-bold">
                          <bdi>{sar(p.dailyH + sur)}</bdi> <span className="text-sm font-normal text-muted">{C.perDay} {isExclusive(p.serviceType) ? "" : C.twoTrips}</span>
                        </p>
                        <p className="text-xs text-muted">{t(S.oneWay, { amount: sar((p.oneWayH ?? defaultOneWay(p.dailyH)) + sur) })}</p>
                        {p.serviceType === "whole_bus" && p.attendantAvailable ? <p className="text-xs text-muted">{t(m.ops.price.attendant, { days: "1", fee: sar(p.attendantFeeH ?? 0) })}</p> : null}
                        {pickup && sur ? <p className="text-xs text-accent-700 dark:text-accent-300">{S.yourPrice}: +{sar(sur)}</p> : null}
                      </li>
                    );
                  })}
              </ul>
              <p className="mt-4 text-xs text-muted">{C.plusFees} · {C.noSibling}</p>
              {s.discounts.t1Pct || s.discounts.t2Pct ? (
                <p className="mt-3 rounded-xl bg-accent-50 px-3 py-2 text-xs font-semibold text-accent-700 dark:bg-accent-700/20 dark:text-accent-200">
                  {t(m.ops.price.tiers, { p1: num(s.discounts.t1Pct, locale), t1: num(s.discounts.t1Days, locale), p2: num(s.discounts.t2Pct, locale), t2: num(s.discounts.t2Days, locale) })}
                </p>
              ) : null}
              <p className="mt-3 text-xs text-muted">
                VAT {num(settings.vatBp / 100, locale)}% · Masar {num(settings.feeBp / 100, locale)}%
              </p>
              <ButtonLink href={status === "signed-in" ? bookHref : `${href(locale, "/login")}?next=${encodeURIComponent(bookHref)}`} size="lg" className="mt-5 w-full">
                {S.book}
              </ButtonLink>
              {status !== "signed-in" ? <p className="mt-2 text-center text-xs text-muted">{C.signInToContinue}</p> : null}
            </Panel>
            <Panel title={S.pickupAreas}>
              <ul className="flex flex-wrap gap-1.5">
                {s.coverage.map((c) => {
                  const dd = districts.find((x) => x.id === c.districtId);
                  return (
                    <li key={c.districtId} className={cn("rounded-full px-2.5 py-1 text-xs", mr?.district?.id === c.districtId ? "bg-brand-500 font-semibold text-white" : "bg-[var(--page-subtle)]")}>
                      {dd ? (locale === "ar" ? dd.nameAr : dd.nameEn) : c.districtId}
                      {c.surchargeH ? ` +${formatSar(c.surchargeH, locale)}` : ""}
                    </li>
                  );
                })}
              </ul>
              {mr && !mr.covered ? <Alert tone="warning" className="mt-3">{m.ops.book.notCovered}</Alert> : null}
            </Panel>
          </aside>
        </div>
      </div>
      {/* Sticky book bar on phones */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--line)] bg-[var(--page)]/95 p-3 backdrop-blur-md lg:hidden" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}>
        <ButtonLink href={status === "signed-in" ? bookHref : `${href(locale, "/login")}?next=${encodeURIComponent(bookHref)}`} size="lg" className="w-full">
          {S.book}
        </ButtonLink>
      </div>
    </div>
  );
}
