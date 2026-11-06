/** Saudi number plates, vehicle catalogue and IBANs. */

/** The 17 letters allowed on Saudi plates: English shown with its Arabic letter. */
export const PLATE_LETTERS: { en: string; ar: string }[] = [
  { en: "A", ar: "ا" },
  { en: "B", ar: "ب" },
  { en: "J", ar: "ح" },
  { en: "D", ar: "د" },
  { en: "R", ar: "ر" },
  { en: "S", ar: "س" },
  { en: "X", ar: "ص" },
  { en: "T", ar: "ط" },
  { en: "E", ar: "ع" },
  { en: "G", ar: "ق" },
  { en: "K", ar: "ك" },
  { en: "L", ar: "ل" },
  { en: "Z", ar: "م" },
  { en: "N", ar: "ن" },
  { en: "H", ar: "هـ" },
  { en: "U", ar: "و" },
  { en: "V", ar: "ى" },
];

const EN_TO_AR = new Map(PLATE_LETTERS.map((l) => [l.en, l.ar]));
const AR_TO_EN = new Map(PLATE_LETTERS.flatMap((l) => [[l.ar, l.en], [l.ar.replace("ـ", ""), l.en]]));

/** Accept typing in either script; keep only allowed letters, max 3. */
export function normalizePlateLetters(input: string): string {
  const out: string[] = [];
  for (const ch of input.toUpperCase()) {
    if (EN_TO_AR.has(ch)) out.push(ch);
    else if (AR_TO_EN.has(ch)) out.push(AR_TO_EN.get(ch)!);
    if (out.length === 3) break;
  }
  return out.join("");
}

export function plateLettersAr(en: string): string {
  return [...en].map((c) => EN_TO_AR.get(c) ?? "").join(" ");
}

export function normalizePlateDigits(input: string): string {
  return input.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/\D/g, "").slice(0, 4);
}

export function plateDigitsAr(digits: string): string {
  return digits.replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
}

export function validPlate(digits: string, letters: string): boolean {
  return /^[0-9]{1,4}$/.test(digits) && /^[ABJDRSXTEGKLZNHUV]{1,3}$/.test(letters);
}

export const CAR_MAKES: Record<string, string[]> = {
  Toyota: ["Camry", "Corolla", "Yaris", "Innova", "Fortuner", "Land Cruiser", "Highlander", "Previa", "Avalon", "RAV4"],
  Hyundai: ["Accent", "Elantra", "Sonata", "Tucson", "Santa Fe", "Staria", "Palisade", "Creta"],
  Kia: ["Pegas", "Cerato", "K5", "Sportage", "Sorento", "Carnival", "Seltos"],
  Nissan: ["Sunny", "Altima", "Maxima", "X-Trail", "Pathfinder", "Patrol"],
  Chevrolet: ["Spark", "Malibu", "Captiva", "Traverse", "Tahoe", "Suburban"],
  GMC: ["Terrain", "Acadia", "Yukon", "Yukon XL"],
  Ford: ["Taurus", "Edge", "Explorer", "Expedition"],
  Honda: ["City", "Civic", "Accord", "CR-V", "Pilot", "Odyssey"],
  Mazda: ["Mazda 3", "Mazda 6", "CX-5", "CX-9"],
  Lexus: ["ES", "LS", "RX", "GX", "LX"],
  Mitsubishi: ["Attrage", "Lancer", "ASX", "Outlander", "Pajero"],
  Other: [],
};

export const BUS_MAKES: Record<string, string[]> = {
  Toyota: ["Hiace", "Coaster"],
  Hyundai: ["H-1", "County", "Universe"],
  Mitsubishi: ["Rosa"],
  Isuzu: ["Journey", "NQR"],
  "King Long": ["XMQ6900", "XMQ6127"],
  Higer: ["KLQ6608", "KLQ6129"],
  "Mercedes-Benz": ["Sprinter", "Travego"],
  Other: [],
};

export const BUS_TYPES = ["minivan", "coaster", "midsize", "fullsize"] as const;
export type BusType = (typeof BUS_TYPES)[number];
export const CAR_CATEGORIES = ["sedan", "suv", "van"] as const;
export type CarCategory = (typeof CAR_CATEGORIES)[number];

/** Capacity bands used for whole-bus pricing. */
export function capacityBand(seats: number): "12" | "22" | "30" | "30+" {
  if (seats <= 12) return "12";
  if (seats <= 22) return "22";
  if (seats <= 30) return "30";
  return "30+";
}

/** SA + 22 digits, ISO 7064 mod-97 (same as public.iban_valid). */
/**
 * Clean whatever was typed or pasted: Arabic digits, spaces, dashes, lower
 * case, and a repeated "SA" (the field starts with SA, people paste SA too).
 * Plain 22 digits get the SA in front.
 */
