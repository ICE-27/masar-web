"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth-provider";
import { Alert, Checkbox, Dialog, Field, Input, Skeleton } from "@/components/form";
import { IconCard, IconCheck, IconLock, IconSpinner, IconWallet } from "@/components/icons";
import { Countdown, ErrorNote, Sar, idempotencyKey, useLoad } from "@/components/ops/bits";
import { PriceTable } from "@/components/ops/price-table";
import { ButtonLink, cn } from "@/components/ui";
import type { Booking, PayMethod, PayResult, Wallet } from "@/lib/data";
import { DEMO_CARDS, cardBrand, digitsOnly, expiryInFuture, formatCardNumber, formatExpiry, luhnValid, parseExpiry, type CardBrand } from "@/lib/domain/cards";
import { formatDate } from "@/lib/domain/dates";
import { formatSar } from "@/lib/domain/money";
import { errorText, num, t } from "@/lib/format";
import { href, type Locale } from "@/lib/i18n";
import type { AppMessages } from "@/lib/messages/app.en";
import { useQueryParam, useNavigate } from "@/lib/nav";
import { formatSaudiMobile } from "@/lib/validation";

const SAVED_CARD = "masar-saved-card";
type Saved = { number: string; brand: CardBrand; exp: string; name: string };
type Stage = "form" | "processing" | "otp" | "applepay" | "stcpay" | "done" | "failed";

function readSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(SAVED_CARD);
    const s = raw ? (JSON.parse(raw) as Saved) : null;
    // Only the published demo cards are ever kept
    return s && DEMO_CARDS.some((c) => digitsOnly(c.number) === digitsOnly(s.number)) ? s : null;
  } catch {
    return null;
  }
}

