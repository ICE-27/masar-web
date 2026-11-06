import { AppLink as Link } from "@/components/link";
import { Accordion } from "@/components/accordion";
import { HowTabs } from "@/components/how-tabs";
import { TripPreview } from "@/components/trip-preview";
import {
  Badge,
  ButtonLink,
  Card,
  Check,
  Eyebrow,
  Section,
  SectionHead,
  cn,
} from "@/components/ui";
import { getMessages, href, isLocale, locales } from "@/lib/i18n";
import { notFound } from "next/navigation";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

const safetyIcons = [
  "M12 2.5 4 6v5.6c0 4.7 3.3 9 8 10 4.7-1 8-5.3 8-10V6l-8-3.5Z M9.2 11.8l2 2 3.6-4",
  "M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11Z M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  "M18 8A6 6 0 1 0 6 8c0 7-3 8-3 8h18s-3-1-3-8 M13.7 20a2 2 0 0 1-3.4 0",
  "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M4.5 20.5a7.5 7.5 0 0 1 15 0",
  "M9 11h6 M9 15h4 M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z",
  "m12 3 2.6 5.4 5.9.9-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.3l5.9-.9L12 3Z",
];

const serviceIcons = [
  "M4 16V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9 M4 16h16 M4 16v2.5 M20 16v2.5 M7.5 9.5h9 M7.5 13h2 M14.5 13h2",
  "m12 3 2.3 4.7 5.2.8-3.8 3.6.9 5.1-4.6-2.4-4.6 2.4.9-5.1L4.5 8.5l5.2-.8L12 3Z",
  "M5 17V9.8a2 2 0 0 1 .5-1.3l2-2.4A2 2 0 0 1 9 5.4h6a2 2 0 0 1 1.5.7l2 2.4a2 2 0 0 1 .5 1.3V17 M5 17h14 M7.5 17v2 M16.5 17v2 M8 13h.01 M16 13h.01",
  "M3 15V8a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v7 M3 15h18 M3 15v2.5 M18 15v2.5 M6.5 10h8 M18 9h1.8L21 12v3",
];

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const m = getMessages(locale);
  const h = m.home;

  return (
    <>
      {/* ---------------- Hero ---------------- */}
      <section className="mesh-hero relative overflow-hidden">
        <div className="container-page py-16 sm:py-20 lg:py-28">
          <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
            <div>
              <Badge tone="accent">
                <span className="h-1.5 w-1.5 rounded-full bg-accent-500" />
                {h.badge}
              </Badge>

              <h1 className="mt-5 text-4xl font-bold leading-[1.12] tracking-tight text-balance sm:text-5xl lg:text-[3.4rem]">
                {h.title}
              </h1>

              <p className="mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg text-pretty">
                {h.subtitle}
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <ButtonLink href={href(locale, "/contact")} size="lg">
                  {h.primaryCta}
                  <span aria-hidden className="start-arrow">
                    →
                  </span>
                </ButtonLink>
                <ButtonLink
                  href={href(locale, "/drivers")}
                  variant="secondary"
                  size="lg"
                >
                  {h.secondaryCta}
                </ButtonLink>
              </div>

              <ul className="mt-9 space-y-2.5">
                {h.trust.items.map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <Check className="mt-0.5" />
                    <span className="text-sm text-muted">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="lg:ps-6">
              <TripPreview locale={locale} />
            </div>
          </div>

          {/* stats strip */}
          <dl className="mt-16 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--line)] lg:mt-20 lg:grid-cols-4">
            {h.stats.map((stat) => (
              <div key={stat.label} className="bg-card px-5 py-6 text-center">
                <dt className="sr-only">{stat.label}</dt>
                <dd>
                  <span className="block text-3xl font-bold text-brand-600 dark:text-brand-300">
                    {stat.value}
                  </span>
                  <span className="mt-1.5 block text-xs leading-relaxed text-muted">
                    {stat.label}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ---------------- How it works ---------------- */}
      <Section subtle id="how">
        <SectionHead
          eyebrow={m.nav.howItWorks}
          title={h.how.title}
          subtitle={h.how.subtitle}
        />
        <HowTabs
          parentsLabel={h.how.parentsTitle}
          driversLabel={h.how.driversTitle}
          parents={h.how.parents}
          drivers={h.how.drivers}
          stepWord={m.common.step}
        />
      </Section>

      {/* ---------------- Safety ---------------- */}
      <Section id="safety">
        <SectionHead
          eyebrow={m.nav.safety}
          title={h.safety.title}
          subtitle={h.safety.subtitle}
        />
        <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {h.safety.items.map((item, i) => (
            <Card
              as="li"
              key={item.title}
              className="hover:border-brand-300 hover:shadow-[var(--shadow-soft)]"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/50 dark:text-brand-300">
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={safetyIcons[i % safetyIcons.length]} />
                </svg>
              </span>
              <h3 className="mt-4 text-base font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {item.body}
              </p>
            </Card>
          ))}
        </ul>
        <div className="mt-10 text-center">
          <ButtonLink href={href(locale, "/safety")} variant="secondary">
            {m.common.learnMore}
          </ButtonLink>
        </div>
      </Section>

      {/* ---------------- Services ---------------- */}
      <Section subtle>
        <SectionHead
          title={h.services.title}
          subtitle={h.services.subtitle}
        />
        <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {h.services.items.map((item, i) => (
            <Card
              as="li"
              key={item.title}
              className="flex flex-col hover:border-brand-300"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent-50 text-accent-700 dark:bg-accent-700/20 dark:text-accent-300">
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={serviceIcons[i % serviceIcons.length]} />
                </svg>
              </span>
              <h3 className="mt-4 text-base font-semibold">{item.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">
                {item.body}
              </p>
              <p className="mt-4 text-sm font-semibold text-brand-600 dark:text-brand-300">
                {item.price}
              </p>
            </Card>
          ))}
        </ul>
      </Section>

      {/* ---------------- Pricing ---------------- */}
      <Section>
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <Eyebrow>{m.nav.pricing}</Eyebrow>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl text-balance">
              {h.pricing.title}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">
              {h.pricing.subtitle}
            </p>
            <p className="mt-6 rounded-2xl border border-[var(--line)] bg-subtle p-5 text-sm leading-relaxed text-muted">
              {h.pricing.note}
            </p>
          </div>

          <Card className="p-0 shadow-[var(--shadow-soft)]">
            <table className="w-full text-sm">
              <caption className="sr-only">{h.pricing.title}</caption>
              <tbody>
                {h.pricing.rows.map((row, i) => (
                  <tr
                    key={row.label}
                    className={cn(
                      "border-b border-[var(--line)] last:border-0",
                      row.strong && "bg-brand-50/60 dark:bg-brand-900/25",
                    )}
                  >
                    <th
                      scope="row"
                      className={cn(
                        "px-5 py-4 text-start font-normal text-muted sm:px-6",
                        row.strong &&
                          "font-semibold text-[var(--ink)]",
                        i === h.pricing.rows.length - 1 && "text-base",
                      )}
                    >
                      {row.label}
                    </th>
                    <td
                      className={cn(
                        "whitespace-nowrap px-5 py-4 text-end tabular-nums sm:px-6",
                        row.strong
                          ? "text-base font-bold text-brand-600 dark:text-brand-300"
                          : "text-muted",
                      )}
                    >
                      {row.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      </Section>

      {/* ---------------- Coverage ---------------- */}
      <Section subtle>
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
          <div>
            <Eyebrow>{h.badge}</Eyebrow>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              {h.coverage.title}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted">
              {h.coverage.subtitle}
            </p>
            <p className="mt-6 text-sm leading-relaxed text-muted">
              {h.coverage.note}
            </p>
            <ButtonLink
              href={href(locale, "/contact")}
              variant="accent"
              className="mt-6"
            >
              {h.coverage.cta}
            </ButtonLink>
          </div>

          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {h.coverage.cities.map((city) => (
              <li
                key={city}
                className="flex items-center gap-2.5 rounded-xl border border-[var(--line)] bg-card px-4 py-3.5 text-sm font-medium"
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden
                  className="h-4 w-4 shrink-0 text-brand-500"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11Z" />
                  <circle cx="12" cy="10" r="2.4" />
                </svg>
                {city}
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* ---------------- Testimonials ---------------- */}
      <Section>
        <SectionHead title={h.testimonials.title} subtitle={h.testimonials.note} />
        <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {h.testimonials.items.map((item) => (
            <Card as="li" key={item.quote} className="flex flex-col">
              <svg
                viewBox="0 0 24 24"
                aria-hidden
                className="h-7 w-7 text-accent-400"
                fill="currentColor"
              >
                <path d="M9.4 6.5C6.6 7.8 5 10 5 12.6c0 .5.1 1 .2 1.4A3.4 3.4 0 1 0 9 11.3c-.3 0-.6 0-.9.1.4-1.3 1.4-2.3 3-3.1l-1.7-1.8Zm9 0c-2.8 1.3-4.4 3.5-4.4 6.1 0 .5.1 1 .2 1.4a3.4 3.4 0 1 0 3.8-2.7c-.3 0-.6 0-.9.1.4-1.3 1.4-2.3 3-3.1l-1.7-1.8Z" />
              </svg>
              <blockquote className="mt-3 flex-1 text-sm leading-relaxed">
                “{item.quote}”
              </blockquote>
              <footer className="mt-5 border-t border-[var(--line)] pt-4">
                <p className="text-xs font-semibold">{item.author}</p>
                <p className="text-xs text-muted">{item.where}</p>
              </footer>
            </Card>
          ))}
        </ul>
      </Section>

      {/* ---------------- FAQ teaser ---------------- */}
      <Section subtle>
        <SectionHead title={h.faq.title} />
        <div className="mx-auto mt-10 max-w-3xl">
          <Accordion items={m.faq.groups[0].items.slice(0, 4)} />
          <div className="mt-8 text-center">
            <ButtonLink href={href(locale, "/faq")} variant="secondary">
              {h.faq.cta}
            </ButtonLink>
          </div>
        </div>
      </Section>

      {/* ---------------- Closing CTA ---------------- */}
      <section className="bg-brand-600 text-white">
        <div className="container-page py-16 text-center sm:py-20">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {h.cta.title}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-brand-50">
            {h.cta.subtitle}
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink href={href(locale, "/contact")} variant="accent" size="lg">
              {h.cta.parent}
            </ButtonLink>
            <Link
              href={href(locale, "/drivers")}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/35 px-7 py-3.5 text-base font-medium transition-colors hover:bg-white/10"
            >
              {h.cta.driver}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
