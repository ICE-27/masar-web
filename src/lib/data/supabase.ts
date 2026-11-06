import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  Address,
  AddressInput,
  Backend,
  DocKind,
  DriverApplication,
  Child,
  ChildInput,
  Consent,
  DataErrorCode,
  Destination,
  Profile,
  ProfilePatch,
} from "./types";
import { DataError, MEDIA_KINDS } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any -- rows are mapped explicitly below */

const KNOWN: DataErrorCode[] = [
  "not_signed_in",
  "phone_invalid",
  "phone_taken",
  "otp_cooldown",
  "otp_rate_limited",
  "otp_missing",
  "otp_expired",
  "otp_too_many_attempts",
  "address_limit",
  "child_limit",
  "dob_in_future",
];

/** Turn Supabase auth and database errors into codes the UI can explain. */
function mapError(error: any): DataError {
  if (!error) return new DataError("unknown");
  const msg = String(error.message ?? "");
  const code = String(error.code ?? "");
  const known = KNOWN.find((k) => msg === k || msg.startsWith(`${k}`));
  if (known) return new DataError(known, error.details ?? undefined);
  // Every rule in the database raises its own short code (P0001), e.g.
  // "no_seats", "schedule_conflict"; details carry the specifics.
  if (code === "P0001" && /^[a-z_]+$/.test(msg)) return new DataError(msg, error.details ?? undefined);

  switch (code) {
    case "invalid_credentials":
      return new DataError("invalid_credentials");
    case "user_already_exists":
    case "email_exists":
      return new DataError("email_taken");
    case "email_address_invalid":
    case "validation_failed":
      return new DataError("email_invalid");
    case "weak_password":
      return new DataError("weak_password");
    case "email_not_confirmed":
      return new DataError("email_not_confirmed");
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return new DataError("rate_limited");
  }
  if (/invalid login credentials/i.test(msg)) return new DataError("invalid_credentials");
  if (/already registered/i.test(msg)) return new DataError("email_taken");
  if (/failed to fetch|network/i.test(msg)) return new DataError("network");
  return new DataError("unknown", msg);
}

function toProfile(row: any, email: string): Profile {
  return {
    id: row.id,
    email,
    role: row.role,
    fullName: row.full_name,
    phone: row.phone,
    phoneVerifiedAt: row.phone_verified_at,
    preferredLocale: row.preferred_locale,
    onboardingStep: row.onboarding_step,
    onboardingCompletedAt: row.onboarding_completed_at,
    createdAt: row.created_at,
  };
}

function toAddress(r: any): Address {
  return {
    id: r.id,
    label: r.label,
    customLabel: r.custom_label,
    lat: r.lat,
    lng: r.lng,
    accuracyM: r.accuracy_m,
    city: r.city,
    district: r.district,
    street: r.street,
    buildingNo: r.building_no,
    floorApt: r.floor_apt,
    landmark: r.landmark,
    nationalAddress: r.national_address,
    isDefault: r.is_default,
    createdAt: r.created_at,
  };
}

