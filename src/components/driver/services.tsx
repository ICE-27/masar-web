"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth-provider";
import { Alert, Choice, Dialog, Field, Input, Select, SubmitButton } from "@/components/form";
import { IconChevron, IconPlus, IconRoute, IconSpinner, IconTrash } from "@/components/icons";
import { RouteMap, useIsDark, type MapCircle, type MapMarker } from "@/components/map/route-map-lazy";
import { EmptyState, ErrorNote, LoadingBlocks, PageTitle, Panel, StatusBadge, Switch, SwitchRow, useLoad } from "@/components/ops/bits";
import { cn } from "@/components/ui";
import type { DestinationGeo, DriverApplication, ServiceInput, ServiceRecord, Stop } from "@/lib/data";
import { formatTime, parseTime, timeInput, weekdayNames } from "@/lib/domain/dates";
import { pathLengthM, pathProject, type District, type Path } from "@/lib/domain/geo";
import { formatSar, parseSar, sarInput } from "@/lib/domain/money";
import { errorText, num, t } from "@/lib/format";
import { osmGeocoder, type LatLng, type PlaceResult } from "@/lib/geo";
import { href, type Locale } from "@/lib/i18n";
import type { AppMessages } from "@/lib/messages/app.en";
import { useQueryParam, useNavigate } from "@/lib/nav";
import { ConflictDialog, conflictFrom } from "./conflict-dialog";
import { PriceEditor, initialPriceForms, priceFormsToRows } from "./driver-wizard";
import { CITIES, CITIES_AR } from "./labels";
import type { ConflictReport } from "@/lib/data";

/* ---- List ----------------------------------------------------------------- */

