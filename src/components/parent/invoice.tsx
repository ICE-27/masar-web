"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { Alert, Skeleton } from "@/components/form";
import { IconChevron, IconDownload } from "@/components/icons";
import { Logo } from "@/components/logo";
import { ErrorNote, useLoad } from "@/components/ops/bits";
import type { Invoice } from "@/lib/data";
import { formatDate } from "@/lib/domain/dates";
import { formatSar, pct } from "@/lib/domain/money";
import { errorText, num, t } from "@/lib/format";
import { href, type Locale } from "@/lib/i18n";
import type { AppMessages } from "@/lib/messages/app.en";
import { useQueryParam, useNavigate } from "@/lib/nav";
import { formatSaudiMobile } from "@/lib/validation";

/** A Saudi-style tax invoice (or credit note), ready to print or save as PDF. */
export function InvoicePage({ locale, m }: { locale: Locale; m: AppMessages }) {
  const I = m.ops.inv;
  const { backend, status } = useAuth();
  const navigate = useNavigate();
  const id = useQueryParam("id");
  useEffect(() => {
    if (status === "signed-out") navigate(`${href(locale, "/login")}?next=${encodeURIComponent(`${href(locale, "/invoice")}?id=${id ?? ""}`)}`, { replace: true });
  }, [status, navigate, locale, id]);
  const inv = useLoad<Invoice | null>(() => (status === "signed-in" && id ? backend.invoice(id) : Promise.resolve(null)), [backend, status, id]);

  if (inv.error) return <div className="container-page max-w-3xl py-10"><ErrorNote m={m} error={inv.error} /></div>;
  if (id === null || (id && status === "signed-in" && !inv.loading && !inv.data)) return <div className="container-page max-w-3xl py-10"><Alert tone="info">{errorText(m, "not_found")}</Alert></div>;
  if (!inv.data) return <div className="container-page max-w-3xl py-10"><Skeleton className="h-[32rem]" /></div>;
  const d = inv.data;
  const b = d.booking;
  const credit = d.kind === "credit_note";
  const sar = (h: number) => formatSar(h, locale, { compact: false });
  const driverName = d.driver ? (locale === "ar" ? d.driver.nameAr || d.driver.nameEn : d.driver.nameEn || d.driver.nameAr) : "";
  const issued = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory-nu-arab" : "en-GB", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(d.issuedAt));

  return (
    <div className="bg-[var(--page-subtle)] py-6 print:bg-white print:py-0 sm:py-10">
      <div className="container-page max-w-3xl">
        <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={() => history.back()} className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-muted hover:text-[var(--ink)]">
            <IconChevron width={16} height={16} className="rotate-180 rtl:rotate-0" /> {m.common.back}
          </button>
          <button type="button" onClick={() => window.print()} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-brand-500 px-5 text-sm font-semibold text-white hover:bg-brand-600">
            <IconDownload width={18} height={18} /> {m.ops.common.print}
          </button>
        </div>

        <article className="print-sheet rounded-2xl border border-[var(--line)] bg-white p-6 text-slate-900 shadow-[var(--shadow-soft)] sm:p-10">
          <header className="flex flex-wrap items-start justify-between gap-6 border-b border-slate-200 pb-6">
            <div>
              <Logo locale={locale} />
              <p className="mt-3 max-w-xs text-xs text-slate-500">{I.sellerName}</p>
            </div>
            <div className="text-end">
              <h1 className="text-2xl font-bold">{credit ? I.creditTitle : I.title}</h1>
              <p className="text-sm text-slate-500">{credit ? "Credit note · إشعار دائن" : "Tax invoice · فاتورة ضريبية"}</p>
            </div>
          </header>

          <dl className="grid gap-x-8 gap-y-3 border-b border-slate-200 py-6 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">{I.number}</dt>
              <dd className="font-semibold"><bdi dir="ltr">{d.number}</bdi></dd>
            </div>
            <div>
              <dt className="text-slate-500">{I.date}</dt>
              <dd className="font-semibold">{issued}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{I.seller}</dt>
              <dd>Masar | مسار</dd>
              <dd className="text-slate-500">{I.vatNo}: {d.vatNumber ? <bdi dir="ltr">{d.vatNumber}</bdi> : I.vatPending}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{I.buyer}</dt>
              <dd>{d.parent?.name}</dd>
              <dd className="text-slate-500"><bdi dir="ltr">{d.parent?.email}</bdi>{d.parent?.phone ? <> · <bdi dir="ltr">{formatSaudiMobile(d.parent.phone)}</bdi></> : null}</dd>
            </div>
            {b ? (
              <>
                <div>
                  <dt className="text-slate-500">{I.booking}</dt>
                  <dd><bdi dir="ltr">{b.code}</bdi></dd>
                </div>
                <div>
                  <dt className="text-slate-500">{I.period}</dt>
                  <dd>{formatDate(b.firstDate, locale)} – {formatDate(b.lastDate, locale)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">{I.driver}</dt>
                  <dd>{driverName}</dd>
                </div>
              </>
            ) : null}
            {credit && d.original ? (
              <div className="sm:col-span-2">
                <dd className="text-slate-600">{t(I.refundOf, { days: num(d.days ?? 0, locale), number: d.original.number })}</dd>
              </div>
            ) : null}
          </dl>

          <table className="mt-6 w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 text-start font-medium">{I.description}</th>
                <th className="py-2 text-end font-medium">{I.amount}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-100">
                <td className="py-3 pe-4">
                  <p className="font-medium">{I.driverPrice}</p>
                  {b ? (
                    <p className="text-slate-500">
                      {t(I.service, { name: b.serviceName, type: m.ops.common.serviceTypes[b.serviceType], days: num(credit ? (d.days ?? 0) : b.bookedDays, locale), legs: m.ops.common.legsShort[b.legs] })}
                      {!credit && b.discountPct ? ` · ${t(I.discountIncl, { pct: num(b.discountPct, locale) })}` : ""}
                      {b.children?.length ? ` · ${b.children.join(locale === "ar" ? "، " : ", ")}` : ""}
                    </p>
                  ) : null}
                </td>
                <td className="py-3 text-end tabular-nums"><bdi>{sar(d.driverH)}</bdi></td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="py-3">{t(I.vat, { pct: pct(d.vatBp, locale) })}</td>
                <td className="py-3 text-end tabular-nums"><bdi>{sar(d.vatH)}</bdi></td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="py-3">{t(I.fee, { pct: pct(d.feeBp, locale) })}</td>
                <td className="py-3 text-end tabular-nums"><bdi>{sar(d.feeH)}</bdi></td>
              </tr>
              <tr>
                <td className="pt-4 text-base font-bold">{I.total}</td>
                <td className="pt-4 text-end text-base font-bold tabular-nums"><bdi>{credit ? "− " : ""}{sar(d.totalH)}</bdi></td>
              </tr>
            </tbody>
          </table>
          {d.method ? <p className="mt-4 text-sm text-slate-500">{t(I.paidBy, { method: (m.ops.pay.methods as Record<string, string>)[d.method] ?? (d.method === "card" ? m.ops.wallet.card : d.method) })}</p> : null}
          <p className="mt-8 border-t border-slate-200 pt-4 text-center text-xs text-slate-500">{I.demo}</p>
        </article>
      </div>
    </div>
  );
}
