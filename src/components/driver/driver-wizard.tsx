"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useAuth } from "@/components/auth-provider";
import { Alert, Checkbox, Choice, Field, Input, Select, Skeleton, SubmitButton, Textarea } from "@/components/form";
import { IconBus, IconCar, IconCheck, IconChevron, IconEdit } from "@/components/icons";
import { AppLink as Link } from "@/components/link";
import { DocUpload } from "@/components/ops/doc-upload";
import { PlatePreview, SwitchRow } from "@/components/ops/bits";
import { StepAccount } from "@/components/parent/wizard";
import { PhoneVerify } from "@/components/parent/phone-verify";
import { ButtonLink, cn } from "@/components/ui";
import type { ApplicationPatch, DocKind, DriverApplication, HoursRow, PriceRowState, Vehicle } from "@/lib/data";
import { addDays, riyadhToday } from "@/lib/domain/dates";
import { formatSar, parseSar, sarInput } from "@/lib/domain/money";
import { calcPrice, defaultOneWay, typesForVehicle, type ServiceType } from "@/lib/domain/pricing";
import {
  BUS_MAKES,
  BUS_TYPES,
  CAR_CATEGORIES,
  CAR_MAKES,
  PLATE_LETTERS,
  bankFromIban,
  capacityBand,
  formatIban,
  ibanValid,
  normalizeIban,
  normalizePlateDigits,
  normalizePlateLetters,
  validSaudiId,
} from "@/lib/domain/vehicle";
import { errorText, num, t } from "@/lib/format";
import { href, type Locale } from "@/lib/i18n";
import type { AppMessages } from "@/lib/messages/app.en";
import { formatSaudiMobile, toAsciiDigits } from "@/lib/validation";
import { HoursEditor, hoursProblems } from "./hours-editor";
import { CITIES, CITIES_AR, COLORS, COLORS_AR, NATIONALITIES, NATIONALITIES_AR, SECTIONS, docLabel, missingSections, type WizardSection } from "./labels";

const LANGS = ["ar", "en", "ur", "hi", "tl", "bn"] as const;

