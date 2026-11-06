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
export function normalizeIban(input: string): string {
  return input
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/\s+/g, "")
    .toUpperCase();
}

export function ibanValid(input: string): boolean {
  const iban = normalizeIban(input);
  if (!/^SA\d{22}$/.test(iban)) return false;
  const s = iban.slice(4) + "2810" + iban.slice(2, 4);
  let r = 0;
  for (const ch of s) r = (r * 10 + Number(ch)) % 97;
  return r === 1;
}

export function formatIban(input: string): string {
  return normalizeIban(input).replace(/(.{4})/g, "$1 ").trim();
}

/** Saudi bank codes (IBAN digits 5-6). */
const BANKS: Record<string, { en: string; ar: string }> = {
  "10": { en: "Saudi National Bank", ar: "البنك الأهلي السعودي" },
  "15": { en: "Bank Albilad", ar: "بنك البلاد" },
  "20": { en: "Riyad Bank", ar: "بنك الرياض" },
  "30": { en: "Arab National Bank", ar: "البنك العربي الوطني" },
  "40": { en: "Saudi Awwal Bank (SAB)", ar: "البنك السعودي الأول" },
  "45": { en: "Saudi Awwal Bank (SAB)", ar: "البنك السعودي الأول" },
  "50": { en: "Alawwal (SAB)", ar: "البنك السعودي الأول" },
  "55": { en: "Banque Saudi Fransi", ar: "البنك السعودي الفرنسي" },
  "60": { en: "Bank AlJazira", ar: "بنك الجزيرة" },
  "65": { en: "Saudi Investment Bank", ar: "البنك السعودي للاستثمار" },
  "80": { en: "Al Rajhi Bank", ar: "مصرف الراجحي" },
  "05": { en: "Alinma Bank", ar: "مصرف الإنماء" },
  "90": { en: "Gulf International Bank", ar: "بنك الخليج الدولي" },
};

export function bankFromIban(input: string): { en: string; ar: string } | null {
  const iban = normalizeIban(input);
  if (!/^SA\d{4}/.test(iban)) return null;
  return BANKS[iban.slice(4, 6)] ?? null;
}

/** National ID starts with 1, Iqama with 2; both are 10 digits. */
export function validSaudiId(input: string): boolean {
  return /^[12]\d{9}$/.test(input);
}

export function maskId(id: string | null | undefined): string {
  if (!id) return "—";
  return `${id.slice(0, 1)}${"•".repeat(Math.max(0, id.length - 3))}${id.slice(-2)}`;
}
