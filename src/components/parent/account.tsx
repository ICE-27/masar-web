"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/components/auth-provider";
import { Alert, Choice, Dialog, Field, Input, Skeleton, SubmitButton } from "@/components/form";
import {
  IconChevron,
  IconDownload,
  IconEdit,
  IconHome,
  IconLogout,
  IconMap,
  IconPhone,
  IconPin,
  IconPlus,
  IconSearch,
  IconShield,
  IconTrash,
  IconUser,
  IconUsers,
} from "@/components/icons";
import { AppLink as Link } from "@/components/link";
import { LocationEditor } from "@/components/map/location-editor";
import { ButtonLink, cn } from "@/components/ui";
import type { Address, Child, Consent, Profile } from "@/lib/data";
import { errorText, num, t } from "@/lib/format";
import { href, type Locale } from "@/lib/i18n";
import type { AppMessages } from "@/lib/messages/app.en";
import { useNavigate } from "@/lib/nav";
import { formatSaudiMobile } from "@/lib/validation";
import { ChildForm } from "./child-form";
import { PhoneVerify } from "./phone-verify";
import { ChildRow } from "./wizard";

export type Section = "overview" | "children" | "addresses" | "profile";

const NAV: { key: Section; path: string; icon: (p: { width: number; height: number }) => ReactNode }[] = [
  { key: "overview", path: "/account", icon: (p) => <IconHome {...p} /> },
  { key: "children", path: "/account/children", icon: (p) => <IconUsers {...p} /> },
  { key: "addresses", path: "/account/addresses", icon: (p) => <IconMap {...p} /> },
  { key: "profile", path: "/account/profile", icon: (p) => <IconUser {...p} /> },
];

export function AccountArea({ locale, m, section }: { locale: Locale; m: AppMessages; section: Section }) {
  const { status, profile } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (status === "signed-out") {
      const here = href(locale, NAV.find((n) => n.key === section)!.path);
      navigate(`${href(locale, "/login")}?next=${encodeURIComponent(here)}`, { replace: true });
    }
  }, [status, locale, section, navigate]);

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-[var(--page-subtle)] pb-24 lg:pb-12">
      <div className="container-page lg:grid lg:grid-cols-[15rem_1fr] lg:gap-10 lg:pt-10">
        {/* Sidebar (desktop) */}
        <aside className="hidden lg:block">
          <nav aria-label={m.common.myAccount} className="sticky top-24 space-y-1">
            {NAV.map((n) => (
              <Link
                key={n.key}
                href={href(locale, n.path)}
                aria-current={n.key === section ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors",
                  n.key === section
                    ? "bg-[var(--card)] text-brand-700 shadow-[var(--shadow-soft)] dark:text-brand-200"
                    : "text-muted hover:bg-[var(--card)] hover:text-[var(--ink)]",
                )}
              >
                {n.icon({ width: 20, height: 20 })}
                {m.account.nav[n.key]}
              </Link>
            ))}
            <SignOutButton m={m} locale={locale} className="mt-4 w-full border-t border-[var(--line)] pt-4" />
          </nav>
        </aside>

        <div className="min-w-0 pt-6 lg:pt-0">
          {status !== "signed-in" || !profile ? (
            <div className="space-y-4">
              <Skeleton className="h-9 w-1/2" />
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="mt-6 h-40" />
              <Skeleton className="h-40" />
            </div>
          ) : (
            <>
              {!profile.onboardingCompletedAt && section !== "profile" ? (
                <Alert tone="warning" title={m.account.finishTitle} className="mb-6">
                  <p>{t(m.account.finishText, { n: num(profile.onboardingStep, locale) })}</p>
                  <Link href={href(locale, "/signup")} className="mt-2 inline-block font-semibold underline underline-offset-4">
                    {m.account.finishCta}
                  </Link>
                </Alert>
              ) : null}
              {section === "overview" ? <Overview locale={locale} m={m} profile={profile} /> : null}
              {section === "children" ? <ChildrenSection locale={locale} m={m} /> : null}
              {section === "addresses" ? <AddressesSection locale={locale} m={m} /> : null}
              {section === "profile" ? <ProfileSection locale={locale} m={m} profile={profile} /> : null}
            </>
          )}
        </div>
      </div>

      {/* Bottom navigation (phones and tablets) */}
      <nav
        id="account-bottom-nav"
        aria-label={m.common.myAccount}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-[var(--page)]/95 backdrop-blur-md lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="mx-auto grid max-w-lg grid-cols-4">
          {NAV.map((n) => (
            <li key={n.key}>
              <Link
                href={href(locale, n.path)}
                aria-current={n.key === section ? "page" : undefined}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 text-[0.7rem] font-medium",
                  n.key === section ? "text-brand-600 dark:text-brand-300" : "text-muted",
                )}
              >
                {n.icon({ width: 22, height: 22 })}
                {m.account.nav[n.key]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

function PageTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1.5 text-sm text-muted sm:text-base">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5 sm:p-6", className)}>
      {children}
    </section>
  );
}

