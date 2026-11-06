import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DriverWizard } from "@/components/driver/driver-wizard";
import { getMessages, isLocale, locales } from "@/lib/i18n";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: locale === "ar" ? "انضم سائقًا في مسار" : "Become a Masar driver" };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const m = getMessages(locale).app;
  return <DriverWizard locale={locale} m={m} />;
}
