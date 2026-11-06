"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth-provider";
import { Alert, Field, Input, SubmitButton } from "@/components/form";
import { IconChat, IconCheck } from "@/components/icons";
import { DataError } from "@/lib/data";
import { errorText, num, t } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { AppMessages } from "@/lib/messages/app.en";
import { formatSaudiMobile, normalizeSaudiMobile, toAsciiDigits } from "@/lib/validation";

/**
 * Mobile verification. Ask for a code, then enter it. While demo mode is on,
 * the code appears on screen as if it were a text message.
 */
export function PhoneVerify({
  m,
  locale,
  initialPhone,
  onVerified,
}: {
  m: AppMessages;
  locale: Locale;
  initialPhone?: string | null;
  onVerified: (phone: string) => void;
}) {
  const P = m.wizard.phone;
  const { backend, refresh } = useAuth();
  const [phone, setPhone] = useState(formatSaudiMobile(initialPhone));
  const [stage, setStage] = useState<"enter" | "code">("enter");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  async function send(target: string) {
    setError(null);
    setBusy(true);
    try {
      const r = await backend.requestPhoneOtp(target);
      setSentTo(target);
      setDemoCode(r.demoCode);
      setCooldown(r.cooldownSeconds);
      setCode("");
      setStage("code");
      setTimeout(() => codeRef.current?.focus(), 50);
    } catch (e) {
      if (e instanceof DataError && e.code === "otp_cooldown") setCooldown(Number(e.detail) || 30);
      setError(errorText(m, e));
    } finally {
      setBusy(false);
    }
  }

  async function onSend(e: FormEvent) {
    e.preventDefault();
    const n = normalizeSaudiMobile(phone);
    if (!n) {
      setError(errorText(m, "phoneInvalid"));
      return;
    }
    await send(n);
  }

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    const c = toAsciiDigits(code).replace(/\D/g, "");
    if (c.length !== 6) {
      setError(errorText(m, "codeInvalid"));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const r = await backend.verifyPhoneOtp(c);
      if (!r.ok) {
        setError(t(P.attemptsLeft, { n: num(r.attemptsLeft ?? 0, locale) }));
        return;
      }
      await refresh();
      onVerified(sentTo!);
    } catch (e) {
      setError(errorText(m, e));
    } finally {
      setBusy(false);
    }
  }

  if (stage === "enter") {
    return (
      <form onSubmit={onSend} noValidate className="space-y-4">
        <Field label={P.label} hint={P.hint} error={error}>
          {(p) => (
            <Input
              {...p}
              invalid={p.invalid}
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              dir="ltr"
              placeholder="05X XXX XXXX"
              className="text-lg tracking-wide rtl:text-right"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          )}
        </Field>
        <SubmitButton busy={busy} busyText={P.sending} className="w-full sm:w-auto">
          {P.send}
        </SubmitButton>
      </form>
    );
  }

  return (
    <div className="space-y-5">
      {demoCode ? (
        <div
          role="status"
          className="animate-fade-up overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-[var(--shadow-soft)]"
        >
          <div className="flex items-center gap-2 border-b border-[var(--line)] bg-[var(--page-subtle)] px-4 py-2 text-xs font-semibold text-muted">
            <IconChat width={16} height={16} className="text-brand-500" />
            {P.demoTitle}
            <span className="ms-auto rounded-full bg-accent-400 px-2 py-0.5 text-[0.65rem] font-bold uppercase text-brand-950">
              {locale === "ar" ? "تجريبي" : "Demo"}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <p className="text-sm">
              {P.demoText}{" "}
              <strong dir="ltr" className="font-mono text-lg tracking-[0.2em] text-brand-600 dark:text-brand-300">
                {demoCode}
              </strong>
            </p>
            <button
              type="button"
              onClick={() => setCode(demoCode)}
              className="min-h-10 rounded-full bg-brand-50 px-4 text-sm font-medium text-brand-700 hover:bg-brand-100 dark:bg-brand-900/40 dark:text-brand-200"
            >
              {P.useCode}
            </button>
          </div>
          <p className="px-4 pb-3 text-xs text-muted">{P.demoNote}</p>
        </div>
      ) : null}

      <form onSubmit={onVerify} noValidate className="space-y-4">
        <p className="text-sm text-muted">
          {P.sentTo.split("{phone}")[0]}
          <bdi dir="ltr" className="font-medium text-[var(--ink)]">
            {formatSaudiMobile(sentTo)}
          </bdi>
          {P.sentTo.split("{phone}")[1]}{" "}
          <button
            type="button"
            onClick={() => {
              setStage("enter");
              setError(null);
            }}
            className="font-medium text-brand-600 underline underline-offset-4 dark:text-brand-300"
          >
            {P.changeNumber}
          </button>
        </p>
        <Field label={P.codeLabel} error={error}>
          {(p) => (
            <Input
              {...p}
              ref={codeRef}
              invalid={p.invalid}
              inputMode="numeric"
              autoComplete="one-time-code"
              dir="ltr"
              maxLength={6}
              placeholder="••••••"
              className="max-w-56 text-center font-mono text-2xl tracking-[0.5em]"
              value={code}
              onChange={(e) => setCode(toAsciiDigits(e.target.value).replace(/\D/g, "").slice(0, 6))}
            />
          )}
        </Field>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SubmitButton busy={busy} busyText={P.verifying} className="w-full sm:w-auto">
            <IconCheck width={18} height={18} />
            {P.verify}
          </SubmitButton>
          <button
            type="button"
            disabled={cooldown > 0 || busy}
            onClick={() => sentTo && send(sentTo)}
            className="min-h-11 rounded-full px-4 text-sm font-medium text-brand-600 hover:bg-brand-50 disabled:text-muted disabled:hover:bg-transparent dark:text-brand-300 dark:hover:bg-brand-900/30"
          >
            {cooldown > 0 ? t(P.resendIn, { s: num(cooldown, locale) }) : P.resend}
          </button>
        </div>
      </form>
    </div>
  );
}

export function VerifiedBadge({ text }: { text: string }) {
  return (
    <Alert tone="success">
      <span className="font-medium">{text}</span>
    </Alert>
  );
}
