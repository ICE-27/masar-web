"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  Alert,
  Checkbox,
  Choice,
  Field,
  Input,
  PasswordInput,
  Skeleton,
  SubmitButton,
  useDraft,
} from "@/components/form";
import {
  IconCheck,
  IconChevron,
  IconEdit,
  IconHome,
  IconPhone,
  IconPlus,
  IconSchool,
  IconUsers,
} from "@/components/icons";
import { AppLink as Link } from "@/components/link";
import { LocationEditor } from "@/components/map/location-editor";
import { ButtonLink, cn } from "@/components/ui";
import type { Address, Child, ConsentKind, OnboardingStep } from "@/lib/data";
import { errorText, num, t } from "@/lib/format";
import { href, type Locale } from "@/lib/i18n";
import type { AppMessages } from "@/lib/messages/app.en";
import { useNavigate } from "@/lib/nav";
import { ageFrom, fieldErrors, formatSaudiMobile, signUpSchema } from "@/lib/validation";
import { ChildForm } from "./child-form";
import { PhoneVerify } from "./phone-verify";

const PENDING_CONSENTS = "masar-pending-consents";

export function ParentWizard({ locale, m }: { locale: Locale; m: AppMessages }) {
  const { status, profile, backend, refresh } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<OnboardingStep | null>(null);
  const [finishedNow, setFinishedNow] = useState(false);

  // Record consents from a sign-up that needed email confirmation first
  useEffect(() => {
    if (status !== "signed-in") return;
    try {
      const raw = localStorage.getItem(PENDING_CONSENTS);
      if (raw) {
        localStorage.removeItem(PENDING_CONSENTS);
        void backend.recordConsents(JSON.parse(raw));
      }
    } catch {
      /* nothing pending */
    }
  }, [status, backend]);

  // Resume where the parent stopped
  useEffect(() => {
    if (status === "signed-out") setView(1);
    if (status === "signed-in" && profile && view === null) {
      if (profile.onboardingCompletedAt) {
        navigate(href(locale, "/account"), { replace: true });
        return;
      }
      setView(profile.onboardingStep);
    }
  }, [status, profile, view, locale, navigate]);

  async function advance(to: OnboardingStep, complete = false) {
    if (profile && (to > profile.onboardingStep || complete)) {
      await backend.updateProfile({
        onboardingStep: to,
        ...(complete ? { onboardingCompletedAt: new Date().toISOString() } : {}),
      });
      await refresh();
    }
    if (complete) setFinishedNow(true);
    setView(to);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (status === "loading" || view === null || (status === "signed-in" && !profile)) {
    return (
      <Shell m={m} locale={locale} step={1} wide={false}>
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="mt-4 h-4 w-1/2" />
        <div className="mt-8 space-y-4">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      </Shell>
    );
  }

  if (profile && profile.role !== "parent") {
    return (
      <Shell m={m} locale={locale} step={1} wide={false}>
        <Alert tone="info">{m.auth.driverNote}</Alert>
      </Shell>
    );
  }

  const back =
    view > 1 && view < 4 ? (
      <button
        type="button"
        onClick={() => setView((view - 1) as OnboardingStep)}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted hover:text-[var(--ink)]"
      >
        <IconChevron width={18} height={18} className="rotate-180 rtl:rotate-0" />
        {m.common.back}
      </button>
    ) : null;

  return (
    <Shell m={m} locale={locale} step={view} wide={view === 2}>
      {view === 1 ? (
        status === "signed-in" && profile ? (
          <StepPhone
            m={m}
            locale={locale}
            phone={profile.phone}
            verified={!!profile.phoneVerifiedAt}
            onDone={() => advance(2)}
          />
        ) : (
          <StepAccount m={m} locale={locale} />
        )
      ) : null}

      {view === 2 ? <StepHome m={m} locale={locale} onDone={() => advance(3)} back={back} /> : null}

      {view === 3 ? (
        <StepChildren m={m} locale={locale} onDone={() => advance(4, true)} back={back} />
      ) : null}

      {view === 4 && profile ? (
        <StepDone m={m} locale={locale} name={profile.fullName ?? ""} phone={profile.phone} celebrate={finishedNow} />
      ) : null}
    </Shell>
  );
}

/* ------------------------------------------------------------------------ */

function Shell({
  m,
  locale,
  step,
  wide,
  children,
}: {
  m: AppMessages;
  locale: Locale;
  step: OnboardingStep;
  wide: boolean;
  children: ReactNode;
}) {
  const W = m.wizard;
  return (
    <div className="mesh-hero min-h-[calc(100dvh-4rem)] pb-16">
      <div className={cn("container-page pt-6 sm:pt-10", wide ? "max-w-6xl" : "max-w-2xl")}>
        <nav aria-label={t(W.stepOf, { n: num(step, locale), total: num(4, locale) })} className="mb-6">
          <p className="mb-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-brand-600 dark:text-brand-300">
            {t(W.stepOf, { n: num(step, locale), total: num(4, locale) })}
          </p>
          <ol className="grid grid-cols-4 gap-2">
            {W.steps.map((label, i) => {
              const n = i + 1;
              const state = n < step ? "done" : n === step ? "current" : "todo";
              return (
                <li key={label} aria-current={state === "current" ? "step" : undefined}>
                  <div
                    className={cn(
                      "h-1.5 rounded-full transition-colors duration-300",
                      state === "todo" ? "bg-[var(--line)]" : "bg-brand-500",
                    )}
                  />
                  <span
                    className={cn(
                      "mt-1.5 flex items-center gap-1 text-xs",
                      state === "current" ? "font-semibold text-[var(--ink)]" : "text-muted",
                    )}
                  >
                    {state === "done" ? <IconCheck width={13} height={13} className="text-brand-500" /> : null}
                    {label}
                  </span>
                </li>
              );
            })}
          </ol>
        </nav>
        <div className="rounded-3xl border border-[var(--line)] bg-[var(--card)] p-5 shadow-[var(--shadow-soft)] sm:p-8">
          {children}
        </div>
      </div>
    </div>
  );
}

function StepHeader({ title, subtitle, icon }: { title: string; subtitle: string; icon?: ReactNode }) {
  return (
    <div className="mb-7 flex items-start gap-4">
      {icon ? (
        <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 sm:flex dark:bg-brand-900/40 dark:text-brand-300">
          {icon}
        </span>
      ) : null}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted sm:text-base">{subtitle}</p>
      </div>
    </div>
  );
}

/* ---- Step 1a: account ---------------------------------------------------- */

type AccountForm = {
  fullName: string;
  email: string;
  password: string;
  language: Locale;
  terms: boolean;
  privacy: boolean;
  whatsapp: boolean;
};

function StepAccount({ m, locale }: { m: AppMessages; locale: Locale }) {
  const A = m.wizard.account;
  const { backend, refresh } = useAuth();
  const navigate = useNavigate();
  const [draft, setDraft, clearDraft] = useDraft<Omit<AccountForm, "password">>("masar-draft-account", {
    fullName: "",
    email: "",
    language: locale,
    terms: false,
    privacy: false,
    whatsapp: true,
  });
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkEmail, setCheckEmail] = useState<string | null>(null);

  const clearError = (k: string) =>
    setErrors((e) => {
      if (!e[k]) return e;
      const next = { ...e };
      delete next[k];
      return next;
    });
  const set = <K extends keyof typeof draft>(k: K, v: (typeof draft)[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    clearError(k as string);
  };
  const err = (k: string) => (errors[k] ? errorText(m, errors[k]) : null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    const parsed = signUpSchema.safeParse({ ...draft, password });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setBusy(true);
    const consents: { kind: ConsentKind; granted: boolean }[] = [
      { kind: "terms", granted: true },
      { kind: "privacy", granted: true },
      { kind: "whatsapp", granted: draft.whatsapp },
    ];
    try {
      const r = await backend.signUp({
        email: parsed.data.email,
        password,
        fullName: parsed.data.fullName,
        locale: draft.language,
      });
      clearDraft();
      if (r.needsEmailConfirmation) {
        try {
          localStorage.setItem(PENDING_CONSENTS, JSON.stringify(consents));
        } catch {
          /* recorded at next sign-up attempt */
        }
        setCheckEmail(parsed.data.email);
        return;
      }
      await backend.recordConsents(consents);
      await refresh();
      if (draft.language !== locale) navigate(href(draft.language, "/signup"), { replace: true });
    } catch (err) {
      setSubmitError(errorText(m, err));
    } finally {
      setBusy(false);
    }
  }

  if (checkEmail) {
    return (
      <div className="py-6 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-900/40">
          <IconCheck width={28} height={28} />
        </span>
        <h1 className="mt-5 text-2xl font-bold">{A.checkEmailTitle}</h1>
        <p className="mx-auto mt-3 max-w-md text-muted">{t(A.checkEmailText, { email: checkEmail })}</p>
        <ButtonLink href={href(locale, "/login")} className="mt-7">
          {m.common.signIn}
        </ButtonLink>
      </div>
    );
  }

  return (
    <>
      <StepHeader title={A.title} subtitle={A.subtitle} />
      {backend.mode === "local" ? (
        <Alert tone="info" className="mb-6">
          {m.common.demoStore}
        </Alert>
      ) : null}
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <Field label={A.fullName} hint={A.fullNameHint} error={err("fullName")}>
          {(p) => (
            <Input {...p} invalid={p.invalid} autoComplete="name" value={draft.fullName} onChange={(e) => set("fullName", e.target.value)} />
          )}
        </Field>
        <Field label={A.email} error={err("email")}>
          {(p) => (
            <Input
              {...p}
              invalid={p.invalid}
              type="email"
              inputMode="email"
              autoComplete="email"
              dir="ltr"
              className="rtl:text-right"
              value={draft.email}
              onChange={(e) => set("email", e.target.value)}
            />
          )}
        </Field>
        <Field label={A.password} hint={A.passwordHint} error={err("password")}>
          {(p) => (
            <PasswordInput
              {...p}
              invalid={p.invalid}
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clearError("password");
              }}
              showLabel={m.auth.show}
              hideLabel={m.auth.hide}
            />
          )}
        </Field>
        <Choice<Locale>
          name="language"
          legend={A.language}
          value={draft.language}
          onChange={(v) => set("language", v)}
          options={[
            { value: "ar", label: <span lang="ar">{A.languages.ar}</span> },
            { value: "en", label: <span lang="en">{A.languages.en}</span> },
          ]}
        />

        <fieldset className="space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--page-subtle)] p-4 sm:p-5">
          <legend className="px-1 text-sm font-semibold">{A.consentTitle}</legend>
          <Checkbox checked={draft.terms} onChange={(v) => set("terms", v)} error={err("terms")}>
            {A.termsBefore}{" "}
            <Link href={href(locale, "/terms")} target="_blank" className="font-medium text-brand-600 underline underline-offset-4 dark:text-brand-300">
              {A.terms}
            </Link>
          </Checkbox>
          <Checkbox checked={draft.privacy} onChange={(v) => set("privacy", v)} error={err("privacy")}>
            {A.privacyBefore}{" "}
            <Link href={href(locale, "/privacy")} target="_blank" className="font-medium text-brand-600 underline underline-offset-4 dark:text-brand-300">
              {A.privacy}
            </Link>{" "}
            {A.privacyAfter}
          </Checkbox>
          <Checkbox checked={draft.whatsapp} onChange={(v) => set("whatsapp", v)} hint={A.whatsappHint}>
            {A.whatsapp}
          </Checkbox>
        </fieldset>

        {submitError ? <Alert tone="error">{submitError}</Alert> : null}

        <SubmitButton busy={busy} busyText={A.creating} className="w-full">
          {A.create}
        </SubmitButton>
        <p className="text-center text-sm text-muted">
          {m.auth.haveAccount}{" "}
          <Link href={href(locale, "/login")} className="font-medium text-brand-600 underline underline-offset-4 dark:text-brand-300">
            {m.common.signIn}
          </Link>
        </p>
      </form>
    </>
  );
}

