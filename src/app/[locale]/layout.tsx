import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
// Fonts come from npm rather than Google Fonts: the build then needs no
// network access and the site serves them from its own domain.
import "@fontsource-variable/inter";
import "@fontsource/ibm-plex-sans-arabic/arabic-400.css";
import "@fontsource/ibm-plex-sans-arabic/arabic-500.css";
import "@fontsource/ibm-plex-sans-arabic/arabic-600.css";
import "@fontsource/ibm-plex-sans-arabic/arabic-700.css";
import "@fontsource/ibm-plex-sans-arabic/latin-400.css";
import "@fontsource/ibm-plex-sans-arabic/latin-600.css";
import type { ReactNode } from "react";
import { DemoRibbon } from "@/components/demo-ribbon";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { themeInitScript } from "@/components/theme";
import {
  dirOf,
  getMessages,
  isLocale,
  locales,
  otherLocale,
  type Locale,
} from "@/lib/i18n";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.ksamasar.com";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#009767" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1410" },
  ],
};

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
  const other = otherLocale(locale);

  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: `${m.meta.brand} — ${m.meta.tagline}`,
      template: `%s · ${m.meta.brand}`,
    },
    description: m.meta.description,
    applicationName: m.meta.brand,
    manifest: "/manifest.webmanifest",
    icons: {
      icon: [
        { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
        { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      ],
      apple: "/apple-icon.png",
    },
    alternates: {
      canonical: `/${locale}`,
      languages: {
        [locale]: `/${locale}`,
        [other]: `/${other}`,
      },
    },
    openGraph: {
      type: "website",
      siteName: m.meta.brand,
      title: `${m.meta.brand} — ${m.meta.tagline}`,
      description: m.meta.description,
      locale: locale === "ar" ? "ar_SA" : "en_US",
      url: `/${locale}`,
    },
    twitter: {
      card: "summary_large_image",
      title: `${m.meta.brand} — ${m.meta.tagline}`,
      description: m.meta.description,
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const typed = locale as Locale;
  const m = getMessages(typed);

  return (
    <html
      lang={typed}
      dir={dirOf(typed)}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh flex flex-col antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:z-[60] focus:m-3 focus:rounded-full focus:bg-brand-500 focus:px-5 focus:py-3 focus:text-white"
        >
          {typed === "ar" ? "تخطَّ إلى المحتوى" : "Skip to content"}
        </a>
        <SiteHeader locale={typed} m={m} />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter locale={typed} m={m} />
        <DemoRibbon m={m} />
      </body>
    </html>
  );
}
