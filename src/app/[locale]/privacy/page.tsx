import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalPage, LegalSection } from "@/components/page-header";
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
  return { title: m.legal.privacy.title, description: m.legal.privacy.intro };
}

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const m = getMessages(locale);
  const page = m.legal.privacy;

  return (
    <LegalPage
      title={page.title}
      intro={page.intro}
      banner={m.legal.demoBanner}
      updatedLabel={m.legal.updated}
      locale={locale}
    >
      {page.sections.map((section, i) => (
        <LegalSection
          key={section.title}
          index={i + 1}
          title={section.title}
          body={section.body}
        />
      ))}
    </LegalPage>
  );
}
