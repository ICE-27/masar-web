"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth-provider";
import { Alert, Field, Input, PasswordInput, SubmitButton } from "@/components/form";
import { AppLink as Link } from "@/components/link";
import { Logo } from "@/components/logo";
import { errorText } from "@/lib/format";
import { href, type Locale } from "@/lib/i18n";
import type { AppMessages } from "@/lib/messages/app.en";
import { getQueryParam, safeNext, useNavigate } from "@/lib/nav";
import { fieldErrors, loginSchema } from "@/lib/validation";

export function LoginForm({ locale, m }: { locale: Locale; m: AppMessages }) {
  const A = m.auth;
  const { backend, status, profile, refresh } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already signed in: go straight on
  useEffect(() => {
    if (status !== "signed-in" || !profile) return;
    const next = getQueryParam("next");
    if (profile.role === "driver") {
      navigate(safeNext(next && next.includes("/driver") ? next : null, href(locale, "/driver")), { replace: true });
      return;
    }
    if (profile.role === "admin") {
      navigate(safeNext(next, href(locale, "/admin")), { replace: true });
      return;
    }
    const fallback = profile.onboardingCompletedAt ? href(locale, "/account") : href(locale, "/signup");
    navigate(profile.onboardingCompletedAt ? safeNext(next, fallback) : fallback, { replace: true });
  }, [status, profile, locale, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await backend.signIn(parsed.data.email, password);
      await refresh();
    } catch (err) {
      setSubmitError(errorText(m, err));
      setBusy(false);
    }
  }

  const err = (k: string) => (errors[k] ? errorText(m, errors[k]) : null);

  return (
    <div className="mesh-hero min-h-[calc(100dvh-4rem)] py-10 sm:py-16">
      <div className="container-page max-w-md">
        <div className="rounded-3xl border border-[var(--line)] bg-[var(--card)] p-6 shadow-[var(--shadow-soft)] sm:p-8">
          <div className="mb-6 flex justify-center">
            <Logo locale={locale} />
          </div>
          <h1 className="text-center text-2xl font-bold tracking-tight">{A.loginTitle}</h1>
          <p className="mt-2 text-center text-sm text-muted">{A.loginSubtitle}</p>

          {backend.mode === "local" ? (
            <Alert tone="info" className="mt-6">
              {m.common.demoStore}
            </Alert>
          ) : null}

          <form onSubmit={onSubmit} noValidate className="mt-6 space-y-5">
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
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              )}
            </Field>
            <Field label={A.password} error={err("password")}>
              {(p) => (
                <PasswordInput
                  {...p}
                  invalid={p.invalid}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  showLabel={A.show}
                  hideLabel={A.hide}
                />
              )}
            </Field>
            {submitError ? <Alert tone="error">{submitError}</Alert> : null}
            <SubmitButton busy={busy} busyText={A.loggingIn} className="w-full">
              {A.loginCta}
            </SubmitButton>
          </form>

          <div className="mt-6 border-t border-[var(--line)] pt-5 text-center text-sm">
            <span className="text-muted">{A.noAccount}</span>{" "}
            <Link href={href(locale, "/signup")} className="font-semibold text-brand-600 underline underline-offset-4 dark:text-brand-300">
              {A.createAccount}
            </Link>
          </div>
        </div>
        <p className="mt-5 text-center text-xs text-muted">
          <Link href={href(locale, "/driver/join")} className="underline underline-offset-4 hover:text-[var(--ink)]">
            {A.driverNote}
          </Link>
        </p>
      </div>
    </div>
  );
}
