/** Money is always halalas (integers). 1 SAR = 100 halalas. */

export type Halalas = number;

export function formatSar(h: Halalas | null | undefined, locale: "ar" | "en", opts: { compact?: boolean } = {}): string {
  const value = (h ?? 0) / 100;
  const whole = Number.isInteger(value);
  const fmt = new Intl.NumberFormat(locale === "ar" ? "ar-SA-u-nu-arab" : "en-US", {
    minimumFractionDigits: whole && opts.compact !== false ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
  return locale === "ar" ? `${fmt} ر.س` : `SAR ${fmt}`;
}

/** "22.5" or "22,5" or "٢٢٫٥" -> 2250. Returns null for anything that isn't a positive amount. */
export function parseSar(input: string): Halalas | null {
  const ascii = input
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٫,]/g, ".")
    .replace(/[^\d.]/g, "");
  if (!ascii || !/^\d+(\.\d{0,2})?$/.test(ascii)) return null;
  return Math.round(parseFloat(ascii) * 100);
}

export function sarInput(h: Halalas | null | undefined): string {
  if (h == null) return "";
  return Number.isInteger(h / 100) ? String(h / 100) : (h / 100).toFixed(2);
}

/** Basis points to a percentage label: 1500 -> "15%". */
export function pct(bp: number, locale: "ar" | "en"): string {
  return new Intl.NumberFormat(locale === "ar" ? "ar-SA-u-nu-arab" : "en-US", { style: "percent", maximumFractionDigits: 2 }).format(bp / 10000);
}
