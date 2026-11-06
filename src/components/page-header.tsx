import type { ReactNode } from "react";
import { Eyebrow } from "./ui";

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <header className="mesh-hero border-b border-[var(--line)]">
      <div className="container-page py-14 sm:py-20">
        <div className="max-w-3xl">
          {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-balance sm:text-5xl">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-5 text-base leading-relaxed text-muted sm:text-lg text-pretty">
              {subtitle}
            </p>
          ) : null}
          {children}
        </div>
      </div>
    </header>
  );
}

const UPDATED = new Date("2026-11-06T00:00:00Z");

/** Shared layout for the three policy pages. */
export function LegalPage({
  title,
  intro,
  banner,
  updatedLabel,
  locale,
  children,
}: {
  title: string;
  intro: string;
  banner: string;
  updatedLabel: string;
  locale: "ar" | "en";
  children: ReactNode;
}) {
  const updated = new Intl.DateTimeFormat(
    locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB",
    { day: "numeric", month: "long", year: "numeric" },
  ).format(UPDATED);

  return (
    <>
      <PageHeader title={title} subtitle={intro}>
        <p className="mt-6 text-xs text-muted">
          {updatedLabel}: {updated}
        </p>
      </PageHeader>
      <div className="container-page py-14 sm:py-18">
        <div className="mx-auto max-w-3xl">
          <p className="rounded-2xl border border-accent-200 bg-accent-50 p-5 text-sm leading-relaxed text-accent-700 dark:border-accent-700/60 dark:bg-accent-700/15 dark:text-accent-200">
            {banner}
          </p>
          <div className="mt-10 space-y-10">{children}</div>
        </div>
      </div>
    </>
  );
}

export function LegalSection({
  title,
  body,
  index,
}: {
  title: string;
  body: string;
  index: number;
}) {
  return (
    <section>
      <h2 className="flex items-baseline gap-3 text-xl font-semibold">
        <span className="text-sm font-bold tabular-nums text-brand-500">
          {String(index).padStart(2, "0")}
        </span>
        {title}
      </h2>
      <p className="mt-3 text-sm leading-[1.9] text-muted sm:text-[0.95rem]">
        {body}
      </p>
    </section>
  );
}
