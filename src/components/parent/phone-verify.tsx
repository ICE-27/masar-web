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

  const [whatsappSent, setWhatsappSent] = useState(false);

  async function send(target: string) {
    setError(null);
    setBusy(true);
    try {
      const r = await backend.requestPhoneOtp(target);
      setSentTo(target);
      setDemoCode(r.demoCode);
      setWhatsappSent(r.channel === "whatsapp");
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
      {whatsappSent ? (
        <div
          role="status"
          className="animate-fade-up overflow-hidden rounded-2xl border border-brand-200 bg-brand-50 shadow-[var(--shadow-soft)] dark:border-brand-800 dark:bg-brand-950/50"
        >
          <div className="flex items-center gap-2 px-4 py-3">
            <svg viewBox="0 0 24 24" width={20} height={20} fill="#25D366" aria-hidden>
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a7.96 7.96 0 0 1-4.11-1.14l-.29-.174-3.01.79.81-2.95-.19-.3A7.96 7.96 0 0 1 4 12c0-4.41 3.59-8 8-8s8 3.59 8 8-3.59 8-8 8z"/>
            </svg>
            <p className="text-sm font-medium text-brand-800 dark:text-brand-200">
              {locale === "ar"
                ? "تم إرسال رمز التحقق عبر واتساب"
                : "Verification code sent via WhatsApp"}
            </p>
          </div>
        </div>
      ) : null}

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
