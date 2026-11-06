import { describe, expect, it } from "vitest";
import {
  ageFrom,
  childSchema,
  formatSaudiMobile,
  inCoverage,
  normalizeNationalAddress,
  normalizeSaudiMobile,
  signUpSchema,
} from "@/lib/validation";

describe("Saudi mobile numbers", () => {
  it.each([
    ["0512345678", "+966512345678"],
    ["512345678", "+966512345678"],
    ["+966 51 234 5678", "+966512345678"],
    ["00966512345678", "+966512345678"],
    ["966-51-234-5678", "+966512345678"],
    ["٠٥١٢٣٤٥٦٧٨", "+966512345678"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeSaudiMobile(input)).toBe(expected);
  });

  it.each(["0412345678", "05123", "+971512345678", "abc", ""])("rejects %s", (input) => {
    expect(normalizeSaudiMobile(input)).toBeNull();
  });

  it("formats for display", () => {
    expect(formatSaudiMobile("+966512345678")).toBe("051 234 5678");
  });
});

describe("ages", () => {
  const today = new Date("2026-11-06T09:00:00Z");
  it("counts whole years", () => {
    expect(ageFrom("2017-11-06", today)).toBe(9);
    expect(ageFrom("2017-11-07", today)).toBe(8);
  });
  it("uses Riyadh time near midnight UTC", () => {
    // 22:30 UTC on the 5th is already the 6th in Riyadh
    expect(ageFrom("2017-11-06", new Date("2026-11-05T22:30:00Z"))).toBe(9);
  });
});

describe("national address", () => {
  it("accepts and uppercases short codes", () => {
    expect(normalizeNationalAddress("rrrd 2929")).toBe("RRRD2929");
  });
  it("rejects other shapes", () => {
    expect(normalizeNationalAddress("RRR2929")).toBeNull();
  });
});

describe("sign-up", () => {
  const base = { fullName: "Sara Ahmed", email: "Sara@Example.com", password: "masar2026", terms: true, privacy: true };
  it("accepts a valid form and lowercases the email", () => {
    const r = signUpSchema.safeParse(base);
    expect(r.success && r.data.email).toBe("sara@example.com");
  });
  it("requires both consents", () => {
    expect(signUpSchema.safeParse({ ...base, privacy: false }).success).toBe(false);
  });
  it("requires a letter and a digit", () => {
    expect(signUpSchema.safeParse({ ...base, password: "abcdefgh" }).success).toBe(false);
  });
});

describe("child", () => {
  const base = {
    fullName: "Layan", gender: "girl", dateOfBirth: "2017-03-04", schoolName: "", grade: "",
    driverNotes: "", medicalNotes: "", emergencyName: "", emergencyPhone: "", authorizedPickups: [],
  };
  it("accepts a school-age child and leaves the phone empty", () => {
    const r = childSchema.safeParse(base);
    expect(r.success && r.data.emergencyPhone).toBeNull();
  });
  it("rejects a toddler", () => {
    expect(childSchema.safeParse({ ...base, dateOfBirth: "2025-01-01" }).success).toBe(false);
  });
  it("normalizes pick-up numbers", () => {
    const r = childSchema.safeParse({ ...base, authorizedPickups: [{ name: "Grandma", phone: "0551112222", relation: "" }] });
    expect(r.success && r.data.authorizedPickups[0].phone).toBe("+966551112222");
  });
});

describe("coverage", () => {
  it("includes Khobar and Al-Ahsa, excludes Riyadh", () => {
    expect(inCoverage(26.28, 50.21)).toBe(true);
    expect(inCoverage(25.38, 49.59)).toBe(true);
    expect(inCoverage(24.71, 46.67)).toBe(false);
  });
});
