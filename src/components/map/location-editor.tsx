"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useAuth } from "@/components/auth-provider";
import {
  Alert,
  Checkbox,
  Choice,
  Field,
  Input,
  Skeleton,
  SubmitButton,
  Textarea,
} from "@/components/form";
import {
  IconLocate,
  IconPin,
  IconSearch,
  IconSpinner,
} from "@/components/icons";
import { cn } from "@/components/ui";
import type { Address, AddressLabel } from "@/lib/data";
import { errorText, num, t } from "@/lib/format";
import {
  detectLocation,
  GeoError,
  osmGeocoder,
  type GeoErrorCode,
  type LatLng,
  type PlaceResult,
} from "@/lib/geo";
import type { Locale } from "@/lib/i18n";
import type { AppMessages } from "@/lib/messages/app.en";
import { addressDetailsSchema, fieldErrors, inCoverage } from "@/lib/validation";

const MapView = dynamic(() => import("./map-view"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-none" />,
});

function useIsDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const read = () => setDark(el.classList.contains("dark"));
    read();
    const mo = new MutationObserver(read);
    mo.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  return dark;
}

type Details = {
  city: string;
  district: string;
  street: string;
  buildingNo: string;
  floorApt: string;
  landmark: string;
  nationalAddress: string;
  customLabel: string;
};

const AUTO_FIELDS = ["city", "district", "street", "buildingNo"] as const;

