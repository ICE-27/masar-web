import { z } from "zod";

/** Arabic-Indic and Eastern Arabic-Indic digits to ASCII, so "٠٥٥..." works. */
export function toAsciiDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/**
 * Accepts the ways Saudis actually type a mobile number — 05XXXXXXXX,
 * 5XXXXXXXX, +9665XXXXXXXX, 009665XXXXXXXX, with spaces or dashes — and
 * returns +9665XXXXXXXX, or null if it isn't a Saudi mobile.
 */
export function normalizeSaudiMobile(input: string): string | null {
  const digits = toAsciiDigits(input).replace(/[\s\-().]/g, "");
  const m =
    digits.match(/^(?:\+966|00966|966)?0?(5\d{8})$/) ?? null;
  return m ? `+966${m[1]}` : null;
}

/** +966512345678 -> 051 234 5678 (local display) */
export function formatSaudiMobile(e164: string | null | undefined): string {
  if (!e164) return "";
  const m = e164.match(/^\+966(5\d)(\d{3})(\d{4})$/);
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : e164;
}

/** Whole years between a YYYY-MM-DD birth date and today (Riyadh time). */
export function ageFrom(dateOfBirth: string, today: Date = new Date()): number | null {
  const m = String(dateOfBirth ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const [, y, mo, d] = m.map(Number);
  const riyadh = new Date(today.getTime() + 3 * 60 * 60 * 1000);
  const ty = riyadh.getUTCFullYear();
  const tm = riyadh.getUTCMonth() + 1;
  const td = riyadh.getUTCDate();
  let age = ty - y;
  if (tm < mo || (tm === mo && td < d)) age -= 1;
  return age;
}

export function todayIso(today: Date = new Date()): string {
  const riyadh = new Date(today.getTime() + 3 * 60 * 60 * 1000);
  return riyadh.toISOString().slice(0, 10);
}

/** Saudi National Address short code: 4 letters + 4 digits, e.g. RRRD2929 */
export function normalizeNationalAddress(input: string): string | null {
  const v = toAsciiDigits(input).replace(/\s/g, "").toUpperCase();
  if (!v) return null;
  return /^[A-Z]{4}\d{4}$/.test(v) ? v : null;
}

export const MIN_CHILD_AGE = 3;
export const MAX_CHILD_AGE = 18;

// Error keys below are looked up in messages.app.errors
export const signUpSchema = z.object({
  fullName: z.string().trim().min(2, "nameShort").max(120, "nameLong"),
  email: z.string().trim().toLowerCase().email("emailInvalid"),
  password: z
    .string()
    .min(8, "passwordShort")
    .regex(/[A-Za-z]/, "passwordWeak")
    .regex(/\d/, "passwordWeak"),
  terms: z.literal(true, { message: "termsRequired" }),
  privacy: z.literal(true, { message: "privacyRequired" }),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("emailInvalid"),
  password: z.string().min(1, "passwordRequired"),
});

const optionalPhone = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (!v) return null;
    const n = normalizeSaudiMobile(v);
    if (!n) {
      ctx.addIssue({ code: "custom", message: "phoneInvalid" });
      return z.NEVER;
    }
    return n;
  });

export const pickupSchema = z.object({
  name: z.string().trim().min(2, "nameShort").max(80, "nameLong"),
  phone: z
    .string()
    .trim()
    .transform((v, ctx) => {
      const n = normalizeSaudiMobile(v);
      if (!n) {
        ctx.addIssue({ code: "custom", message: "phoneInvalid" });
        return z.NEVER;
      }
      return n;
    }),
  relation: z.string().trim().max(40, "tooLong"),
});

export const childSchema = z.object({
  fullName: z.string().trim().min(2, "nameShort").max(80, "nameLong"),
  gender: z.enum(["boy", "girl"], { message: "genderRequired" }),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "dobRequired")
    .refine((v) => {
      const a = ageFrom(v);
      return a !== null && a >= MIN_CHILD_AGE && a <= MAX_CHILD_AGE;
    }, "dobRange"),
  schoolName: z.string().trim().max(120, "tooLong"),
  grade: z.string().trim().max(40, "tooLong"),
  driverNotes: z.string().trim().max(500, "tooLong"),
  medicalNotes: z.string().trim().max(500, "tooLong"),
  emergencyName: z.string().trim().max(80, "tooLong"),
  emergencyPhone: optionalPhone,
  authorizedPickups: z.array(pickupSchema).max(5),
});

export const addressDetailsSchema = z.object({
  city: z.string().trim().max(80, "tooLong"),
  district: z.string().trim().max(80, "tooLong"),
  street: z.string().trim().max(120, "tooLong"),
  buildingNo: z.string().trim().max(20, "tooLong"),
  floorApt: z.string().trim().max(40, "tooLong"),
  landmark: z.string().trim().max(300, "tooLong"),
  customLabel: z.string().trim().max(40, "tooLong"),
  nationalAddress: z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (!v) return null;
      const n = normalizeNationalAddress(v);
      if (!n) {
        ctx.addIssue({ code: "custom", message: "nationalAddressInvalid" });
        return z.NEVER;
      }
      return n;
    }),
});

/** Field -> first error key, for showing under each input. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Rough bounding box of the Eastern Province launch area. */
export const COVERAGE_BOUNDS = {
  south: 24.8,
  west: 48.5,
  north: 27.6,
  east: 50.6,
};

export function inCoverage(lat: number, lng: number): boolean {
  const b = COVERAGE_BOUNDS;
  return lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east;
}
