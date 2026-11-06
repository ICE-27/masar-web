import { AppLink as Link } from "./link";
import { Logo } from "./logo";
import { href, type Locale } from "@/lib/i18n";
import type { Messages } from "@/lib/messages/en";

export function SiteFooter({ locale, m }: { locale: Locale; m: Messages }) {
  const columns = [
    {
      title: m.footer.product,
      links: [
        { label: m.nav.forDrivers, path: "/drivers" },
        { label: m.nav.safety, path: "/safety" },
        { label: m.nav.faq, path: "/faq" },
      ],
    },
    {
      title: m.footer.company,
      links: [
        { label: m.nav.about, path: "/about" },
        { label: m.nav.contact, path: "/contact" },
      ],
    },
    {
      title: m.footer.legalTitle,
      links: [
        { label: m.legal.privacy.title, path: "/privacy" },
        { label: m.legal.terms.title, path: "/terms" },
        { label: m.legal.refunds.title, path: "/refunds" },
      ],
    },
  ];

  return (
    <footer className="no-print border-t border-[var(--line)] bg-subtle">
      <div className="container-page py-14">
        <div className="grid gap-10 md:grid-cols-[1.6fr_repeat(3,1fr)]">
          <div className="max-w-xs">
            <Logo locale={locale} />
            <p className="mt-4 text-sm leading-relaxed text-muted">
              {m.footer.tagline}
            </p>
            <div className="mt-5 flex flex-wrap gap-1.5">
              {m.home.coverage.cities.map((city) => (
                <span
                  key={city}
                  className="rounded-full border border-[var(--line)] bg-[var(--card)] px-2.5 py-1 text-[0.7rem] text-muted"
                >
                  {city}
                </span>
              ))}
            </div>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <h3 className="text-sm font-semibold">{col.title}</h3>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.path}>
                    <Link
                      href={href(locale, link.path)}
                      className="text-sm text-muted transition-colors hover:text-brand-600 dark:hover:text-brand-300"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-[var(--line)] pt-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {m.meta.brand}. {m.footer.rights}
          </p>
        </div>
      </div>
    </footer>
  );
}
