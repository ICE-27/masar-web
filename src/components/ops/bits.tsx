"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, Skeleton } from "@/components/form";
import { IconShield } from "@/components/icons";
import { cn } from "@/components/ui";
import type { BookingStatus, DriverStatus } from "@/lib/data";
import { timeLeft } from "@/lib/domain/dates";
import { formatSar } from "@/lib/domain/money";
import { plateDigitsAr, plateLettersAr } from "@/lib/domain/vehicle";
import { errorText, num, t } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { AppMessages } from "@/lib/messages/app.en";

export function PageTitle({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1.5 max-w-2xl text-sm text-muted sm:text-base">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Panel({ children, className, title, action }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode }) {
  return (
    <section className={cn("rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5 sm:p-6", className)}>
      {title || action ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title ? <h2 className="font-semibold">{title}</h2> : <span />}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function EmptyState({ text, action, icon }: { text: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--card)] px-4 py-10 text-center">
      {icon ? <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300">{icon}</div> : null}
      <p className="mx-auto max-w-md text-sm text-muted">{text}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function LoadingBlocks({ n = 3 }: { n?: number }) {
  return (
    <div className="space-y-3" aria-busy>
      {Array.from({ length: n }, (_, i) => (
        <Skeleton key={i} className="h-24" />
      ))}
    </div>
  );
}

/** Load something once (and on demand), with loading and error states. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fn = useCallback(load, deps);
  const reload = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    try {
      const v = await fn();
      if (id === seq.current) {
        setData(v);
        setError(null);
      }
    } catch (e) {
      if (id === seq.current) setError(e);
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [fn]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, setData, error, loading, reload };
}

export function ErrorNote({ m, error, className }: { m: AppMessages; error: unknown; className?: string }) {
  if (!error) return null;
  return (
    <Alert tone="error" className={className}>
      {errorText(m, error)}
    </Alert>
  );
}

export function Sar({ h, locale, className }: { h: number | null | undefined; locale: Locale; className?: string }) {
  return (
    <bdi className={cn("tabular-nums", className)}>{formatSar(h, locale)}</bdi>
  );
}

/** Ticks every 30 seconds (or every second when `fast`). */
export function useNow(fast = false) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), fast ? 1000 : 30000);
    return () => clearInterval(id);
  }, [fast]);
  return now;
}

export function countdownText(iso: string | null | undefined, m: AppMessages, locale: Locale, now: number): string {
  const left = timeLeft(iso, now);
  if (left.ms <= 0) return m.ops.common.expired;
  if (left.h === 0) return t(m.ops.common.minutesLeft, { m: num(Math.max(1, left.m), locale) });
  return t(m.ops.common.timeLeft, { h: num(left.h, locale), m: num(left.m, locale) });
}

export function Countdown({ iso, m, locale, template }: { iso: string | null | undefined; m: AppMessages; locale: Locale; template?: string }) {
  const now = useNow();
  const text = countdownText(iso, m, locale, now);
  return <span>{template ? t(template, { t: text }) : text}</span>;
}

const STATUS_TONE: Record<string, string> = {
  pending: "bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/40 dark:text-sky-200 dark:border-sky-900",
  accepted: "bg-accent-50 text-accent-700 border-accent-200 dark:bg-accent-700/20 dark:text-accent-200 dark:border-accent-700/50",
  confirmed: "bg-brand-50 text-brand-700 border-brand-200 dark:bg-brand-900/40 dark:text-brand-200 dark:border-brand-800",
  approved: "bg-brand-50 text-brand-700 border-brand-200 dark:bg-brand-900/40 dark:text-brand-200 dark:border-brand-800",
  completed: "bg-[var(--page-subtle)] text-muted border-[var(--line)]",
  rejected: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-200 dark:border-red-900",
  expired: "bg-[var(--page-subtle)] text-muted border-[var(--line)]",
  cancelled: "bg-[var(--page-subtle)] text-muted border-[var(--line)]",
  draft: "bg-[var(--page-subtle)] text-muted border-[var(--line)]",
  submitted: "bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/40 dark:text-sky-200 dark:border-sky-900",
  under_review: "bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/40 dark:text-sky-200 dark:border-sky-900",
  action_needed: "bg-accent-50 text-accent-700 border-accent-200 dark:bg-accent-700/20 dark:text-accent-200 dark:border-accent-700/50",
  suspended: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-200 dark:border-red-900",
};

