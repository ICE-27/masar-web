import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LoginForm } from "@/components/parent/login-form";
import { getMessages, isLocale, locales } from "@/lib/i18n";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: locale === "ar" ? "تسجيل الدخول" : "Sign in", robots: { index: true, follow: true } };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <LoginForm locale={locale} m={getMessages(locale).app} />;
}
