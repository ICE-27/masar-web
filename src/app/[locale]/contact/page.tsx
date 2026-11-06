import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContactForm } from "@/components/contact-form";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui";
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
  return { title: m.contact.title, description: m.contact.subtitle };
}

export default async function ContactPage({
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
        eyebrow={m.nav.contact}
        title={m.contact.title}
        subtitle={m.contact.subtitle}
      />

      <div className="container-page py-14 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr] lg:gap-16">
          <Card className="p-6 sm:p-8">
            <ContactForm m={m} />
          </Card>

          <aside className="space-y-5">
            <Card>
              <h2 className="text-base font-semibold">
                {m.contact.otherTitle}
              </h2>
              <ul className="mt-4 space-y-4 text-sm">
                <li className="flex items-start gap-3">
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden
                    className="mt-0.5 h-4.5 w-4.5 shrink-0 text-brand-500"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11Z" />
                    <circle cx="12" cy="10" r="2.4" />
                  </svg>
                  <span className="text-muted">{m.contact.based}</span>
                </li>
                <li className="flex items-start gap-3">
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden
                    className="mt-0.5 h-4.5 w-4.5 shrink-0 text-brand-500"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5.2l3.2 1.9" />
                  </svg>
                  <span className="text-muted">{m.contact.hours}</span>
                </li>
              </ul>
            </Card>

            <Card className="border-brand-200 bg-brand-50 dark:border-brand-700 dark:bg-brand-900/30">
              <h2 className="text-base font-semibold">
                {m.contact.orWhatsapp}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {m.demo.text}
              </p>
            </Card>
          </aside>
        </div>
      </div>
    </>
  );
}
