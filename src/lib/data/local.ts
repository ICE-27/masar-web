/**
 * In-browser demo backend.
 *
 * Used when Supabase isn't configured (the shareable preview, or a fresh clone
 * with no .env). It follows the same rules as the SQL in
 * supabase/migrations/0001_parent_onboarding.sql — one verified account per
 * number, code cooldowns and expiry, first address becomes the default, limits —
 * so the screens behave identically against either backend.
 *
 * Everything lives in this browser's storage. Nothing leaves the device.
 */
import type {
  Address,
  AddressInput,
  AuthUser,
  Backend,
  Child,
  ChildInput,
  Consent,
  ConsentKind,
  Destination,
  OtpRequest,
  OtpResult,
  Profile,
  ProfilePatch,
  SignUpInput,
} from "./types";
import type { OpsBackend } from "./ops-types";
import { DataError } from "./types";
import { DESTINATIONS } from "./destinations";

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

/** localStorage, falling back to memory when storage is blocked or throws. */
export function browserStore(): KeyValueStore {
  const memory = new Map<string, string>();
  const ls = (): Storage | null => {
    try {
      return typeof window !== "undefined" ? window.localStorage : null;
    } catch {
      return null;
    }
  };
  return {
    get(key) {
      try {
        return ls()?.getItem(key) ?? memory.get(key) ?? null;
      } catch {
        return memory.get(key) ?? null;
      }
    },
    set(key, value) {
      memory.set(key, value);
      try {
        ls()?.setItem(key, value);
      } catch {
        /* memory only */
      }
    },
    remove(key) {
      memory.delete(key);
      try {
        ls()?.removeItem(key);
      } catch {
        /* memory only */
      }
    },
  };
}

export function memoryStore(): KeyValueStore {
  const m = new Map<string, string>();
  return {
    get: (k) => m.get(k) ?? null,
    set: (k, v) => void m.set(k, v),
    remove: (k) => void m.delete(k),
  };
}

interface StoredUser {
  id: string;
  email: string;
  passwordHash: string;
}

interface StoredOtp {
  userId: string;
  phone: string;
  code: string;
  expiresAt: number;
  attempts: number;
  consumedAt: number | null;
  createdAt: number;
}

interface Db {
  version: 1;
  users: StoredUser[];
  profiles: Profile[];
  consents: (Consent & { userId: string })[];
  addresses: (Address & { parentId: string })[];
  children: (Child & { parentId: string })[];
  otps: StoredOtp[];
}

const DB_KEY = "masar-demo-db";
const SESSION_KEY = "masar-demo-session";
const EVENT = "masar-demo-auth";

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_COOLDOWN_S = 30;
const OTP_MAX_PER_HOUR = 5;
const MAX_ADDRESSES = 10;
const MAX_CHILDREN = 10;

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

async function hash(text: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  return `plain:${text}`;
}

export interface LocalOptions {
  store?: KeyValueStore;
  /** Simulated network delay in ms; 0 in tests. */
  latency?: number;
  now?: () => number;
}

