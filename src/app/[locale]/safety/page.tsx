import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card, Section, SectionHead } from "@/components/ui";
import { getMessages, isLocale, locales } from "@/lib/i18n";

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
  return { title: m.safetyPage.title, description: m.safetyPage.subtitle };
}

export default async function SafetyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const m = getMessages(locale);
  const s = m.safetyPage;

  return (
    <>
      <PageHeader eyebrow={m.nav.safety} title={s.title} subtitle={s.subtitle} />

      {/* Verification */}
      <Section>
        <SectionHead
          title={s.verificationTitle}
          subtitle={s.verificationBody}
        />
        <ol className="mx-auto mt-12 grid max-w-5xl gap-5 sm:grid-cols-2">
          {s.verificationSteps.map((step, i) => (
            <Card as="li" key={step.title} className="flex gap-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-500 text-sm font-bold text-white">
                {i + 1}
              </span>
              <div>
                <h3 className="text-base font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {step.body}
                </p>
              </div>
            </Card>
          ))}
        </ol>
      </Section>

      {/* During the trip */}
      <Section subtle>
        <SectionHead title={s.duringTitle} />
        <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {s.during.map((item) => (
            <Card as="li" key={item.title} className="hover:border-brand-300">
              <h3 className="text-base font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {item.body}
              </p>
            </Card>
          ))}
        </ul>
      </Section>

      {/* Who sees what */}
      <Section>
        <SectionHead title={s.privacyTitle} />
        <div className="mx-auto mt-12 max-w-4xl divide-y divide-[var(--line)] overflow-hidden rounded-2xl border border-[var(--line)] bg-card">
          {s.privacy.map((item) => (
            <div
              key={item.title}
              className="grid gap-2 p-6 sm:grid-cols-[minmax(0,13rem)_1fr] sm:gap-6"
            >
              <h3 className="text-sm font-semibold text-brand-600 dark:text-brand-300">
                {item.title}
              </h3>
              <p className="text-sm leading-relaxed text-muted">{item.body}</p>
            </div>
          ))}
        </div>
        <p className="mx-auto mt-8 max-w-4xl text-center text-xs leading-relaxed text-muted">
          {s.note}
        </p>
      </Section>
    </>
  );
}