function useList<T>(load: () => Promise<T[]>) {
  const [items, setItems] = useState<T[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const reload = useCallback(async () => {
    try {
      setItems(await load());
      setError(null);
    } catch (e) {
      setError(e);
      setItems([]);
    }
  }, [load]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { items, error, reload, setItems };
}

function addressTitle(a: Address, m: AppMessages) {
  return a.label === "other" && a.customLabel ? a.customLabel : m.location.labels[a.label];
}

function addressLine(a: Address, locale: Locale) {
  const sep = locale === "ar" ? "، " : ", ";
  return [a.street && a.buildingNo ? `${a.street} ${a.buildingNo}` : a.street, a.district, a.city]
    .filter(Boolean)
    .join(sep);
}

/* ---- Overview ------------------------------------------------------------ */

function Overview({ locale, m, profile }: { locale: Locale; m: AppMessages; profile: Profile }) {
  const A = m.account;
  const { backend } = useAuth();
  const loadKids = useCallback(() => backend.listChildren(), [backend]);
  const loadAddr = useCallback(() => backend.listAddresses(), [backend]);
  const kids = useList<Child>(loadKids);
  const addrs = useList<Address>(loadAddr);
  const home = addrs.items?.find((a) => a.isDefault) ?? null;

  return (
    <>
      <PageTitle title={t(A.hello, { name: (profile.fullName ?? "").split(" ")[0] })} subtitle={A.overviewSubtitle} />

      <div className="grid gap-4 xl:grid-cols-2">
        {/* Find a ride — next milestone */}
        <section className="relative overflow-hidden rounded-2xl bg-brand-600 p-6 text-white xl:col-span-2 dark:bg-brand-800">
          <div aria-hidden className="absolute -end-10 -top-10 h-44 w-44 rounded-full bg-white/10" />
          <div aria-hidden className="absolute -bottom-16 end-24 h-40 w-40 rounded-full bg-accent-400/20" />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div className="max-w-lg">
              <span className="inline-flex rounded-full bg-accent-400 px-2.5 py-0.5 text-xs font-bold text-brand-950">{A.soon}</span>
              <h2 className="mt-3 flex items-center gap-2 text-xl font-bold">
                <IconSearch width={22} height={22} /> {A.findRideTitle}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-white/85">{A.findRideText}</p>
            </div>
          </div>
        </section>

        <Panel>
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-semibold">
              <IconUsers width={20} height={20} className="text-brand-500" /> {A.childrenTitle}
            </h2>
            <Link href={href(locale, "/account/children")} className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-brand-600 dark:text-brand-300">
              {A.viewAll} <IconChevron width={16} height={16} className="rtl:rotate-180" />
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {kids.items === null ? (
              <Skeleton className="h-20" />
            ) : kids.items.length ? (
              kids.items.slice(0, 3).map((c) => <ChildRow key={c.id} child={c} m={m} locale={locale} actions={<span />} />)
            ) : (
              <EmptyState text={A.noChildren} action={<ButtonLink href={href(locale, "/account/children")} size="sm" variant="secondary">{A.addChild}</ButtonLink>} />
            )}
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel>
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-semibold">
                <IconPin width={20} height={20} className="text-brand-500" /> {m.wizard.done.home}
              </h2>
              <Link href={href(locale, "/account/addresses")} className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-brand-600 dark:text-brand-300">
                {A.viewAll} <IconChevron width={16} height={16} className="rtl:rotate-180" />
              </Link>
            </div>
            {addrs.items === null ? (
              <Skeleton className="mt-4 h-14" />
            ) : home ? (
              <div className="mt-3">
                <p className="font-medium">{addressTitle(home, m)}</p>
                <p className="mt-0.5 text-sm text-muted">{addressLine(home, locale) || m.location.pinSet}</p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted">{A.noAddresses}</p>
            )}
          </Panel>
          <Panel>
            <h2 className="flex items-center gap-2 font-semibold">
              <IconPhone width={20} height={20} className="text-brand-500" /> {A.phoneSection}
            </h2>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <bdi dir="ltr" className="text-base font-medium">
                {formatSaudiMobile(profile.phone) || "—"}
              </bdi>
              {profile.phoneVerifiedAt ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
                  <IconShield width={14} height={14} /> {A.phoneVerified}
                </span>
              ) : (
                <Link href={href(locale, "/account/profile")} className="text-sm font-semibold text-accent-700 underline underline-offset-4 dark:text-accent-300">
                  {A.verifyNow}
                </Link>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}

function EmptyState({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--line)] px-4 py-8 text-center">
      <p className="text-sm text-muted">{text}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/* ---- Children ------------------------------------------------------------ */

function ChildrenSection({ locale, m }: { locale: Locale; m: AppMessages }) {
  const A = m.account;
  const { backend } = useAuth();
  const load = useCallback(() => backend.listChildren(), [backend]);
  const { items, setItems, error } = useList<Child>(load);
  const [editing, setEditing] = useState<Child | "new" | null>(null);
  const [deleting, setDeleting] = useState<Child | null>(null);

  return (
    <>
      <PageTitle
        title={A.childrenTitle}
        subtitle={A.childrenSubtitle}
        action={
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-brand-500 px-5 text-sm font-semibold text-white hover:bg-brand-600"
          >
            <IconPlus width={18} height={18} /> {A.addChild}
          </button>
        }
      />
      {error ? <Alert tone="error" className="mb-4">{errorText(m, error)}</Alert> : null}
      {items === null ? (
        <div className="space-y-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : items.length ? (
        <ul className="grid gap-3 xl:grid-cols-2">
          {items.map((c) => (
            <li key={c.id}>
              <ChildRow
                child={c}
                m={m}
                locale={locale}
                actions={
                  <div className="flex shrink-0">
                    <IconButton label={t(m.child.editTitle, { name: c.fullName })} onClick={() => setEditing(c)}>
                      <IconEdit />
                    </IconButton>
                    <IconButton label={t(A.deleteChild, { name: c.fullName })} onClick={() => setDeleting(c)} danger>
                      <IconTrash />
                    </IconButton>
                  </div>
                }
              />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState text={A.noChildren} />
      )}

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" || editing === null ? m.child.addTitle : t(m.child.editTitle, { name: editing.fullName })}
        closeLabel={m.common.close}
        wide
      >
        {editing !== null ? (
          <ChildForm
            m={m}
            locale={locale}
            initial={editing === "new" ? null : editing}
            onSaved={(saved) => {
              setItems((l) => {
                const list = l ?? [];
                return list.some((x) => x.id === saved.id) ? list.map((x) => (x.id === saved.id ? saved : x)) : [...list, saved];
              });
              setEditing(null);
            }}
            secondaryAction={
              <button type="button" onClick={() => setEditing(null)} className="min-h-11 rounded-full px-4 text-sm font-medium text-muted hover:text-[var(--ink)]">
                {m.common.cancel}
              </button>
            }
          />
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        m={m}
        title={deleting ? t(A.deleteChild, { name: deleting.fullName }) : ""}
        text={deleting ? t(A.deleteChildText, { name: deleting.fullName }) : ""}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          await backend.deleteChild(deleting.id);
          setItems((l) => (l ?? []).filter((x) => x.id !== deleting.id));
          setDeleting(null);
        }}
      />
    </>
  );
}

/* ---- Addresses ----------------------------------------------------------- */

function AddressesSection({ locale, m }: { locale: Locale; m: AppMessages }) {
  const A = m.account;
  const { backend } = useAuth();
  const load = useCallback(() => backend.listAddresses(), [backend]);
  const { items, reload, error } = useList<Address>(load);
  const [editing, setEditing] = useState<Address | "new" | null>(null);
  const [deleting, setDeleting] = useState<Address | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  return (
    <>
      <PageTitle
        title={A.addressesTitle}
        subtitle={A.addressesSubtitle}
        action={
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-brand-500 px-5 text-sm font-semibold text-white hover:bg-brand-600"
          >
            <IconPlus width={18} height={18} /> {A.addAddress}
          </button>
        }
      />
      {error ? <Alert tone="error" className="mb-4">{errorText(m, error)}</Alert> : null}
      {items === null ? (
        <Skeleton className="h-28" />
      ) : items.length ? (
        <ul className="grid gap-3 xl:grid-cols-2">
          {items.map((a) => (
            <li key={a.id} className="flex items-start gap-4 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300">
                {a.label === "home" ? <IconHome /> : <IconPin />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {addressTitle(a, m)}
                  {a.isDefault ? (
                    <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[0.7rem] font-semibold text-white">{A.default}</span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-sm text-muted">{addressLine(a, locale) || m.location.pinSet}</p>
                {a.landmark ? <p className="mt-1 text-sm text-muted">“{a.landmark}”</p> : null}
                {!a.isDefault ? (
                  <button
                    type="button"
                    disabled={busyId === a.id}
                    onClick={async () => {
                      setBusyId(a.id);
                      try {
                        await backend.saveAddress({ ...a, isDefault: true });
                        await reload();
                      } finally {
                        setBusyId(null);
                      }
                    }}
                    className="mt-2 min-h-10 text-sm font-medium text-brand-600 underline underline-offset-4 disabled:opacity-50 dark:text-brand-300"
                  >
                    {A.makeDefault}
                  </button>
                ) : null}
              </div>
              <div className="flex shrink-0">
                <IconButton label={A.editAddress} onClick={() => setEditing(a)}>
                  <IconEdit />
                </IconButton>
                <IconButton label={A.deleteAddress} onClick={() => setDeleting(a)} danger>
                  <IconTrash />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState text={A.noAddresses} />
      )}

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? A.addAddress : A.editAddress}
        closeLabel={m.common.close}
        wide
      >
        {editing !== null ? (
          <LocationEditor
            locale={locale}
            m={m}
            layout="stacked"
            initial={editing === "new" ? null : editing}
            showDefaultToggle
            onSaved={async () => {
              setEditing(null);
              await reload();
            }}
          />
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        m={m}
        title={A.deleteAddress}
        text={A.deleteAddressText}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          await backend.deleteAddress(deleting.id);
          setDeleting(null);
          await reload();
        }}
      />
    </>
  );
}

/* ---- Profile ------------------------------------------------------------- */

function ProfileSection({ locale, m, profile }: { locale: Locale; m: AppMessages; profile: Profile }) {
  const A = m.account;
  const { backend, refresh } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(profile.fullName ?? "");
  const [lang, setLang] = useState<Locale>(profile.preferredLocale);
  const [saveState, setSaveState] = useState<"idle" | "busy" | "saved">("idle");
  const [nameError, setNameError] = useState<string | null>(null);
  const [changingPhone, setChangingPhone] = useState(!profile.phoneVerifiedAt);
  const [consents, setConsents] = useState<Consent[] | null>(null);
  const [whatsBusy, setWhatsBusy] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    backend.listConsents().then(setConsents).catch(() => setConsents([]));
  }, [backend]);

  const whatsappOn = consents?.find((c) => c.kind === "whatsapp")?.granted ?? false;

  async function saveDetails(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) {
      setNameError(errorText(m, "nameShort"));
      return;
    }
    setNameError(null);
    setSaveState("busy");
    try {
      await backend.updateProfile({ fullName: name.trim(), preferredLocale: lang });
      await refresh();
      setSaveState("saved");
      if (lang !== locale) navigate(href(lang, "/account/profile"));
    } catch (err) {
      setNameError(errorText(m, err));
      setSaveState("idle");
    }
  }

  async function toggleWhatsapp() {
    setWhatsBusy(true);
    try {
      await backend.recordConsents([{ kind: "whatsapp", granted: !whatsappOn }]);
      setConsents(await backend.listConsents());
    } finally {
      setWhatsBusy(false);
    }
  }

  async function download() {
    const [addresses, children, consentLog] = await Promise.all([
      backend.listAddresses(),
      backend.listChildren(),
      backend.listConsents(),
    ]);
    const data = {
      exportedAt: new Date().toISOString(),
      service: "Masar | مسار (demo)",
      profile,
      addresses,
      children,
      consents: consentLog,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `masar-my-data-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function deleteAccount() {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await backend.deleteAccount();
      navigate(href(locale), { replace: true });
    } catch (err) {
      setDeleteError(errorText(m, err));
      setDeleteBusy(false);
    }
  }

  const fmtDate = (iso: string) =>
    new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Riyadh",
    }).format(new Date(iso));

  return (
    <>
      <PageTitle title={A.profileTitle} subtitle={A.profileSubtitle} />
      <div className="space-y-4">
        <Panel>
          <h2 className="mb-5 font-semibold">{A.details}</h2>
          <form onSubmit={saveDetails} noValidate className="space-y-5">
            <Field label={m.wizard.account.fullName} error={nameError}>
              {(p) => <Input {...p} invalid={p.invalid} value={name} onChange={(e) => { setName(e.target.value); setSaveState("idle"); }} autoComplete="name" />}
            </Field>
            <Field label={A.email}>
              {(p) => <Input {...p} value={profile.email} readOnly disabled dir="ltr" className="rtl:text-right" />}
            </Field>
            <Choice<Locale>
              name="profile-language"
              legend={A.language}
              value={lang}
              onChange={(v) => { setLang(v); setSaveState("idle"); }}
              options={[
                { value: "ar", label: <span lang="ar">العربية</span> },
                { value: "en", label: <span lang="en">English</span> },
              ]}
            />
            <div className="flex items-center gap-3">
              <SubmitButton busy={saveState === "busy"} busyText={m.common.saving}>
                {m.common.save}
              </SubmitButton>
              {saveState === "saved" ? (
                <span role="status" className="text-sm font-medium text-brand-600 dark:text-brand-300">
                  {m.common.saved}
                </span>
              ) : null}
            </div>
          </form>
        </Panel>

        <Panel>
          <h2 className="mb-4 flex items-center gap-2 font-semibold">
            <IconPhone width={20} height={20} className="text-brand-500" /> {A.phoneSection}
          </h2>
          {changingPhone ? (
            <PhoneVerify
              m={m}
              locale={locale}
              initialPhone={profile.phone}
              onVerified={() => setChangingPhone(false)}
            />
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <bdi dir="ltr" className="text-lg font-medium">{formatSaudiMobile(profile.phone)}</bdi>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
                  <IconShield width={14} height={14} /> {A.phoneVerified}
                </span>
              </div>
              <button type="button" onClick={() => setChangingPhone(true)} className="min-h-11 rounded-full border border-[var(--line)] px-4 text-sm font-medium hover:border-brand-400">
                {A.changeNumber}
              </button>
            </div>
          )}
        </Panel>

        <Panel>
          <h2 className="mb-4 font-semibold">{A.notifications}</h2>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p id="wa-label" className="font-medium">{A.whatsappOn}</p>
              <p className="mt-1 text-sm text-muted">{A.whatsappHint}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={whatsappOn}
              aria-labelledby="wa-label"
              disabled={consents === null || whatsBusy}
              onClick={toggleWhatsapp}
              className={cn(
                "relative mt-1 inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors disabled:opacity-60",
                whatsappOn ? "bg-brand-500" : "bg-slate-300 dark:bg-slate-600",
              )}
            >
              <span
                className={cn(
                  "inline-block h-6 w-6 rounded-full bg-white shadow transition-transform",
                  whatsappOn ? "translate-x-7 rtl:-translate-x-7" : "translate-x-1 rtl:-translate-x-1",
                )}
              />
            </button>
          </div>
          {consents && consents.length ? (
            <details className="mt-5 border-t border-[var(--line)] pt-4">
              <summary className="cursor-pointer text-sm font-medium text-muted">{A.consentLog}</summary>
              <ul className="mt-3 space-y-2 text-sm">
                {consents.map((c, i) => (
                  <li key={i} className="flex flex-wrap justify-between gap-2">
                    <span>
                      {A.consentKinds[c.kind]} — <span className={c.granted ? "text-brand-600 dark:text-brand-300" : "text-red-600"}>{c.granted ? A.granted : A.withdrawn}</span>
                    </span>
                    <span className="text-muted">{fmtDate(c.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </Panel>

        <Panel>
          <h2 className="mb-4 font-semibold">{A.privacyTitle}</h2>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-md text-sm text-muted">{A.downloadHint}</p>
            <button type="button" onClick={download} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--line)] px-4 text-sm font-medium hover:border-brand-400">
              <IconDownload width={18} height={18} /> {A.download}
            </button>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-5">
            <p className="max-w-md text-sm text-muted">{A.deleteWarning}</p>
            <button type="button" onClick={() => setDeleteOpen(true)} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-red-300 px-4 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40">
              <IconTrash width={18} height={18} /> {A.deleteAccount}
            </button>
          </div>
        </Panel>
      </div>

      <SignOutButton m={m} locale={locale} className="mt-6 lg:hidden" />

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} title={A.deleteAccount} closeLabel={m.common.close}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (confirmText.trim() === A.deleteConfirmWord) void deleteAccount();
          }}
          className="space-y-5"
        >
          <Alert tone="error">{A.deleteWarning}</Alert>
          <Field label={A.deleteConfirmLabel}>
            {(p) => <Input {...p} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />}
          </Field>
          {deleteError ? <Alert tone="error">{deleteError}</Alert> : null}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setDeleteOpen(false)} className="min-h-12 rounded-full px-5 font-medium text-muted hover:text-[var(--ink)]">
              {m.common.cancel}
            </button>
            <SubmitButton variant="danger" busy={deleteBusy} busyText={m.common.deleting} disabled={confirmText.trim() !== A.deleteConfirmWord}>
              {A.deleteAccount}
            </SubmitButton>
          </div>
        </form>
      </Dialog>
    </>
  );
}

/* ---- Bits ---------------------------------------------------------------- */

function SignOutButton({ m, locale, className }: { m: AppMessages; locale: Locale; className?: string }) {
  const { backend } = useAuth();
  const navigate = useNavigate();
  return (
    <div className={className}>
      <button
        type="button"
        onClick={async () => {
          await backend.signOut();
          navigate(href(locale), { replace: true });
        }}
        className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-muted hover:bg-[var(--card)] hover:text-[var(--ink)]"
      >
        <IconLogout width={20} height={20} />
        {m.common.signOut}
      </button>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
  danger,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors",
        danger
          ? "text-muted hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
          : "text-muted hover:bg-[var(--page-subtle)] hover:text-[var(--ink)]",
      )}
    >
      {children}
    </button>
  );
}

function ConfirmDialog({
  open,
  m,
  title,
  text,
  onClose,
  onConfirm,
}: {
  open: boolean;
  m: AppMessages;
  title: string;
  text: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open={open} onClose={onClose} title={title} closeLabel={m.common.close}>
      <p className="text-muted">{text}</p>
      {error ? <Alert tone="error" className="mt-4">{error}</Alert> : null}
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" onClick={onClose} className="min-h-12 rounded-full px-5 font-medium text-muted hover:text-[var(--ink)]">
          {m.common.cancel}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await onConfirm();
            } catch (e) {
              setError(errorText(m, e));
            } finally {
              setBusy(false);
            }
          }}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-red-600 px-6 font-semibold text-white hover:bg-red-700 disabled:opacity-60"
        >
          {busy ? m.common.deleting : m.common.delete}
        </button>
      </div>
    </Dialog>
  );
}