/* ---- Step 1b: mobile ----------------------------------------------------- */

function StepPhone({
  m,
  locale,
  phone,
  verified,
  onDone,
}: {
  m: AppMessages;
  locale: Locale;
  phone: string | null;
  verified: boolean;
  onDone: () => void;
}) {
  const P = m.wizard.phone;
  return (
    <>
      <StepHeader title={P.title} subtitle={P.subtitle} icon={<IconPhone width={24} height={24} />} />
      {verified ? (
        <div className="space-y-5">
          <Alert tone="success" title={P.verified}>
            <bdi dir="ltr">{formatSaudiMobile(phone)}</bdi>
          </Alert>
          <button
            type="button"
            onClick={onDone}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-brand-500 px-6 py-3 text-base font-semibold text-white hover:bg-brand-600 sm:w-auto"
          >
            {m.common.continue}
          </button>
        </div>
      ) : (
        <PhoneVerify m={m} locale={locale} initialPhone={phone} onVerified={onDone} />
      )}
      <p className="mt-8 border-t border-[var(--line)] pt-4 text-xs text-muted">{m.wizard.savedNote}</p>
    </>
  );
}

/* ---- Step 2: home -------------------------------------------------------- */

function StepHome({ m, locale, onDone, back }: { m: AppMessages; locale: Locale; onDone: () => void; back: ReactNode }) {
  const H = m.wizard.location;
  const { backend } = useAuth();
  const [existing, setExisting] = useState<Address | null | undefined>(undefined);

  useEffect(() => {
    backend
      .listAddresses()
      .then((list) => setExisting(list.find((a) => a.isDefault) ?? list[0] ?? null))
      .catch(() => setExisting(null));
  }, [backend]);

  return (
    <>
      <StepHeader title={H.title} subtitle={H.subtitle} icon={<IconHome width={24} height={24} />} />
      {existing === undefined ? (
        <Skeleton className="h-96" />
      ) : (
        <LocationEditor
          locale={locale}
          m={m}
          initial={existing}
          onSaved={onDone}
          submitLabel={m.common.continue}
          secondaryAction={back}
        />
      )}
    </>
  );
}

