import { beforeEach, describe, expect, it } from "vitest";
import { createLocalBackend, memoryStore } from "@/lib/data/local";
import { DataError, type AddressInput, type Backend } from "@/lib/data/types";

const addr = (city: string): AddressInput => ({
  label: "home", customLabel: null, lat: 26.3, lng: 50.2, accuracyM: null, city,
  district: null, street: null, buildingNo: null, floorApt: null, landmark: null, nationalAddress: null,
});

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof DataError && e.code === code);
}

describe("local demo backend", () => {
  let clock = 1_800_000_000_000;
  let store = memoryStore();
  let b: Backend;
  beforeEach(() => {
    clock = 1_800_000_000_000;
    store = memoryStore();
    b = createLocalBackend({ store, latency: 0, now: () => clock });
  });

  it("signs up, signs out and back in", async () => {
    await b.signUp({ email: "a@x.com", password: "masar2026", fullName: "Sara", locale: "en" });
    expect((await b.getProfile())?.fullName).toBe("Sara");
    await b.signOut();
    expect(await b.getUser()).toBeNull();
    await expectCode(b.signIn("a@x.com", "wrong"), "invalid_credentials");
    await b.signIn("A@x.com", "masar2026");
    expect((await b.getUser())?.email).toBe("a@x.com");
  });

  it("refuses a duplicate email", async () => {
    await b.signUp({ email: "a@x.com", password: "masar2026", fullName: "Sara", locale: "en" });
    await expectCode(b.signUp({ email: "a@x.com", password: "masar2026", fullName: "X Y", locale: "en" }), "email_taken");
  });

  it("verifies a phone with cooldown, attempts and one account per number", async () => {
    await b.signUp({ email: "a@x.com", password: "masar2026", fullName: "Sara", locale: "en" });
    const otp = await b.requestPhoneOtp("+966512345678");
    expect(otp.demoCode).toMatch(/^\d{6}$/);
    await expectCode(b.requestPhoneOtp("+966512345678"), "otp_cooldown");
    expect(await b.verifyPhoneOtp("nope")).toEqual({ ok: false, attemptsLeft: 4 });
    expect((await b.verifyPhoneOtp(otp.demoCode!)).ok).toBe(true);
    expect((await b.getProfile())?.phoneVerifiedAt).not.toBeNull();

    await b.signOut();
    await b.signUp({ email: "b@x.com", password: "masar2026", fullName: "Omar", locale: "ar" });
    await expectCode(b.requestPhoneOtp("+966512345678"), "phone_taken");
  });

  it("expires codes", async () => {
    await b.signUp({ email: "a@x.com", password: "masar2026", fullName: "Sara", locale: "en" });
    const otp = await b.requestPhoneOtp("+966512345678");
    clock += 6 * 60 * 1000;
    await expectCode(b.verifyPhoneOtp(otp.demoCode!), "otp_expired");
  });

  it("changing the number clears verification", async () => {
    await b.signUp({ email: "a@x.com", password: "masar2026", fullName: "Sara", locale: "en" });
    const otp = await b.requestPhoneOtp("+966512345678");
    await b.verifyPhoneOtp(otp.demoCode!);
    const p = await b.updateProfile({ phone: "+966599999999" });
    expect(p.phoneVerifiedAt).toBeNull();
  });

  it("keeps exactly one default address", async () => {
    await b.signUp({ email: "a@x.com", password: "masar2026", fullName: "Sara", locale: "en" });
    const home = await b.saveAddress(addr("Khobar"));
    expect(home.isDefault).toBe(true);
    clock += 1000;
    const g = await b.saveAddress({ ...addr("Dammam"), isDefault: true });
    let list = await b.listAddresses();
    expect(list.filter((a) => a.isDefault).map((a) => a.city)).toEqual(["Dammam"]);
    await b.deleteAddress(g.id);
    list = await b.listAddresses();
    expect(list.map((a) => [a.city, a.isDefault])).toEqual([["Khobar", true]]);
  });

  it("keeps each parent's data separate and deletes it with the account", async () => {
    await b.signUp({ email: "a@x.com", password: "masar2026", fullName: "Sara", locale: "en" });
    await b.saveChild({
      fullName: "Layan", gender: "girl", dateOfBirth: "2017-03-04", schoolName: null, destinationId: null,
      grade: null, driverNotes: null, medicalNotes: null, emergencyName: null, emergencyPhone: null, authorizedPickups: [],
    });
    await b.signOut();
    await b.signUp({ email: "b@x.com", password: "masar2026", fullName: "Omar", locale: "ar" });
    expect(await b.listChildren()).toHaveLength(0);
    await b.deleteAccount();
    await b.signIn("a@x.com", "masar2026");
    expect(await b.listChildren()).toHaveLength(1);
    await b.deleteAccount();
    expect(JSON.parse(store.get("masar-demo-db")!).children).toHaveLength(0);
  });
});
