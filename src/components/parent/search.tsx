"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { Alert, Field, Input, Select } from "@/components/form";
import { IconBus, IconCar, IconLocate, IconPin, IconSearch, IconSpinner, IconUsers } from "@/components/icons";
import { AppLink as Link } from "@/components/link";
import { RouteMap, RouteSketch, useIsDark } from "@/components/map/route-map-lazy";
import { Avatar, EmptyState, ErrorNote, LoadingBlocks, Tabs, VerifiedBadge, useLoad } from "@/components/ops/bits";
import { ButtonLink, cn } from "@/components/ui";
import type { Address, Child, SearchData, ServiceRecord } from "@/lib/data";
import { formatTime, weekdayNames } from "@/lib/domain/dates";
import { matchService, type MatchResult } from "@/lib/domain/match";
import { formatSar } from "@/lib/domain/money";
import { isExclusive } from "@/lib/domain/pricing";
import { num, t } from "@/lib/format";
import { detectLocation, GeoError, osmGeocoder, type LatLng, type PlaceResult } from "@/lib/geo";
import { href, type Locale } from "@/lib/i18n";
import type { AppMessages } from "@/lib/messages/app.en";
import { ageFrom } from "@/lib/validation";

export interface PickupPoint extends LatLng {
  label: string;
  districtName?: string | null;
  addressId?: string;
}

const PICKUP_KEY = "masar-search-pickup";

export function savedPickup(): PickupPoint | null {
  try {
    const raw = sessionStorage.getItem(PICKUP_KEY);
    return raw ? (JSON.parse(raw) as PickupPoint) : null;
  } catch {
    return null;
  }
}

type Filters = {
  type: "any" | "shared" | "exclusive";
  vehicle: "any" | "car" | "bus";
  gender: "any" | "male" | "female";
  attendant: "any" | "required" | "female";
  maxPrice: string;
  days: number[];
  ac: boolean;
  cameras: boolean;
  seatbelts: boolean;
  maxJourney: string;
  destination: string;
};

const NO_FILTERS: Filters = { type: "any", vehicle: "any", gender: "any", attendant: "any", maxPrice: "", days: [], ac: false, cameras: false, seatbelts: false, maxJourney: "", destination: "" };

/** Finding a ride needs an account: visitors first choose parent or driver. */
export function SearchPage({ locale, m }: { locale: Locale; m: AppMessages }) {
  const { status } = useAuth();
  if (status === "loading") {
    return (
      <div className="container-page max-w-3xl py-10">
        <LoadingBlocks n={2} />
      </div>
    );
  }
  if (status !== "signed-in") return <RoleGate locale={locale} m={m} />;
  return <SearchInner locale={locale} m={m} />;
}

