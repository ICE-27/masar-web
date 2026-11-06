import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ButtonLink, Card, Section, SectionHead } from "@/components/ui";
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
  return { title: m.about.title, description: m.about.lead };
}

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const m = getMessages(locale);
  const a = m.about;

  return (
    <>
      <PageHeader eyebrow={m.nav.about} title={a.title} subtitle={a.lead} />

      <Section>
        <div className="mx-auto max-w-3xl space-y-6">
          {a.body.map((para) => (
            <p
              key={para.slice(0, 24)}
              className="text-base leading-[1.9] text-muted"
            >
              {para}
            </p>
          ))}
        </div>

        <div className="mx-auto mt-14 grid max-w-3xl grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--line)] sm:grid-cols-4">
          {m.home.stats.map((stat) => (
            <div key={stat.label} className="bg-card px-4 py-6 text-center">
              <span className="block text-2xl font-bold text-brand-600 dark:text-brand-300">
                {stat.value}
              </span>
              <span className="mt-1.5 block text-xs leading-relaxed text-muted">
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section subtle>
        <div className="text-center">
          <ButtonLink href={href(locale, "/contact")} variant="secondary">
            {m.nav.contact}
          </ButtonLink>
        </div>
      </Section>
    </>
  );
}