export function LocationEditor({
  locale,
  m,
  initial,
  onSaved,
  submitLabel,
  showDefaultToggle = false,
  secondaryAction,
  layout = "wide",
}: {
  locale: Locale;
  m: AppMessages;
  initial?: Address | null;
  onSaved: (a: Address) => void;
  submitLabel?: string;
  showDefaultToggle?: boolean;
  secondaryAction?: ReactNode;
  layout?: "wide" | "stacked";
}) {
  const L = m.location;
  const { backend } = useAuth();
  const dark = useIsDark();

  const [point, setPoint] = useState<LatLng | null>(
    initial ? { lat: initial.lat, lng: initial.lng } : null,
  );
  const [accuracy, setAccuracy] = useState<number | null>(initial?.accuracyM ?? null);
  const [focusKey, setFocusKey] = useState(0);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState<GeoErrorCode | null>(null);
  const [lookup, setLookup] = useState<"idle" | "loading" | "failed">("idle");
  const [label, setLabel] = useState<AddressLabel>(initial?.label ?? "home");
  const [makeDefault, setMakeDefault] = useState(initial?.isDefault ?? false);
  const [details, setDetails] = useState<Details>({
    city: initial?.city ?? "",
    district: initial?.district ?? "",
    street: initial?.street ?? "",
    buildingNo: initial?.buildingNo ?? "",
    floorApt: initial?.floorApt ?? "",
    landmark: initial?.landmark ?? "",
    nationalAddress: initial?.nationalAddress ?? "",
    customLabel: initial?.customLabel ?? "",
  });
  const touched = useRef(new Set<string>(initial ? AUTO_FIELDS : []));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pinStatusRef = useRef<HTMLParagraphElement>(null);

  // Fill in the address from the pin, without overwriting what the parent typed
  useEffect(() => {
    if (!point) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setLookup("loading");
      try {
        const r = await osmGeocoder.reverse(point, locale, ctrl.signal);
        setDetails((d) => {
          const next = { ...d };
          for (const k of AUTO_FIELDS) if (!touched.current.has(k)) next[k] = r[k];
          return next;
        });
        setLookup("idle");
      } catch {
        if (!ctrl.signal.aborted) setLookup("failed");
      }
    }, 450);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [point, locale]);

  const place = useCallback((p: LatLng, acc: number | null, fly: boolean) => {
    setPoint(p);
    setAccuracy(acc);
    setErrors((e) => ({ ...e, pin: "" }));
    if (fly) setFocusKey((k) => k + 1);
  }, []);

  async function onDetect() {
    setGeoBusy(true);
    setGeoError(null);
    try {
      const p = await detectLocation();
      place({ lat: p.lat, lng: p.lng }, p.accuracy, true);
      // Move focus to the result so screen readers announce it
      setTimeout(() => pinStatusRef.current?.focus(), 50);
    } catch (e) {
      setGeoError(e instanceof GeoError ? e.code : "unavailable");
    } finally {
      setGeoBusy(false);
    }
  }

  function setField(k: keyof Details, v: string) {
    touched.current.add(k);
    setDetails((d) => ({ ...d, [k]: v }));
    setErrors((e) => (e[k] ? { ...e, [k]: "" } : e));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    const parsed = addressDetailsSchema.safeParse(details);
    const errs: Record<string, string> = parsed.success ? {} : fieldErrors(parsed.error);
    if (!point) errs.pin = "pinRequired";
    if (Object.keys(errs).length || !parsed.success || !point) {
      setErrors(errs);
      if (errs.pin) document.getElementById("location-tools")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const d = parsed.data;
      const saved = await backend.saveAddress({
        id: initial?.id,
        label,
        customLabel: label === "other" ? d.customLabel || null : null,
        lat: point.lat,
        lng: point.lng,
        accuracyM: accuracy,
        city: d.city || null,
        district: d.district || null,
        street: d.street || null,
        buildingNo: d.buildingNo || null,
        floorApt: d.floorApt || null,
        landmark: d.landmark || null,
        nationalAddress: d.nationalAddress,
        ...(showDefaultToggle ? { isDefault: makeDefault } : {}),
      });
      onSaved(saved);
    } catch (err) {
      setSubmitError(errorText(m, err));
    } finally {
      setBusy(false);
    }
  }

  const err = (k: string) => (errors[k] ? errorText(m, errors[k]) : null);
  const outside = point ? !inCoverage(point.lat, point.lng) : false;

  return (
    <form onSubmit={onSubmit} noValidate className={cn(layout === "wide" && "lg:grid lg:grid-cols-[1.2fr_1fr] lg:gap-8")}>
      {/* ---- Locate: detect, search, map ---- */}
      <div id="location-tools" className="scroll-mt-24 space-y-3">
        <button
          type="button"
          onClick={onDetect}
          disabled={geoBusy}
          aria-busy={geoBusy || undefined}
          className="group flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-brand-500 px-5 py-3.5 text-base font-semibold text-white shadow-[0_10px_24px_-12px_rgba(0,151,103,0.95)] transition-all duration-200 hover:bg-brand-600 active:scale-[0.99] disabled:opacity-80"
        >
          {geoBusy ? <IconSpinner /> : <IconLocate width={22} height={22} />}
          {geoBusy ? L.detecting : L.detect}
        </button>

        {geoError ? <GeoErrorHelp code={geoError} m={m} /> : null}

        <div className="flex items-center gap-3 text-xs text-muted" aria-hidden>
          <span className="h-px flex-1 bg-[var(--line)]" />
          {L.or}
          <span className="h-px flex-1 bg-[var(--line)]" />
        </div>

        <PlaceSearch locale={locale} m={m} onPick={(r) => place({ lat: r.lat, lng: r.lng }, null, true)} />

        <div
          className={cn(
            "relative isolate overflow-hidden rounded-2xl border bg-[var(--page-subtle)]",
            "h-[46vh] min-h-72 sm:h-[26rem]",
            errors.pin ? "border-red-500" : "border-[var(--line)]",
          )}
          style={{
            backgroundImage:
              "linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        >
          <MapView
            point={point}
            accuracy={accuracy}
            focusKey={focusKey}
            onPick={(p) => place(p, null, false)}
            dark={dark}
            label={L.mapLabel}
            attribution={L.attribution}
          />
        </div>

        <p
          ref={pinStatusRef}
          tabIndex={-1}
          aria-live="polite"
          className={cn(
            "flex items-start gap-2 text-sm leading-relaxed focus:outline-none",
            errors.pin ? "font-medium text-red-600 dark:text-red-400" : point ? "text-[var(--ink)]" : "text-muted",
          )}
        >
          <IconPin width={18} height={18} className={cn("mt-0.5 shrink-0", point && !errors.pin && "text-brand-500")} />
          <span>
            {errors.pin
              ? L.pinRequired
              : point
                ? accuracy && accuracy > 50
                  ? t(L.lowAccuracy, { m: num(accuracy, locale) })
                  : `${L.pinSet}${accuracy ? ` · ${t(L.accuracy, { m: num(accuracy, locale) })}` : ""}. ${L.pinHint}`
                : L.pinHint}
          </span>
        </p>

        {outside ? <Alert tone="warning">{L.outside}</Alert> : null}
      </div>

      {/* ---- Details ---- */}
      <div className="mt-8 space-y-5 lg:mt-0">
        <div>
          <h3 className="text-base font-semibold">{L.details}</h3>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted" aria-live="polite">
            {lookup === "loading" ? (
              <>
                <IconSpinner width={14} height={14} /> {L.lookingUp}
              </>
            ) : lookup === "failed" ? (
              L.lookupFailed
            ) : (
              L.detailsHint
            )}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={L.city} error={err("city")}>
            {(p) => (
              <Input {...p} value={details.city} onChange={(e) => setField("city", e.target.value)} autoComplete="address-level2" />
            )}
          </Field>
          <Field label={L.district} error={err("district")}>
            {(p) => (
              <Input {...p} value={details.district} onChange={(e) => setField("district", e.target.value)} autoComplete="address-level3" />
            )}
          </Field>
          <Field label={L.street} error={err("street")} className="col-span-2">
            {(p) => (
              <Input {...p} value={details.street} onChange={(e) => setField("street", e.target.value)} autoComplete="address-line1" />
            )}
          </Field>
          <Field label={L.buildingNo} error={err("buildingNo")}>
            {(p) => (
              <Input {...p} value={details.buildingNo} onChange={(e) => setField("buildingNo", e.target.value)} inputMode="text" />
            )}
          </Field>
          <Field label={L.floorApt} optional optionalText={m.common.optional} error={err("floorApt")}>
            {(p) => <Input {...p} value={details.floorApt} onChange={(e) => setField("floorApt", e.target.value)} />}
          </Field>
        </div>

        <Field label={L.landmark} hint={L.landmarkHint} optional optionalText={m.common.optional} error={err("landmark")}>
          {(p) => (
            <Textarea {...p} rows={2} value={details.landmark} onChange={(e) => setField("landmark", e.target.value)} />
          )}
        </Field>

        <Field
          label={L.nationalAddress}
          hint={L.nationalAddressHint}
          optional
          optionalText={m.common.optional}
          error={err("nationalAddress")}
        >
          {(p) => (
            <Input
              {...p}
              dir="ltr"
              value={details.nationalAddress}
              onChange={(e) => setField("nationalAddress", e.target.value.toUpperCase())}
              maxLength={9}
              autoCapitalize="characters"
              placeholder="RRRD2929"
              className="font-mono tracking-wider rtl:text-right"
            />
          )}
        </Field>

        <Choice<AddressLabel>
          name="address-label"
          legend={L.label}
          value={label}
          onChange={setLabel}
          columns={3}
          options={[
            { value: "home", label: L.labels.home },
            { value: "grandparents", label: L.labels.grandparents },
            { value: "other", label: L.labels.other },
          ]}
        />
        {label === "other" ? (
          <Field label={L.customLabel} hint={L.customLabelHint} error={err("customLabel")}>
            {(p) => <Input {...p} value={details.customLabel} onChange={(e) => setField("customLabel", e.target.value)} />}
          </Field>
        ) : null}

        {showDefaultToggle && !initial?.isDefault ? (
          <Checkbox checked={makeDefault} onChange={setMakeDefault}>
            {L.makeDefault}
          </Checkbox>
        ) : null}

        {submitError ? <Alert tone="error">{submitError}</Alert> : null}

        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
          {secondaryAction ?? <span />}
          <SubmitButton busy={busy} busyText={m.common.saving} className="w-full sm:w-auto">
            {submitLabel ?? L.save}
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}

function GeoErrorHelp({ code, m }: { code: GeoErrorCode; m: AppMessages }) {
  const E = m.location.errors;
  if (code === "denied") {
    return (
      <Alert tone="warning" title={E.deniedTitle}>
        <p>{E.deniedIntro}</p>
        <ul className="mt-2 list-disc space-y-1 ps-5">
          <li>{E.iphone}</li>
          <li>{E.android}</li>
          <li>{E.desktop}</li>
        </ul>
        <p className="mt-2">{E.fallback}</p>
      </Alert>
    );
  }
  return <Alert tone="warning">{E[code]}</Alert>;
}

/** Address search as an ARIA combobox: type, arrow through results, Enter to pick. */
function PlaceSearch({
  locale,
  m,
  onPick,
}: {
  locale: Locale;
  m: AppMessages;
  onPick: (r: PlaceResult) => void;
}) {
  const L = m.location;
  const id = useId();
  const listId = `${id}-list`;
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "empty" | "error">("idle");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 3) {
      setResults([]);
      setStatus("idle");
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setStatus("loading");
      try {
        const r = await osmGeocoder.search(query, locale, ctrl.signal);
        setResults(r);
        setActive(-1);
        setStatus(r.length ? "idle" : "empty");
      } catch {
        if (!ctrl.signal.aborted) setStatus("error");
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q, locale]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function choose(r: PlaceResult) {
    setQ(r.title);
    setOpen(false);
    onPick(r);
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      if (open && active >= 0 && results[active]) {
        e.preventDefault();
        choose(results[active]);
      } else {
        e.preventDefault();
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showList = open && q.trim().length >= 3;

  return (
    <div ref={boxRef} className="relative">
      <label htmlFor={id} className="sr-only">
        {L.searchLabel}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-4 text-muted">
          {status === "loading" ? <IconSpinner width={18} height={18} /> : <IconSearch />}
        </span>
        <input
          id={id}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined}
          autoComplete="off"
          placeholder={L.searchPlaceholder}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          className="block min-h-12 w-full rounded-xl border border-[var(--line)] bg-[var(--card)] py-3 pe-4 ps-11 text-base placeholder:text-[var(--ink-muted)]/70 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15"
        />
      </div>
      {showList ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={L.searchLabel}
          className="absolute inset-x-0 top-full z-[1100] mt-1.5 max-h-80 overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--card)] p-1.5 shadow-[var(--shadow-lift)]"
        >
          {status === "loading" && !results.length ? (
            <li className="px-3 py-3 text-sm text-muted">{L.searching}</li>
          ) : status === "empty" ? (
            <li className="px-3 py-3 text-sm text-muted">{L.noResults}</li>
          ) : status === "error" ? (
            <li className="px-3 py-3 text-sm text-muted">{L.searchUnavailable}</li>
          ) : (
            results.map((r, i) => (
              <li
                key={r.id}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(r)}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5",
                  i === active ? "bg-brand-50 dark:bg-brand-900/40" : "",
                )}
              >
                <IconPin width={18} height={18} className="mt-0.5 shrink-0 text-brand-500" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{r.title}</span>
                  {r.subtitle ? <span className="block truncate text-xs text-muted">{r.subtitle}</span> : null}
                </span>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