export function createLocalBackend(options: LocalOptions = {}): Backend {
  const store = options.store ?? browserStore();
  const latency = options.latency ?? 220;
  const now = options.now ?? (() => Date.now());
  const listeners = new Set<() => void>();

  const wait = () =>
    latency > 0
      ? new Promise<void>((r) => setTimeout(r, latency * (0.6 + Math.random() * 0.8)))
      : Promise.resolve();

  function load(): Db {
    const raw = store.get(DB_KEY);
    if (raw) {
      try {
        const db = JSON.parse(raw) as Db;
        if (db.version === 1) return db;
      } catch {
        /* start over */
      }
    }
    return {
      version: 1,
      users: [],
      profiles: [],
      consents: [],
      addresses: [],
      children: [],
      otps: [],
    };
  }

  function save(db: Db) {
    store.set(DB_KEY, JSON.stringify(db));
  }

  function sessionUserId(): string | null {
    return store.get(SESSION_KEY);
  }

  function emit() {
    listeners.forEach((l) => l());
    if (typeof window !== "undefined") {
      try {
        window.dispatchEvent(new Event(EVENT));
      } catch {
        /* ignore */
      }
    }
  }

  function requireUser(db: Db): StoredUser {
    const id = sessionUserId();
    const user = id ? db.users.find((u) => u.id === id) : undefined;
    if (!user) throw new DataError("not_signed_in");
    return user;
  }

  function iso(ms: number) {
    return new Date(ms).toISOString();
  }

  function strip<T extends { parentId: string }>(row: T): Omit<T, "parentId"> {
    const { parentId: _ignored, ...rest } = row;
    void _ignored;
    return rest;
  }

  return {
    ...localOpsUnavailable(),
    mode: "local",

    async getUser(): Promise<AuthUser | null> {
      const db = load();
      const id = sessionUserId();
      const u = id ? db.users.find((x) => x.id === id) : undefined;
      return u ? { id: u.id, email: u.email } : null;
    },

    onAuthChange(callback) {
      listeners.add(callback);
      const onStorage = (e: StorageEvent) => {
        if (e.key === SESSION_KEY) callback();
      };
      if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(callback);
        if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
      };
    },

    async signUp(input: SignUpInput) {
      await wait();
      const db = load();
      const email = input.email.trim().toLowerCase();
      if (db.users.some((u) => u.email === email)) throw new DataError("email_taken");
      const id = uuid();
      db.users.push({ id, email, passwordHash: await hash(`${email}:${input.password}`) });
      db.profiles.push({
        id,
        email,
        role: input.role === "driver" ? "driver" : "parent",
        fullName: input.fullName.trim(),
        phone: null,
        phoneVerifiedAt: null,
        preferredLocale: input.locale,
        onboardingStep: 1,
        onboardingCompletedAt: null,
        createdAt: iso(now()),
      });
      save(db);
      store.set(SESSION_KEY, id);
      emit();
      return { needsEmailConfirmation: false };
    },

    async signIn(email, password) {
      await wait();
      const db = load();
      const e = email.trim().toLowerCase();
      const u = db.users.find((x) => x.email === e);
      if (!u || u.passwordHash !== (await hash(`${e}:${password}`))) {
        throw new DataError("invalid_credentials");
      }
      store.set(SESSION_KEY, u.id);
      emit();
    },

    async signOut() {
      store.remove(SESSION_KEY);
      emit();
    },

    async getProfile() {
      const db = load();
      const id = sessionUserId();
      return (id && db.profiles.find((p) => p.id === id)) || null;
    },

    async updateProfile(patch: ProfilePatch) {
      await wait();
      const db = load();
      const user = requireUser(db);
      const p = db.profiles.find((x) => x.id === user.id)!;
      if (patch.phone !== undefined && patch.phone !== p.phone) p.phoneVerifiedAt = null;
      Object.assign(p, patch);
      save(db);
      return p;
    },

    async listConsents() {
      const db = load();
      const user = requireUser(db);
      return db.consents
        .filter((c) => c.userId === user.id)
        .map(({ userId: _u, ...c }) => (void _u, c))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async recordConsents(items: { kind: ConsentKind; granted: boolean }[]) {
      const db = load();
      const user = requireUser(db);
      const at = iso(now());
      for (const item of items) {
        db.consents.push({ userId: user.id, version: "2026-11", createdAt: at, ...item });
      }
      save(db);
    },

    async requestPhoneOtp(phone: string): Promise<OtpRequest> {
      await wait();
      const db = load();
      const user = requireUser(db);
      if (!/^\+9665\d{8}$/.test(phone)) throw new DataError("phone_invalid");
      if (db.profiles.some((p) => p.phone === phone && p.phoneVerifiedAt && p.id !== user.id)) {
        throw new DataError("phone_taken");
      }
      const mine = db.otps.filter((o) => o.userId === user.id);
      const last = mine.reduce((m, o) => Math.max(m, o.createdAt), 0);
      const t = now();
      if (last && t - last < OTP_COOLDOWN_S * 1000) {
        throw new DataError(
          "otp_cooldown",
          String(Math.ceil((last + OTP_COOLDOWN_S * 1000 - t) / 1000)),
        );
      }
      if (mine.filter((o) => t - o.createdAt < 3600_000).length >= OTP_MAX_PER_HOUR) {
        throw new DataError("otp_rate_limited");
      }
      mine.forEach((o) => {
        if (!o.consumedAt) o.consumedAt = t;
      });
      const code = String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
      db.otps.push({
        userId: user.id,
        phone,
        code,
        expiresAt: t + OTP_TTL_MS,
        attempts: 0,
        consumedAt: null,
        createdAt: t,
      });
      save(db);
      return { expiresAt: iso(t + OTP_TTL_MS), cooldownSeconds: OTP_COOLDOWN_S, demoCode: code };
    },

    async verifyPhoneOtp(code: string): Promise<OtpResult> {
      await wait();
      const db = load();
      const user = requireUser(db);
      const otp = db.otps
        .filter((o) => o.userId === user.id && !o.consumedAt)
        .sort((a, b) => b.createdAt - a.createdAt)[0];
      if (!otp) throw new DataError("otp_missing");
      if (otp.expiresAt < now()) throw new DataError("otp_expired");
      if (otp.attempts >= 5) throw new DataError("otp_too_many_attempts");
      if (otp.code !== code) {
        otp.attempts += 1;
        save(db);
        return { ok: false, attemptsLeft: 5 - otp.attempts };
      }
      otp.consumedAt = now();
      if (db.profiles.some((p) => p.phone === otp.phone && p.phoneVerifiedAt && p.id !== user.id)) {
        save(db);
        throw new DataError("phone_taken");
      }
      const p = db.profiles.find((x) => x.id === user.id)!;
      p.phone = otp.phone;
      p.phoneVerifiedAt = iso(now());
      save(db);
      return { ok: true };
    },

    async listAddresses() {
      const db = load();
      const user = requireUser(db);
      return db.addresses
        .filter((a) => a.parentId === user.id)
        .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.createdAt.localeCompare(b.createdAt))
        .map(strip);
    },

    async saveAddress(input: AddressInput) {
      await wait();
      const db = load();
      const user = requireUser(db);
      const mine = db.addresses.filter((a) => a.parentId === user.id);
      let row: (typeof db.addresses)[number];
      if (input.id) {
        const existing = mine.find((a) => a.id === input.id);
        if (!existing) throw new DataError("unknown");
        Object.assign(existing, input, { isDefault: input.isDefault ?? existing.isDefault });
        row = existing;
      } else {
        if (mine.length >= MAX_ADDRESSES) throw new DataError("address_limit");
        row = {
          ...input,
          id: uuid(),
          parentId: user.id,
          isDefault: mine.length === 0 ? true : !!input.isDefault,
          createdAt: iso(now()),
        };
        db.addresses.push(row);
      }
      if (row.isDefault) {
        mine.forEach((a) => {
          if (a.id !== row.id) a.isDefault = false;
        });
      }
      save(db);
      return strip(row);
    },

    async deleteAddress(id: string) {
      await wait();
      const db = load();
      const user = requireUser(db);
      const row = db.addresses.find((a) => a.id === id && a.parentId === user.id);
      if (!row) return;
      db.addresses = db.addresses.filter((a) => a !== row);
      if (row.isDefault) {
        const next = db.addresses
          .filter((a) => a.parentId === user.id)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
        if (next) next.isDefault = true;
      }
      save(db);
    },

    async listChildren() {
      const db = load();
      const user = requireUser(db);
      return db.children
        .filter((c) => c.parentId === user.id)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map(strip);
    },

    async saveChild(input: ChildInput) {
      await wait();
      const db = load();
      const user = requireUser(db);
      if (input.dateOfBirth > new Date(now()).toISOString().slice(0, 10)) {
        throw new DataError("dob_in_future");
      }
      if (input.id) {
        const existing = db.children.find((c) => c.id === input.id && c.parentId === user.id);
        if (!existing) throw new DataError("unknown");
        Object.assign(existing, input);
        save(db);
        return strip(existing);
      }
      if (db.children.filter((c) => c.parentId === user.id).length >= MAX_CHILDREN) {
        throw new DataError("child_limit");
      }
      const row = { ...input, id: uuid(), parentId: user.id, createdAt: iso(now()) };
      db.children.push(row);
      save(db);
      return strip(row);
    },

    async deleteChild(id: string) {
      await wait();
      const db = load();
      const user = requireUser(db);
      db.children = db.children.filter((c) => !(c.id === id && c.parentId === user.id));
      save(db);
    },

    async listDestinations(): Promise<Destination[]> {
      return DESTINATIONS;
    },

    async deleteAccount() {
      await wait();
      const db = load();
      const user = requireUser(db);
      const keep = <T extends { userId?: string; parentId?: string; id?: string }>(rows: T[]) =>
        rows.filter((r) => r.userId !== user.id && r.parentId !== user.id);
      db.users = db.users.filter((u) => u.id !== user.id);
      db.profiles = db.profiles.filter((p) => p.id !== user.id);
      db.consents = keep(db.consents);
      db.addresses = keep(db.addresses);
      db.children = keep(db.children);
      db.otps = keep(db.otps);
      save(db);
      store.remove(SESSION_KEY);
      emit();
    },
  };
}

