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
        <SectionHead title={a.teamTitle} subtitle={a.teamNote} />
        <ul className="mx-auto mt-12 grid max-w-3xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {a.team.map((member) => (
            <Card as="li" key={member} className="flex items-center gap-3 p-4">
              <span
                aria-hidden
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-700 dark:bg-brand-800 dark:text-brand-200"
              >
                {member.trim()[0]}
              </span>
              <span className="text-sm font-medium">{member}</span>
            </Card>
          ))}
        </ul>
        <div className="mt-12 text-center">
          <ButtonLink href={href(locale, "/contact")} variant="secondary">
            {m.nav.contact}
          </ButtonLink>
        </div>
      </Section>
    </>
  );
}