export function Checkout({ locale, m }: { locale: Locale; m: AppMessages }) {
  const P = m.ops.pay;
  const { backend, status, profile } = useAuth();
  const navigate = useNavigate();
  const bookingId = useQueryParam("booking");
  const here = `${href(locale, "/checkout")}?booking=${bookingId ?? ""}`;
  useEffect(() => {
    if (status === "signed-out") navigate(`${href(locale, "/login")}?next=${encodeURIComponent(here)}`, { replace: true });
  }, [status, locale, navigate, here]);

  const ready = status === "signed-in";
  const bk = useLoad<Booking | null>(() => (ready && bookingId ? backend.getBooking(bookingId) : Promise.resolve(null)), [backend, ready, bookingId]);
  const wallet = useLoad<Wallet | null>(() => (ready ? backend.wallet().catch(() => null) : Promise.resolve(null)), [backend, ready]);

  const [method, setMethod] = useState<PayMethod>("mada");
  const [number, setNumber] = useState("");
  const [exp, setExp] = useState("");
  const [cvc, setCvc] = useState("");
  const [name, setName] = useState("");
  const [save, setSave] = useState(false);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [useSaved, setUseSaved] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [stage, setStage] = useState<Stage>("form");
  const [otp, setOtp] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpErr, setOtpErr] = useState<string | null>(null);
  const [result, setResult] = useState<PayResult | null>(null);
  const [failCode, setFailCode] = useState<string | null>(null);
  const [stcPhone, setStcPhone] = useState("");
  const [stcSent, setStcSent] = useState(false);
  const key = useRef<string | null>(null);

  useEffect(() => {
    const s = readSaved();
    if (s) {
      setSaved(s);
      setUseSaved(true);
    }
  }, []);
  useEffect(() => {
    if (profile?.phone) setStcPhone(formatSaudiMobile(profile.phone));
    if (profile?.fullName && !name) setName(profile.fullName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  if (!ready || bk.loading) return <Frame m={m}><Skeleton className="h-96" /></Frame>;
  if (bk.error) return <Frame m={m}><ErrorNote m={m} error={bk.error} /></Frame>;
  const b = bk.data;
  if (!b) return <Frame m={m}><Alert tone="error">{errorText(m, "not_found")}</Alert></Frame>;

  const total = b.price.totalH;
  const driver = b.driver ? (locale === "ar" ? b.driver.firstNameAr || b.driver.firstNameEn : b.driver.firstNameEn || b.driver.firstNameAr) : "";
  const cardMethod = method === "card" || method === "mada";
  const brand = useSaved && saved ? saved.brand : cardBrand(number);

  if (stage === "done" && result) {
    return (
      <Frame m={m}>
        <div className="py-8 text-center">
          <span className="mx-auto flex h-20 w-20 animate-[pop_400ms_ease-out] items-center justify-center rounded-full bg-brand-500 text-white shadow-[0_12px_30px_-10px_rgba(0,151,103,0.9)]">
            <IconCheck width={40} height={40} />
          </span>
          <h1 className="mt-6 text-2xl font-bold">{P.successTitle}</h1>
          <p className="mx-auto mt-2 max-w-md text-muted">{t(P.successText, { code: b.code, driver })}</p>
          <p className="mt-4 text-3xl font-bold"><Sar h={total} locale={locale} /></p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <ButtonLink href={`${href(locale, "/account/booking")}?id=${b.id}`}>{P.viewBooking}</ButtonLink>
            {result.invoiceId ? (
              <ButtonLink href={`${href(locale, "/invoice")}?id=${result.invoiceId}`} variant="secondary">
                {P.receipt}
              </ButtonLink>
            ) : null}
          </div>
        </div>
      </Frame>
    );
  }

  if (b.status !== "accepted") {
    return (
      <Frame m={m}>
        <Alert tone={b.status === "confirmed" ? "success" : "warning"}>{b.status === "confirmed" ? P.alreadyPaid : t(P.notPayable, { status: m.ops.common.bookingStatus[b.status] })}</Alert>
        <ButtonLink href={`${href(locale, "/account/booking")}?id=${b.id}`} className="mt-4">{P.viewBooking}</ButtonLink>
      </Frame>
    );
  }

  function validate(): boolean {
    if (!cardMethod) return true;
    const e: Record<string, string> = {};
    if (!(useSaved && saved)) {
      if (!luhnValid(number)) e.number = P.numberInvalid;
      const ex = parseExpiry(exp);
      if (!ex || !expiryInFuture(ex)) e.exp = P.expiryInvalid;
      if (name.trim().length < 2) e.name = P.nameRequired;
    }
    if (!/^\d{3}$/.test(digitsOnly(cvc))) e.cvc = P.cvcInvalid;
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function charge(m_: PayMethod) {
    if (!b) return;
    setStage("processing");
    const num_ = useSaved && saved ? saved.number : number;
    const ex = parseExpiry(useSaved && saved ? saved.exp : exp);
    // A slow bank: the timeout test card waits longer before failing
    const slow = digitsOnly(num_) === "4000000000000119";
    await new Promise((r) => setTimeout(r, slow ? 4500 : 1800));
    let r: PayResult | null = null;
    for (let attempt = 0; attempt < 2 && !r; attempt++) {
      try {
        r = await backend.payBooking({
          bookingId: b.id,
          method: m_,
          idempotencyKey: key.current!,
          card: m_ === "card" || m_ === "mada" ? { number: digitsOnly(num_), expMonth: ex?.month ?? 0, expYear: ex?.year ?? 0, cvc: digitsOnly(cvc) } : undefined,
        });
      } catch (e) {
        // A network blip: retry once with the same key, so it can never charge twice
        if (attempt === 1 || !(e && typeof e === "object" && "code" in e && (e as { code: string }).code === "network")) {
          setFailCode(e && typeof e === "object" && "code" in e ? (e as { code: string }).code : "fallback");
          setStage("failed");
          return;
        }
      }
    }
    if (!r) return;
    if (r.status === "succeeded") {
      if (save && (m_ === "card" || m_ === "mada") && !useSaved) {
        try {
          localStorage.setItem(SAVED_CARD, JSON.stringify({ number: digitsOnly(num_), brand: cardBrand(num_), exp: formatExpiry(exp), name }));
        } catch {
          /* not saved */
        }
      }
      setResult(r);
      setStage("done");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      setFailCode(r.code ?? "fallback");
      setStage("failed");
    }
  }

  function onPay(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    key.current = idempotencyKey();
    setFailCode(null);
    if (method === "applepay") return setStage("applepay");
    if (method === "stcpay") {
      setStcSent(false);
      setOtp("");
      return setStage("stcpay");
    }
    if (cardMethod) {
      // 3-D Secure: a one-time code from the card's bank
      setOtpCode(String(Math.floor(1000 + Math.random() * 9000)));
      setOtp("");
      setOtpErr(null);
      return setStage("otp");
    }
    void charge(method);
  }

  const methods: { k: PayMethod; label: string }[] = [
    { k: "mada", label: P.methods.mada },
    { k: "card", label: P.methods.card },
    { k: "applepay", label: P.methods.applepay },
    { k: "stcpay", label: P.methods.stcpay },
    { k: "wallet", label: P.methods.wallet },
  ];
  const walletShort = method === "wallet" && wallet.data && wallet.data.balanceH < total;

  return (
    <Frame m={m}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{P.title}</h1>
        <span className="inline-flex items-center gap-1.5 text-sm text-muted"><IconLock width={16} height={16} /> {P.secure}</span>
      </div>
      <Alert tone="warning" className="mb-6">{P.ribbon}</Alert>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <form onSubmit={onPay} noValidate className="space-y-5">
          <fieldset>
            <legend className="mb-3 font-semibold">{P.method}</legend>
            <div role="radiogroup" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {methods.map((x) => (
                <button
                  key={x.k}
                  type="button"
                  role="radio"
                  aria-checked={method === x.k}
                  onClick={() => {
                    setMethod(x.k);
                    setErrors({});
                  }}
                  className={cn("flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl border-2 px-2 text-xs font-semibold", method === x.k ? "border-brand-500 bg-brand-50 dark:bg-brand-900/30" : "border-[var(--line)] hover:border-brand-300")}
                >
                  <MethodLogo k={x.k} />
                  {x.label}
                </button>
              ))}
            </div>
          </fieldset>

          {cardMethod ? (
            <div className="space-y-4 rounded-2xl border border-[var(--line)] p-4 sm:p-5">
              {saved ? (
                <div className="flex flex-wrap gap-2">
                  <button type="button" aria-pressed={useSaved} onClick={() => setUseSaved(true)} className={cn("min-h-10 rounded-full border px-4 text-sm", useSaved ? "border-brand-500 bg-brand-500 text-white" : "border-[var(--line)]")}>
                    {t(P.savedCard, { brand: saved.brand.toUpperCase(), last4: saved.number.slice(-4) })}
                  </button>
                  <button type="button" aria-pressed={!useSaved} onClick={() => setUseSaved(false)} className={cn("min-h-10 rounded-full border px-4 text-sm", !useSaved ? "border-brand-500 bg-brand-500 text-white" : "border-[var(--line)]")}>
                    {P.useOther}
                  </button>
                </div>
              ) : null}
              {!(useSaved && saved) ? (
                <>
                  <Field label={P.cardNumber} error={errors.number}>
                    {(p) => (
                      <div className="relative">
                        <Input {...p} invalid={p.invalid} inputMode="numeric" autoComplete="cc-number" dir="ltr" className="pe-20 font-mono tracking-wider rtl:text-right" placeholder="0000 0000 0000 0000" value={number} onChange={(e) => setNumber(formatCardNumber(e.target.value))} />
                        <span className="absolute end-3 top-1/2 -translate-y-1/2 rounded-md bg-[var(--page-subtle)] px-2 py-1 text-[0.65rem] font-bold uppercase text-muted">{brand}</span>
                      </div>
                    )}
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={P.expiry} error={errors.exp}>
                      {(p) => <Input {...p} invalid={p.invalid} inputMode="numeric" autoComplete="cc-exp" dir="ltr" placeholder="MM/YY" value={exp} onChange={(e) => setExp(formatExpiry(e.target.value))} />}
                    </Field>
                    <Field label={P.cvc} error={errors.cvc}>
                      {(p) => <Input {...p} invalid={p.invalid} inputMode="numeric" autoComplete="cc-csc" dir="ltr" maxLength={3} placeholder="123" value={cvc} onChange={(e) => setCvc(digitsOnly(e.target.value).slice(0, 3))} />}
                    </Field>
                  </div>
                  <Field label={P.name} error={errors.name}>
                    {(p) => <Input {...p} invalid={p.invalid} autoComplete="cc-name" dir="ltr" className="uppercase rtl:text-right" value={name} onChange={(e) => setName(e.target.value)} />}
                  </Field>
                  <Checkbox checked={save} onChange={setSave}>{P.saveCard}</Checkbox>
                </>
              ) : (
                <Field label={P.cvc} error={errors.cvc} className="max-w-40">
                  {(p) => <Input {...p} invalid={p.invalid} inputMode="numeric" dir="ltr" maxLength={3} value={cvc} onChange={(e) => setCvc(digitsOnly(e.target.value).slice(0, 3))} />}
                </Field>
              )}
            </div>
          ) : null}

          {method === "wallet" ? (
            <div className="rounded-2xl border border-[var(--line)] p-4 sm:p-5">
              <p className="flex items-center gap-2 font-semibold"><IconWallet width={20} height={20} className="text-brand-500" /> {t(P.walletBalance, { amount: formatSar(wallet.data?.balanceH ?? 0, locale) })}</p>
              {walletShort ? <Alert tone="warning" className="mt-3">{t(P.walletShort, { amount: formatSar(wallet.data!.balanceH, locale), total: formatSar(total, locale) })}</Alert> : null}
            </div>
          ) : null}

          {stage === "failed" ? (
            <Alert tone="error" title={P.failTitle}>
              <p>{(P.errors as Record<string, string>)[failCode ?? ""] ?? errorText(m, failCode ?? "unknown")}</p>
              <button type="button" onClick={() => { setStage("form"); setMethod(method === "mada" ? "card" : "mada"); }} className="mt-2 font-semibold underline underline-offset-4">
                {P.tryAnother}
              </button>
            </Alert>
          ) : null}

          <button type="submit" disabled={stage === "processing" || !!walletShort} className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-brand-500 px-6 text-lg font-semibold text-white shadow-[0_8px_20px_-10px_rgba(0,151,103,0.9)] hover:bg-brand-600 disabled:opacity-60">
            {stage === "processing" ? <IconSpinner /> : <IconLock width={18} height={18} />}
            {stage === "processing" ? P.processing : t(P.payAmount, { amount: formatSar(total, locale, { compact: false }) })}
          </button>

          {cardMethod ? (
            <section className="rounded-2xl border border-dashed border-accent-300 bg-accent-50/60 p-4 dark:border-accent-700/50 dark:bg-accent-700/10">
              <h2 className="text-sm font-semibold">{P.demoTitle}</h2>
              <p className="mt-0.5 text-xs text-muted">{P.demoText}</p>
              <ul className="mt-3 space-y-1.5">
                {DEMO_CARDS.map((c) => (
                  <li key={c.number} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2">
                      <IconCard width={16} height={16} className="text-muted" />
                      <bdi dir="ltr" className="font-mono">{c.number}</bdi>
                      <span className={cn("rounded-full px-2 py-0.5 text-[0.65rem] font-bold", c.outcome === "success" ? "bg-brand-100 text-brand-800 dark:bg-brand-900/50 dark:text-brand-200" : "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-200")}>{P.outcomes[c.outcome]}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setUseSaved(false);
                        setMethod(c.brand === "mada" ? "mada" : "card");
                        setNumber(c.number);
                        setExp("12/30");
                        setCvc("123");
                        if (!name) setName("Demo Parent");
                        setErrors({});
                      }}
                      className="min-h-9 rounded-full border border-[var(--line)] bg-[var(--card)] px-3 text-xs font-medium hover:border-brand-400"
                    >
                      {P.use}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </form>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4">
            <h2 className="font-semibold">{P.summary}</h2>
            <p className="mt-2 text-sm font-medium">{b.service?.name}</p>
            <p className="text-sm text-muted">
              <bdi dir="ltr">{b.code}</bdi> · {driver} · {b.children.map((c) => c.firstName).join(locale === "ar" ? "، " : ", ")}
            </p>
            <p className="text-sm text-muted">
              {formatDate(b.firstDate, locale, "short")} – {formatDate(b.lastDate, locale, "short")} · {num(b.bookedDays, locale)} {m.ops.common.days}
            </p>
            <p className="mt-3 rounded-xl bg-accent-50 px-3 py-2 text-sm font-medium text-accent-700 dark:bg-accent-700/20 dark:text-accent-200">
              <Countdown iso={b.paymentDueAt} m={m} locale={locale} template={P.deadline} />
            </p>
          </section>
          <PriceTable
            m={m}
            locale={locale}
            serviceType={b.serviceType}
            districtName={b.district ? (locale === "ar" ? b.district.nameAr : b.district.nameEn) : null}
            baseRateH={b.price.rateH - b.price.surchargeH}
            surchargeH={b.price.surchargeH}
            rateH={b.price.rateH}
            units={b.price.units}
            childrenCount={b.price.childrenCount}
            days={b.bookedDays}
            attendantFeeH={b.price.attendantFeeH}
            price={b.price}
          />
        </aside>
      </div>

      {/* 3-D Secure */}
      <Dialog open={stage === "otp"} onClose={() => setStage("form")} title={P.otpTitle} closeLabel={m.common.close}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (otp !== otpCode) {
              setOtpErr(P.otpWrong);
              return;
            }
            void charge(method);
          }}
          className="space-y-4"
        >
          <p className="text-sm text-muted">{t(P.otpText, { phone: formatSaudiMobile(profile?.phone) || "05X XXX XXXX" })}</p>
          <p className="rounded-xl bg-accent-50 px-3 py-2 text-sm font-semibold text-accent-700 dark:bg-accent-700/20 dark:text-accent-200">{t(P.otpDemo, { code: otpCode })}</p>
          <Field label={P.otpLabel} error={otpErr}>
            {(p) => <Input {...p} invalid={p.invalid} inputMode="numeric" autoComplete="one-time-code" dir="ltr" maxLength={4} className="text-center font-mono text-2xl tracking-[0.5em]" value={otp} onChange={(e) => { setOtp(digitsOnly(e.target.value).slice(0, 4)); setOtpErr(null); }} autoFocus />}
          </Field>
          <button type="submit" className="min-h-12 w-full rounded-full bg-brand-500 font-semibold text-white">{P.verify}</button>
        </form>
      </Dialog>

      {/* Apple Pay sheet */}
      <Dialog open={stage === "applepay"} onClose={() => setStage("form")} title={P.applePayTitle} closeLabel={m.common.close}>
        <div className="space-y-4 text-center">
          <p className="text-3xl font-bold"><Sar h={total} locale={locale} /></p>
          <p className="text-sm text-muted">{t(P.applePayText, { amount: formatSar(total, locale) })}</p>
          <button type="button" onClick={() => void charge("applepay")} className="min-h-12 w-full rounded-full bg-black font-semibold text-white dark:bg-white dark:text-black">
             {P.applePayConfirm}
          </button>
        </div>
      </Dialog>

      {/* STC Pay */}
      <Dialog open={stage === "stcpay"} onClose={() => setStage("form")} title={P.stcTitle} closeLabel={m.common.close}>
        <div className="space-y-4">
          <Field label={P.stcPhone}>{(p) => <Input {...p} dir="ltr" inputMode="tel" value={stcPhone} onChange={(e) => setStcPhone(e.target.value)} />}</Field>
          {!stcSent ? (
            <button
              type="button"
              onClick={() => {
                setOtpCode(String(Math.floor(1000 + Math.random() * 9000)));
                setStcSent(true);
              }}
              className="min-h-12 w-full rounded-full bg-[#4f008c] font-semibold text-white"
            >
              {P.stcSend}
            </button>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (otp !== otpCode) {
                  setOtpErr(P.otpWrong);
                  return;
                }
                void charge("stcpay");
              }}
              className="space-y-4"
            >
              <p className="rounded-xl bg-accent-50 px-3 py-2 text-sm font-semibold text-accent-700 dark:bg-accent-700/20 dark:text-accent-200">{t(P.otpDemo, { code: otpCode })}</p>
              <Field label={P.otpLabel} error={otpErr}>
                {(p) => <Input {...p} invalid={p.invalid} inputMode="numeric" dir="ltr" maxLength={4} className="text-center font-mono text-2xl tracking-[0.5em]" value={otp} onChange={(e) => { setOtp(digitsOnly(e.target.value).slice(0, 4)); setOtpErr(null); }} />}
              </Field>
              <button type="submit" className="min-h-12 w-full rounded-full bg-[#4f008c] font-semibold text-white">{P.verify}</button>
            </form>
          )}
        </div>
      </Dialog>
    </Frame>
  );
}

function Frame({ m, children }: { m: AppMessages; children: React.ReactNode }) {
  return (
    <div className="mesh-hero min-h-[calc(100dvh-4rem)] pb-16">
      <div className="container-page max-w-5xl pt-6 sm:pt-10">
        <div className="rounded-3xl border border-[var(--line)] bg-[var(--card)] p-5 shadow-[var(--shadow-soft)] sm:p-8">{children}</div>
        <p className="mt-4 text-center text-xs text-muted">{m.ops.pay.ribbon}</p>
      </div>
    </div>
  );
}

function MethodLogo({ k }: { k: PayMethod }) {
  if (k === "mada")
    return (
      <span className="flex h-6 items-center gap-0.5" aria-hidden>
        <span className="h-1.5 w-5 rounded-full bg-[#84b740]" />
        <span className="h-1.5 w-5 rounded-full bg-[#259bd6]" />
      </span>
    );
  if (k === "card") return <span className="flex h-6 items-center text-[0.7rem] font-black italic text-[#1a1f71] dark:text-sky-300" aria-hidden>VISA<span className="ms-1 inline-flex"><span className="h-3.5 w-3.5 rounded-full bg-[#eb001b]" /><span className="-ms-1.5 h-3.5 w-3.5 rounded-full bg-[#f79e1b] opacity-90" /></span></span>;
  if (k === "applepay") return <span className="flex h-6 items-center text-sm font-semibold" aria-hidden> Pay</span>;
  if (k === "stcpay") return <span className="flex h-6 items-center text-xs font-black text-[#4f008c] dark:text-purple-300" aria-hidden>stc pay</span>;
  return <IconWallet width={22} height={22} className="text-brand-500" />;
}
