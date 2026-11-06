import type { AppMessages } from "./messages/app.en";
import type { DataError } from "./data/types";

/** "Step {n} of {total}" + {n: 2, total: 4} -> "Step 2 of 4" */
export function t(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

/** Message for a validation key or a DataError, never a raw provider message. */
export function errorText(
  m: AppMessages,
  error: string | DataError | unknown,
): string {
  const errors = m.errors as Record<string, string>;
  if (typeof error === "string") return errors[error] ?? errors.unknown;
  if (error && typeof error === "object" && "code" in error) {
    const e = error as DataError;
    const text = errors[e.code] ?? errors.unknown;
    return t(text, { s: e.detail ?? "30" });
  }
  return errors.unknown;
}

/** Arabic-Indic digits in Arabic, Latin in English. */
export function num(n: number, locale: "ar" | "en"): string {
  return new Intl.NumberFormat(locale === "ar" ? "ar-SA-u-nu-arab" : "en-US", { useGrouping: false }).format(n);
}
