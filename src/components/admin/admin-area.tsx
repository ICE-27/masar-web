"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { Alert, Field, Input, Select, SubmitButton, Textarea } from "@/components/form";
import { IconBus, IconCalendar, IconCar, IconChart, IconCheck, IconChevron, IconDownload, IconMoney, IconSettings, IconUsers, IconX } from "@/components/icons";
import { AreaShell, type AreaNavItem } from "@/components/ops/area-shell";
import { EmptyState, ErrorNote, KeyRow, LoadingBlocks, PageTitle, Panel, PlatePreview, Sar, Stat, StatusBadge, Switch, Tabs, useLoad } from "@/components/ops/bits";
import { cn } from "@/components/ui";
import type { AdminOverview, DocKind, DriverApplication, DriverDoc, PayoutRun, QueueItem, SettingsMap } from "@/lib/data";
import { formatDate } from "@/lib/domain/dates";
import { formatSar } from "@/lib/domain/money";
import { errorText, num, t } from "@/lib/format";
import { href, type Locale } from "@/lib/i18n";
import type { AppMessages } from "@/lib/messages/app.en";
import { useQueryParam, useNavigate } from "@/lib/nav";
import { formatSaudiMobile } from "@/lib/validation";
import { docLabel } from "@/components/driver/labels";

export type AdminSection = "overview" | "drivers" | "bookings" | "payouts" | "settings";

export function AdminArea({ locale, m, section }: { locale: Locale; m: AppMessages; section: AdminSection }) {
  const N = m.ops.admin.nav;
  const items: AreaNavItem[] = [
    { key: "overview", path: "/admin", label: N.overview, icon: (p) => <IconChart {...p} /> },
    { key: "drivers", path: "/admin/drivers", label: N.drivers, icon: (p) => <IconUsers {...p} /> },
    { key: "bookings", path: "/admin/bookings", label: N.bookings, icon: (p) => <IconCalendar {...p} /> },
    { key: "payouts", path: "/admin/payouts", label: N.payouts, icon: (p) => <IconMoney {...p} /> },
    { key: "settings", path: "/admin/settings", label: N.settings, icon: (p) => <IconSettings {...p} /> },
  ];
  return (
    <AreaShell locale={locale} m={m} items={items} active={section} roles={["admin"]} label={m.ops.admin.title} here={items.find((i) => i.key === section)!.path} wide>
      {section === "overview" ? <Overview m={m} locale={locale} /> : null}
      {section === "drivers" ? <Drivers m={m} locale={locale} /> : null}
      {section === "bookings" ? <Bookings m={m} locale={locale} /> : null}
      {section === "payouts" ? <Payouts m={m} locale={locale} /> : null}
      {section === "settings" ? <Settings m={m} locale={locale} /> : null}
    </AreaShell>
  );
}

