import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Accordion } from "@/components/accordion";
import { PageHeader } from "@/components/page-header";
import { ButtonLink } from "@/components/ui";
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
  return { title: m.faq.title, description: m.faq.subtitle };
}

export default async function FaqPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const m = getMessages(locale);

  return (
    <>
      <PageHeader
        eyebrow={m.nav.faq}
        title={m.faq.title}
        subtitle={m.faq.subtitle}
      />

      <div className="container-page py-14 sm:py-20">
        <div className="mx-auto max-w-3xl space-y-14">
          {m.faq.groups.map((group) => (
            <section key={group.title}>
              <h2 className="text-2xl font-bold tracking-tight">
                {group.title}
              </h2>
              <div className="mt-6">
                <Accordion items={group.items} />
              </div>
            </section>
          ))}

          <div className="rounded-2xl border border-[var(--line)] bg-subtle p-8 text-center">
            <p className="text-sm text-muted">{m.faq.subtitle}</p>
            <ButtonLink
              href={href(locale, "/contact")}
              className="mt-5"
              variant="secondary"
            >
              {m.nav.contact}
            </ButtonLink>
          </div>
        </div>
      </div>
    </>
  );
}
