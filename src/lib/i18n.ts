import ar from "./messages/ar";
import en from "./messages/en";
import type { Messages } from "./messages/en";

export const locales = ["ar", "en"] as const;
export type Locale = (typeof locales)[number];

/** Arabic first: most of our families in the Eastern Province read Arabic. */
export const defaultLocale: Locale = "ar";

const dictionaries: Record<Locale, Messages> = { ar, en };

export function getMessages(locale: Locale): Messages {
  return dictionaries[locale];
}

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

export function dirOf(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}

export function otherLocale(locale: Locale): Locale {
  return locale === "ar" ? "en" : "ar";
}

/** Build an href inside the current locale, e.g. href("ar", "/safety") -> "/ar/safety" */
export function href(locale: Locale, path = "/"): string {
  const clean = path === "/" ? "" : path.startsWith("/") ? path : `/${path}`;
  return `/${locale}${clean}`;
}

export type { Messages };