function fromAddress(a: AddressInput) {
  return {
    label: a.label,
    custom_label: a.customLabel,
    lat: a.lat,
    lng: a.lng,
    accuracy_m: a.accuracyM,
    city: a.city,
    district: a.district,
    street: a.street,
    building_no: a.buildingNo,
    floor_apt: a.floorApt,
    landmark: a.landmark,
    national_address: a.nationalAddress,
    ...(a.isDefault !== undefined ? { is_default: a.isDefault } : {}),
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toChild(r: any): Child {
  return {
    id: r.id,
    fullName: r.full_name,
    gender: r.gender,
    dateOfBirth: r.date_of_birth,
    schoolName: r.school_name,
    destinationId: r.destination_id,
    grade: r.grade,
    driverNotes: r.driver_notes,
    medicalNotes: r.medical_notes,
    emergencyName: r.emergency_name,
    emergencyPhone: r.emergency_phone,
    authorizedPickups: Array.isArray(r.authorized_pickups) ? r.authorized_pickups : [],
    createdAt: r.created_at,
  };
}

function fromChild(c: ChildInput) {
  return {
    full_name: c.fullName,
    gender: c.gender,
    date_of_birth: c.dateOfBirth,
    school_name: c.schoolName,
    destination_id: c.destinationId && UUID.test(c.destinationId) ? c.destinationId : null,
    grade: c.grade,
    driver_notes: c.driverNotes,
    medical_notes: c.medicalNotes,
    emergency_name: c.emergencyName,
    emergency_phone: c.emergencyPhone,
    authorized_pickups: c.authorizedPickups,
  };
}

/** Accepts the project URL with or without a trailing /rest/v1/. */
export function normalizeSupabaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
}

export function createSupabaseBackend(url: string, anonKey: string): Backend {
  const sb: SupabaseClient = createClient(normalizeSupabaseUrl(url), anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: "masar-auth" },
  });

  async function uid(): Promise<{ id: string; email: string }> {
    const { data } = await sb.auth.getSession();
    const u = data.session?.user;
    if (!u) throw new DataError("not_signed_in");
    return { id: u.id, email: u.email ?? "" };
  }

  async function run<T = any>(p: PromiseLike<{ data: any; error: any }>): Promise<T> {
    let result: { data: any; error: any };
    try {
      result = await p;
    } catch (e) {
      throw mapError(e);
    }
    if (result.error) throw mapError(result.error);
    return result.data;
  }

  /** Call a database function; its JSON comes back in the app's own shape. */
  function rpc<T = any>(name: string, args?: Record<string, unknown>): Promise<T> {
    return run<T>(sb.rpc(name, args ?? {}));
  }

  return {
    mode: "supabase",

    async getUser() {
      const { data } = await sb.auth.getSession();
      const u = data.session?.user;
      return u ? { id: u.id, email: u.email ?? "" } : null;
    },

    onAuthChange(callback) {
      const { data } = sb.auth.onAuthStateChange((event) => {
        if (event !== "TOKEN_REFRESHED") callback();
      });
      return () => data.subscription.unsubscribe();
    },

    async signUp({ email, password, fullName, locale, role }) {
      const data = await run(
        sb.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: { data: { full_name: fullName.trim(), locale, role: role === "driver" ? "driver" : "parent" } },
        }),
      );
      // With "Confirm email" on, Supabase hides existing accounts behind an
      // empty identities list instead of an error.
      if (data.user && data.user.identities?.length === 0) throw new DataError("email_taken");
      return { needsEmailConfirmation: !data.session };
    },

    async signIn(email, password) {
      await run(sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password }));
    },

    async signOut() {
      await sb.auth.signOut();
    },

    async getProfile() {
      const { data } = await sb.auth.getSession();
      const u = data.session?.user;
      if (!u) return null;
      const row = await run(sb.from("profiles").select("*").eq("id", u.id).maybeSingle());
      return row ? toProfile(row, u.email ?? "") : null;
    },

    async updateProfile(patch: ProfilePatch) {
      const u = await uid();
      const body: Record<string, unknown> = {};
      if (patch.fullName !== undefined) body.full_name = patch.fullName;
      if (patch.phone !== undefined) body.phone = patch.phone;
      if (patch.preferredLocale !== undefined) body.preferred_locale = patch.preferredLocale;
      if (patch.onboardingStep !== undefined) body.onboarding_step = patch.onboardingStep;
      if (patch.onboardingCompletedAt !== undefined)
        body.onboarding_completed_at = patch.onboardingCompletedAt;
      const row = await run(sb.from("profiles").update(body).eq("id", u.id).select("*").single());
      return toProfile(row, u.email);
    },

    async listConsents(): Promise<Consent[]> {
      const rows = await run(
        sb.from("consents").select("kind, version, granted, created_at").order("created_at", { ascending: false }),
      );
      return (rows ?? []).map((r: any) => ({
        kind: r.kind,
        version: r.version,
        granted: r.granted,
        createdAt: r.created_at,
      }));
    },

    async recordConsents(items) {
      if (!items.length) return;
      await run(sb.from("consents").insert(items.map((i) => ({ kind: i.kind, granted: i.granted }))));
    },

    async requestPhoneOtp(phone) {
      // Through our own API route, which can also send the code by WhatsApp.
      // If the route isn't there (static preview), ask the database directly.
      const { data: sess } = await sb.auth.getSession();
      const token = sess.session?.access_token;
      if (token && typeof window !== "undefined") {
        let res: Response | null = null;
        try {
          res = await fetch("/api/send-otp", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ phone }),
          });
        } catch {
          res = null;
        }
        if (res && res.status !== 404 && res.status !== 501 && res.status !== 405) {
          const r: any = await res.json().catch(() => ({}));
          if (!res.ok) throw mapError(r);
          return { expiresAt: r.expires_at, cooldownSeconds: r.cooldown_seconds, demoCode: r.demo_code ?? null, channel: r.channel };
        }
      }
      const r: any = await run(sb.rpc("request_phone_otp", { p_phone: phone }));
      return {
        expiresAt: r.expires_at,
        cooldownSeconds: r.cooldown_seconds,
        demoCode: r.demo_code ?? null,
        channel: "screen" as const,
      };
    },

    async verifyPhoneOtp(code) {
      const r: any = await run(sb.rpc("verify_phone_otp", { p_code: code }));
      return { ok: !!r.ok, attemptsLeft: r.attempts_left ?? undefined };
    },

    async listAddresses() {
      const rows = await run(
        sb
          .from("addresses")
          .select("*")
          .order("is_default", { ascending: false })
          .order("created_at", { ascending: true }),
      );
      return (rows ?? []).map(toAddress);
    },

    async saveAddress(input) {
      const body = fromAddress(input);
      const row = input.id
        ? await run(sb.from("addresses").update(body).eq("id", input.id).select("*").single())
        : await run(sb.from("addresses").insert(body).select("*").single());
      return toAddress(row);
    },

    async deleteAddress(id) {
      await run(sb.from("addresses").delete().eq("id", id));
    },

    async listChildren() {
      const rows = await run(sb.from("children").select("*").order("created_at", { ascending: true }));
      return (rows ?? []).map(toChild);
    },

    async saveChild(input) {
      const body = fromChild(input);
      const row = input.id
        ? await run(sb.from("children").update(body).eq("id", input.id).select("*").single())
        : await run(sb.from("children").insert(body).select("*").single());
      return toChild(row);
    },

    async deleteChild(id) {
      await run(sb.from("children").delete().eq("id", id));
    },

    async listDestinations(): Promise<Destination[]> {
      const rows = await run(sb.from("destinations").select("id, name_en, name_ar, city, kind").order("name_en"));
      return (rows ?? []).map((r: any) => ({
        id: r.id,
        nameEn: r.name_en,
        nameAr: r.name_ar,
        city: r.city,
        kind: r.kind,
      }));
    },

    async deleteAccount() {
      await run(sb.rpc("delete_my_account"));
      await sb.auth.signOut();
    },

    /* ---- Drivers, services, bookings, money (Milestones 3-6) ---------- */

    async driverApplication() {
      return rpc<DriverApplication>("driver_get_application");
    },
    async saveApplication(patch) {
      return rpc<DriverApplication>("driver_save_application", { p: patch });
    },
    async uploadDocument(kind: DocKind, file: Blob, expiry: string | null) {
      const u = await uid();
      const media = MEDIA_KINDS.includes(kind);
      const bucket = media ? "driver-media" : "driver-docs";
      const ext = file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = `${u.id}/${kind}-${Date.now()}.${ext}`;
      const { error } = await sb.storage.from(bucket).upload(path, file, { contentType: file.type || "image/jpeg", upsert: true });
      if (error) {
        const m = String((error as { message?: string }).message ?? "");
        if (/size|large/i.test(m)) throw new DataError("file_too_large");
        if (/mime|type/i.test(m)) throw new DataError("file_type");
        throw mapError(error);
      }
      return rpc<DriverApplication>("driver_save_document", { p_kind: kind, p_bucket: bucket, p_path: path, p_expiry: expiry });
    },
    async updateDocumentExpiry(doc, expiry) {
      return rpc<DriverApplication>("driver_save_document", { p_kind: doc.kind, p_bucket: doc.bucket, p_path: doc.path, p_expiry: expiry });
    },
    async submitApplication() {
      return rpc<DriverApplication>("driver_submit");
    },
    async fileUrl(doc) {
      if (doc.bucket === "demo" || doc.path.startsWith("/")) return doc.path;
      if (doc.bucket === "driver-media") return sb.storage.from(doc.bucket).getPublicUrl(doc.path).data.publicUrl;
      const { data, error } = await sb.storage.from(doc.bucket).createSignedUrl(doc.path, 300);
      if (error) return null;
      return data.signedUrl;
    },
    mediaUrl(path) {
      if (!path) return null;
      if (path.startsWith("/")) return path;
      const [bucket, ...rest] = path.split("/");
      return sb.storage.from(bucket).getPublicUrl(rest.join("/")).data.publicUrl;
    },

    async notifications() {
      return rpc("my_notifications");
    },
    async markNotificationsRead() {
      await rpc("mark_notifications_read");
    },

    async driverServices() {
      return rpc("driver_services");
    },
    async driverService(id) {
      return rpc("driver_get_service", { p_id: id });
    },
    async saveService(input, applyFrom) {
      return rpc("driver_save_service", { p: input, p_from: applyFrom ?? null });
    },
    async checkService(id, schedule, applyFrom) {
      return rpc("driver_check_service", { p_service: id, p_schedule: schedule, p_from: applyFrom ?? null });
    },
    async archiveService(id) {
      await rpc("driver_archive_service", { p_service: id });
    },
    async addDestination(input) {
      return rpc("add_destination", { p: input });
    },
    async listDestinationsGeo() {
      const rows = await run(sb.from("destinations").select("id, name_en, name_ar, city, kind, lat, lng").order("name_en"));
      return (rows ?? []).map((r: any) => ({ id: r.id, nameEn: r.name_en, nameAr: r.name_ar, city: r.city, kind: r.kind, lat: r.lat, lng: r.lng }));
    },
    async listDistricts() {
      const rows = await run(sb.from("districts").select("id, city, name_en, name_ar, lat, lng").order("city"));
      return (rows ?? []).map((r: any) => ({ id: r.id, city: r.city, nameEn: r.name_en, nameAr: r.name_ar, lat: r.lat, lng: r.lng }));
    },
    async checkHours(hours, applyFrom) {
      return rpc("driver_check_hours", { p_hours: hours, p_from: applyFrom ?? null });
    },
    async saveHours(hours, applyFrom) {
      return rpc("driver_save_hours", { p_hours: hours, p_from: applyFrom ?? null });
    },
    async blockedDates() {
      return rpc("driver_blocked_dates");
    },
    async blockDates(start, end, reason, cancelConfirmed) {
      return rpc("driver_block_dates", { p_start: start, p_end: end, p_reason: reason, p_cancel_confirmed: cancelConfirmed });
    },
    async unblock(id) {
      return rpc("driver_unblock", { p_id: id });
    },
    async setDay(serviceId, date, seats, unavailable, reason, cancelConfirmed) {
      return rpc("driver_set_day", {
        p_service: serviceId,
        p_date: date,
        p_seats: seats,
        p_unavailable: unavailable,
        p_reason: reason,
        p_cancel_confirmed: cancelConfirmed,
      });
    },
    async driverCalendar(from, to) {
      return rpc("driver_calendar", { p_from: from, p_to: to });
    },

    async searchServices(params) {
      return rpc("search_services", { p: params ?? {} });
    },
    async getService(id) {
      return rpc("get_service", { p_id: id });
    },
    async quoteBooking(input) {
      return rpc("quote_booking", { p: input });
    },
    async createBooking(input) {
      return rpc("create_booking", { p: input });
    },
    async getBooking(id) {
      return rpc("get_booking", { p_id: id });
    },
    async myBookings() {
      return rpc("my_bookings");
    },
    async driverBookings(kind) {
      return rpc("driver_bookings", { p_kind: kind });
    },
    async respond(id, accept, reason) {
      return rpc("driver_respond", { p_booking: id, p_accept: accept, p_reason: reason ?? null });
    },
    async payBooking(input) {
      return rpc("pay_booking", { p: input });
    },
    async cancelPreview(id) {
      return rpc("cancel_preview", { p_booking: id });
    },
    async cancelBooking(id, reason, refundTo) {
      return rpc("cancel_booking", { p_booking: id, p_reason: reason, p_refund_to: refundTo });
    },
    async wallet() {
      return rpc("wallet_summary");
    },
    async invoice(id) {
      return rpc("get_invoice", { p_id: id });
    },
    async earnings() {
      return rpc("driver_earnings");
    },

    async adminOverview() {
      return rpc("admin_overview");
    },
    async adminDriverQueue() {
      return rpc("admin_driver_queue");
    },
    async adminDriver(id) {
      return rpc("admin_get_driver", { p_id: id });
    },
    async reviewDocument(docId, approve, reason) {
      return rpc("admin_review_document", { p_doc: docId, p_approve: approve, p_reason: reason });
    },
    async decideDriver(id, decision, note) {
      return rpc("admin_decide_driver", { p_driver: id, p_decision: decision, p_note: note });
    },
    async adminBookings() {
      return rpc("admin_bookings");
    },
    async adminSettings() {
      return rpc("admin_settings");
    },
    async saveSettings(p) {
      return rpc("admin_save_settings", { p });
    },
    async payoutRun() {
      return rpc("admin_payout_run");
    },
    async payoutRuns() {
      return rpc("admin_payout_runs");
    },
  };
}