export function DriverWizard({ locale, m }: { locale: Locale; m: AppMessages }) {
  const D = m.ops.dw;
  const { status, profile, backend } = useAuth();
  const [app, setApp] = useState<DriverApplication | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [step, setStep] = useState<number | null>(null);

  useEffect(() => {
    if (status !== "signed-in" || !profile || profile.role !== "driver") return;
    backend
      .driverApplication()
      .then((a) => {
        setApp(a);
        setStep((s) => s ?? (a.driver.status === "action_needed" ? 8 : Math.min(8, Math.max(1, a.driver.wizardStep))));
      })
      .catch(setError);
  }, [status, profile, backend]);

  const go = (n: number) => {
    setStep(n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (status === "loading" || (status === "signed-in" && !profile)) {
    return (
      <Shell m={m} locale={locale} step={1}>
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="mt-6 h-40" />
      </Shell>
    );
  }

  if (status === "signed-out") {
    return (
      <Shell m={m} locale={locale} step={1}>
        <StepAccount m={m} locale={locale} role="driver" title={D.account.title} subtitle={D.account.subtitle} />
      </Shell>
    );
  }

  if (profile && profile.role !== "driver") {
    return (
      <Shell m={m} locale={locale} step={1}>
        <Alert tone="info">{D.parentAccount}</Alert>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell m={m} locale={locale} step={1}>
        <Alert tone="error">{errorText(m, error)}</Alert>
      </Shell>
    );
  }

  if (!app || step === null) {
    return (
      <Shell m={m} locale={locale} step={1}>
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="mt-6 h-40" />
      </Shell>
    );
  }

  const st = app.driver.status;
  if (st !== "draft" && st !== "action_needed") {
    return (
      <div className="mesh-hero min-h-[calc(100dvh-4rem)] pb-16">
        <div className="container-page max-w-2xl pt-8 sm:pt-12">
          <ApplicationStatus m={m} locale={locale} app={app} />
        </div>
      </div>
    );
  }

  const save = async (patch: ApplicationPatch, next: number) => {
    const a = await backend.saveApplication({ ...patch, step: next });
    setApp(a);
    go(next);
  };

  const common = { m, locale, app, setApp };
  return (
    <Shell m={m} locale={locale} step={step} onStep={(n) => (n <= Math.max(app.driver.wizardStep, step) ? go(n) : undefined)} maxStep={Math.max(app.driver.wizardStep, step)}>
      {st === "action_needed" ? (
        <Alert tone="warning" title={m.ops.common.driverStatus.action_needed} className="mb-6">
          <p>{D.status.actionText}</p>
          {app.driver.adminNote ? <p className="mt-1">“{app.driver.adminNote}”</p> : null}
        </Alert>
      ) : null}
      {step === 1 ? <StepPersonal {...common} onSave={(p) => save(p, 2)} /> : null}
      {step === 2 ? <StepIdentity {...common} onSave={(p) => save(p, 3)} back={() => go(1)} /> : null}
      {step === 3 ? <StepLicence {...common} onSave={(p) => save(p, 4)} back={() => go(2)} /> : null}
      {step === 4 ? <StepVehicle {...common} onSave={(p) => save(p, 5)} back={() => go(3)} /> : null}
      {step === 5 ? <StepPricing {...common} onSave={(p) => save(p, 6)} back={() => go(4)} /> : null}
      {step === 6 ? <StepPayout {...common} onSave={(p) => save(p, 7)} back={() => go(5)} /> : null}
      {step === 7 ? <StepHours {...common} onSave={(p) => save(p, 8)} back={() => go(6)} /> : null}
      {step === 8 ? <StepReview {...common} goTo={go} back={() => go(7)} /> : null}
    </Shell>
  );
}

/* ---- Frame ---------------------------------------------------------------- */

function Shell({ m, locale, step, children, onStep, maxStep = 1 }: { m: AppMessages; locale: Locale; step: number; children: ReactNode; onStep?: (n: number) => void; maxStep?: number }) {
  const D = m.ops.dw;
  return (
    <div className="mesh-hero min-h-[calc(100dvh-4rem)] pb-16">
      <div className="container-page max-w-3xl pt-6 sm:pt-10">
        <p className="text-sm font-semibold text-brand-600 dark:text-brand-300">{D.title}</p>
        <nav aria-label={t(D.stepOf, { n: num(step, locale), total: num(8, locale) })} className="mb-6 mt-2">
          <p className="mb-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
            {t(D.stepOf, { n: num(step, locale), total: num(8, locale) })} · {D.steps[SECTIONS[step - 1]]}
          </p>
          <ol className="grid grid-cols-8 gap-1.5">
            {SECTIONS.map((s, i) => {
              const n = i + 1;
              const state = n < step ? "done" : n === step ? "current" : "todo";
              const can = !!onStep && n <= maxStep;
              return (
                <li key={s} aria-current={state === "current" ? "step" : undefined}>
                  <button
                    type="button"
                    disabled={!can}
                    onClick={() => onStep?.(n)}
                    aria-label={D.steps[s]}
                    className="block w-full disabled:cursor-default"
                  >
                    <span className={cn("block h-1.5 rounded-full", state === "todo" ? "bg-[var(--line)]" : "bg-brand-500")} />
                    <span className={cn("mt-1.5 hidden truncate text-[0.68rem] sm:block", state === "current" ? "font-semibold" : "text-muted")}>{D.steps[s]}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
        <div className="rounded-3xl border border-[var(--line)] bg-[var(--card)] p-5 shadow-[var(--shadow-soft)] sm:p-8">{children}</div>
      </div>
    </div>
  );
}

function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">{title}</h1>
      {subtitle ? <p className="mt-2 text-sm leading-relaxed text-muted sm:text-base">{subtitle}</p> : null}
    </div>
  );
}

function Footer({ m, busy, back, error, label }: { m: AppMessages; busy: boolean; back?: () => void; error?: string | null; label?: string }) {
  return (
    <div className="mt-8 space-y-4">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        {back ? (
          <button type="button" onClick={back} className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted hover:text-[var(--ink)]">
            <IconChevron width={18} height={18} className="rotate-180 rtl:rotate-0" /> {m.common.back}
          </button>
        ) : (
          <span />
        )}
        <SubmitButton busy={busy} busyText={m.common.saving} className="w-full sm:w-auto">
          {label ?? m.ops.dw.saveContinue}
        </SubmitButton>
      </div>
    </div>
  );
}

type StepProps = {
  m: AppMessages;
  locale: Locale;
  app: DriverApplication;
  setApp: (a: DriverApplication) => void;
  onSave: (p: ApplicationPatch) => Promise<void>;
  back?: () => void;
};

function useSubmit(m: AppMessages, fn: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error && err.message.startsWith("v:") ? err.message.slice(2) : errorText(m, err));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, submit, setError };
}

const fail = (msg: string) => {
  throw new Error(`v:${msg}`);
};

const docOf = (app: DriverApplication, k: DocKind) => app.documents.find((d) => d.kind === k);

/* ---- 1: you ------------------------------------------------------------- */

function StepPersonal({ m, locale, app, setApp, onSave }: StepProps) {
  const A = m.ops.dw.account;
  const { profile } = useAuth();
  const d = app.driver;
  const [phoneDone, setPhoneDone] = useState(!!profile?.phoneVerifiedAt);
  const [f, setF] = useState({
    nameAr: d.nameAr ?? "",
    nameEn: d.nameEn ?? profile?.fullName ?? "",
    gender: (d.gender ?? "") as "male" | "female" | "",
    dateOfBirth: d.dateOfBirth ?? "",
    nationality: d.nationality ?? "Saudi",
    city: d.city ?? "",
    yearsExperience: d.yearsExperience?.toString() ?? "",
    languages: d.languages?.length ? d.languages : ["ar"],
    bio: d.bio ?? "",
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const { busy, error, submit } = useSubmit(m, async () => {
    if (!phoneDone) fail(A.phoneFirst);
    if (f.nameAr.trim().length < 2 || f.nameEn.trim().length < 2) fail(errorText(m, "nameShort"));
    if (!f.gender) fail(m.errors.genderRequired);
    if (!f.dateOfBirth) fail(m.errors.dobRequired);
    if (!f.city) fail(m.errors.fixBelow);
    if (!docOf(app, "profile_photo")) fail(`${A.photo}: ${m.ops.dw.upload.required}`);
    await onSave({
      personal: {
        nameAr: f.nameAr.trim(),
        nameEn: f.nameEn.trim(),
        gender: f.gender as "male" | "female",
        dateOfBirth: f.dateOfBirth,
        nationality: f.nationality,
        city: f.city,
        bio: f.bio.trim(),
        languages: f.languages,
        yearsExperience: f.yearsExperience ? Number(toAsciiDigits(f.yearsExperience)) : null,
      },
    });
  });
  const maxDob = addDays(riyadhToday(), -25 * 365 - 6);

  return (
    <>
      <Header title={m.wizard.phone.title} subtitle={A.phoneSubtitle} />
      {phoneDone ? (
        <Alert tone="success" title={m.wizard.phone.verified}>
          <bdi dir="ltr">{formatSaudiMobile(profile?.phone)}</bdi>
        </Alert>
      ) : (
        <PhoneVerify m={m} locale={locale} initialPhone={profile?.phone} onVerified={() => setPhoneDone(true)} />
      )}

      <form onSubmit={submit} noValidate>

      <h2 className="mb-4 mt-10 text-xl font-bold">{A.personalTitle}</h2>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={A.nameAr} hint={A.nameHint}>
          {(p) => <Input {...p} dir="rtl" lang="ar" value={f.nameAr} onChange={(e) => set("nameAr", e.target.value)} />}
        </Field>
        <Field label={A.nameEn} hint={A.nameHint}>
          {(p) => <Input {...p} dir="ltr" lang="en" className="rtl:text-right" value={f.nameEn} onChange={(e) => set("nameEn", e.target.value)} />}
        </Field>
      </div>
      <div className="mt-5">
        <Choice<"male" | "female">
          name="gender"
          legend={A.gender}
          value={f.gender}
          onChange={(v) => set("gender", v)}
          options={[
            { value: "male", label: m.ops.common.genders.male },
            { value: "female", label: m.ops.common.genders.female },
          ]}
        />
      </div>
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <Field label={A.dob} hint={A.dobHint}>
          {(p) => <Input {...p} type="date" max={maxDob} value={f.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} />}
        </Field>
        <Field label={A.nationality}>
          {(p) => (
            <Select {...p} value={f.nationality} onChange={(e) => set("nationality", e.target.value)}>
              {NATIONALITIES.map((n) => (
                <option key={n} value={n}>{locale === "ar" ? NATIONALITIES_AR[n] : n}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={A.city}>
          {(p) => (
            <Select {...p} value={f.city} onChange={(e) => set("city", e.target.value)}>
              <option value="">—</option>
              {CITIES.map((c) => (
                <option key={c} value={c}>{locale === "ar" ? CITIES_AR[c] : c}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={A.years} optional optionalText={m.common.optional}>
          {(p) => <Input {...p} inputMode="numeric" value={f.yearsExperience} onChange={(e) => set("yearsExperience", e.target.value.replace(/[^\d٠-٩]/g, "").slice(0, 2))} />}
        </Field>
      </div>
      <fieldset className="mt-5">
        <legend className="mb-2 text-sm font-medium">{A.languages}</legend>
        <div className="flex flex-wrap gap-2">
          {LANGS.map((l) => {
            const on = f.languages.includes(l);
            return (
              <button
                key={l}
                type="button"
                aria-pressed={on}
                onClick={() => set("languages", on ? f.languages.filter((x) => x !== l) : [...f.languages, l])}
                className={cn("min-h-10 rounded-full border px-4 text-sm", on ? "border-brand-500 bg-brand-50 font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-200" : "border-[var(--line)]")}
              >
                {A.langs[l]}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="mt-5">
        <Field label={A.bio} hint={A.bioHint} optional optionalText={m.common.optional}>
          {(p) => <Textarea {...p} maxLength={400} value={f.bio} onChange={(e) => set("bio", e.target.value)} />}
        </Field>
      </div>
      <div className="mt-6">
        <DocUpload m={m} locale={locale} kind="profile_photo" label={A.photo} tip={A.photoTip} doc={docOf(app, "profile_photo")} capture="user" onSaved={setApp} />
      </div>
      <Footer m={m} busy={busy} error={error} />
      </form>
    </>
  );
}

/* ---- 2: identity ---------------------------------------------------------- */

function StepIdentity({ m, locale, app, setApp, onSave, back }: StepProps) {
  const I = m.ops.dw.identity;
  const d = app.driver;
  const [idNumber, setIdNumber] = useState(d.idNumber ?? "");
  const [idExpiry, setIdExpiry] = useState(d.idExpiry ?? "");
  const [policeIssued, setPoliceIssued] = useState(d.policeIssued ?? "");
  const today = riyadhToday();
  const { busy, error, submit } = useSubmit(m, async () => {
    if (!validSaudiId(idNumber)) fail(I.idHint);
    if (!idExpiry || idExpiry <= today) fail(errorText(m, "document_expired"));
    if (!policeIssued || policeIssued < addDays(today, -365) || policeIssued > today) fail(errorText(m, "police_too_old"));
    for (const k of ["id_front", "id_back", "selfie", "police"] as DocKind[]) if (!docOf(app, k)) fail(`${docLabel(m, k)}: ${m.ops.dw.upload.required}`);
    await onSave({ identity: { idNumber, idExpiry, policeIssued } });
  });
  return (
    <form onSubmit={submit} noValidate>
      <Header title={I.title} subtitle={I.subtitle} />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={I.idNumber} hint={I.idHint}>
          {(p) => <Input {...p} inputMode="numeric" dir="ltr" className="tracking-widest rtl:text-right" maxLength={10} value={idNumber} onChange={(e) => setIdNumber(toAsciiDigits(e.target.value).replace(/\D/g, "").slice(0, 10))} autoComplete="off" />}
        </Field>
        <Field label={I.idExpiry}>
          {(p) => <Input {...p} type="date" min={addDays(today, 1)} value={idExpiry} onChange={(e) => setIdExpiry(e.target.value)} />}
        </Field>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <DocUpload m={m} locale={locale} kind="id_front" label={I.idFront} tip={m.ops.dw.upload.tips} doc={docOf(app, "id_front")} onSaved={setApp} />
        <DocUpload m={m} locale={locale} kind="id_back" label={I.idBack} tip={m.ops.dw.upload.tips} doc={docOf(app, "id_back")} onSaved={setApp} />
        <DocUpload m={m} locale={locale} kind="selfie" label={I.selfie} tip={I.selfieTip} doc={docOf(app, "selfie")} capture="user" onSaved={setApp} />
        <div className="rounded-2xl border border-[var(--line)] p-4">
          <Field label={I.policeIssued} hint={I.policeHint}>
            {(p) => <Input {...p} type="date" min={addDays(today, -365)} max={today} value={policeIssued} onChange={(e) => setPoliceIssued(e.target.value)} />}
          </Field>
          <div className="mt-3">
            <DocUpload m={m} locale={locale} kind="police" label={I.police} doc={docOf(app, "police")} onSaved={setApp} compact />
          </div>
        </div>
      </div>
      <p className="mt-4 text-xs text-muted">{I.nafath}</p>
      <Footer m={m} busy={busy} error={error} back={back} />
    </form>
  );
}

/* ---- 3: licence ----------------------------------------------------------- */

function StepLicence({ m, locale, app, setApp, onSave, back }: StepProps) {
  const L = m.ops.dw.licence;
  const d = app.driver;
  const [num_, setNum] = useState(d.licenceNumber ?? "");
  const [type, setType] = useState<"private" | "public" | "heavy" | "">(d.licenceType ?? "");
  const [expiry, setExpiry] = useState(d.licenceExpiry ?? "");
  const today = riyadhToday();
  const { busy, error, submit } = useSubmit(m, async () => {
    if (!/^\d{6,12}$/.test(num_)) fail(m.errors.fixBelow);
    if (!type) fail(m.errors.fixBelow);
    if (!expiry || expiry <= today) fail(errorText(m, "document_expired"));
    if (!docOf(app, "licence")) fail(`${L.image}: ${m.ops.dw.upload.required}`);
    if (app.vehicle?.type === "bus" && type === "private") fail(errorText(m, "bus_needs_public_licence"));
    await onSave({ licence: { licenceNumber: num_, licenceType: type as "private", licenceExpiry: expiry } });
  });
  return (
    <form onSubmit={submit} noValidate>
      <Header title={L.title} subtitle={L.subtitle} />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={L.number}>
          {(p) => <Input {...p} inputMode="numeric" dir="ltr" className="rtl:text-right" value={num_} onChange={(e) => setNum(toAsciiDigits(e.target.value).replace(/\D/g, "").slice(0, 12))} />}
        </Field>
        <Field label={L.expiry}>
          {(p) => <Input {...p} type="date" min={addDays(today, 1)} value={expiry} onChange={(e) => setExpiry(e.target.value)} />}
        </Field>
      </div>
      <div className="mt-5">
        <Choice<"private" | "public" | "heavy">
          name="licence-type"
          legend={L.type}
          columns={3}
          value={type}
          onChange={setType}
          options={(["private", "public", "heavy"] as const).map((v) => ({ value: v, label: L.types[v] }))}
        />
      </div>
      <div className="mt-6">
        <DocUpload m={m} locale={locale} kind="licence" label={L.image} tip={m.ops.dw.upload.tips} doc={docOf(app, "licence")} onSaved={setApp} />
      </div>
      <Footer m={m} busy={busy} error={error} back={back} />
    </form>
  );
}

/* ---- 4: vehicle ----------------------------------------------------------- */

function StepVehicle({ m, locale, app, setApp, onSave, back }: StepProps) {
  const V = m.ops.dw.vehicle;
  const C = m.ops.common;
  const v = app.vehicle;
  const female = app.driver.gender === "female";
  const year = Number(riyadhToday().slice(0, 4));
  const [f, setF] = useState<Vehicle>({
    type: v?.type ?? (female ? "car" : (undefined as unknown as "car")),
    make: v?.make ?? "",
    model: v?.model ?? "",
    year: v?.year ?? year - 2,
    color: v?.color ?? "White",
    seats: v?.seats ?? null,
    carCategory: v?.carCategory ?? "sedan",
    busType: v?.busType ?? "minivan",
    ac: v?.ac ?? true,
    gps: v?.gps ?? false,
    cameras: v?.cameras ?? false,
    seatbelts: v?.seatbelts ?? true,
    femaleAttendant: v?.femaleAttendant ?? false,
    wheelchair: v?.wheelchair ?? false,
    plateDigits: v?.plateDigits ?? "",
    plateLetters: v?.plateLetters ?? "",
  });
  const set = <K extends keyof typeof f>(k: K, val: (typeof f)[K]) => setF((x) => ({ ...x, [k]: val }));
  const makes = f.type === "bus" ? BUS_MAKES : CAR_MAKES;
  const models = f.make ? (makes[f.make] ?? []) : [];
  const [modelOther, setModelOther] = useState(() => !!v?.model && !((v.type === "bus" ? BUS_MAKES : CAR_MAKES)[v.make ?? ""] ?? []).includes(v.model));
  const typedModel = f.make === "Other" || !models.length || modelOther;
  const maxAge = 10;

  const { busy, error, submit } = useSubmit(m, async () => {
    if (!f.type) fail(V.chooseType);
    if (f.type === "bus" && female) fail(errorText(m, "female_bus_not_allowed"));
    const model = (f.model ?? "").trim();
    if (!f.make || !model || !f.color) fail(m.errors.fixBelow);
    if (!f.year || f.year < year - maxAge || f.year > year + 1) fail(t(errorText(m, "vehicle_too_old"), { s: num(year - maxAge, locale) }));
    if (!f.seats || (f.type === "car" ? f.seats > 7 || f.seats < 1 : f.seats < 8 || f.seats > 60)) fail(m.errors.fixBelow);
    if (!/^\d{1,4}$/.test(f.plateDigits ?? "") || !/^[A-Z]{1,3}$/.test(f.plateLetters ?? "")) fail(V.plateHint);
    const needs: DocKind[] = ["istimara", "insurance", "fahas", "car_front", "car_back", "car_side", "car_interior", ...(f.type === "bus" ? (["tga_card", "first_aid"] as DocKind[]) : [])];
    for (const k of needs) if (!docOf(app, k)) fail(`${docLabel(m, k)}: ${m.ops.dw.upload.required}`);
    await onSave({
      vehicle: {
        type: f.type,
        make: f.make,
        model,
        year: f.year,
        color: f.color,
        seats: f.seats,
        carCategory: f.type === "car" ? f.carCategory : null,
        busType: f.type === "bus" ? f.busType : null,
        ac: f.ac,
        gps: f.gps,
        cameras: f.cameras,
        seatbelts: f.seatbelts,
        femaleAttendant: f.femaleAttendant,
        wheelchair: f.wheelchair,
        plateDigits: f.plateDigits ?? "",
        plateLetters: f.plateLetters ?? "",
      },
    });
  });

  const TypeCard = ({ value, title, text, icon, disabled }: { value: "car" | "bus"; title: string; text: string; icon: ReactNode; disabled?: boolean }) => (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={f.type === value}
      onClick={() => {
        setF((x) => ({ ...x, type: value, make: "", model: "", seats: null }));
        setModelOther(false);
      }}
      className={cn(
        "flex flex-col items-start gap-3 rounded-2xl border-2 p-5 text-start transition-all disabled:cursor-not-allowed disabled:opacity-50",
        f.type === value ? "border-brand-500 bg-brand-50 dark:bg-brand-900/30" : "border-[var(--line)] hover:border-brand-300",
      )}
    >
      <span className={cn("flex h-14 w-14 items-center justify-center rounded-2xl", f.type === value ? "bg-brand-500 text-white" : "bg-[var(--page-subtle)] text-brand-600")}>{icon}</span>
      <span className="text-lg font-bold">{title}</span>
      <span className="text-sm text-muted">{text}</span>
    </button>
  );

  return (
    <form onSubmit={submit} noValidate>
      <Header title={V.title} />
      <h2 className="mb-3 font-semibold">{V.chooseType}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <TypeCard value="car" title={V.carTitle} text={V.carText} icon={<IconCar width={30} height={30} />} />
        <TypeCard value="bus" title={V.busTitle} text={V.busText} icon={<IconBus width={30} height={30} />} disabled={female} />
      </div>
      {female ? <Alert tone="info" className="mt-3">{V.femaleBus}</Alert> : null}

      {f.type ? (
        <>
          <h2 className="mb-4 mt-8 text-lg font-bold">{V.details}</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={V.make}>
              {(p) => (
                <Select
                  {...p}
                  value={f.make ?? ""}
                  onChange={(e) => {
                    setF((x) => ({ ...x, make: e.target.value, model: "" }));
                    setModelOther(false);
                  }}
                >
                  <option value="">—</option>
                  {Object.keys(makes).map((k) => (
                    <option key={k} value={k}>{k === "Other" ? V.makeOther : k}</option>
                  ))}
                </Select>
              )}
            </Field>
            {f.make && f.make !== "Other" && models.length ? (
              <Field label={V.model}>
                {(p) => (
                  <Select
                    {...p}
                    value={modelOther ? "__other" : (f.model ?? "")}
                    onChange={(e) => {
                      const val = e.target.value;
                      setModelOther(val === "__other");
                      set("model", val === "__other" ? "" : val);
                    }}
                  >
                    <option value="">—</option>
                    {models.map((k) => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                    <option value="__other">{V.makeOther}</option>
                  </Select>
                )}
              </Field>
            ) : null}
            {f.make && typedModel ? (
              <Field label={V.otherModel}>
                {(p) => <Input {...p} value={f.model ?? ""} onChange={(e) => set("model", e.target.value)} />}
              </Field>
            ) : null}
            <Field label={V.year} hint={t(V.yearHint, { n: num(maxAge, locale) })}>
              {(p) => (
                <Select {...p} value={f.year ?? ""} onChange={(e) => set("year", Number(e.target.value))}>
                  {Array.from({ length: maxAge + 2 }, (_, i) => year + 1 - i).map((y) => (
                    <option key={y} value={y}>{num(y, locale)}</option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={V.color}>
              {(p) => (
                <Select {...p} value={f.color ?? ""} onChange={(e) => set("color", e.target.value)}>
                  {COLORS.map((c) => (
                    <option key={c} value={c}>{locale === "ar" ? COLORS_AR[c] : c}</option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={f.type === "car" ? V.seats : V.capacity} hint={f.type === "car" ? V.seatsCarHint : undefined}>
              {(p) => (
                <Select {...p} value={f.seats ?? ""} onChange={(e) => set("seats", Number(e.target.value))}>
                  <option value="">—</option>
                  {(f.type === "car" ? [1, 2, 3, 4, 5, 6, 7] : Array.from({ length: 53 }, (_, i) => i + 8)).map((n) => (
                    <option key={n} value={n}>{num(n, locale)}</option>
                  ))}
                </Select>
              )}
            </Field>
            {f.type === "car" ? (
              <Field label={V.category}>
                {(p) => (
                  <Select {...p} value={f.carCategory ?? "sedan"} onChange={(e) => set("carCategory", e.target.value as Vehicle["carCategory"])}>
                    {CAR_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{C.carCategories[c]}</option>
                    ))}
                  </Select>
                )}
              </Field>
            ) : (
              <Field label={V.busType}>
                {(p) => (
                  <Select {...p} value={f.busType ?? "minivan"} onChange={(e) => set("busType", e.target.value as Vehicle["busType"])}>
                    {BUS_TYPES.map((c) => (
                      <option key={c} value={c}>{C.busTypes[c]}</option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
          </div>

          <h3 className="mb-2 mt-6 text-sm font-semibold">{V.amenities}</h3>
          <div className="grid gap-x-8 rounded-2xl border border-[var(--line)] px-4 py-2 sm:grid-cols-2">
            {(["ac", "seatbelts", "gps", "cameras", ...(f.type === "bus" ? (["femaleAttendant", "wheelchair"] as const) : (["wheelchair"] as const))] as const).map((k) => (
              <SwitchRow key={k} label={C.amenities[k]} checked={!!f[k]} onChange={(val) => set(k, val)} />
            ))}
          </div>

          <h2 className="mb-2 mt-8 text-lg font-bold">{V.plate}</h2>
          <p className="mb-4 text-sm text-muted">{V.plateHint}</p>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
            <div className="grid flex-1 grid-cols-2 gap-3">
              <Field label={V.plateDigits}>
                {(p) => <Input {...p} inputMode="numeric" dir="ltr" maxLength={4} className="text-center text-lg tracking-[0.3em]" value={f.plateDigits ?? ""} onChange={(e) => set("plateDigits", normalizePlateDigits(e.target.value))} />}
              </Field>
              <Field label={V.plateLetters}>
                {(p) => <Input {...p} dir="ltr" autoCapitalize="characters" maxLength={6} className="text-center text-lg tracking-[0.3em]" value={f.plateLetters ?? ""} onChange={(e) => set("plateLetters", normalizePlateLetters(e.target.value))} />}
              </Field>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted">{V.platePreview}</p>
              <PlatePreview digits={f.plateDigits ?? ""} letters={f.plateLetters ?? ""} />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5" aria-hidden>
            {PLATE_LETTERS.map((l) => (
              <button
                key={l.en}
                type="button"
                tabIndex={-1}
                onClick={() => set("plateLetters", normalizePlateLetters((f.plateLetters ?? "") + l.en))}
                className="min-h-9 rounded-lg border border-[var(--line)] px-2 text-xs hover:border-brand-400"
              >
                {l.ar} <span className="text-muted">{l.en}</span>
              </button>
            ))}
            <button type="button" tabIndex={-1} onClick={() => set("plateLetters", "")} className="min-h-9 rounded-lg px-2 text-xs text-muted underline">
              ×
            </button>
          </div>

          <h2 className="mb-4 mt-8 text-lg font-bold">{V.docs}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <DocUpload m={m} locale={locale} kind="istimara" label={V.istimara} doc={docOf(app, "istimara")} needsExpiry onSaved={setApp} compact />
            <DocUpload m={m} locale={locale} kind="insurance" label={V.insurance} doc={docOf(app, "insurance")} needsExpiry onSaved={setApp} compact />
            <DocUpload m={m} locale={locale} kind="fahas" label={V.fahas} doc={docOf(app, "fahas")} needsExpiry onSaved={setApp} compact />
            {f.type === "bus" ? (
              <>
                <DocUpload m={m} locale={locale} kind="tga_card" label={V.tga} doc={docOf(app, "tga_card")} needsExpiry onSaved={setApp} compact />
                <DocUpload m={m} locale={locale} kind="first_aid" label={V.firstAid} doc={docOf(app, "first_aid")} onSaved={setApp} compact />
              </>
            ) : null}
          </div>

          <h2 className="mb-4 mt-8 text-lg font-bold">{V.photos}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {(["car_front", "car_back", "car_side", "car_interior"] as DocKind[]).map((k) => (
              <DocUpload key={k} m={m} locale={locale} kind={k} label={docLabel(m, k)} doc={docOf(app, k)} onSaved={setApp} compact />
            ))}
          </div>
        </>
      ) : null}
      <Footer m={m} busy={busy} error={error} back={back} />
    </form>
  );
}

/* ---- 5: prices ------------------------------------------------------------ */

const DEFAULT_PRICES: Record<ServiceType, { daily: number; enabled: boolean; maxChildren?: number; attendantFee?: number }> = {
  shared_car: { daily: 2000, enabled: true },
  exclusive_car: { daily: 9000, enabled: false, maxChildren: 4 },
  shared_bus: { daily: 1700, enabled: true },
  whole_bus: { daily: 65000, enabled: false, attendantFee: 8000 },
};

type PriceForm = { type: ServiceType; enabled: boolean; daily: string; oneWay: string; perTrip: string; maxChildren: string; attendant: boolean; attendantFee: string };

export function initialPriceForms(vehicle: "car" | "bus", rows: PriceRowState[]): PriceForm[] {
  return typesForVehicle(vehicle).map((type) => {
    const r = rows.find((x) => x.serviceType === type);
    const d = DEFAULT_PRICES[type];
    return {
      type,
      enabled: r ? r.enabled : d.enabled,
      daily: sarInput(r?.dailyH ?? d.daily),
      oneWay: sarInput(r?.oneWayH ?? defaultOneWay(r?.dailyH ?? d.daily)),
      perTrip: sarInput(r?.perTripH ?? null),
      maxChildren: String(r?.maxChildren ?? d.maxChildren ?? ""),
      attendant: r?.attendantAvailable ?? false,
      attendantFee: sarInput(r?.attendantFeeH ?? d.attendantFee ?? null),
    };
  });
}

export function priceFormsToRows(forms: PriceForm[]): PriceRowState[] | null {
  const rows: PriceRowState[] = [];
  for (const f of forms) {
    const daily = parseSar(f.daily);
    if (f.enabled && (!daily || daily < 100)) return null;
    rows.push({
      serviceType: f.type,
      enabled: f.enabled,
      dailyH: daily ?? 100,
      oneWayH: parseSar(f.oneWay) ?? (daily ? defaultOneWay(daily) : null),
      perTripH: parseSar(f.perTrip),
      maxChildren: f.maxChildren ? Number(f.maxChildren) : null,
      attendantAvailable: f.attendant,
      attendantFeeH: f.attendant ? (parseSar(f.attendantFee) ?? 0) : 0,
    });
  }
  return rows;
}

export function PriceEditor({
  m,
  locale,
  forms,
  setForms,
  seats,
  t1Pct,
  t2Pct,
}: {
  m: AppMessages;
  locale: Locale;
  forms: PriceForm[];
  setForms: (f: PriceForm[]) => void;
  seats: number | null;
  t1Pct: number;
  t2Pct: number;
}) {
  const P = m.ops.dw.pricing;
  const C = m.ops.common;
  const upd = (i: number, patch: Partial<PriceForm>) => setForms(forms.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  return (
    <div className="space-y-4">
      {forms.map((f, i) => {
        const exclusive = f.type === "exclusive_car" || f.type === "whole_bus";
        const daily = parseSar(f.daily) ?? 0;
        const units = exclusive ? 1 : 2;
        const q = calcPrice({ rateH: daily, units, days: 22, t1Pct, t2Pct });
        const sar = (h: number) => formatSar(h, locale, { compact: false });
        return (
          <fieldset key={f.type} className={cn("rounded-2xl border p-4 sm:p-5", f.enabled ? "border-brand-300 dark:border-brand-800" : "border-[var(--line)]")}>
            <legend className="sr-only">{C.serviceTypes[f.type]}</legend>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold">{C.serviceTypes[f.type]}</p>
                <p className="mt-0.5 text-sm text-muted">{C.serviceTypeHints[f.type]}</p>
              </div>
              <Checkbox checked={f.enabled} onChange={(v) => upd(i, { enabled: v })}>
                {P.offer}
              </Checkbox>
            </div>
            {f.enabled ? (
              <>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <Field label={`${P.daily} (${locale === "ar" ? "ر.س" : "SAR"})`}>
                    {(p) => (
                      <Input
                        {...p}
                        inputMode="decimal"
                        dir="ltr"
                        className="rtl:text-right"
                        value={f.daily}
                        onChange={(e) => {
                          const d = parseSar(e.target.value);
                          const wasDefault = parseSar(f.oneWay) === defaultOneWay(parseSar(f.daily) ?? 0);
                          upd(i, { daily: e.target.value, ...(wasDefault && d ? { oneWay: sarInput(defaultOneWay(d)) } : {}) });
                        }}
                      />
                    )}
                  </Field>
                  <Field label={`${P.oneWay} (${locale === "ar" ? "ر.س" : "SAR"})`} hint={P.oneWayHint}>
                    {(p) => <Input {...p} inputMode="decimal" dir="ltr" className="rtl:text-right" value={f.oneWay} onChange={(e) => upd(i, { oneWay: e.target.value })} />}
                  </Field>
                  {exclusive ? (
                    <Field label={`${P.perTrip} (${locale === "ar" ? "ر.س" : "SAR"})`} hint={P.perTripHint} optional optionalText={m.common.optional}>
                      {(p) => <Input {...p} inputMode="decimal" dir="ltr" className="rtl:text-right" value={f.perTrip} onChange={(e) => upd(i, { perTrip: e.target.value })} />}
                    </Field>
                  ) : null}
                  {f.type === "exclusive_car" ? (
                    <Field label={P.maxChildren}>
                      {(p) => (
                        <Select {...p} value={f.maxChildren} onChange={(e) => upd(i, { maxChildren: e.target.value })}>
                          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                            <option key={n} value={n}>{num(n, locale)}</option>
                          ))}
                        </Select>
                      )}
                    </Field>
                  ) : null}
                </div>
                {f.type === "whole_bus" ? (
                  <div className="mt-4 rounded-xl bg-[var(--page-subtle)] p-3">
                    <p className="mb-2 text-xs text-muted">{seats ? (capacityBand(seats) === "30+" ? P.bandOver : t(P.band, { n: num(Number(capacityBand(seats)), locale) })) : null}</p>
                    <Checkbox checked={f.attendant} onChange={(v) => upd(i, { attendant: v })}>
                      {P.attendant}
                    </Checkbox>
                    {f.attendant ? (
                      <div className="mt-3 max-w-xs">
                        <Field label={`${P.attendantFee} (${locale === "ar" ? "ر.س" : "SAR"})`}>
                          {(p) => <Input {...p} inputMode="decimal" dir="ltr" className="rtl:text-right" value={f.attendantFee} onChange={(e) => upd(i, { attendantFee: e.target.value })} />}
                        </Field>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {f.type === "shared_bus" ? (
                  <div className="mt-3">
                    <Checkbox checked={f.attendant} onChange={(v) => upd(i, { attendant: v })}>
                      {P.attendant}
                    </Checkbox>
                  </div>
                ) : null}
                {daily > 0 ? (
                  <p className="mt-4 rounded-xl border border-brand-200 bg-brand-50 p-3 text-sm leading-relaxed text-brand-900 dark:border-brand-800 dark:bg-brand-900/30 dark:text-brand-100">
                    <span className="font-semibold">{P.preview}: </span>
                    {t(exclusive ? P.previewVehicle : P.previewText, {
                      rate: sar(daily),
                      days: num(22, locale),
                      line: sar(q.lineH),
                      disc: q.discountPct ? t(P.previewDisc, { pct: num(q.discountPct, locale) }) : "",
                      driver: sar(q.driverH),
                      vat: sar(q.vatH),
                      fee: sar(q.feeH),
                      total: sar(q.totalH),
                    })}
                  </p>
                ) : null}
              </>
            ) : null}
          </fieldset>
        );
      })}
    </div>
  );
}

function StepPricing({ m, locale, app, onSave, back }: StepProps) {
  const P = m.ops.dw.pricing;
  const vt = app.vehicle?.type ?? "car";
  const [forms, setForms] = useState(() => initialPriceForms(vt, app.pricing));
  const [t1, setT1] = useState(app.driver.discountT1Pct);
  const [t2, setT2] = useState(app.driver.discountT2Pct);
  const { busy, error, submit } = useSubmit(m, async () => {
    const rows = priceFormsToRows(forms);
    if (!rows || !rows.some((r) => r.enabled)) fail(errorText(m, "pricing_required"));
    await onSave({ pricing: { types: rows!, discountT1Pct: t1, discountT2Pct: t2 } });
  });
  return (
    <form onSubmit={submit} noValidate>
      <Header title={P.title} subtitle={P.subtitle} />
      <Alert tone="info" className="mb-5">
        {P.helper} {P.youKeep}
      </Alert>
      <PriceEditor m={m} locale={locale} forms={forms} setForms={setForms} seats={app.vehicle?.seats ?? null} t1Pct={t1} t2Pct={t2} />
      <fieldset className="mt-6 rounded-2xl border border-[var(--line)] p-4 sm:p-5">
        <legend className="px-1 font-semibold">{P.discounts}</legend>
        <p className="mb-4 text-sm text-muted">{P.discountsHint}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { label: t(P.t1, { n: num(10, locale) }), v: t1, set: setT1 },
            { label: t(P.t2, { n: num(20, locale) }), v: t2, set: setT2 },
          ].map((x, i) => (
            <Field key={i} label={x.label}>
              {(p) => (
                <Select {...p} value={x.v} onChange={(e) => x.set(Number(e.target.value))}>
                  {[0, 3, 5, 7, 10, 12, 15, 20].map((n) => (
                    <option key={n} value={n}>{n === 0 ? m.ops.common.no : `${num(n, locale)}${P.pctOff}`}</option>
                  ))}
                </Select>
              )}
            </Field>
          ))}
        </div>
      </fieldset>
      <Footer m={m} busy={busy} error={error} back={back} />
    </form>
  );
}

/* ---- 6: payouts ----------------------------------------------------------- */

function StepPayout({ m, locale, app, onSave, back }: StepProps) {
  const P = m.ops.dw.payout;
  const [iban, setIban] = useState(app.driver.iban ? formatIban(app.driver.iban) : "SA");
  const [bank, setBank] = useState(app.driver.bankName ?? "");
  const [holder, setHolder] = useState(app.driver.accountHolder ?? app.driver.nameEn ?? "");
  const detected = bankFromIban(iban);
  const valid = ibanValid(iban);
  const { busy, error, submit } = useSubmit(m, async () => {
    if (!valid) fail(errorText(m, "iban_invalid"));
    if (holder.trim().length < 3) fail(m.errors.fixBelow);
    await onSave({ payout: { iban: normalizeIban(iban), bankName: bank || (detected ? detected.en : ""), accountHolder: holder.trim() } });
  });
  useEffect(() => {
    if (detected && !bank) setBank(detected.en);
  }, [detected, bank]);
  return (
    <form onSubmit={submit} noValidate>
      <Header title={P.title} subtitle={P.subtitle} />
      <div className="space-y-5">
        <Field label={P.iban} hint={P.ibanHint} error={iban.length > 6 && normalizeIban(iban).length >= 24 && !valid ? errorText(m, "iban_invalid") : null}>
          {(p) => (
            <div className="relative">
              <Input {...p} dir="ltr" autoComplete="off" spellCheck={false} className="pe-12 font-mono tracking-wider rtl:text-right" value={iban} onChange={(e) => setIban(formatIban(e.target.value).slice(0, 29))} />
              {valid ? <IconCheck className="absolute end-4 top-1/2 -translate-y-1/2 text-brand-500" aria-label={P.ibanOk} /> : null}
            </div>
          )}
        </Field>
        <Field label={P.bank}>
          {(p) => <Input {...p} value={locale === "ar" && detected && bank === detected.en ? detected.ar : bank} onChange={(e) => setBank(e.target.value)} />}
        </Field>
        <Field label={P.holder} hint={P.holderHint}>
          {(p) => <Input {...p} value={holder} onChange={(e) => setHolder(e.target.value)} />}
        </Field>
      </div>
      <Alert tone="info" className="mt-5">{P.demo}</Alert>
      <Footer m={m} busy={busy} error={error} back={back} />
    </form>
  );
}

/* ---- 7: hours ------------------------------------------------------------- */

function StepHours({ m, locale, app, onSave, back }: StepProps) {
  const H = m.ops.dw.hours;
  const [hours, setHours] = useState<HoursRow[]>(
    app.hours.length ? app.hours : [0, 1, 2, 3, 4].flatMap((d) => [{ dow: d, startMin: 360, endMin: 480 }, { dow: d, startMin: 750, endMin: 930 }]),
  );
  const { busy, error, submit } = useSubmit(m, async () => {
    if (!hours.length) fail(errorText(m, "hours_required"));
    if (hoursProblems(hours).length) fail(H.overlap);
    await onSave({ hours });
  });
  return (
    <form onSubmit={submit} noValidate>
      <Header title={H.title} subtitle={H.subtitle} />
      <HoursEditor m={m} locale={locale} value={hours} onChange={setHours} />
      <Footer m={m} busy={busy} error={error} back={back} />
    </form>
  );
}

/* ---- 8: review and submit ------------------------------------------------- */

function StepReview({ m, locale, app, setApp, goTo, back }: Omit<StepProps, "onSave"> & { goTo: (n: number) => void }) {
  const R = m.ops.dw.review;
  const { backend } = useAuth();
  const [agree, setAgree] = useState(false);
  const missing = useMemo(() => missingSections(app), [app]);
  const rejected = app.documents.filter((d) => d.status === "rejected");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const d = app.driver;
  const v = app.vehicle;
  const total = app.requiredDocs.length;
  const uploaded = app.documents.filter((x) => app.requiredDocs.includes(x.kind)).length;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!agree) {
      setError(m.errors.fixBelow);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setApp(await backend.submitApplication());
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(errorText(m, err));
    } finally {
      setBusy(false);
    }
  }

  const Row = ({ section, children }: { section: WizardSection; children: ReactNode }) => {
    const miss = missing.find((x) => x.section === section);
    return (
      <div className={cn("flex items-start justify-between gap-4 border-b border-[var(--line)] py-3 last:border-0", miss && "text-red-700 dark:text-red-300")}>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{m.ops.dw.steps[section]}</p>
          <div className="mt-0.5 text-sm text-muted">{children}</div>
          {miss?.docs.length ? <p className="mt-1 text-xs">{miss.docs.map((k) => docLabel(m, k)).join(" · ")}</p> : null}
        </div>
        <button type="button" onClick={() => goTo(SECTIONS.indexOf(section) + 1)} className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-full px-3 text-sm font-medium text-brand-600 dark:text-brand-300">
          <IconEdit width={16} height={16} /> {R.editSection}
        </button>
      </div>
    );
  };

  return (
    <form onSubmit={submit} noValidate>
      <Header title={R.title} subtitle={R.subtitle} />
      {missing.length ? (
        <Alert tone="warning" title={R.missing} className="mb-5">
          {missing.map((x) => m.ops.dw.steps[x.section]).join(" · ")}
        </Alert>
      ) : null}
      {rejected.length ? (
        <Alert tone="error" className="mb-5">
          <ul className="list-disc ps-4">
            {rejected.map((x) => (
              <li key={x.id}>
                {docLabel(m, x.kind)}: {x.rejectReason}
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}
      <div className="rounded-2xl border border-[var(--line)] px-4">
        <Row section="account">{[d.nameEn, d.nameAr].filter(Boolean).join(" · ")} {d.city ? `· ${locale === "ar" ? CITIES_AR[d.city] ?? d.city : d.city}` : ""}</Row>
        <Row section="identity">{d.idNumber ? `${d.idNumber.slice(0, 1)}••••••••${d.idNumber.slice(-1)}` : "—"}</Row>
        <Row section="licence">{d.licenceType ? m.ops.dw.licence.types[d.licenceType] : "—"}</Row>
        <Row section="vehicle">
          {v ? (
            <span className="flex flex-wrap items-center gap-2">
              {[v.make, v.model, v.year].filter(Boolean).join(" ")} · {t(m.ops.common.seats, { n: num(v.seats ?? 0, locale) })}
              {v.plateDigits ? <PlatePreview digits={v.plateDigits} letters={v.plateLetters ?? ""} size="sm" /> : null}
            </span>
          ) : (
            "—"
          )}
        </Row>
        <Row section="pricing">
          {app.pricing
            .filter((p) => p.enabled)
            .map((p) => `${m.ops.common.serviceTypes[p.serviceType]}: ${formatSar(p.dailyH, locale)}`)
            .join(" · ") || "—"}
        </Row>
        <Row section="payout">{d.iban ? `${d.bankName ?? ""} · ${d.iban.slice(0, 4)} •••• ${d.iban.slice(-4)}` : "—"}</Row>
        <Row section="hours">{app.hours.length ? `${num(new Set(app.hours.map((h) => h.dow)).size, locale)} ${m.ops.common.days}` : "—"}</Row>
      </div>
      <p className="mt-3 text-sm text-muted">{t(R.docsUploaded, { n: num(uploaded, locale), total: num(total, locale) })}</p>
      <div className="mt-6">
        <Checkbox checked={agree} onChange={setAgree}>
          {R.declaration}
        </Checkbox>
      </div>
      {error ? <Alert tone="error" className="mt-4">{error}</Alert> : null}
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" onClick={back} className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted hover:text-[var(--ink)]">
          <IconChevron width={18} height={18} className="rotate-180 rtl:rotate-0" /> {m.common.back}
        </button>
        <SubmitButton busy={busy} busyText={R.submitting} disabled={!!missing.length} className="w-full sm:w-auto">
          {R.submit}
        </SubmitButton>
      </div>
    </form>
  );
}

/* ---- Status tracker ------------------------------------------------------- */

export function ApplicationStatus({ m, locale, app, compact }: { m: AppMessages; locale: Locale; app: DriverApplication; compact?: boolean }) {
  const S = m.ops.dw.status;
  const st = app.driver.status;
  const stage = st === "submitted" ? 1 : st === "under_review" ? 2 : st === "approved" ? 3 : st === "action_needed" ? 3 : 0;
  const steps = [S.submitted, S.review, st === "action_needed" ? S.actionNeeded : S.decision];
  const text =
    st === "submitted" ? S.submittedText : st === "under_review" ? S.reviewText : st === "approved" ? S.approvedText : st === "action_needed" ? S.actionText : st === "suspended" ? S.suspendedText : m.ops.dw.subtitle;
  return (
    <div className={cn("rounded-3xl border border-[var(--line)] bg-[var(--card)] shadow-[var(--shadow-soft)]", compact ? "p-5" : "p-6 sm:p-8")}>
      <h2 className={cn("font-bold", compact ? "text-lg" : "text-2xl")}>{S.title}</h2>
      <ol className="mt-5 grid grid-cols-3 gap-2" aria-label={S.title}>
        {steps.map((label, i) => {
          const n = i + 1;
          const done = stage >= n;
          const warn = st === "action_needed" && n === 3;
          return (
            <li key={label} className="text-center">
              <span
                className={cn(
                  "mx-auto flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-bold",
                  warn ? "border-accent-400 bg-accent-400 text-brand-950" : done ? "border-brand-500 bg-brand-500 text-white" : "border-[var(--line)] text-muted",
                )}
              >
                {done && !warn ? <IconCheck width={16} height={16} /> : num(n, locale)}
              </span>
              <span className={cn("mt-2 block text-xs", done ? "font-semibold" : "text-muted")}>{label}</span>
            </li>
          );
        })}
      </ol>
      <p className="mt-5 text-sm leading-relaxed text-muted">{text}</p>
      {app.driver.adminNote && (st === "action_needed" || st === "suspended") ? (
        <Alert tone="warning" title={S.adminNote} className="mt-4">
          {app.driver.adminNote}
        </Alert>
      ) : null}
      {st === "action_needed" ? (
        <ul className="mt-4 space-y-1 text-sm">
          {app.documents
            .filter((d) => d.status === "rejected")
            .map((d) => (
              <li key={d.id} className="text-red-700 dark:text-red-300">
                • {docLabel(m, d.kind)}: {d.rejectReason}
              </li>
            ))}
        </ul>
      ) : null}
      <div className="mt-6 flex flex-wrap gap-3">
        {st === "draft" ? <ButtonLink href={href(locale, "/driver/join")}>{S.continue}</ButtonLink> : null}
        {st === "action_needed" ? <ButtonLink href={href(locale, "/driver/join")}>{S.fix}</ButtonLink> : null}
        {st === "approved" && !compact ? <ButtonLink href={href(locale, "/driver")}>{m.ops.nav.driverHome}</ButtonLink> : null}
        {!compact && st !== "approved" ? (
          <Link href={href(locale, "/driver")} className="inline-flex min-h-11 items-center px-2 text-sm font-medium text-brand-600 underline underline-offset-4 dark:text-brand-300">
            {m.ops.nav.driverHome}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