export function ServicesSection({ m, locale }: { m: AppMessages; locale: Locale }) {
  const S = m.ops.svc;
  const { backend } = useAuth();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const qNew = useQueryParam("new");
  const qId = useQueryParam("id");
  useEffect(() => {
    if (qNew) setEditing("new");
    else if (qId) setEditing(qId);
  }, [qNew, qId]);
  const app = useLoad(() => backend.driverApplication(), [backend]);
  const list = useLoad(() => backend.driverServices(), [backend]);

  if (app.data && app.data.driver.status !== "approved") {
    return (
      <>
        <PageTitle title={S.title} subtitle={S.subtitle} />
        <Alert tone="info">{m.ops.da.notApproved}</Alert>
      </>
    );
  }

  if (editing && app.data) {
    return (
      <ServiceEditor
        m={m}
        locale={locale}
        app={app.data}
        id={editing === "new" ? null : editing}
        onDone={async () => {
          setEditing(null);
          navigate(href(locale, "/driver/services"), { replace: true });
          await list.reload();
        }}
      />
    );
  }

  const days = weekdayNames(locale, "short");
  return (
    <>
      <PageTitle
        title={S.title}
        subtitle={S.subtitle}
        action={
          <button type="button" onClick={() => setEditing("new")} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-brand-500 px-5 text-sm font-semibold text-white hover:bg-brand-600">
            <IconPlus width={18} height={18} /> {S.new}
          </button>
        }
      />
      <ErrorNote m={m} error={list.error} className="mb-4" />
      {list.loading && !list.data ? (
        <LoadingBlocks />
      ) : !list.data?.length ? (
        <EmptyState text={S.empty} icon={<IconRoute />} />
      ) : (
        <ul className="grid gap-4 xl:grid-cols-2">
          {list.data.map((s) => (
            <li key={s.id} className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{s.name}</p>
                  <p className="mt-0.5 text-sm text-muted">{locale === "ar" ? s.destination.nameAr : s.destination.nameEn}</p>
                </div>
                <StatusBadge status={s.status === "active" ? "confirmed" : "draft"} label={s.status === "active" ? S.active : S.paused} />
              </div>
              {s.schedule ? (
                <p className="mt-3 text-sm">
                  {s.schedule.days.map((d) => days[d]).join(" · ")}
                  {s.schedule.outbound ? ` · ${formatTime(s.schedule.pickupStartMin, locale)}–${formatTime(s.schedule.arriveMin, locale)}` : ""}
                  {s.schedule.returnTrip ? ` · ${formatTime(s.schedule.returnDepartMin, locale)}–${formatTime(s.schedule.returnEndMin, locale)}` : ""}
                </p>
              ) : null}
              <p className="mt-1 text-sm text-muted">
                {t(m.ops.common.seats, { n: num(s.schedule?.seats ?? 0, locale) })} · {t(S.families, { n: num(s.families, locale) })}
                {s.pendingRequests ? ` · ${t(S.pendingCount, { n: num(s.pendingRequests, locale) })}` : ""}
              </p>
              <div className="mt-4 flex gap-2">
                <button type="button" onClick={() => setEditing(s.id)} className="min-h-11 rounded-full border border-[var(--line)] px-5 text-sm font-medium hover:border-brand-400">
                  {S.edit}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/* ---- Editor --------------------------------------------------------------- */

type Mode = "start" | "stop" | null;

async function roadRoute(points: LatLng[], signal: AbortSignal): Promise<{ path: Path; distanceM: number; durationS: number }> {
  const coords = points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
  const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`, { signal });
  if (!res.ok) throw new Error(`route ${res.status}`);
  const data = (await res.json()) as { routes?: { geometry: { coordinates: [number, number][] }; distance: number; duration: number }[] };
  const r = data.routes?.[0];
  if (!r) throw new Error("no route");
  return { path: r.geometry.coordinates.map(([lng, lat]) => [Math.round(lat * 1e6) / 1e6, Math.round(lng * 1e6) / 1e6]), distanceM: Math.round(r.distance), durationS: Math.round(r.duration) };
}

function ServiceEditor({ m, locale, app, id, onDone }: { m: AppMessages; locale: Locale; app: DriverApplication; id: string | null; onDone: () => void }) {
  const S = m.ops.svc;
  const C = m.ops.common;
  const { backend } = useAuth();
  const dark = useIsDark();
  const vehicle = app.vehicle!;
  const dests = useLoad(() => backend.listDestinationsGeo(), [backend]);
  const districts = useLoad(() => backend.listDistricts(), [backend]);
  const existing = useLoad<ServiceRecord | null>(() => (id ? backend.driverService(id) : Promise.resolve(null)), [backend, id]);

  const [name, setName] = useState("");
  const [kind, setKind] = useState<ServiceRecord["kind"]>("school");
  const [destId, setDestId] = useState("");
  const [start, setStart] = useState<LatLng | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [road, setRoad] = useState<{ path: Path; distanceM: number; durationS: number } | null>(null);
  const [routing, setRouting] = useState(false);
  const [routeFailed, setRouteFailed] = useState(false);
  const [mode, setMode] = useState<Mode>(null);
  const [accepts, setAccepts] = useState<ServiceRecord["accepts"]>("both");
  const [ageMin, setAgeMin] = useState(4);
  const [ageMax, setAgeMax] = useState(17);
  const [maxKids, setMaxKids] = useState(4);
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [outbound, setOutbound] = useState(true);
  const [ps, setPs] = useState(375);
  const [pe, setPe] = useState(405);
  const [ar, setAr] = useState(420);
  const [ret, setRet] = useState(true);
  const [rd, setRd] = useState(795);
  const [re, setRe] = useState(840);
  const [seats, setSeats] = useState(vehicle.seats ?? 4);
  const [shared, setShared] = useState(true);
  const [exclusive, setExclusive] = useState(false);
  const [coverage, setCoverage] = useState<Record<string, string>>({});
  const [forms, setForms] = useState(() => initialPriceForms(vehicle.type, app.pricing));
  const [t1, setT1] = useState(app.driver.discountT1Pct);
  const [t2, setT2] = useState(app.driver.discountT2Pct);
  const [limits, setLimits] = useState({ maxPickupM: 2000, maxDetourM: 3000, maxDetourPct: 15, maxStops: 10, maxJourneyMin: 45 });
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ConflictReport | null>(null);
  const [addingDest, setAddingDest] = useState(false);
  const loaded = useRef(false);

  // Fill the form from an existing service
  useEffect(() => {
    const s = existing.data;
    if (!s || loaded.current) return;
    loaded.current = true;
    setName(s.name);
    setKind(s.kind);
    setDestId(s.destination.id);
    setStart(s.start);
    setStops(s.stops ?? []);
    setRoad(s.path.length > 2 + (s.stops?.length ?? 0) ? { path: s.path, distanceM: s.distanceM ?? 0, durationS: s.durationS ?? 0 } : null);
    setAccepts(s.accepts);
    setAgeMin(s.ageMin);
    setAgeMax(s.ageMax);
    setMaxKids(s.maxChildrenPerFamily);
    if (s.schedule) {
      setDays(s.schedule.days);
      setOutbound(s.schedule.outbound);
      setPs(s.schedule.pickupStartMin ?? 375);
      setPe(s.schedule.pickupEndMin ?? 405);
      setAr(s.schedule.arriveMin ?? 420);
      setRet(s.schedule.returnTrip);
      setRd(s.schedule.returnDepartMin ?? 795);
      setRe(s.schedule.returnEndMin ?? 840);
      setSeats(s.schedule.seats);
    }
    setShared(s.sharedEnabled);
    setExclusive(s.exclusiveEnabled);
    setCoverage(Object.fromEntries(s.coverage.map((c) => [c.districtId, sarInput(c.surchargeH)])));
    setForms(initialPriceForms(vehicle.type, s.pricing.map((p) => ({ ...p, enabled: true }))));
    setT1(s.discounts.t1Pct);
    setT2(s.discounts.t2Pct);
    setLimits(s.limits);
    setActive(s.status === "active");
  }, [existing.data, vehicle.type]);

  const dest = (dests.data ?? []).find((d) => d.id === destId) ?? null;
  const points = useMemo<LatLng[]>(
    () => [...(start ? [start] : []), ...stops, ...(dest?.lat != null && dest.lng != null ? [{ lat: dest.lat, lng: dest.lng }] : [])],
    [start, stops, dest],
  );
  const straight: Path = points.map((p) => [p.lat, p.lng]);
  const path: Path = road?.path ?? straight;
  const distanceM = road?.distanceM ?? Math.round(pathLengthM(straight) * 1.25);
  const durationS = road?.durationS ?? Math.round((distanceM / 500) * 60);

  // Follow real roads whenever the stops change (free OSRM router; straight lines if it can't be reached)
  const pointsKey = points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join("|");
  const firstKey = useRef<string | null>(null);
  useEffect(() => {
    if (points.length < 2) return;
    if (firstKey.current === null && id) {
      firstKey.current = pointsKey; // keep the saved road path on first load
      return;
    }
    firstKey.current = pointsKey;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setRouting(true);
      try {
        setRoad(await roadRoute(points, ctrl.signal));
        setRouteFailed(false);
      } catch {
        if (!ctrl.signal.aborted) {
          setRoad(null);
          setRouteFailed(true);
        }
      } finally {
        if (!ctrl.signal.aborted) setRouting(false);
      }
    }, 700);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointsKey]);

  // Districts near the route, nearest first
  const nearDistricts = useMemo(() => {
    if (!districts.data || path.length < 2) return [] as (District & { d: number })[];
    return districts.data
      .map((d) => ({ ...d, d: pathProject(path, d).distanceM ?? 1e9 }))
      .filter((d) => d.d < 6000 || coverage[d.id] !== undefined)
      .sort((a, b) => a.d - b.d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [districts.data, path.length, path[0]?.[0], path[path.length - 1]?.[0], coverage]);

  // New service: pre-tick districts within the pickup limit
  const autoTicked = useRef(false);
  useEffect(() => {
    if (id || autoTicked.current || !nearDistricts.length || points.length < 2) return;
    autoTicked.current = true;
    setCoverage(Object.fromEntries(nearDistricts.filter((d) => d.d <= limits.maxPickupM).map((d) => [d.id, "0"])));
  }, [id, nearDistricts, points.length, limits.maxPickupM]);

  function onMapClick(p: LatLng) {
    if (mode === "start") {
      setStart(p);
      setMode(null);
    } else if (mode === "stop") {
      setStops((s) => [...s, { lat: p.lat, lng: p.lng }]);
    }
  }

  const markers: MapMarker[] = [
    ...(start ? [{ id: "start", lat: start.lat, lng: start.lng, kind: "start" as const, label: S.start, draggable: true, onDrag: (p: LatLng) => setStart(p) }] : []),
    ...stops.map((s, i) => ({ id: `s${i}`, lat: s.lat, lng: s.lng, kind: "stop" as const, n: i + 1, label: s.label || t(S.stop, { n: num(i + 1, locale) }), draggable: true, onDrag: (p: LatLng) => setStops((x) => x.map((y, j) => (j === i ? { ...y, ...p } : y))) })),
    ...(dest?.lat != null && dest.lng != null ? [{ id: "dest", lat: dest.lat, lng: dest.lng, kind: "dest" as const, label: locale === "ar" ? dest.nameAr : dest.nameEn }] : []),
  ];
  const circles: MapCircle[] = nearDistricts.map((d) => ({
    id: d.id,
    lat: d.lat,
    lng: d.lng,
    radius: 900,
    active: coverage[d.id] !== undefined,
    label: locale === "ar" ? d.nameAr : d.nameEn,
    onClick: () => setCoverage((c) => {
      const n = { ...c };
      if (n[d.id] !== undefined) delete n[d.id];
      else n[d.id] = "0";
      return n;
    }),
  }));

  function build(): ServiceInput | string {
    if (name.trim().length < 3) return m.errors.fixBelow;
    if (!destId) return S.destinationHint;
    if (!start) return S.routeHelp;
    if (!days.length) return errorText(m, "dates_required");
    if (outbound && !(ps <= pe && pe <= ar)) return m.errors.fixBelow;
    if (ret && !(rd < re)) return m.errors.fixBelow;
    if (!outbound && !ret) return m.errors.fixBelow;
    const rows = priceFormsToRows(forms);
    if (!rows || !rows.some((r) => r.enabled)) return errorText(m, "pricing_required");
    const enabled = rows.filter((r) => r.enabled);
    const sharedOn = shared && enabled.some((r) => r.serviceType === "shared_car" || r.serviceType === "shared_bus");
    const exclOn = exclusive && enabled.some((r) => r.serviceType === "exclusive_car" || r.serviceType === "whole_bus");
    if (!sharedOn && !exclOn) return errorText(m, "pricing_required");
    return {
      ...(id ? { id } : {}),
      name: name.trim(),
      kind,
      destinationId: destId,
      start,
      stops,
      path,
      distanceM,
      durationS,
      accepts,
      ageMin,
      ageMax,
      maxChildrenPerFamily: maxKids,
      sharedEnabled: sharedOn,
      exclusiveEnabled: exclOn,
      limits,
      discounts: { t1Pct: t1, t2Pct: t2 },
      schedule: {
        days: [...days].sort(),
        outbound,
        pickupStartMin: outbound ? ps : null,
        pickupEndMin: outbound ? pe : null,
        arriveMin: outbound ? ar : null,
        returnTrip: ret,
        returnDepartMin: ret ? rd : null,
        returnEndMin: ret ? re : null,
        seats,
      },
      pricing: enabled.map((r) => ({
        serviceType: r.serviceType,
        dailyH: r.dailyH,
        oneWayH: r.oneWayH,
        perTripH: r.perTripH,
        maxChildren: r.maxChildren,
        attendantAvailable: r.attendantAvailable,
        attendantFeeH: r.attendantFeeH,
      })),
      coverage: Object.entries(coverage).map(([districtId, v]) => ({ districtId, surchargeH: parseSar(v) ?? 0 })),
      status: active ? "active" : "paused",
    };
  }

  async function save(applyFrom?: string) {
    const input = build();
    if (typeof input === "string") {
      setError(input);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await backend.saveService(input, applyFrom ?? null);
      setConflict(null);
      onDone();
    } catch (e) {
      const c = conflictFrom(e);
      if (c) setConflict(c);
      else if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "outside_hours") {
        const names = weekdayNames(locale, "long");
        const det = String((e as { detail?: string }).detail ?? "").split(",").filter(Boolean).map((d) => names[Number(d)]);
        setError(t(S.outsideHours, { days: det.join(locale === "ar" ? "، " : ", ") }));
      } else setError(errorText(m, e));
    } finally {
      setBusy(false);
    }
  }

  if ((id && !existing.data && !existing.error) || !dests.data) return <LoadingBlocks />;
  if (existing.error) return <ErrorNote m={m} error={existing.error} />;

  const names = weekdayNames(locale, "short");
  const destsByCity = CITIES.map((c) => ({ city: c, items: (dests.data ?? []).filter((d) => d.city === c) })).filter((g) => g.items.length);
  const sharedType = vehicle.type === "car" ? "shared_car" : "shared_bus";
  const exclType = vehicle.type === "car" ? "exclusive_car" : "whole_bus";
  const firstPrice = parseSar(forms.find((f) => f.enabled)?.daily ?? "") ?? 0;

  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        void save();
      }}
      noValidate
    >
      <button type="button" onClick={onDone} className="mb-3 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-muted hover:text-[var(--ink)]">
        <IconChevron width={16} height={16} className="rotate-180 rtl:rotate-0" /> {S.title}
      </button>
      <PageTitle title={id ? S.edit : S.new} />

      <div className="space-y-6">
        <Panel title={S.basics}>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={S.name} hint={S.nameHint} className="sm:col-span-2">
              {(p) => <Input {...p} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />}
            </Field>
            <Field label={S.kind}>
              {(p) => (
                <Select {...p} value={kind} onChange={(e) => setKind(e.target.value as ServiceRecord["kind"])}>
                  {(["school", "activity", "trip"] as const).map((k) => (
                    <option key={k} value={k}>{C.kinds[k]}</option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={S.destination} hint={S.destinationHint}>
              {(p) => (
                <div className="flex gap-2">
                  <Select {...p} value={destId} onChange={(e) => setDestId(e.target.value)}>
                    <option value="">—</option>
                    {destsByCity.map((g) => (
                      <optgroup key={g.city} label={locale === "ar" ? CITIES_AR[g.city] : g.city}>
                        {g.items.map((d) => (
                          <option key={d.id} value={d.id}>{locale === "ar" ? d.nameAr : d.nameEn}</option>
                        ))}
                      </optgroup>
                    ))}
                  </Select>
                  <button type="button" onClick={() => setAddingDest(true)} aria-label={S.addDestination} title={S.addDestination} className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[var(--line)] hover:border-brand-400">
                    <IconPlus />
                  </button>
                </div>
              )}
            </Field>
            <div className="sm:col-span-2">
              <Choice<ServiceRecord["accepts"]> name="accepts" legend={S.accepts} columns={3} value={accepts} onChange={setAccepts} options={(["both", "boys", "girls"] as const).map((v) => ({ value: v, label: C.accepts[v] }))} />
            </div>
            <div className="grid grid-cols-3 gap-3 sm:col-span-2">
              {[
                { label: S.ageMin, v: ageMin, set: setAgeMin, opts: Array.from({ length: 16 }, (_, i) => i + 3) },
                { label: S.ageMax, v: ageMax, set: setAgeMax, opts: Array.from({ length: 16 }, (_, i) => i + 3) },
                { label: S.maxChildren, v: maxKids, set: setMaxKids, opts: [1, 2, 3, 4, 5, 6] },
              ].map((x) => (
                <Field key={x.label} label={x.label}>
                  {(p) => (
                    <Select {...p} value={x.v} onChange={(e) => x.set(Number(e.target.value))}>
                      {x.opts.map((n) => (
                        <option key={n} value={n}>{num(n, locale)}</option>
                      ))}
                    </Select>
                  )}
                </Field>
              ))}
            </div>
          </div>
        </Panel>

        <Panel title={S.route}>
          <p className="mb-4 text-sm text-muted">{S.routeHelp}</p>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button type="button" aria-pressed={mode === "start"} onClick={() => setMode(mode === "start" ? null : "start")} className={cn("min-h-10 rounded-full border px-4 text-sm font-medium", mode === "start" ? "border-brand-500 bg-brand-500 text-white" : "border-[var(--line)]")}>
              {S.setStart}
            </button>
            <button type="button" aria-pressed={mode === "stop"} disabled={!start} onClick={() => setMode(mode === "stop" ? null : "stop")} className={cn("min-h-10 rounded-full border px-4 text-sm font-medium disabled:opacity-50", mode === "stop" ? "border-brand-500 bg-brand-500 text-white" : "border-[var(--line)]")}>
              <IconPlus width={14} height={14} className="me-1 inline" /> {S.addStop}
            </button>
            {mode ? <span className="text-sm font-medium text-accent-700 dark:text-accent-300">{S.clickMap}</span> : null}
            {routing ? <IconSpinner className="text-brand-500" /> : null}
          </div>
          <div className={cn("overflow-hidden rounded-2xl border border-[var(--line)]", mode && "ring-4 ring-brand-500/30")}>
            <RouteMap
              routes={path.length > 1 ? [{ id: "r", path, dashed: !road }] : []}
              markers={markers}
              circles={circles}
              onMapClick={onMapClick}
              fitKey={`${!!start}-${stops.length}-${destId}`}
              label={S.route}
              dark={dark}
              attribution={m.location.attribution}
              className="h-80 sm:h-[26rem]"
            />
          </div>
          {routeFailed ? <p className="mt-2 text-xs text-muted">{S.roadFailed}</p> : null}
          <ol className="mt-4 space-y-2">
            {start ? (
              <li className="flex items-center gap-3 text-sm">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">●</span>
                <span className="flex-1">{S.start}</span>
              </li>
            ) : null}
            {stops.map((s, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-brand-500 text-xs font-bold text-brand-700 dark:text-brand-200">{num(i + 1, locale)}</span>
                <Input
                  aria-label={t(S.stop, { n: num(i + 1, locale) })}
                  className="min-h-10 flex-1 py-1.5"
                  value={s.label ?? ""}
                  placeholder={t(S.stop, { n: num(i + 1, locale) })}
                  onChange={(e) => setStops((x) => x.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))}
                />
                <button type="button" aria-label={S.moveUp} disabled={i === 0} onClick={() => setStops((x) => { const n = [...x]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; })} className="h-10 w-10 rounded-full text-muted disabled:opacity-30">↑</button>
                <button type="button" aria-label={S.moveDown} disabled={i === stops.length - 1} onClick={() => setStops((x) => { const n = [...x]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; return n; })} className="h-10 w-10 rounded-full text-muted disabled:opacity-30">↓</button>
                <button type="button" aria-label={S.removeStop} onClick={() => setStops((x) => x.filter((_, j) => j !== i))} className="inline-flex h-10 w-10 items-center justify-center rounded-full text-muted hover:text-red-600">
                  <IconTrash width={16} height={16} />
                </button>
              </li>
            ))}
          </ol>
          {points.length > 1 ? (
            <p className="mt-3 text-sm text-muted">
              {S.distance}: {t(C.km, { n: num(Math.round(distanceM / 100) / 10, locale) })} · {S.duration}: {t(C.min, { n: num(Math.round(durationS / 60), locale) })}
            </p>
          ) : null}
        </Panel>

        <Panel title={S.coverage}>
          <p className="mb-4 text-sm text-muted">{S.coverageHint}</p>
          {nearDistricts.length ? (
            <ul className="divide-y divide-[var(--line)] rounded-2xl border border-[var(--line)]">
              {nearDistricts.map((d) => {
                const on = coverage[d.id] !== undefined;
                return (
                  <li key={d.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                    <Switch checked={on} label={locale === "ar" ? d.nameAr : d.nameEn} onChange={(v) => setCoverage((c) => { const n = { ...c }; if (v) n[d.id] = "0"; else delete n[d.id]; return n; })} />
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="font-medium">{locale === "ar" ? d.nameAr : d.nameEn}</span>
                      <span className="text-muted"> · {locale === "ar" ? CITIES_AR[d.city] ?? d.city : d.city} · {t(C.km, { n: num(Math.round(d.d / 100) / 10, locale) })}</span>
                    </span>
                    {on ? (
                      <label className="flex items-center gap-2 text-xs text-muted">
                        {S.surcharge}
                        <Input inputMode="decimal" dir="ltr" className="min-h-10 w-24 py-1.5 text-center" value={coverage[d.id]} onChange={(e) => setCoverage((c) => ({ ...c, [d.id]: e.target.value }))} />
                      </label>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted">{S.routeHelp}</p>
          )}
        </Panel>

        <Panel title={S.schedule}>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">{S.days}</legend>
            <div className="flex flex-wrap gap-2">
              {names.map((n, d) => {
                const on = days.includes(d);
                return (
                  <button key={d} type="button" aria-pressed={on} onClick={() => setDays(on ? days.filter((x) => x !== d) : [...days, d])} className={cn("min-h-11 min-w-14 rounded-full border px-3 text-sm", on ? "border-brand-500 bg-brand-500 font-semibold text-white" : "border-[var(--line)]")}>
                    {n}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <div className="rounded-2xl border border-[var(--line)] p-4">
              <SwitchRow label={S.outbound} checked={outbound} onChange={setOutbound} />
              {outbound ? (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {[
                    { l: S.pickupFrom, v: ps, s: setPs },
                    { l: S.pickupTo, v: pe, s: setPe },
                    { l: S.arrive, v: ar, s: setAr },
                  ].map((x) => (
                    <TimeField key={x.l} label={x.l} value={x.v} onChange={x.s} />
                  ))}
                </div>
              ) : null}
            </div>
            <div className="rounded-2xl border border-[var(--line)] p-4">
              <SwitchRow label={S.returnTrip} checked={ret} onChange={setRet} />
              {ret ? (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <TimeField label={S.depart} value={rd} onChange={setRd} />
                  <TimeField label={S.returnEnd} value={re} onChange={setRe} />
                </div>
              ) : null}
            </div>
          </div>
          <div className="mt-5 max-w-xs">
            <Field label={S.seats} hint={t(S.seatsHint, { n: num(vehicle.seats ?? 0, locale) })}>
              {(p) => (
                <Select {...p} value={seats} onChange={(e) => setSeats(Number(e.target.value))}>
                  {Array.from({ length: vehicle.seats ?? 1 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>{num(n, locale)}</option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        </Panel>

        <Panel title={S.pricing}>
          <div className="mb-4 grid gap-x-8 rounded-2xl border border-[var(--line)] px-4 py-1 sm:grid-cols-2">
            <SwitchRow label={`${S.shared} — ${C.serviceTypes[sharedType]}`} checked={shared} onChange={setShared} />
            <SwitchRow label={`${S.exclusive} — ${C.serviceTypes[exclType]}`} checked={exclusive} onChange={setExclusive} />
          </div>
          <PriceEditor m={m} locale={locale} forms={forms} setForms={setForms} seats={vehicle.seats} t1Pct={t1} t2Pct={t2} />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {[
              { label: t(m.ops.dw.pricing.t1, { n: num(10, locale) }), v: t1, set: setT1 },
              { label: t(m.ops.dw.pricing.t2, { n: num(20, locale) }), v: t2, set: setT2 },
            ].map((x, i) => (
              <Field key={i} label={x.label}>
                {(p) => (
                  <Select {...p} value={x.v} onChange={(e) => x.set(Number(e.target.value))}>
                    {[0, 3, 5, 7, 10, 12, 15, 20].map((n) => (
                      <option key={n} value={n}>{n === 0 ? C.no : `${num(n, locale)}${m.ops.dw.pricing.pctOff}`}</option>
                    ))}
                  </Select>
                )}
              </Field>
            ))}
          </div>
          {firstPrice ? (
            <p className="mt-4 text-sm text-muted">
              {t(S.preview, {
                price: formatSar(firstPrice, locale, { compact: false }),
                fee: formatSar(Math.round(firstPrice * 0.1), locale, { compact: false }),
                total: formatSar(firstPrice + Math.round(firstPrice * 0.1), locale, { compact: false }),
              })}
            </p>
          ) : null}
        </Panel>

        <Panel title={S.limits}>
          <p className="mb-4 text-sm text-muted">{S.limitsHint}</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { label: S.maxPickup, v: limits.maxPickupM / 1000, k: "maxPickupM", mul: 1000, step: 0.5 },
              { label: S.maxDetour, v: limits.maxDetourM / 1000, k: "maxDetourM", mul: 1000, step: 0.5 },
              { label: S.maxDetourPct, v: limits.maxDetourPct, k: "maxDetourPct", mul: 1, step: 1 },
              { label: S.maxStops, v: limits.maxStops, k: "maxStops", mul: 1, step: 1 },
              { label: S.maxJourney, v: limits.maxJourneyMin, k: "maxJourneyMin", mul: 1, step: 5 },
            ].map((x) => (
              <Field key={x.k} label={x.label}>
                {(p) => <Input {...p} type="number" min={x.step} step={x.step} dir="ltr" value={x.v} onChange={(e) => setLimits((l) => ({ ...l, [x.k]: Math.max(1, Math.round(Number(e.target.value) * x.mul)) }))} />}
              </Field>
            ))}
          </div>
        </Panel>

        <Panel>
          <SwitchRow label={active ? S.active : S.paused} checked={active} onChange={setActive} />
        </Panel>

        {error ? <Alert tone="error">{error}</Alert> : null}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          {id ? (
            <ArchiveButton m={m} id={id} onDone={onDone} />
          ) : (
            <span />
          )}
          <SubmitButton busy={busy} busyText={m.common.saving}>
            {id ? S.save : S.publish}
          </SubmitButton>
        </div>
      </div>

      <ConflictDialog m={m} locale={locale} report={conflict} busy={busy} onClose={() => setConflict(null)} onApplyFrom={(d) => void save(d)} />
      <AddDestination
        m={m}
        locale={locale}
        open={addingDest}
        onClose={() => setAddingDest(false)}
        onAdded={async (d) => {
          await dests.reload();
          setDestId(d.id);
          setAddingDest(false);
        }}
      />
    </form>
  );
}

function TimeField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      <input
        type="time"
        step={300}
        value={timeInput(value)}
        onChange={(e) => {
          const v = parseTime(e.target.value);
          if (v != null) onChange(v);
        }}
        className="min-h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--card)] px-2 text-sm"
      />
    </label>
  );
}

function ArchiveButton({ m, id, onDone }: { m: AppMessages; id: string; onDone: () => void }) {
  const S = m.ops.svc;
  const { backend } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="min-h-12 rounded-full px-4 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40">
        {S.archive}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={S.archive} closeLabel={m.common.close}>
        <p className="text-sm text-muted">{S.archiveText}</p>
        {error ? <Alert tone="error" className="mt-4">{error}</Alert> : null}
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={() => setOpen(false)} className="min-h-12 rounded-full px-5 font-medium text-muted">{m.common.cancel}</button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await backend.archiveService(id);
                setOpen(false);
                onDone();
              } catch (e) {
                setError(errorText(m, e));
              } finally {
                setBusy(false);
              }
            }}
            className="min-h-12 rounded-full bg-red-600 px-5 font-semibold text-white disabled:opacity-60"
          >
            {S.archive}
          </button>
        </div>
      </Dialog>
    </>
  );
}

function AddDestination({ m, locale, open, onClose, onAdded }: { m: AppMessages; locale: Locale; open: boolean; onClose: () => void; onAdded: (d: DestinationGeo) => void }) {
  const S = m.ops.svc;
  const { backend } = useAuth();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [pick, setPick] = useState<PlaceResult | null>(null);
  const [nameEn, setNameEn] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [city, setCity] = useState("Khobar");
  const [kind, setKind] = useState("school");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (q.trim().length < 3) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      osmGeocoder.search(q, locale, ctrl.signal).then(setResults).catch(() => setResults([]));
    }, 350);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q, locale]);

  return (
    <Dialog open={open} onClose={onClose} title={S.addDestination} closeLabel={m.common.close}>
      <p className="mb-4 text-sm text-muted">{S.addDestinationText}</p>
      <Field label={m.ops.search.searchPlace}>
        {(p) => <Input {...p} value={q} onChange={(e) => setQ(e.target.value)} />}
      </Field>
      {results.length ? (
        <ul className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-[var(--line)]">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => {
                  setPick(r);
                  setNameEn((n) => n || r.title);
                  setNameAr((n) => n || r.title);
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
      {pick ? (
        <div className="mt-4 space-y-4">
          <Field label={S.destNameEn}>{(p) => <Input {...p} dir="ltr" value={nameEn} onChange={(e) => setNameEn(e.target.value)} />}</Field>
          <Field label={S.destNameAr}>{(p) => <Input {...p} dir="rtl" value={nameAr} onChange={(e) => setNameAr(e.target.value)} />}</Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={S.destCity}>
              {(p) => (
                <Select {...p} value={city} onChange={(e) => setCity(e.target.value)}>
                  {CITIES.map((c) => <option key={c} value={c}>{locale === "ar" ? CITIES_AR[c] : c}</option>)}
                </Select>
              )}
            </Field>
            <Field label={S.destKind}>
              {(p) => (
                <Select {...p} value={kind} onChange={(e) => setKind(e.target.value)}>
                  {(["school", "tutoring", "sports", "other"] as const).map((k) => <option key={k} value={k}>{S.destKinds[k]}</option>)}
                </Select>
              )}
            </Field>
          </div>
          {error ? <Alert tone="error">{error}</Alert> : null}
          <button
            type="button"
            disabled={busy || nameEn.trim().length < 3}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                onAdded(await backend.addDestination({ nameEn: nameEn.trim(), nameAr: nameAr.trim(), kind, city, lat: pick.lat, lng: pick.lng }));
              } catch (e) {
                setError(errorText(m, e));
              } finally {
                setBusy(false);
              }
            }}
            className="min-h-12 w-full rounded-full bg-brand-500 font-semibold text-white disabled:opacity-60"
          >
            {S.addDestination}
          </button>
        </div>
      ) : null}
    </Dialog>
  );
}
