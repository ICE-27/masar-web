import type { DocKind, DriverApplication } from "@/lib/data";
import type { AppMessages } from "@/lib/messages/app.en";

export function docLabel(m: AppMessages, kind: DocKind): string {
  const D = m.ops.dw;
  const map: Record<DocKind, string> = {
    profile_photo: D.account.photo,
    id_front: D.identity.idFront,
    id_back: D.identity.idBack,
    selfie: D.identity.selfie,
    police: D.identity.police,
    licence: D.licence.image,
    istimara: D.vehicle.istimara,
    insurance: D.vehicle.insurance,
    fahas: D.vehicle.fahas,
    tga_card: D.vehicle.tga,
    first_aid: D.vehicle.firstAid,
    car_front: D.vehicle.front,
    car_back: D.vehicle.back,
    car_side: D.vehicle.side,
    car_interior: D.vehicle.interior,
  };
  return map[kind];
}

export type WizardSection = "account" | "identity" | "licence" | "vehicle" | "pricing" | "payout" | "hours" | "review";
export const SECTIONS: WizardSection[] = ["account", "identity", "licence", "vehicle", "pricing", "payout", "hours", "review"];

export const SECTION_DOCS: Partial<Record<WizardSection, DocKind[]>> = {
  account: ["profile_photo"],
  identity: ["id_front", "id_back", "selfie", "police"],
  licence: ["licence"],
  vehicle: ["istimara", "insurance", "fahas", "tga_card", "first_aid", "car_front", "car_back", "car_side", "car_interior"],
};

/** What is still missing, section by section (mirrors public.driver_submit). */
export function missingSections(app: DriverApplication): { section: WizardSection; docs: DocKind[] }[] {
  const d = app.driver;
  const v = app.vehicle;
  const have = new Set(app.documents.map((x) => x.kind));
  const required = new Set(app.requiredDocs.length ? app.requiredDocs : []);
  const out: { section: WizardSection; docs: DocKind[] }[] = [];
  const docsFor = (s: WizardSection) => (SECTION_DOCS[s] ?? []).filter((k) => (required.size ? required.has(k) : true) && !have.has(k));
  const push = (section: WizardSection, fieldsMissing: boolean) => {
    const docs = docsFor(section);
    if (fieldsMissing || docs.length) out.push({ section, docs });
  };
  push("account", !d.phoneVerified || !d.nameAr || !d.nameEn || !d.gender || !d.dateOfBirth || !d.city);
  push("identity", !d.idNumber || !d.idExpiry || !d.policeIssued);
  push("licence", !d.licenceNumber || !d.licenceType || !d.licenceExpiry);
  push("vehicle", !v || !v.seats || !v.plateDigits || !v.plateLetters || !v.make);
  if (!app.pricing.some((p) => p.enabled)) out.push({ section: "pricing", docs: [] });
  if (!d.iban || !d.accountHolder) out.push({ section: "payout", docs: [] });
  if (!app.hours.length && !app.futureHours.length) out.push({ section: "hours", docs: [] });
  return out;
}

export const NATIONALITIES = [
  "Saudi", "Egyptian", "Sudanese", "Yemeni", "Jordanian", "Syrian", "Pakistani", "Indian", "Bangladeshi", "Filipino", "Other",
];
export const NATIONALITIES_AR: Record<string, string> = {
  Saudi: "سعودي", Egyptian: "مصري", Sudanese: "سوداني", Yemeni: "يمني", Jordanian: "أردني", Syrian: "سوري",
  Pakistani: "باكستاني", Indian: "هندي", Bangladeshi: "بنغلاديشي", Filipino: "فلبيني", Other: "أخرى",
};
export const CITIES = ["Dammam", "Khobar", "Dhahran", "Qatif", "Jubail", "Al Ahsa"];
export const CITIES_AR: Record<string, string> = {
  Dammam: "الدمام", Khobar: "الخبر", Dhahran: "الظهران", Qatif: "القطيف", Jubail: "الجبيل", "Al Ahsa": "الأحساء",
};
export const COLORS = ["White", "Silver", "Grey", "Black", "Pearl", "Blue", "Red", "Gold", "Beige", "Yellow", "Green", "Brown"];
export const COLORS_AR: Record<string, string> = {
  White: "أبيض", Silver: "فضي", Grey: "رمادي", Black: "أسود", Pearl: "لؤلؤي", Blue: "أزرق", Red: "أحمر",
  Gold: "ذهبي", Beige: "بيج", Yellow: "أصفر", Green: "أخضر", Brown: "بني",
};
