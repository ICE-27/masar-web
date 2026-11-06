import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DriverArea } from "@/components/driver/driver-area";
import { getMessages, isLocale, locales } from "@/lib/i18n";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: locale === "ar" ? "طلبات الحجز" : "Booking requests", robots: { index: false, follow: true } };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const m = getMessages(locale).app;
  return <DriverArea locale={locale} m={m} section="requests" />;
}