/* ---- Step 3: children ---------------------------------------------------- */

function StepChildren({
  m,
  locale,
  onDone,
  back,
}: {
  m: AppMessages;
  locale: Locale;
  onDone: () => Promise<void>;
  back: ReactNode;
}) {
  const K = m.wizard.children;
  const { backend } = useAuth();
  const [children, setChildren] = useState<Child[] | null>(null);
  const [editing, setEditing] = useState<Child | "new" | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    backend
      .listChildren()
      .then((c) => {
        setChildren(c);
        if (!c.length) setEditing("new");
      })
      .catch(() => setChildren([]));
  }, [backend]);

  async function finish() {
    setBusy(true);
    try {
      await onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <StepHeader title={K.title} subtitle={K.subtitle} icon={<IconUsers width={24} height={24} />} />

      {children === null ? (
        <Skeleton className="h-40" />
      ) : (
        <div className="space-y-6">
          {children.length ? (
            <ul className="space-y-3">
              {children.map((c) => (
                <li key={c.id}>
                  <ChildRow child={c} m={m} locale={locale} onEdit={() => setEditing(c)} />
                </li>
              ))}
            </ul>
          ) : null}

          {editing ? (
            <div className="rounded-2xl border border-brand-200 bg-brand-50/40 p-4 sm:p-6 dark:border-brand-800 dark:bg-brand-900/10">
              <h2 className="mb-5 text-lg font-semibold">
                {editing === "new" ? m.child.addTitle : t(m.child.editTitle, { name: editing.fullName })}
              </h2>
              <ChildForm
                m={m}
                locale={locale}
                initial={editing === "new" ? null : editing}
                draftKey={editing === "new" ? "masar-draft-child" : undefined}
                onSaved={(saved) => {
                  setChildren((list) => {
                    const l = list ?? [];
                    return l.some((x) => x.id === saved.id) ? l.map((x) => (x.id === saved.id ? saved : x)) : [...l, saved];
                  });
                  setEditing(null);
                }}
                secondaryAction={
                  children.length ? (
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      className="min-h-11 rounded-full px-4 text-sm font-medium text-muted hover:text-[var(--ink)]"
                    >
                      {m.common.cancel}
                    </button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditing("new")}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-300 text-base font-semibold text-brand-700 transition-colors hover:border-brand-500 hover:bg-brand-50 dark:border-brand-700 dark:text-brand-200 dark:hover:bg-brand-900/30"
            >
              <IconPlus />
              {children.length ? K.addAnother : K.addFirst}
            </button>
          )}

          <div className="flex flex-col-reverse gap-3 border-t border-[var(--line)] pt-5 sm:flex-row sm:items-center sm:justify-between">
            {back ?? <span />}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {!children.length ? <p className="text-xs text-muted sm:me-2">{K.later}</p> : null}
              <button
                type="button"
                onClick={finish}
                disabled={busy}
                className={cn(
                  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 py-3 text-base font-semibold transition-all disabled:opacity-60",
                  children.length
                    ? "bg-brand-500 text-white hover:bg-brand-600"
                    : "border border-[var(--line)] hover:border-brand-400",
                )}
              >
                {children.length ? K.continue : m.common.skip}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function ChildRow({
  child,
  m,
  locale,
  onEdit,
  actions,
}: {
  child: Child;
  m: AppMessages;
  locale: Locale;
  onEdit?: () => void;
  actions?: ReactNode;
}) {
  const age = ageFrom(child.dateOfBirth);
  const grade = child.grade ? (m.child.grades as Record<string, string>)[child.grade] : null;
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4">
      <span
        aria-hidden
        className={cn(
          "flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-bold",
          child.gender === "girl"
            ? "bg-accent-100 text-accent-700 dark:bg-accent-700/25 dark:text-accent-200"
            : "bg-brand-100 text-brand-700 dark:bg-brand-900/50 dark:text-brand-200",
        )}
      >
        {child.fullName.trim().charAt(0)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{child.fullName}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted">
          <span>{child.gender === "girl" ? m.child.girl : m.child.boy}</span>
          {age !== null ? <span>· {t(age > 10 ? m.child.yearsMany : m.child.years, { n: num(age, locale) })}</span> : null}
          {grade ? <span>· {grade}</span> : null}
        </p>
        {child.schoolName ? (
          <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-muted">
            <IconSchool width={15} height={15} className="shrink-0 text-brand-500" />
            <span className="truncate">{child.schoolName}</span>
          </p>
        ) : null}
      </div>
      {actions ??
        (onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            aria-label={t(m.child.editTitle, { name: child.fullName })}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-[var(--page-subtle)] hover:text-[var(--ink)]"
          >
            <IconEdit />
          </button>
        ) : null)}
    </div>
  );
}

/* ---- Step 4: done -------------------------------------------------------- */

function StepDone({
  m,
  locale,
  name,
  phone,
  celebrate,
}: {
  m: AppMessages;
  locale: Locale;
  name: string;
  phone: string | null;
  celebrate: boolean;
}) {
  const D = m.wizard.done;
  const { backend } = useAuth();
  const [home, setHome] = useState<Address | null>(null);
  const [kids, setKids] = useState<Child[]>([]);
  useEffect(() => {
    backend.listAddresses().then((l) => setHome(l.find((a) => a.isDefault) ?? null)).catch(() => {});
    backend.listChildren().then(setKids).catch(() => {});
  }, [backend]);

  return (
    <div className="text-center">
      <span
        className={cn(
          "mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-500 text-white shadow-[0_12px_28px_-10px_rgba(0,151,103,0.9)]",
          celebrate && "animate-fade-up",
        )}
      >
        <IconCheck width={32} height={32} strokeWidth={2.4} />
      </span>
      <h1 className="mt-6 text-2xl font-bold tracking-tight sm:text-3xl">{t(D.title, { name: name.split(" ")[0] })}</h1>
      <p className="mt-2 text-muted">{D.subtitle}</p>

      <dl className="mx-auto mt-8 grid max-w-md gap-3 text-start">
        <SummaryRow icon={<IconPhone width={18} height={18} />} label={D.phone}>
          <bdi dir="ltr">{formatSaudiMobile(phone)}</bdi>
        </SummaryRow>
        <SummaryRow icon={<IconHome width={18} height={18} />} label={D.home}>
          {home ? [home.district, home.city].filter(Boolean).join(locale === "ar" ? "، " : ", ") || m.location.pinSet : D.none}
        </SummaryRow>
        <SummaryRow icon={<IconUsers width={18} height={18} />} label={D.children}>
          {kids.length ? kids.map((k) => k.fullName.split(" ")[0]).join(locale === "ar" ? "، " : ", ") : D.none}
        </SummaryRow>
      </dl>

      <div className="mx-auto mt-8 flex max-w-md flex-col gap-3">
        <ButtonLink href={href(locale, "/account")} size="lg">
          {D.findRide}
        </ButtonLink>
        <p className="text-xs leading-relaxed text-muted">{D.searchSoon}</p>
      </div>
    </div>
  );
}

function SummaryRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--page-subtle)] px-4 py-3">
      <span className="text-brand-500">{icon}</span>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="ms-auto truncate text-sm font-medium">{children}</dd>
    </div>
  );
}
