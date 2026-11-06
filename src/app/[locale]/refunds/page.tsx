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
  return { title: m.legal.refunds.title, description: m.legal.refunds.intro };
}

export default async function RefundsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const m = getMessages(locale);
  const page = m.legal.refunds;

  return (
    <LegalPage
      title={page.title}
      intro={page.intro}
      banner={m.legal.demoBanner}
      updatedLabel={m.legal.updated}
      locale={locale}
    >
      <section>
        <div className="overflow-x-auto rounded-2xl border border-[var(--line)]">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="bg-subtle">
                {page.tableHeads.map((head) => (
                  <th
                    key={head}
                    scope="col"
                    className="px-5 py-3.5 text-start text-xs font-semibold uppercase tracking-wide text-muted"
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {page.rows.map((row) => (
                <tr
                  key={row.who}
                  className="border-t border-[var(--line)] align-top"
                >
                  <th
                    scope="row"
                    className="px-5 py-4 text-start text-sm font-semibold"
                  >
                    {row.who}
                  </th>
                  <td className="px-5 py-4 text-sm leading-relaxed text-muted">
                    {row.price}
                  </td>
                  <td className="px-5 py-4 text-sm font-medium">{row.fee}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

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
