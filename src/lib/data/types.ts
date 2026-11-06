import type { Locale } from "@/lib/i18n";

export type Role = "parent" | "driver" | "admin";
export type OnboardingStep = 1 | 2 | 3 | 4;

export interface AuthUser {
  id: string;
  email: string;
}

export interface Profile {
  id: string;
  email: string;
  role: Role;
  fullName: string | null;
  phone: string | null;
  phoneVerifiedAt: string | null;
  preferredLocale: Locale;
  onboardingStep: OnboardingStep;
  onboardingCompletedAt: string | null;
  createdAt: string;
}

export type ProfilePatch = Partial<
  Pick<
    Profile,
    | "fullName"
    | "phone"
    | "preferredLocale"
    | "onboardingStep"
    | "onboardingCompletedAt"
  >
>;

export type AddressLabel = "home" | "grandparents" | "other";

export interface Address {
  id: string;
  label: AddressLabel;
  customLabel: string | null;
  lat: number;
  lng: number;
  accuracyM: number | null;
  city: string | null;
  district: string | null;
  street: string | null;
  buildingNo: string | null;
  floorApt: string | null;
  landmark: string | null;
  nationalAddress: string | null;
  isDefault: boolean;
  createdAt: string;
}

export type AddressInput = Omit<Address, "id" | "isDefault" | "createdAt"> & {
  id?: string;
  isDefault?: boolean;
};

export interface Pickup {
  name: string;
  phone: string;
  relation: string;
}

export type Gender = "boy" | "girl";

export interface Child {
  id: string;
  fullName: string;
  gender: Gender;
  dateOfBirth: string; // YYYY-MM-DD
  schoolName: string | null;
  destinationId: string | null;
  grade: string | null;
  driverNotes: string | null;
  medicalNotes: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  authorizedPickups: Pickup[];
  createdAt: string;
}

export type ChildInput = Omit<Child, "id" | "createdAt"> & { id?: string };

export interface Destination {
  id: string;
  nameEn: string;
  nameAr: string;
  city: string;
  kind: "school" | "tutoring" | "sports" | "other";
}

export type ConsentKind = "terms" | "privacy" | "whatsapp";

export interface Consent {
  kind: ConsentKind;
  version: string;
  granted: boolean;
  createdAt: string;
}

export interface OtpRequest {
  expiresAt: string;
  cooldownSeconds: number;
  /** Shown on screen while demo mode is on. Later it goes out over WhatsApp. */
  demoCode: string | null;
}

export interface OtpResult {
  ok: boolean;
  attemptsLeft?: number;
}

/**
 * Every failure the UI knows how to explain. Database and auth errors are
 * mapped onto these, so the screens never show raw provider messages.
 */
export type DataErrorCode =
  | "invalid_credentials"
  | "email_taken"
  | "email_invalid"
  | "weak_password"
  | "email_not_confirmed"
  | "rate_limited"
  | "not_signed_in"
  | "phone_invalid"
  | "phone_taken"
  | "otp_cooldown"
  | "otp_rate_limited"
  | "otp_missing"
  | "otp_expired"
  | "otp_too_many_attempts"
  | "address_limit"
  | "child_limit"
  | "dob_in_future"
  | "network"
  | "unknown";

export class DataError extends Error {
  constructor(
    public code: DataErrorCode,
    public detail?: string,
  ) {
    super(code);
    this.name = "DataError";
  }
}

export interface SignUpInput {
  email: string;
  password: string;
  fullName: string;
  locale: Locale;
}

export interface Backend {
  /** "supabase" when the env vars are set; "local" keeps everything in this browser. */
  readonly mode: "supabase" | "local";

  getUser(): Promise<AuthUser | null>;
  onAuthChange(callback: () => void): () => void;
  signUp(input: SignUpInput): Promise<{ needsEmailConfirmation: boolean }>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;

  getProfile(): Promise<Profile | null>;
  updateProfile(patch: ProfilePatch): Promise<Profile>;

  listConsents(): Promise<Consent[]>;
  recordConsents(items: { kind: ConsentKind; granted: boolean }[]): Promise<void>;

  requestPhoneOtp(phone: string): Promise<OtpRequest>;
  verifyPhoneOtp(code: string): Promise<OtpResult>;

  listAddresses(): Promise<Address[]>;
  saveAddress(input: AddressInput): Promise<Address>;
  deleteAddress(id: string): Promise<void>;

  listChildren(): Promise<Child[]>;
  saveChild(input: ChildInput): Promise<Child>;
  deleteChild(id: string): Promise<void>;

  listDestinations(): Promise<Destination[]>;

  deleteAccount(): Promise<void>;
}