function RoleGate({ locale, m }: { locale: Locale; m: AppMessages }) {
  const G = m.ops.gate;
  const next = encodeURIComponent(href(locale, "/search"));
  const cards = [
    {
      key: "parent",
      icon: <IconUsers width={26} height={26} />,
      title: G.parentTitle,
      text: G.parentText,
      primary: { href: href(locale, "/signup"), label: G.parentSignUp },
      secondary: { href: `${href(locale, "/login")}?next=${next}`, label: G.signIn },
    },
    {
      key: "driver",
      icon: <IconBus width={26} height={26} />,
      title: G.driverTitle,
      text: G.driverText,
      primary: { href: href(locale, "/driver/join"), label: G.driverJoin },
      secondary: { href: `${href(locale, "/login")}?next=${encodeURIComponent(href(locale, "/driver"))}`, label: G.signIn },
    },
  ];
  return (
    <div className="mesh-hero min-h-[calc(100dvh-4rem)] pb-16">
      <div className="container-page max-w-3xl pt-10 sm:pt-16">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{G.title}</h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted sm:text-base">{G.subtitle}</p>
        </div>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {cards.map((c) => (
            <li key={c.key} className="flex flex-col rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6 shadow-[var(--shadow-soft)]">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300">{c.icon}</span>
              <h2 className="mt-4 text-lg font-bold">{c.title}</h2>
              <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted">{c.text}</p>
              <div className="mt-5 flex flex-col gap-2.5">
                <ButtonLink href={c.primary.href} className="w-full">{c.primary.label}</ButtonLink>
                <ButtonLink href={c.secondary.href} variant="secondary" className="w-full">{c.secondary.label}</ButtonLink>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function SearchInner({ locale, m }: { locale: Locale; m: AppMessages }) {
  const S = m.ops.search;
  const { backend, status, profile } = useAuth();
  const dark = useIsDark();
  const data = useLoad<SearchData>(() => backend.searchServices(), [backend]);
  const isParent = status === "signed-in" && profile?.role === "parent";
  const addrs = useLoad<Address[]>(() => (isParent ? backend.listAddresses() : Promise.resolve([])), [backend, isParent]);
  const kids = useLoad<Child[]>(() => (isParent ? backend.listChildren() : Promise.resolve([])), [backend, isParent]);
  const [pickup, setPickup] = useState<PickupPoint | null>(null);
  const [childIds, setChildIds] = useState<string[] | null>(null);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [view, setView] = useState<"list" | "map">("list");
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  // Start from the saved default address, or the last point used
  useEffect(() => {
    if (pickup) return;
    const last = savedPickup();
    if (last) {
      setPickup(last);
      return;
    }
    const home = addrs.data?.find((a) => a.isDefault);
    if (home) setPickup({ lat: home.lat, lng: home.lng, label: home.customLabel || m.location.labels[home.label], districtName: home.district, addressId: home.id });
  }, [addrs.data, pickup, m.location.labels]);

  useEffect(() => {
    if (pickup) {
      try {
        sessionStorage.setItem(PICKUP_KEY, JSON.stringify(pickup));
      } catch {
        /* storage blocked */
      }
    }
  }, [pickup]);

  useEffect(() => {
    if (kids.data && childIds === null) setChildIds(kids.data.map((c) => c.id));
  }, [kids.data, childIds]);

  const chosenKids = (kids.data ?? []).filter((c) => (childIds ?? []).includes(c.id));
  const results = useMemo(() => {
    if (!data.data || !pickup) return { match: [], near: [] } as { match: Ranked[]; near: Ranked[] };
    return rank(data.data, pickup, chosenKids, filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.data, pickup, filters, childIds, kids.data]);

  const destinations = useMemo(() => {
    const seen = new Map<string, ServiceRecord["destination"]>();
    for (const s of data.data?.services ?? []) seen.set(s.destination.id, s.destination);
    return [...seen.values()];
  }, [data.data]);

  const all = [...results.match, ...results.near];
  const activeFilters = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-[var(--page-subtle)] pb-16">
      <div className="container-page pt-6 sm:pt-10">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{S.title}</h1>
        <p className="mt-1.5 text-sm text-muted sm:text-base">{S.subtitle}</p>

        <div className="mt-6 grid gap-6 lg:grid-cols-[22rem_1fr]">
          {/* Controls */}
          <aside className="space-y-4">
            <PickupPicker m={m} locale={locale} value={pickup} onChange={setPickup} addresses={addrs.data ?? []} />
            {isParent && (kids.data ?? []).length ? (
              <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4">
                <h2 className="mb-2 text-sm font-semibold">{S.forChildren}</h2>
                <div className="flex flex-wrap gap-2">
                  {(kids.data ?? []).map((c) => {
                    const on = (childIds ?? []).includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setChildIds((ids) => (on ? (ids ?? []).filter((x) => x !== c.id) : [...(ids ?? []), c.id]))}
                        className={cn("min-h-10 rounded-full border px-3.5 text-sm", on ? "border-brand-500 bg-brand-50 font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-200" : "border-[var(--line)]")}
                      >
                        {c.fullName.split(" ")[0]}
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}
            <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4">
              <Field label={S.destination}>
                {(p) => (
                  <Select {...p} value={filters.destination} onChange={(e) => setFilters((f) => ({ ...f, destination: e.target.value }))}>
                    <option value="">{S.anyDestination}</option>
                    {destinations.map((d) => (
                      <option key={d.id} value={d.id}>{locale === "ar" ? d.nameAr : d.nameEn}</option>
                    ))}
                  </Select>
                )}
              </Field>
              <div className="mt-3 flex items-center justify-between">
                <button type="button" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters} className="min-h-10 text-sm font-semibold text-brand-600 dark:text-brand-300">
                  {S.filters} {activeFilters ? "•" : ""}
                </button>
                {activeFilters ? (
                  <button type="button" onClick={() => setFilters(NO_FILTERS)} className="min-h-10 text-sm text-muted underline underline-offset-4">
                    {S.clearFilters}
                  </button>
                ) : null}
              </div>
              {showFilters ? <FilterPanel m={m} locale={locale} value={filters} onChange={setFilters} /> : null}
            </section>
          </aside>

          {/* Results */}
          <section aria-live="polite">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="font-semibold">
                {pickup && data.data ? (results.match.length === 1 ? S.resultsOne : t(S.results, { n: num(results.match.length, locale) })) : ""}
              </p>
              <Tabs label={S.title} value={view} onChange={setView} items={[{ value: "list", label: S.list }, { value: "map", label: S.map }]} />
            </div>
            <ErrorNote m={m} error={data.error} className="mb-4" />
            {!data.data ? (
              data.error ? null : <LoadingBlocks />
            ) : !pickup ? (
              <EmptyState text={S.pinFirst} icon={<IconPin />} />
            ) : view === "map" ? (
              <div className="overflow-hidden rounded-2xl border border-[var(--line)]">
                <RouteMap
                  routes={all.map((r) => ({
                    id: r.s.id,
                    path: r.s.path,
                    color: r.s.id === selected ? "#f0b94f" : r.m.status === "match" ? "#009767" : "#94a3b8",
                    weight: r.s.id === selected ? 7 : 4,
                    label: r.s.name,
                    onClick: () => setSelected(r.s.id),
                  }))}
                  markers={[{ id: "home", lat: pickup.lat, lng: pickup.lng, kind: "home", label: pickup.label }]}
                  fitKey={`${pickup.lat}-${all.length}`}
                  label={S.map}
                  dark={dark}
                  attribution={m.location.attribution}
                  className="h-[60vh]"
                  center={pickup}
                />
                {selected ? (
                  <div className="border-t border-[var(--line)] bg-[var(--card)] p-3">
                    {all.filter((r) => r.s.id === selected).map((r) => (
                      <ResultCard key={r.s.id} r={r} m={m} locale={locale} pickup={pickup} />
                    ))}
                  </div>
                ) : null}
              </div>
            ) : all.length === 0 ? (
              <EmptyState
                icon={<IconSearch />}
                text={
                  <>
                    <span className="block text-base font-semibold text-[var(--ink)]">{S.emptyTitle}</span>
                    <span className="mt-1 block">{S.emptyText}</span>
                  </>
                }
              />
            ) : (
              <div className="space-y-6">
                <ul className="space-y-4">
                  {results.match.map((r) => (
                    <li key={r.s.id}>
                      <ResultCard r={r} m={m} locale={locale} pickup={pickup} />
                    </li>
                  ))}
                </ul>
                {results.near.length ? (
                  <div>
                    <h2 className="font-semibold">{S.nearTitle}</h2>
                    <p className="mb-3 text-sm text-muted">{S.nearText}</p>
                    <ul className="space-y-4">
                      {results.near.map((r) => (
                        <li key={r.s.id}>
                          <ResultCard r={r} m={m} locale={locale} pickup={pickup} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

type Ranked = { s: ServiceRecord; m: MatchResult; priceH: number; exclusiveOnly: boolean };

function rank(data: SearchData, pickup: PickupPoint, kids: Child[], f: Filters): { match: Ranked[]; near: Ranked[] } {
  const children = kids.map((c) => ({ gender: c.gender, age: ageFrom(c.dateOfBirth) }));
  const out: Ranked[] = [];
  for (const s of data.services) {
    const v = s.driver?.vehicle;
    if (f.destination && s.destination.id !== f.destination) continue;
    if (f.type === "shared" && !s.sharedEnabled) continue;
    if (f.type === "exclusive" && !s.exclusiveEnabled) continue;
    if (f.vehicle !== "any" && v?.type !== f.vehicle) continue;
    if (f.gender !== "any" && s.driver?.gender !== f.gender) continue;
    if (f.attendant === "female" && !v?.femaleAttendant) continue;
    if (f.attendant === "required" && !v?.femaleAttendant && !s.pricing.some((p) => p.attendantAvailable)) continue;
    if (f.ac && !v?.ac) continue;
    if (f.cameras && !v?.cameras) continue;
    if (f.seatbelts && !v?.seatbelts) continue;
    const exclusiveOnly = !s.sharedEnabled;
    const needed = exclusiveOnly ? 1 : Math.max(1, children.length);
    const mr = matchService(s, pickup, {
      districts: data.districts,
      districtName: pickup.districtName,
      children,
      days: f.days.length ? f.days : undefined,
      seatsNeeded: exclusiveOnly ? (s.schedule?.seats ?? 1) : needed,
      maxJourneyMin: f.maxJourney ? Number(f.maxJourney) : null,
    });
    if (mr.status === "none") continue;
    const row = s.pricing.find((p) => (exclusiveOnly ? isExclusive(p.serviceType) : !isExclusive(p.serviceType))) ?? s.pricing[0];
    const priceH = (row?.dailyH ?? 0) + mr.surchargeH;
    if (f.maxPrice && !exclusiveOnly && priceH > Number(f.maxPrice) * 100) continue;
    out.push({ s, m: mr, priceH, exclusiveOnly });
  }
  out.sort((a, b) => a.m.pickupDistanceM - b.m.pickupDistanceM || a.priceH - b.priceH);
  return { match: out.filter((r) => r.m.status === "match"), near: out.filter((r) => r.m.status === "near") };
}

function ResultCard({ r, m, locale, pickup }: { r: Ranked; m: AppMessages; locale: Locale; pickup: PickupPoint }) {
  const S = m.ops.search;
  const C = m.ops.common;
  const { s, m: mr } = r;
  const d = s.driver!;
  const v = d.vehicle;
  const { backend } = useAuth();
  const name = locale === "ar" ? d.firstNameAr || d.firstNameEn : d.firstNameEn || d.firstNameAr;
  const days = weekdayNames(locale, "short");
  const km = (x: number) => num(Math.round(x / 100) / 10, locale);
  const areas = s.coverage.length;
  return (
    <article className={cn("rounded-2xl border bg-[var(--card)] p-4 transition-shadow hover:shadow-[var(--shadow-soft)] sm:p-5", mr.status === "match" ? "border-[var(--line)]" : "border-dashed border-[var(--line)]")}>
      <div className="flex gap-4">
        <Avatar name={name} url={backend.mediaUrl(d.photo)} size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-bold">{name}</h3>
            {d.verified ? <VerifiedBadge m={m} /> : null}
            <span className="text-xs text-muted">{C.genders[d.gender]}</span>
            <span className="rounded-full bg-accent-50 px-2 py-0.5 text-[0.7rem] font-semibold text-accent-700 dark:bg-accent-700/20 dark:text-accent-200">{C.newDriver}</span>
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
            {v.type === "bus" ? <IconBus width={16} height={16} /> : <IconCar width={16} height={16} />}
            {[v.make, v.model, v.year].filter(Boolean).join(" ")} · {t(C.seats, { n: num(v.seats ?? 0, locale) })}
          </p>
          <p className="mt-1 text-sm font-medium">{s.name}</p>
          <p className="text-sm text-muted">
            {locale === "ar" ? s.destination.nameAr : s.destination.nameEn}
            {s.schedule ? ` · ${s.schedule.days.map((x) => days[x]).join(" ")}` : ""}
            {s.schedule?.outbound ? ` · ${formatTime(s.schedule.pickupStartMin, locale)}` : ""}
          </p>
        </div>
        <RouteSketch path={s.path} home={pickup} className="hidden h-[72px] w-[120px] shrink-0 sm:block" label={s.name} />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
        <span className="rounded-full bg-brand-50 px-2.5 py-1 font-medium text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">{t(C.seatsFree, { n: num(mr.minFreeSeats, locale) })}</span>
        <span className="rounded-full bg-[var(--page-subtle)] px-2.5 py-1">{mr.pickupDistanceM < 150 ? S.onRoute : t(S.fromRoute, { km: km(mr.pickupDistanceM) })}</span>
        <span className="rounded-full bg-[var(--page-subtle)] px-2.5 py-1">{t(S.adds, { n: num(mr.addedMin, locale) })}</span>
        {mr.estPickupMin != null ? <span className="rounded-full bg-[var(--page-subtle)] px-2.5 py-1">{t(S.pickedUp, { time: formatTime(mr.estPickupMin, locale) })}</span> : null}
        {v.femaleAttendant ? <span className="rounded-full bg-[var(--page-subtle)] px-2.5 py-1">{C.amenities.femaleAttendant}</span> : null}
        {areas ? <span className="rounded-full bg-[var(--page-subtle)] px-2.5 py-1">{num(areas, locale)} {m.ops.service.pickupAreas}</span> : null}
      </div>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-[var(--line)] pt-4">
        <div>
          <p className="text-xl font-bold">
            <bdi>{formatSar(r.priceH, locale)}</bdi> <span className="text-sm font-normal text-muted">{C.perDay} {r.exclusiveOnly ? C.perVehiclePerDay : C.twoTrips}</span>
          </p>
          <p className="text-xs text-muted">{C.plusFees}</p>
          {s.discounts.t1Pct || s.discounts.t2Pct ? (
            <p className="mt-1 inline-block rounded-full bg-accent-50 px-2 py-0.5 text-[0.7rem] font-semibold text-accent-700 dark:bg-accent-700/20 dark:text-accent-200">
              {t(m.ops.price.tiers, { p1: num(s.discounts.t1Pct, locale), t1: num(s.discounts.t1Days, locale), p2: num(s.discounts.t2Pct, locale), t2: num(s.discounts.t2Days, locale) })}
            </p>
          ) : null}
        </div>
        <Link href={`${href(locale, "/service")}?id=${s.id}`} className="inline-flex min-h-11 items-center rounded-full bg-brand-500 px-5 text-sm font-semibold text-white hover:bg-brand-600">
          {S.viewDetails}
        </Link>
      </div>
    </article>
  );
}

function FilterPanel({ m, locale, value: f, onChange }: { m: AppMessages; locale: Locale; value: Filters; onChange: (f: Filters) => void }) {
  const S = m.ops.search;
  const C = m.ops.common;
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => onChange({ ...f, [k]: v });
  const Seg = <K extends "type" | "vehicle" | "gender" | "attendant">({ k, label, opts }: { k: K; label: string; opts: { v: Filters[K]; l: string }[] }) => (
    <fieldset className="mt-3">
      <legend className="mb-1.5 text-xs font-semibold text-muted">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {opts.map((o) => (
          <button key={String(o.v)} type="button" aria-pressed={f[k] === o.v} onClick={() => set(k, o.v)} className={cn("min-h-9 rounded-full border px-3 text-xs", f[k] === o.v ? "border-brand-500 bg-brand-500 font-semibold text-white" : "border-[var(--line)]")}>
            {o.l}
          </button>
        ))}
      </div>
    </fieldset>
  );
  const names = weekdayNames(locale, "short");
  return (
    <div className="mt-2 border-t border-[var(--line)] pt-2">
      <Seg k="type" label={S.serviceType} opts={[{ v: "any", l: C.any }, { v: "shared", l: S.shared }, { v: "exclusive", l: S.exclusive }]} />
      <Seg k="vehicle" label={S.vehicle} opts={[{ v: "any", l: C.any }, { v: "car", l: C.vehicleTypes.car }, { v: "bus", l: C.vehicleTypes.bus }]} />
      <Seg k="gender" label={S.driverGender} opts={[{ v: "any", l: C.any }, { v: "female", l: C.genders.female }, { v: "male", l: C.genders.male }]} />
      <Seg k="attendant" label={S.attendant} opts={[{ v: "any", l: C.any }, { v: "required", l: S.attendantRequired }, { v: "female", l: S.attendantFemale }]} />
      <fieldset className="mt-3">
        <legend className="mb-1.5 text-xs font-semibold text-muted">{S.days}</legend>
        <div className="flex flex-wrap gap-1.5">
          {names.map((n, d) => {
            const on = f.days.includes(d);
            return (
              <button key={d} type="button" aria-pressed={on} onClick={() => set("days", on ? f.days.filter((x) => x !== d) : [...f.days, d])} className={cn("min-h-9 min-w-11 rounded-full border px-2 text-xs", on ? "border-brand-500 bg-brand-500 font-semibold text-white" : "border-[var(--line)]")}>
                {n}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label={S.maxPrice}>{(p) => <Input {...p} inputMode="decimal" dir="ltr" className="min-h-10 py-2" value={f.maxPrice} onChange={(e) => set("maxPrice", e.target.value.replace(/[^\d.]/g, ""))} />}</Field>
        <Field label={S.maxJourney}>
          {(p) => (
            <Select {...p} className="min-h-10 py-2" value={f.maxJourney} onChange={(e) => set("maxJourney", e.target.value)}>
              <option value="">{C.any}</option>
              {[20, 30, 45, 60].map((n) => <option key={n} value={n}>{t(C.min, { n: num(n, locale) })}</option>)}
            </Select>
          )}
        </Field>
      </div>
      <fieldset className="mt-3">
        <legend className="mb-1.5 text-xs font-semibold text-muted">{S.amenities}</legend>
        <div className="flex flex-wrap gap-1.5">
          {(["ac", "cameras", "seatbelts"] as const).map((k) => (
            <button key={k} type="button" aria-pressed={f[k]} onClick={() => set(k, !f[k])} className={cn("min-h-9 rounded-full border px-3 text-xs", f[k] ? "border-brand-500 bg-brand-500 font-semibold text-white" : "border-[var(--line)]")}>
              {C.amenities[k]}
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

export function PickupPicker({ m, locale, value, onChange, addresses }: { m: AppMessages; locale: Locale; value: PickupPoint | null; onChange: (p: PickupPoint) => void; addresses: Address[] }) {
  const S = m.ops.search;
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  useEffect(() => {
    if (q.trim().length < 3) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => osmGeocoder.search(q, locale, ctrl.signal).then(setResults).catch(() => setResults([])), 350);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q, locale]);

  async function detect() {
    setBusy(true);
    setGeoError(null);
    try {
      const p = await detectLocation();
      let districtName: string | null = null;
      try {
        districtName = (await osmGeocoder.reverse(p, locale)).district || null;
      } catch {
        /* name is optional */
      }
      onChange({ lat: p.lat, lng: p.lng, label: S.detect, districtName });
    } catch (e) {
      const L = m.location.errors as Record<string, string>;
      setGeoError(e instanceof GeoError ? (e.code === "denied" ? `${L.deniedTitle}. ${L.deniedIntro} ${L.fallback}` : (L[e.code] ?? m.errors.unknown)) : m.errors.unknown);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4">
      <h2 className="mb-2 text-sm font-semibold">{S.pickup}</h2>
      {value ? (
        <p className="mb-3 flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2 text-sm font-medium text-brand-800 dark:bg-brand-900/30 dark:text-brand-100">
          <IconPin width={16} height={16} /> {value.label}
          {value.districtName ? <span className="font-normal text-muted">· {value.districtName}</span> : null}
        </p>
      ) : null}
      {addresses.length ? (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {addresses.map((a) => (
            <button
              key={a.id}
              type="button"
              aria-pressed={value?.addressId === a.id}
              onClick={() => onChange({ lat: a.lat, lng: a.lng, label: a.customLabel || m.location.labels[a.label], districtName: a.district, addressId: a.id })}
              className={cn("min-h-9 rounded-full border px-3 text-xs", value?.addressId === a.id ? "border-brand-500 bg-brand-500 font-semibold text-white" : "border-[var(--line)]")}
            >
              {a.customLabel || m.location.labels[a.label]}
            </button>
          ))}
        </div>
      ) : null}
      <button type="button" onClick={detect} disabled={busy} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
        {busy ? <IconSpinner /> : <IconLocate width={18} height={18} />} {busy ? S.detecting : S.detect}
      </button>
      {geoError ? <Alert tone="error" className="mt-2">{geoError}</Alert> : null}
      <div className="mt-3">
        <label className="sr-only" htmlFor="pickup-q">{S.searchPlace}</label>
        <Input id="pickup-q" placeholder={S.searchPlace} value={q} onChange={(e) => setQ(e.target.value)} className="min-h-11 py-2" />
        {results.length ? (
          <ul className="mt-1 max-h-56 overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--card)]">
            {results.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange({ lat: r.lat, lng: r.lng, label: r.title, districtName: r.subtitle.split(/[،,]/)[0]?.trim() || null });
                    setQ("");
                    setResults([]);
                  }}
                  className="block w-full px-3 py-2 text-start text-sm hover:bg-[var(--page-subtle)]"
                >
                  <span className="font-medium">{r.title}</span> <span className="text-muted">{r.subtitle}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
