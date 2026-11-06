"use client";

import { AppLink as Link } from "./link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "./auth-provider";
import { IconLogout, IconUser } from "./icons";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme";
import { ButtonLink, cn } from "./ui";
import { href, otherLocale, type Locale } from "@/lib/i18n";
import type { Messages } from "@/lib/messages/en";

type NavItem = { label: string; path: string };

export function SiteHeader({
  locale,
  m,
}: {
  locale: Locale;
  m: Messages;
}) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const { status, backend } = useAuth();
  const signedIn = status === "signed-in";
  const a = m.app.common;

  const items: NavItem[] = [
    { label: m.nav.forDrivers, path: "/drivers" },
    { label: m.nav.safety, path: "/safety" },
    { label: m.nav.faq, path: "/faq" },
    { label: m.nav.about, path: "/about" },
    { label: m.nav.contact, path: "/contact" },
  ];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the mobile menu whenever the route changes
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock scrolling behind the open menu
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const other = otherLocale(locale);
  const swapPath = pathname?.replace(/^\/(ar|en)/, "") || "";

  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-all duration-200",
        scrolled
          ? "border-b border-[var(--line)] bg-[var(--page)]/85 backdrop-blur-md"
          : "border-b border-transparent bg-[var(--page)]",
      )}
    >
      <div className="container-page">
        <div className="flex h-16 items-center justify-between gap-4 lg:h-18">
          <Link
            href={href(locale)}
            className="shrink-0 rounded-lg"
            aria-label={m.meta.brand}
          >
            <Logo locale={locale} />
          </Link>

          <nav
            aria-label={m.nav.menu}
            className="hidden lg:flex items-center gap-1"
          >
            {items.map((item) => {
              const target = href(locale, item.path);
              const active = pathname === target;
              return (
                <Link
                  key={item.path}
                  href={target}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-full px-3.5 py-2 text-sm font-medium transition-colors",
                    active
                      ? "text-brand-600 dark:text-brand-300"
                      : "text-muted hover:text-[var(--ink)]",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href={`/${other}${swapPath}`}
              hrefLang={other}
              aria-label={m.lang.label}
              className="hidden sm:inline-flex h-10 items-center rounded-full border border-[var(--line)] px-3.5 text-sm font-medium text-muted transition-colors hover:border-brand-300 hover:text-brand-600 dark:hover:text-brand-300"
            >
              {m.lang.toggle}
            </Link>
            <ThemeToggle label={m.theme.toggle} />
            {status === "loading" ? (
              <span aria-hidden className="hidden h-11 w-32 sm:inline-block" />
            ) : signedIn ? (
              <ButtonLink
                href={href(locale, "/account")}
                size="md"
                className="hidden sm:inline-flex"
              >
                <IconUser width={18} height={18} />
                {a.myAccount}
              </ButtonLink>
            ) : (
              <>
                <Link
                  href={href(locale, "/login")}
                  className="hidden h-10 items-center rounded-full px-3.5 text-sm font-medium text-[var(--ink)] hover:text-brand-600 sm:inline-flex dark:hover:text-brand-300"
                >
                  {a.signIn}
                </Link>
                <ButtonLink
                  href={href(locale, "/signup")}
                  size="md"
                  className="hidden sm:inline-flex"
                >
                  {m.nav.findRide}
                </ButtonLink>
              </>
            )}

            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls="mobile-menu"
              aria-label={open ? m.nav.close : m.nav.menu}
              className="lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--line)] text-[var(--ink)]"
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
              >
                {open ? (
                  <path d="M6 6l12 12M18 6L6 18" />
                ) : (
                  <path d="M3.5 7h17M3.5 12h17M3.5 17h17" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <div
        id="mobile-menu"
        hidden={!open}
        className="lg:hidden border-t border-[var(--line)] bg-[var(--page)]"
      >
        <div className="container-page py-4">
          <nav aria-label={m.nav.menu} className="flex flex-col">
            {items.map((item) => (
              <Link
                key={item.path}
                href={href(locale, item.path)}
                className="rounded-xl px-3 py-3.5 text-base font-medium text-[var(--ink)] hover:bg-brand-50 dark:hover:bg-brand-900/30"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-4 grid gap-2.5">
            {signedIn ? (
              <>
                <ButtonLink href={href(locale, "/account")} size="lg">
                  <IconUser width={18} height={18} />
                  {a.myAccount}
                </ButtonLink>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    void backend.signOut();
                  }}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-[var(--line)] px-7 py-3 text-base font-medium"
                >
                  <IconLogout width={18} height={18} />
                  {a.signOut}
                </button>
              </>
            ) : (
              <>
                <ButtonLink href={href(locale, "/signup")} size="lg">
                  {m.nav.findRide}
                </ButtonLink>
                <ButtonLink href={href(locale, "/login")} variant="secondary" size="lg">
                  {a.signIn}
                </ButtonLink>
                <ButtonLink
                  href={href(locale, "/drivers")}
                  variant="ghost"
                  size="lg"
                >
                  {m.nav.becomeDriver}
                </ButtonLink>
              </>
            )}
            <Link
              href={`/${other}${swapPath}`}
              hrefLang={other}
              className="mt-1 text-center text-sm font-medium text-muted underline underline-offset-4"
            >
              {m.lang.toggle}
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