/**
 * Drivers, bookings and payments need the real database (Supabase): the
 * seat holds, ledger and verification rules live there. In the in-browser
 * demo store these explain that instead of pretending.
 */
function localOpsUnavailable(): OpsBackend {
  const no = () => Promise.reject(new DataError("needs_supabase"));
  return {
    driverApplication: no,
    saveApplication: no,
    uploadDocument: no,
    updateDocumentExpiry: no,
    submitApplication: no,
    fileUrl: () => Promise.resolve(null),
    mediaUrl: (p) => (p && p.startsWith("/") ? p : null),
    notifications: () => Promise.resolve([]),
    markNotificationsRead: () => Promise.resolve(),
    driverServices: no,
    driverService: no,
    saveService: no,
    checkService: no,
    archiveService: no,
    addDestination: no,
    listDestinationsGeo: no,
    listDistricts: no,
    checkHours: no,
    saveHours: no,
    blockedDates: no,
    blockDates: no,
    unblock: no,
    setDay: no,
    driverCalendar: no,
    searchServices: no,
    getService: no,
    quoteBooking: no,
    createBooking: no,
    getBooking: no,
    myBookings: () => Promise.resolve([]),
    driverBookings: no,
    respond: no,
    payBooking: no,
    cancelPreview: no,
    cancelBooking: no,
    wallet: no,
    invoice: no,
    earnings: no,
    adminOverview: no,
    adminDriverQueue: no,
    adminDriver: no,
    reviewDocument: no,
    decideDriver: no,
    adminBookings: no,
    adminSettings: no,
    saveSettings: no,
    payoutRun: no,
    payoutRuns: no,
  };
}