export function StatusBadge({ status, label }: { status: BookingStatus | DriverStatus | string; label: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold", STATUS_TONE[status] ?? STATUS_TONE.draft)}>
      {label}
    </span>
  );
}

export function VerifiedBadge({ m }: { m: AppMessages }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-500 px-2 py-0.5 text-[0.7rem] font-semibold text-white">
      <IconShield width={12} height={12} /> {m.ops.common.verified}
    </span>
  );
}

export function Avatar({ name, url, size = 48, className }: { name: string; url?: string | null; size?: number; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("");
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" width={size} height={size} className={cn("shrink-0 rounded-full object-cover", className)} style={{ width: size, height: size }} />
  ) : (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700 dark:bg-brand-900/60 dark:text-brand-200", className)}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials || "؟"}
    </span>
  );
}

export function Stat({ label, value, hint, tone = "plain" }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: "plain" | "brand" | "accent" }) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-4 sm:p-5",
        tone === "brand"
          ? "border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-brand-900/30"
          : tone === "accent"
            ? "border-accent-200 bg-accent-50 dark:border-accent-700/50 dark:bg-accent-700/15"
            : "border-[var(--line)] bg-[var(--card)]",
      )}
    >
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1.5 text-xl font-bold tracking-tight sm:text-2xl">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; id?: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-brand-500" : "bg-slate-300 dark:bg-slate-600",
      )}
    >
      <span className={cn("inline-block h-5 w-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-6 rtl:-translate-x-6" : "translate-x-1 rtl:-translate-x-1")} />
    </button>
  );
}

export function SwitchRow({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: ReactNode; disabled?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
      </div>
      <Switch checked={checked} onChange={onChange} label={label} disabled={disabled} />
    </div>
  );
}

/** Saudi plate: Arabic on top, English below, as on the real plate. */
export function PlatePreview({ digits, letters, size = "md" }: { digits: string; letters: string; size?: "sm" | "md" }) {
  const sm = size === "sm";
  return (
    <div
      dir="ltr"
      aria-label={`${digits} ${letters}`}
      className={cn("inline-grid select-none grid-cols-[1fr_auto_1fr] overflow-hidden rounded-lg border-2 border-slate-800 bg-white text-slate-900 shadow-sm", sm ? "text-sm" : "text-lg")}
    >
      <div className={cn("flex flex-col items-center justify-center border-e-2 border-slate-800 font-bold", sm ? "px-2 py-0.5" : "px-4 py-1.5")}>
        <span className="font-[IBM_Plex_Sans_Arabic] leading-tight tracking-widest">{plateDigitsAr(digits) || "٠٠٠٠"}</span>
        <span className="leading-tight tracking-widest">{digits || "0000"}</span>
      </div>
      <div className={cn("flex flex-col items-center justify-center bg-sky-100 text-[0.55rem] font-bold leading-tight text-sky-800", sm ? "px-1" : "px-1.5")}>
        <span>السعودية</span>
        <span>KSA</span>
      </div>
      <div className={cn("flex flex-col items-center justify-center border-s-2 border-slate-800 font-bold", sm ? "px-2 py-0.5" : "px-4 py-1.5")}>
        <span className="leading-tight tracking-widest">{plateLettersAr(letters) || "ا ب د"}</span>
        <span className="leading-tight tracking-[0.3em]">{letters.split("").join(" ") || "A B D"}</span>
      </div>
    </div>
  );
}

export function KeyRow({ label, children, strong }: { label: ReactNode; children: ReactNode; strong?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-2", strong && "font-semibold")}>
      <dt className={cn("text-sm", strong ? "" : "text-muted")}>{label}</dt>
      <dd className="text-end text-sm">{children}</dd>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode; count?: number }[]; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="mb-5 inline-flex max-w-full gap-1 overflow-x-auto rounded-full border border-[var(--line)] bg-[var(--card)] p-1">
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          role="tab"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cn(
            "min-h-10 shrink-0 rounded-full px-4 text-sm font-medium transition-colors",
            value === it.value ? "bg-brand-500 text-white" : "text-muted hover:text-[var(--ink)]",
          )}
        >
          {it.label}
          {it.count ? <span className={cn("ms-1.5 rounded-full px-1.5 text-xs", value === it.value ? "bg-white/25" : "bg-[var(--page-subtle)]")}>{it.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function idempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
