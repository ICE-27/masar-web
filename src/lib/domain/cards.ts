/** Card checks for the simulated checkout. The same demo cards are accepted by public.pay_booking. */

export type CardBrand = "visa" | "mastercard" | "mada" | "amex" | "card";

export function digitsOnly(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/\D/g, "");
}

export function luhnValid(num: string): boolean {
  const n = digitsOnly(num);
  if (n.length < 12 || n.length > 19) return false;
  let sum = 0;
  let dbl = false;
  for (let i = n.length - 1; i >= 0; i--) {
    let d = Number(n[i]);
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

const MADA_BINS = new Set([
  "440647", "440795", "446404", "457865", "968208", "588845", "588846", "588848", "604906", "636120",
  "968201", "504300", "431361", "521076", "529415", "535825", "543085", "549760", "554180", "588847", "968205",
]);

export function cardBrand(num: string): CardBrand {
  const n = digitsOnly(num);
  if (MADA_BINS.has(n.slice(0, 6))) return "mada";
  if (/^4/.test(n)) return "visa";
  if (/^(5[1-5]|2[2-7])/.test(n)) return "mastercard";
  if (/^3[47]/.test(n)) return "amex";
  return "card";
}

export function formatCardNumber(input: string): string {
  return digitsOnly(input)
    .slice(0, 19)
    .replace(/(.{4})/g, "$1 ")
    .trim();
}

/** "1228" or "12/28" -> {month: 12, year: 2028} */
export function parseExpiry(input: string): { month: number; year: number } | null {
  const d = digitsOnly(input);
  if (d.length !== 4) return null;
  const month = Number(d.slice(0, 2));
  const year = 2000 + Number(d.slice(2));
  if (month < 1 || month > 12) return null;
  return { month, year };
}

export function formatExpiry(input: string): string {
  const d = digitsOnly(input).slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

export function expiryInFuture(e: { month: number; year: number }, today = new Date()): boolean {
  const lastDay = new Date(Date.UTC(e.year, e.month, 0));
  return lastDay.getTime() >= Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
}

export type DemoOutcome = "success" | "declined" | "insufficient" | "timeout";

/** The published demo cards. Any other number is refused, so no real card is ever processed. */
export const DEMO_CARDS: { number: string; brand: CardBrand; outcome: DemoOutcome }[] = [
  { number: "4464 0400 0000 0007", brand: "mada", outcome: "success" },
  { number: "4242 4242 4242 4242", brand: "visa", outcome: "success" },
  { number: "5555 5555 5555 4444", brand: "mastercard", outcome: "success" },
  { number: "4000 0000 0000 0002", brand: "visa", outcome: "declined" },
  { number: "4000 0000 0000 9995", brand: "visa", outcome: "insufficient" },
  { number: "4000 0000 0000 0119", brand: "visa", outcome: "timeout" },
];