function Overview({ m, locale }: { m: AppMessages; locale: Locale }) {
  const A = m.ops.admin;
  const { backend } = useAuth();
  const o = useLoad<AdminOverview>(() => backend.adminOverview(), [backend]);
  if (o.error) return <ErrorNote m={m} error={o.error} />;
  if (!o.data) return <LoadingBlocks />;
  const d = o.data;
  const max = Math.max(1, ...d.byMonth.map((x) => x.gmvH));
  return (
    <>
      <PageTitle title={A.title} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={A.gmv} value={<Sar h={d.gmvH} locale={locale} />} />
        <Stat label={A.commission} value={<Sar h={d.commissionH} locale={locale} />} tone="brand" />
        <Stat label={A.vat} value={<Sar h={d.vatH} locale={locale} />} />
        <Stat label={A.refunds} value={<Sar h={d.refundsH} locale={locale} />} />
        <Stat label={A.driverOwed} value={<Sar h={d.driverOwedH} locale={locale} />} />
        <Stat label={A.paidOut} value={<Sar h={d.paidOutH} locale={locale} />} />
        <Stat label={A.wallets} value={<Sar h={d.walletsH} locale={locale} />} />
        <Stat label={A.failed} value={num(d.failedPayments, locale)} />
      </div>
      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <Panel title={A.byMonth} className="lg:col-span-2">
          {d.byMonth.length ? (
            <ul className="space-y-3">
              {d.byMonth.map((x) => (
                <li key={x.month}>
                  <div className="flex justify-between text-sm">
                    <span>{x.month}</span>
                    <span className="text-muted"><Sar h={x.gmvH} locale={locale} /> · {A.commission}: <Sar h={x.feeH} locale={locale} /></span>
                  </div>
                  <div className="mt-1 h-3 overflow-hidden rounded-full bg-[var(--page-subtle)]">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${(x.gmvH / max) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">{m.ops.wallet.none}</p>
          )}
        </Panel>
        <div className="space-y-5">
          <Panel title={A.driversByStatus}>
            <dl className="divide-y divide-[var(--line)]">
              {Object.entries(d.drivers).map(([k, v]) => (
                <KeyRow key={k} label={(m.ops.common.driverStatus as Record<string, string>)[k] ?? k}>{num(v ?? 0, locale)}</KeyRow>
              ))}
            </dl>
          </Panel>
          <Panel title={A.bookingsByStatus}>
            <dl className="divide-y divide-[var(--line)]">
              {Object.entries(d.bookings).map(([k, v]) => (
                <KeyRow key={k} label={(m.ops.common.bookingStatus as Record<string, string>)[k] ?? k}>{num(v ?? 0, locale)}</KeyRow>
              ))}
              <KeyRow label={A.parents}>{num(d.parents, locale)}</KeyRow>
              <KeyRow label={A.liveServices}>{num(d.services, locale)}</KeyRow>
            </dl>
          </Panel>
        </div>
      </div>
    </>
  );
}

/* ---- Drivers -------------------------------------------------------------- */

function Drivers({ m, locale }: { m: AppMessages; locale: Locale }) {
  const A = m.ops.admin;
  const { backend } = useAuth();
  const navigate = useNavigate();
  const [id, setId] = useState<string | null>(null);
  const qId = useQueryParam("id");
  useEffect(() => {
    if (qId) setId(qId);
  }, [qId]);
  const q = useLoad<QueueItem[]>(() => backend.adminDriverQueue(), [backend]);
  const [filter, setFilter] = useState<"todo" | "all">("todo");
  if (id) {
    return (
      <DriverReview
        m={m}
        locale={locale}
        id={id}
        onBack={() => {
          setId(null);
          navigate(href(locale, "/admin/drivers"), { replace: true });
          void q.reload();
        }}
      />
    );
  }
  const rows = (q.data ?? []).filter((r) => filter === "all" || ["submitted", "under_review", "action_needed"].includes(r.status));
  return (
    <>
      <PageTitle title={A.queue} />
      <Tabs label={A.queue} value={filter} onChange={setFilter} items={[{ value: "todo", label: A.queue, count: (q.data ?? []).filter((r) => ["submitted", "under_review"].includes(r.status)).length }, { value: "all", label: m.ops.common.all }]} />
      <ErrorNote m={m} error={q.error} className="mb-4" />
      {q.loading && !q.data ? (
        <LoadingBlocks />
      ) : !rows.length ? (
        <EmptyState text={A.queueEmpty} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--card)]">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="border-b border-[var(--line)] text-start text-xs text-muted">
              <tr>
                <th className="px-4 py-3 text-start font-medium">{A.applicant}</th>
                <th className="px-4 py-3 text-start font-medium">{m.ops.search.vehicle}</th>
                <th className="px-4 py-3 text-start font-medium">{A.documents}</th>
                <th className="px-4 py-3 text-start font-medium">{m.ops.common.from}</th>
                <th className="px-4 py-3 text-end font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{locale === "ar" ? r.nameAr || r.nameEn : r.nameEn || r.nameAr}</p>
                    <p className="text-xs text-muted">{r.gender ? m.ops.common.genders[r.gender] : ""} · {r.city}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5">{r.vehicleType === "bus" ? <IconBus width={16} height={16} /> : <IconCar width={16} height={16} />} {r.vehicle}</span>
                  </td>
                  <td className="px-4 py-3">
                    {t(A.docs, { a: num(r.docsApproved, locale), t: num(r.docsTotal, locale) })}
                    {r.docsRejected ? <span className="ms-1 text-red-600">· {num(r.docsRejected, locale)} ✕</span> : null}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} label={m.ops.common.driverStatus[r.status]} />
                    <p className="mt-1 text-xs text-muted">{r.submittedAt ? formatDate(r.submittedAt.slice(0, 10), locale) : ""}</p>
                  </td>
                  <td className="px-4 py-3 text-end">
                    <button type="button" onClick={() => setId(r.id)} className="min-h-10 rounded-full border border-[var(--line)] px-4 font-medium hover:border-brand-400">
                      {m.ops.common.view}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function DriverReview({ m, locale, id, onBack }: { m: AppMessages; locale: Locale; id: string; onBack: () => void }) {
  const A = m.ops.admin;
  const { backend } = useAuth();
  const app = useLoad<DriverApplication>(() => backend.adminDriver(id), [backend, id]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (app.error) return <ErrorNote m={m} error={app.error} />;
  if (!app.data) return <LoadingBlocks />;
  const a = app.data;
  const d = a.driver;
  const v = a.vehicle;
  const docs = new Map(a.documents.map((x) => [x.kind, x]));
  const allApproved = a.requiredDocs.every((k) => docs.get(k)?.status === "approved");

  async function decide(decision: "approve" | "action_needed" | "suspend") {
    setBusy(decision);
    setError(null);
    try {
      app.setData(await backend.decideDriver(id, decision, note));
    } catch (e) {
      setError(errorText(m, e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <button type="button" onClick={onBack} className="mb-3 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-muted hover:text-[var(--ink)]">
        <IconChevron width={16} height={16} className="rotate-180 rtl:rotate-0" /> {A.queue}
      </button>
      <PageTitle title={`${d.nameEn ?? ""} · ${d.nameAr ?? ""}`} action={<StatusBadge status={d.status} label={m.ops.common.driverStatus[d.status]} />} />
      <div className="grid gap-5 xl:grid-cols-[22rem_1fr]">
        <div className="space-y-5">
          <Panel title={A.applicant}>
            <dl className="divide-y divide-[var(--line)] text-sm">
              <KeyRow label={m.ops.dw.account.gender}>{d.gender ? m.ops.common.genders[d.gender] : "—"}</KeyRow>
              <KeyRow label={m.ops.dw.account.dob}>{d.dateOfBirth ? formatDate(d.dateOfBirth, locale) : "—"}</KeyRow>
              <KeyRow label={m.ops.dw.account.nationality}>{d.nationality ?? "—"}</KeyRow>
              <KeyRow label={m.ops.dw.account.city}>{d.city ?? "—"}</KeyRow>
              <KeyRow label={m.ops.dw.identity.idNumber}><bdi dir="ltr">{d.idNumber}</bdi></KeyRow>
              <KeyRow label={m.ops.dw.identity.idExpiry}>{d.idExpiry ? formatDate(d.idExpiry, locale) : "—"}</KeyRow>
              <KeyRow label={m.ops.dw.identity.policeIssued}>{d.policeIssued ? formatDate(d.policeIssued, locale) : "—"}</KeyRow>
              <KeyRow label={m.ops.dw.licence.type}>{d.licenceType ? m.ops.dw.licence.types[d.licenceType] : "—"} · <bdi dir="ltr">{d.licenceNumber}</bdi></KeyRow>
              <KeyRow label={m.ops.dw.licence.expiry}>{d.licenceExpiry ? formatDate(d.licenceExpiry, locale) : "—"}</KeyRow>
              <KeyRow label={m.wizard.account.email}><bdi dir="ltr">{d.email}</bdi></KeyRow>
              <KeyRow label={m.account.phoneSection}><bdi dir="ltr">{formatSaudiMobile(d.phone)}</bdi> {d.phoneVerified ? "✓" : ""}</KeyRow>
              <KeyRow label={m.ops.dw.payout.iban}><bdi dir="ltr" className="font-mono text-xs">{d.iban}</bdi></KeyRow>
              <KeyRow label={m.ops.dw.payout.holder}>{d.accountHolder}</KeyRow>
            </dl>
          </Panel>
          {v ? (
            <Panel title={m.ops.dw.steps.vehicle}>
              <p className="flex items-center gap-2 font-medium">{v.type === "bus" ? <IconBus /> : <IconCar />} {[v.make, v.model, v.year, v.color].filter(Boolean).join(" · ")}</p>
              <p className="mt-1 text-sm text-muted">{t(m.ops.common.seats, { n: num(v.seats ?? 0, locale) })}</p>
              {v.plateDigits ? <div className="mt-3"><PlatePreview digits={v.plateDigits} letters={v.plateLetters ?? ""} /></div> : null}
            </Panel>
          ) : null}
          <Panel title={A.decision}>
            <Field label={A.note} optional optionalText={m.common.optional}>
              {(p) => <Textarea {...p} value={note} onChange={(e) => setNote(e.target.value)} />}
            </Field>
            {!allApproved ? <p className="mt-3 text-xs text-muted">{A.allDocsFirst}</p> : null}
            {error ? <Alert tone="error" className="mt-3">{error}</Alert> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" disabled={!allApproved || !!busy} onClick={() => decide("approve")} className="min-h-11 rounded-full bg-brand-500 px-5 text-sm font-semibold text-white disabled:opacity-50">{A.approveDriver}</button>
              <button type="button" disabled={!!busy} onClick={() => decide("action_needed")} className="min-h-11 rounded-full border border-accent-400 px-5 text-sm font-semibold text-accent-700 dark:text-accent-300">{A.actionNeeded}</button>
              <button type="button" disabled={!!busy} onClick={() => decide("suspend")} className="min-h-11 rounded-full px-4 text-sm font-medium text-red-600">{A.suspend}</button>
            </div>
          </Panel>
        </div>
        <div>
          <h2 className="mb-3 font-semibold">{A.documents}</h2>
          <ul className="grid gap-4 md:grid-cols-2">
            {a.requiredDocs.map((k) => (
              <DocReview key={k} m={m} kind={k} doc={docs.get(k)} onChange={(x) => app.setData(x)} />
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}

function DocReview({ m, kind, doc, onChange }: { m: AppMessages; kind: DocKind; doc: DriverDoc | undefined; onChange: (a: DriverApplication) => void }) {
  const A = m.ops.admin;
  const { backend } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  const [reason, setReason] = useState<keyof typeof A.rejectReasons>("blurry");
  const [other, setOther] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    if (doc) backend.fileUrl(doc).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [doc, backend]);
  const pdf = doc?.path.endsWith(".pdf");
  return (
    <li className={cn("overflow-hidden rounded-2xl border bg-[var(--card)]", doc?.status === "approved" ? "border-brand-300 dark:border-brand-800" : doc?.status === "rejected" ? "border-red-300 dark:border-red-900" : "border-[var(--line)]")}>
      <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-2.5">
        <p className="text-sm font-semibold">{docLabel(m, kind)}</p>
        {doc ? <StatusBadge status={doc.status === "approved" ? "approved" : doc.status === "rejected" ? "rejected" : "pending"} label={m.ops.dw.upload[doc.status]} /> : <span className="text-xs text-red-600">{A.missingDoc}</span>}
      </div>
      <div className="flex aspect-[4/3] items-center justify-center bg-[var(--page-subtle)]">
        {doc && url ? (
          pdf ? (
            <a href={url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-brand-600 underline">{A.pdf}</a>
          ) : (
            <a href={url} target="_blank" rel="noreferrer" aria-label={A.openFile} className="h-full w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={docLabel(m, kind)} className="h-full w-full object-contain" />
            </a>
          )
        ) : null}
      </div>
      {doc ? (
        <div className="space-y-2 px-4 py-3">
          {doc.expiry ? <p className="text-xs text-muted">{m.ops.dw.vehicle.expiry}: {doc.expiry}</p> : null}
          {doc.status === "rejected" && doc.rejectReason ? <p className="text-xs text-red-600">{doc.rejectReason}</p> : null}
          {rejecting ? (
            <div className="space-y-2">
              <Select value={reason} onChange={(e) => setReason(e.target.value as keyof typeof A.rejectReasons)} className="min-h-10 py-2 text-sm">
                {(Object.keys(A.rejectReasons) as (keyof typeof A.rejectReasons)[]).map((r) => <option key={r} value={r}>{A.rejectReasons[r]}</option>)}
              </Select>
              <Input value={other} onChange={(e) => setOther(e.target.value)} placeholder={m.ops.common.note} className="min-h-10 py-2 text-sm" />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      onChange(await backend.reviewDocument(doc.id, false, [A.rejectReasons[reason], other.trim()].filter(Boolean).join(" — ")));
                      setRejecting(false);
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="min-h-10 rounded-full bg-red-600 px-4 text-sm font-semibold text-white"
                >
                  {A.rejectDoc}
                </button>
                <button type="button" onClick={() => setRejecting(false)} className="min-h-10 px-3 text-sm text-muted">{m.common.cancel}</button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy || doc.status === "approved"}
                onClick={async () => {
                  setBusy(true);
                  try {
                    onChange(await backend.reviewDocument(doc.id, true, ""));
                  } finally {
                    setBusy(false);
                  }
                }}
                className="inline-flex min-h-10 items-center gap-1 rounded-full bg-brand-500 px-4 text-sm font-semibold text-white disabled:opacity-40"
              >
                <IconCheck width={14} height={14} /> {A.approve}
              </button>
              <button type="button" onClick={() => setRejecting(true)} className="inline-flex min-h-10 items-center gap-1 rounded-full border border-[var(--line)] px-4 text-sm font-medium hover:border-red-300 hover:text-red-600">
                <IconX width={14} height={14} /> {A.rejectDoc}
              </button>
            </div>
          )}
        </div>
      ) : null}
    </li>
  );
}

/* ---- Bookings ------------------------------------------------------------- */

function Bookings({ m, locale }: { m: AppMessages; locale: Locale }) {
  const A = m.ops.admin;
  const { backend } = useAuth();
  const list = useLoad(() => backend.adminBookings(), [backend]);
  return (
    <>
      <PageTitle title={A.bookingsTitle} />
      <ErrorNote m={m} error={list.error} className="mb-4" />
      {!list.data ? (
        <LoadingBlocks />
      ) : !list.data.length ? (
        <EmptyState text={m.ops.bk.empty} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--card)]">
          <table className="w-full min-w-[48rem] text-sm">
            <thead className="border-b border-[var(--line)] text-xs text-muted">
              <tr>
                {[A.cols.code, A.cols.trip, A.cols.driver, A.cols.days, A.cols.total, A.cols.fee, ""].map((h, i) => (
                  <th key={i} className="px-4 py-3 text-start font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {list.data.map((b) => (
                <tr key={b.id}>
                  <td className="px-4 py-3"><bdi dir="ltr" className="font-mono text-xs">{b.code}</bdi><p className="text-xs text-muted">{formatDate(b.createdAt.slice(0, 10), locale)}</p></td>
                  <td className="px-4 py-3"><p className="font-medium">{b.serviceName}</p><p className="text-xs text-muted">{b.parentFirstName} · {b.children.map((c) => c.firstName).join(", ")}</p></td>
                  <td className="px-4 py-3">{b.driver ? (locale === "ar" ? b.driver.firstNameAr : b.driver.firstNameEn) : "—"}</td>
                  <td className="px-4 py-3">{num(b.bookedDays, locale)}</td>
                  <td className="px-4 py-3"><Sar h={b.totalH} locale={locale} /></td>
                  <td className="px-4 py-3"><Sar h={b.feeH ?? 0} locale={locale} /></td>
                  <td className="px-4 py-3"><StatusBadge status={b.status} label={m.ops.common.bookingStatus[b.status]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/* ---- Payouts -------------------------------------------------------------- */

function Payouts({ m, locale }: { m: AppMessages; locale: Locale }) {
  const A = m.ops.admin;
  const { backend } = useAuth();
  const runs = useLoad<PayoutRun[]>(() => backend.payoutRuns(), [backend]);
  const [last, setLast] = useState<PayoutRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function csv(run: PayoutRun) {
    const rows = [["driver", "account_holder", "bank", "iban", "amount_sar", "status"], ...(run.rows ?? []).map((r) => [r.name, r.accountHolder ?? "", r.bankName ?? "", r.iban ?? "", (r.amountH / 100).toFixed(2), r.status])];
    const text = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `masar-payouts-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <>
      <PageTitle title={A.payoutsTitle} subtitle={A.payoutsText} />
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const r = await backend.payoutRun();
              setLast(r);
              await runs.reload();
            } catch (e) {
              setError(errorText(m, e));
            } finally {
              setBusy(false);
            }
          }}
          className="min-h-12 rounded-full bg-brand-500 px-6 font-semibold text-white disabled:opacity-60"
        >
          {busy ? m.common.loading : A.runPayouts}
        </button>
        {last ? (
          <button type="button" onClick={() => csv(last)} className="inline-flex min-h-12 items-center gap-2 rounded-full border border-[var(--line)] px-5 font-medium">
            <IconDownload width={18} height={18} /> {A.downloadCsv}
          </button>
        ) : null}
      </div>
      {error ? <Alert tone="error" className="mt-4">{error}</Alert> : null}
      {last ? (
        <Panel className="mt-5" title={t(A.lastRun, { n: num(last.count, locale), amount: formatSar(last.totalH, locale) })}>
          <ul className="divide-y divide-[var(--line)] text-sm">
            {(last.rows ?? []).map((r) => (
              <li key={r.driverId} className="flex justify-between gap-3 py-2">
                <span>{r.name} · <bdi dir="ltr" className="text-muted">{r.iban?.slice(0, 4)}••••{r.iban?.slice(-4)}</bdi></span>
                <Sar h={r.amountH} locale={locale} className="font-semibold" />
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
      <Panel className="mt-5" title={m.ops.earn.payouts}>
        {(runs.data ?? []).length ? (
          <ul className="divide-y divide-[var(--line)] text-sm">
            {(runs.data ?? []).map((r) => (
              <li key={r.id} className="flex justify-between gap-3 py-2">
                <span>{r.createdAt ? formatDate(r.createdAt.slice(0, 10), locale) : ""} · {num(r.count, locale)}</span>
                <Sar h={r.totalH} locale={locale} className="font-semibold" />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{A.noRuns}</p>
        )}
      </Panel>
    </>
  );
}

/* ---- Settings ------------------------------------------------------------- */

const PCT_KEYS = ["masar_fee_rate", "vat_rate"];
const NUM_KEYS = ["discount_t1_days", "discount_t1_pct", "discount_t2_days", "discount_t2_pct", "request_hold_hours", "payment_hold_hours", "hold_cutoff_hours", "schedule_notice_days", "cancel_notice_days", "max_vehicle_age", "min_driver_age"];

function Settings({ m, locale }: { m: AppMessages; locale: Locale }) {
  const A = m.ops.admin;
  const { backend } = useAuth();
  const s = useLoad<SettingsMap>(() => backend.adminSettings(), [backend]);
  const [f, setF] = useState<Record<string, string | boolean>>({});
  const [holidays, setHolidays] = useState<{ from: string; to: string; name?: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  useEffect(() => {
    if (!s.data) return;
    const d = s.data;
    const x: Record<string, string | boolean> = {};
    for (const k of PCT_KEYS) x[k] = String(Math.round(Number(d[k] ?? 0) * 10000) / 100);
    for (const k of NUM_KEYS) x[k] = String(d[k] ?? "");
    x.wallet_demo_h = String(Number(d.wallet_demo_h ?? 0) / 100);
    x.vat_number = d.vat_number ? String(d.vat_number) : "";
    x.vat_on_fee = d.vat_on_fee === true;
    x.demo_mode = d.demo_mode === true;
    setF(x);
    setHolidays(Array.isArray(d.holidays) ? (d.holidays as { from: string; to: string; name?: string }[]) : []);
  }, [s.data]);
  if (s.error) return <ErrorNote m={m} error={s.error} />;
  if (!s.data) return <LoadingBlocks />;
  const label = (k: string) => (A.settings as Record<string, string>)[k] ?? k;
  return (
    <>
      <PageTitle title={A.settingsTitle} />
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMsg(null);
          try {
            const out: SettingsMap = {};
            for (const k of PCT_KEYS) out[k] = Number(f[k]) / 100;
            for (const k of NUM_KEYS) out[k] = Number(f[k]);
            out.wallet_demo_h = Math.round(Number(f.wallet_demo_h) * 100);
            out.vat_number = f.vat_number ? String(f.vat_number) : null;
            out.vat_on_fee = !!f.vat_on_fee;
            out.demo_mode = !!f.demo_mode;
            out.holidays = holidays.filter((h) => h.from && h.to);
            await backend.saveSettings(out);
            setMsg({ tone: "success", text: A.settingsSaved });
          } catch (err) {
            setMsg({ tone: "error", text: errorText(m, err) });
          } finally {
            setBusy(false);
          }
        }}
        className="space-y-5"
      >
        <Panel>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PCT_KEYS.map((k) => (
              <Field key={k} label={`${label(k)} (${A.percent})`}>{(p) => <Input {...p} type="number" step="0.01" dir="ltr" value={String(f[k] ?? "")} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} />}</Field>
            ))}
            {NUM_KEYS.map((k) => (
              <Field key={k} label={label(k)}>{(p) => <Input {...p} type="number" dir="ltr" value={String(f[k] ?? "")} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} />}</Field>
            ))}
            <Field label={label("wallet_demo_h")}>{(p) => <Input {...p} type="number" dir="ltr" value={String(f.wallet_demo_h ?? "")} onChange={(e) => setF((x) => ({ ...x, wallet_demo_h: e.target.value }))} />}</Field>
            <Field label={label("vat_number")}>{(p) => <Input {...p} dir="ltr" value={String(f.vat_number ?? "")} onChange={(e) => setF((x) => ({ ...x, vat_number: e.target.value }))} />}</Field>
          </div>
          <div className="mt-4 grid gap-x-8 sm:grid-cols-2">
            {(["vat_on_fee", "demo_mode"] as const).map((k) => (
              <div key={k} className="flex items-center justify-between gap-3 py-2">
                <span className="text-sm font-medium">{label(k)}</span>
                <Switch checked={!!f[k]} label={label(k)} onChange={(v) => setF((x) => ({ ...x, [k]: v }))} />
              </div>
            ))}
          </div>
        </Panel>
        <Panel title={label("holidays")}>
          <ul className="space-y-2">
            {holidays.map((h, i) => (
              <li key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_2fr_auto]">
                <Input type="date" aria-label={A.holidayFrom} value={h.from} onChange={(e) => setHolidays((x) => x.map((y, j) => (j === i ? { ...y, from: e.target.value } : y)))} />
                <Input type="date" aria-label={A.holidayTo} value={h.to} onChange={(e) => setHolidays((x) => x.map((y, j) => (j === i ? { ...y, to: e.target.value } : y)))} />
                <Input aria-label={A.holidayName} placeholder={A.holidayName} value={h.name ?? ""} onChange={(e) => setHolidays((x) => x.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} />
                <button type="button" aria-label={m.common.delete} onClick={() => setHolidays((x) => x.filter((_, j) => j !== i))} className="inline-flex h-12 w-12 items-center justify-center rounded-full text-muted hover:text-red-600"><IconX /></button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setHolidays((x) => [...x, { from: "", to: "", name: "" }])} className="mt-3 min-h-10 text-sm font-medium text-brand-600 dark:text-brand-300">+ {A.addHoliday}</button>
        </Panel>
        {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
        <SubmitButton busy={busy} busyText={m.common.saving}>{m.common.save}</SubmitButton>
      </form>
      <p className="mt-4 text-xs text-muted">{locale === "ar" ? "تُطبق النسب الجديدة على الحجوزات الجديدة فقط؛ تحتفظ كل فاتورة بالنسب التي صدرت بها." : "New rates apply to new bookings only; every booking keeps the rates it was made with."}</p>
    </>
  );
}