export function normalizeIban(input: string): string {
  let s = input
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "");
  while (s.startsWith("SASA")) s = s.slice(2);
  if (/^\d{22}$/.test(s)) s = "SA" + s;
  return s;
}

/** Saudi IBAN: SA, 2 check digits, 2-digit bank code, 18 account characters (ISO 13616, mod 97). */
export function ibanValid(input: string): boolean {
  const iban = normalizeIban(input);
  if (!/^SA\d{4}[0-9A-Z]{18}$/.test(iban)) return false;
  const s = iban.slice(4) + iban.slice(0, 4);
  let r = 0;
  for (const ch of s) {
    const v = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of v) r = (r * 10 + Number(d)) % 97;
  }
  return r === 1;
}

export function formatIban(input: string): string {
  return normalizeIban(input).replace(/(.{4})/g, "$1 ").trim();
}

/** Banks operating in Saudi Arabia, with their IBAN bank code (digits 5-6) where known. */
export const SAUDI_BANKS: { code: string | null; en: string; ar: string }[] = [
  { code: "80", en: "Al Rajhi Bank", ar: "مصرف الراجحي" },
  { code: "10", en: "Saudi National Bank (SNB)", ar: "البنك الأهلي السعودي" },
  { code: "20", en: "Riyad Bank", ar: "بنك الرياض" },
  { code: "45", en: "Saudi Awwal Bank (SAB)", ar: "البنك السعودي الأول" },
  { code: "05", en: "Alinma Bank", ar: "مصرف الإنماء" },
  { code: "55", en: "Banque Saudi Fransi", ar: "البنك السعودي الفرنسي" },
  { code: "30", en: "Arab National Bank", ar: "البنك العربي الوطني" },
  { code: "15", en: "Bank Albilad", ar: "بنك البلاد" },
  { code: "60", en: "Bank AlJazira", ar: "بنك الجزيرة" },
  { code: "65", en: "Saudi Investment Bank", ar: "البنك السعودي للاستثمار" },
  { code: "90", en: "Gulf International Bank (meem)", ar: "بنك الخليج الدولي (ميم)" },
  { code: null, en: "STC Bank", ar: "بنك إس تي سي" },
  { code: null, en: "D360 Bank", ar: "بنك دال ٣٦٠" },
  { code: null, en: "Emirates NBD", ar: "بنك الإمارات دبي الوطني" },
  { code: null, en: "Bank Muscat", ar: "بنك مسقط" },
  { code: null, en: "National Bank of Bahrain", ar: "بنك البحرين الوطني" },
  { code: null, en: "National Bank of Kuwait", ar: "بنك الكويت الوطني" },
  { code: null, en: "First Abu Dhabi Bank", ar: "بنك أبوظبي الأول" },
  { code: null, en: "J.P. Morgan", ar: "جي بي مورقان" },
  { code: null, en: "Other", ar: "أخرى" },
];
const BANK_ALIASES: Record<string, string> = { "40": "45", "50": "45" };

export function bankFromIban(input: string): { en: string; ar: string } | null {
  const iban = normalizeIban(input);
  if (!/^SA\d{4}/.test(iban)) return null;
  const code = iban.slice(4, 6);
  return SAUDI_BANKS.find((b) => b.code === (BANK_ALIASES[code] ?? code)) ?? null;
}

const SUV = /land cruiser|prado|fortuner|rav4|highlander|sequoia|4runner|patrol|x-trail|pathfinder|tahoe|suburban|yukon|terrain|acadia|tucson|santa fe|palisade|creta|sportage|sorento|seltos|telluride|explorer|expedition|edge|captiva|traverse|cr-v|pilot|cx-|rx|gx|lx|asx|outlander|pajero|montero|cherokee|durango|kodiaq|tiguan|touareg|x5|x3|q5|q7|gle|glc/i;
const VAN = /hiace|sienna|odyssey|carnival|staria|h-1|starex|previa|innova|pacifica|caravan|quest|v-class|vito|transit/i;

/** A car's category follows from its model; anything unknown counts as a sedan. */
export function carCategoryFor(model: string | null | undefined): CarCategory {
  const m = model ?? "";
  if (VAN.test(m)) return "van";
  if (SUV.test(m)) return "suv";
  return "sedan";
}

/** A bus's size class follows from its seats. */
export function busTypeFor(seats: number | null | undefined): BusType {
  const n = seats ?? 0;
  if (n <= 15) return "minivan";
  if (n <= 30) return "coaster";
  if (n <= 45) return "midsize";
  return "fullsize";
}

/** National ID starts with 1, Iqama with 2; both are 10 digits. */
export function validSaudiId(input: string): boolean {
  return /^[12]\d{9}$/.test(input);
}

export function maskId(id: string | null | undefined): string {
  if (!id) return "—";
  return `${id.slice(0, 1)}${"•".repeat(Math.max(0, id.length - 3))}${id.slice(-2)}`;
}
