import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import {
  ButtonLink,
  Card,
  Check,
  Section,
  SectionHead,
  cn,
} from "@/components/ui";
import { getMessages, href, isLocale, locales } from "@/lib/i18n";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const m = getMessages(locale);
  return { title: m.nav.forDrivers, description: m.drivers.subtitle };
}

export default async function DriversPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const m = getMessages(locale);
  const d = m.drivers;

  return (
    <>
      <PageHeader eyebrow={m.nav.forDrivers} title={d.title} subtitle={d.subtitle}>
        <div className="mt-8">
          <ButtonLink href={href(locale, "/contact")} size="lg">
            {d.cta}
            <span aria-hidden className="start-arrow">
              →
            </span>
          </ButtonLink>
        </div>
      </PageHeader>

      {/* Benefits */}
      <Section>
        <SectionHead title={d.benefitsTitle} />
        <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {d.benefits.map((b) => (
            <Card as="li" key={b.title} className="hover:border-brand-300">
              <h3 className="text-base font-semibold">{b.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{b.body}</p>
            </Card>
          ))}
        </ul>
      </Section>

      {/* The fee */}
      <Section subtle>
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <SectionHead title={d.feeTitle} center={false} />
            <p className="mt-4 text-base leading-relaxed text-muted">
              {d.feeBody}
            </p>
          </div>
          <Card className="shadow-[var(--shadow-soft)]">
            <h3 className="text-sm font-semibold text-muted">
              {d.feeExample.title}
            </h3>
            <table className="mt-4 w-full text-sm">
              <tbody>
                {d.feeExample.rows.map((row) => (
                  <tr
                    key={row.label}
                    className="border-b border-[var(--line)] last:border-0"
                  >
                    <th
                      scope="row"
                      className={cn(
                        "py-3.5 text-start font-normal text-muted",
                        row.strong && "font-semibold text-[var(--ink)]",
                      )}
                    >
                      {row.label}
                    </th>
                    <td
                      className={cn(
                        "whitespace-nowrap py-3.5 text-end tabular-nums",
                        row.strong
                          ? "text-lg font-bold text-brand-600 dark:text-brand-300"
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

      {/* Requirements */}
      <Section>
        <SectionHead
          title={d.requirementsTitle}
          subtitle={d.requirementsNote}
        />
        <div className="mx-auto mt-12 grid max-w-4xl gap-5 md:grid-cols-2">
          {[d.requirements.driver, d.requirements.vehicle].map((group) => (
            <Card key={group.title}>
              <h3 className="text-base font-semibold">{group.title}</h3>
              <ul className="mt-4 space-y-3">
                {group.items.map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <Check className="mt-0.5" />
                    <span className="text-sm leading-relaxed text-muted">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </Section>

      {/* Steps */}
      <Section subtle>
        <SectionHead title={d.stepsTitle} />
        <ol className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {d.steps.map((step, i) => (
            <li key={step.title} className="relative">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-500 text-sm font-bold text-white">
                  {i + 1}
                </span>
                <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted">
                  {m.common.step} {i + 1}
                </span>
              </div>
              <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
        <div className="mt-12 text-center">
          <ButtonLink href={href(locale, "/contact")} size="lg">
            {d.cta}
          </ButtonLink>
        </div>
      </Section>
    </>
  );
}
