import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccountArea } from "@/components/parent/account";
import { getMessages, isLocale, locales } from "@/lib/i18n";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: locale === "ar" ? "العناوين" : "Addresses", robots: { index: false, follow: true } };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <AccountArea locale={locale} m={getMessages(locale).app} section="addresses" />;
}
