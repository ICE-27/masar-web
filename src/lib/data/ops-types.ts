/**
 * Types for drivers, services, bookings and money. The database functions
 * return JSON in exactly these shapes (camelCase), so no mapping is needed.
 */
import type { District, Path } from "@/lib/domain/geo";
import type { Halalas } from "@/lib/domain/money";
import type { Legs, PriceRow, PricingSettings, ServiceType } from "@/lib/domain/pricing";

export type { District, Path, Halalas, Legs, PriceRow, ServiceType };

export type DriverStatus = "draft" | "submitted" | "under_review" | "approved" | "action_needed" | "suspended";

export type DocKind =
  | "profile_photo"
  | "id_front"
  | "id_back"
  | "selfie"
  | "police"
  | "licence"
  | "istimara"
  | "insurance"
  | "fahas"
  | "tga_card"
  | "first_aid"
  | "car_front"
  | "car_back"
  | "car_side"
  | "car_interior";

export const MEDIA_KINDS: DocKind[] = ["profile_photo", "car_front", "car_back", "car_side", "car_interior"];

export interface DriverDoc {
  id: string;
  kind: DocKind;
  bucket: "driver-docs" | "driver-media" | "demo";
  path: string;
  expiry: string | null;
  status: "pending" | "approved" | "rejected";
  rejectReason: string | null;
  updatedAt: string;
}

export interface DriverRecord {
  id: string;
  status: DriverStatus;
  wizardStep: number;
  nameAr: string | null;
  nameEn: string | null;
  gender: "male" | "female" | null;
  dateOfBirth: string | null;
  nationality: string | null;
  city: string | null;
  bio: string | null;
  languages: string[];
  yearsExperience: number | null;
  idNumber: string | null;
  idExpiry: string | null;
  policeIssued: string | null;
  licenceNumber: string | null;
  licenceType: "private" | "public" | "heavy" | null;
  licenceExpiry: string | null;
  bankName: string | null;
  iban: string | null;
  accountHolder: string | null;
  discountT1Pct: number;
  discountT2Pct: number;
  declarationAt: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  approvedAt: string | null;
  adminNote: string | null;
  createdAt: string;
  email: string | null;
  phone: string | null;
  phoneVerified: boolean;
}

export interface Vehicle {
  type: "car" | "bus";
  make: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  seats: number | null;
  carCategory: "sedan" | "suv" | "van" | null;
  busType: "minivan" | "coaster" | "midsize" | "fullsize" | null;
  ac: boolean;
  gps: boolean;
  cameras: boolean;
  seatbelts: boolean;
  femaleAttendant: boolean;
  wheelchair: boolean;
  plateDigits?: string | null;
  plateLetters?: string | null;
}

export interface HoursRow {
  dow: number;
  startMin: number;
  endMin: number;
}

export type PriceRowState = PriceRow & { enabled: boolean };

export interface DriverApplication {
  driver: DriverRecord;
  vehicle: Vehicle | null;
  documents: DriverDoc[];
  pricing: PriceRowState[];
  hours: HoursRow[];
  futureHours: (HoursRow & { validFrom: string })[];
  requiredDocs: DocKind[];
}

export interface ApplicationPatch {
  step?: number;
  personal?: {
    nameAr: string;
    nameEn: string;
    gender: "male" | "female";
    dateOfBirth: string;
    nationality: string;
    city: string;
    bio?: string;
    languages?: string[];
    yearsExperience?: number | null;
  };
  identity?: { idNumber: string; idExpiry: string; policeIssued: string };
  licence?: { licenceNumber: string; licenceType: "private" | "public" | "heavy"; licenceExpiry: string };
  vehicle?: Omit<Vehicle, "plateDigits" | "plateLetters"> & { plateDigits: string; plateLetters: string };
  pricing?: { types: PriceRowState[]; discountT1Pct: number; discountT2Pct: number };
  payout?: { bankName: string; iban: string; accountHolder: string };
  hours?: HoursRow[];
}

export interface Schedule {
  validFrom?: string;
  days: number[];
  outbound: boolean;
  pickupStartMin: number | null;
  pickupEndMin: number | null;
  arriveMin: number | null;
  returnTrip: boolean;
  returnDepartMin: number | null;
  returnEndMin: number | null;
  seats: number;
}

export interface SeatDay {
  date: string;
  capacity: number;
  taken: number;
  closed: string | null;
}

export interface DestinationGeo {
  id: string;
  nameEn: string;
  nameAr: string;
  city: string;
  kind: "school" | "tutoring" | "sports" | "other";
  lat: number | null;
  lng: number | null;
}

export interface Stop {
  lat: number;
  lng: number;
  label?: string;
}

export interface MatchLimits {
  maxPickupM: number;
  maxDetourM: number;
  maxDetourPct: number;
  maxStops: number;
  maxJourneyMin: number;
}

export type VehiclePublic = Omit<Vehicle, "plateDigits" | "plateLetters">;

export interface DriverPublic {
  id: string;
  firstNameEn: string;
  firstNameAr: string;
  gender: "male" | "female";
  city: string | null;
  languages: string[];
  bio: string | null;
  yearsExperience: number | null;
  memberSince: string | null;
  photo: string | null;
  verified: boolean;
  checks: string[];
  carPhotos: string[];
  completedTrips: number;
  vehicle: VehiclePublic;
}

export interface ServiceRecord {
  id: string;
  driverId: string;
  name: string;
  kind: "school" | "activity" | "trip";
  status: "active" | "paused" | "archived";
  destination: DestinationGeo;
  start: { lat: number; lng: number };
  stops: Stop[];
  path: Path;
  distanceM: number | null;
  durationS: number | null;
  accepts: "boys" | "girls" | "both";
  ageMin: number;
  ageMax: number;
  maxChildrenPerFamily: number;
  sharedEnabled: boolean;
  exclusiveEnabled: boolean;
  limits: MatchLimits;
  discounts: { t1Days: number; t1Pct: number; t2Days: number; t2Pct: number };
  schedule: Schedule | null;
  upcomingSchedules: Schedule[];
  pricing: PriceRow[];
  coverage: { districtId: string; surchargeH: Halalas }[];
  families: number;
  seatsByDate: SeatDay[];
  pendingRequests?: number;
  driver?: DriverPublic;
}

export interface ServiceInput {
  id?: string;
  name: string;
  kind: ServiceRecord["kind"];
  destinationId: string;
  start: { lat: number; lng: number };
  stops: Stop[];
  path: Path;
  distanceM: number | null;
  durationS: number | null;
  accepts: ServiceRecord["accepts"];
  ageMin: number;
  ageMax: number;
  maxChildrenPerFamily: number;
  sharedEnabled: boolean;
  exclusiveEnabled: boolean;
  limits: MatchLimits;
  discounts: { t1Pct: number; t2Pct: number };
  schedule: Schedule;
  pricing: PriceRow[];
  coverage: { districtId: string; surchargeH: Halalas }[];
  status: "active" | "paused";
}

export interface AppSettings extends PricingSettings {
  cancelNoticeDays: number;
  requestHoldHours: number;
  paymentHoldHours: number;
  schoolWeekDays: number;
  holidays: { from: string; to: string; name?: string }[];
  today: string;
  demoMode: boolean;
}

export interface SearchData {
  settings: AppSettings;
  districts: District[];
  services: ServiceRecord[];
}

export interface ServiceDetail {
  service: ServiceRecord;
  settings: AppSettings;
  districts: District[];
}

export interface BookingInput {
  serviceId: string;
  serviceType: ServiceType;
  legs: Legs;
  childIds: string[];
  addressId: string;
  dates: string[];
  attendant?: boolean;
  note?: string;
}

export interface PriceBreakdown {
  lineH: Halalas;
  discountPct: number;
  discountH: Halalas;
  driverH: Halalas;
  vatBp: number;
  vatH: Halalas;
  feeBp: number;
  feeH: Halalas;
  totalH: Halalas;
}

export interface Quote {
  serviceId: string;
  serviceType: ServiceType;
  legs: Legs;
  exclusive: boolean;
  children: { id: string; firstName: string; gender: "boy" | "girl"; dateOfBirth: string }[];
  childrenCount: number;
  units: number;
  districtId: string | null;
  covered: boolean;
  pickupDistanceM: number;
  outsideRoute: boolean;
  estPickupMin: number | null;
  baseRateH: Halalas;
  surchargeH: Halalas;
  rateH: Halalas;
  attendant: boolean;
  attendantFeeH: Halalas;
  dates: string[];
  bookedDays: number;
  unavailable: { date: string; reason: string; free?: number }[];
  problems: { code: string; detail?: string | number }[];
  price: PriceBreakdown & { t1Days: number; t2Days: number };
  requestExpiresAt: string | null;
  firstTripAt: string | null;
}

export type BookingStatus = "pending" | "accepted" | "confirmed" | "completed" | "rejected" | "expired" | "cancelled";
export type DateState = "scheduled" | "cancelled" | "absent" | "completed" | "driver_unavailable";

export interface NameBi {
  nameEn: string;
  nameAr: string;
}

export interface BookingCard {
  id: string;
  code: string;
  status: BookingStatus;
  cancelledBy: "parent" | "driver" | "admin" | null;
  endsOn: string | null;
  serviceType: ServiceType;
  legs: Legs;
  firstDate: string;
  lastDate: string;
  bookedDays: number;
  totalH: Halalas;
  driverH: Halalas;
  feeH?: Halalas;
  vatH?: Halalas;
  requestExpiresAt: string | null;
  paymentDueAt: string | null;
  createdAt: string;
  outsideRoute: boolean;
  pickupDistanceM: number | null;
  estPickupMin: number | null;
  district: (NameBi & { id: string; city: string }) | null;
  serviceName: string | null;
  destination: NameBi | null;
  driver: { firstNameEn: string; firstNameAr: string; gender: "male" | "female"; vehicleType: "car" | "bus" } | null;
  parentFirstName: string | null;
  children: { firstName: string; gender: "boy" | "girl"; age: number | null }[];
  nextDate: string | null;
}

export interface Booking {
  id: string;
  code: string;
  status: BookingStatus;
  cancelledBy: "parent" | "driver" | "admin" | null;
  endsOn: string | null;
  viewer: "parent" | "driver" | "admin";
  serviceType: ServiceType;
  legs: Legs;
  attendant: boolean;
  firstDate: string;
  lastDate: string;
  bookedDays: number;
  outsideRoute: boolean;
  pickupDistanceM: number | null;
  estPickupMin: number | null;
  note: string | null;
  districtId: string | null;
  district: (NameBi & { id: string; city: string }) | null;
  requestExpiresAt: string | null;
  paymentDueAt: string | null;
  respondedAt: string | null;
  confirmedAt: string | null;
  cancelledAt: string | null;
  rejectReason: string | null;
  cancelReason: string | null;
  createdAt: string;
  price: PriceBreakdown & { rateH: Halalas; surchargeH: Halalas; units: number; childrenCount: number; attendantFeeH: Halalas };
  service: {
    id: string;
    name: string;
    kind: string;
    path: Path;
    start: { lat: number; lng: number };
    stops: Stop[];
    destination: Omit<DestinationGeo, "kind"> | null;
    schedule: Omit<Schedule, "seats" | "validFrom"> | null;
  } | null;
  driver: {
    id: string;
    firstNameEn: string;
    firstNameAr: string;
    gender: "male" | "female";
    photo: string | null;
    phone: string | null;
    vehicle: { type: "car" | "bus"; make: string; model: string; year: number; color: string; seats: number; plateDigits: string | null; plateLetters: string | null } | null;
  } | null;
  parent: { firstName: string; phone: string | null } | null;
  pickup: {
    lat?: number;
    lng?: number;
    label?: string;
    customLabel?: string | null;
    city?: string | null;
    district?: string | null;
    street?: string | null;
    buildingNo?: string | null;
    floorApt?: string | null;
    landmark?: string | null;
    nationalAddress?: string | null;
    districtId?: string | null;
  };
  children: {
    id: string | null;
    firstName: string;
    gender: "boy" | "girl";
    age: number | null;
    driverNotes: string | null;
    medicalNotes: string | null;
    authorizedPickups: { name: string; phone: string; relation?: string }[] | null;
    emergencyName: string | null;
    emergencyPhone: string | null;
  }[];
  dates: { date: string; state: DateState; refundedH: Halalas }[];
  payments: Payment[];
  invoices: { id: string; number: string; kind: "invoice" | "credit_note"; totalH: Halalas; issuedAt: string }[];
  refunds: { id: string; initiatedBy: "parent" | "driver" | "admin"; days: number; driverH: Halalas; vatH: Halalas; feeH: Halalas; totalH: Halalas; destination: "wallet" | "card"; createdAt: string }[];
}

export interface Payment {
  id: string;
  method: PayMethod;
  amountH: Halalas;
  status: "succeeded" | "failed";
  failureCode: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
  createdAt: string;
  bookingId?: string;
  bookingCode?: string;
}

export type PayMethod = "card" | "mada" | "applepay" | "stcpay" | "wallet";

export interface PayInput {
  bookingId: string;
  method: PayMethod;
  idempotencyKey: string;
  card?: { number: string; expMonth: number; expYear: number; cvc: string };
}

export interface PayResult {
  status: "succeeded" | "failed";
  code?: string | null;
  paymentId: string;
  invoiceId?: string | null;
  bookingId: string;
  replayed?: boolean;
}

export interface CancelPreview {
  status: BookingStatus;
  paid: boolean;
  noticeDays: number;
  remainingDays: number;
  inNoticeDays: number;
  refundDays: number;
  endsOn: string | null;
  refundDriverH: Halalas;
  refundVatH: Halalas;
  feeKeptH: Halalas;
  cancellable: boolean;
}

export interface Wallet {
  balanceH: Halalas;
  entries: { id: number; account: "parent_wallet" | "parent_external"; amountH: Halalas; kind: "charge" | "refund" | "topup"; memo: string | null; bookingId: string | null; createdAt: string }[];
  invoices: { id: string; number: string; kind: "invoice" | "credit_note"; totalH: Halalas; issuedAt: string; bookingId: string; bookingCode: string }[];
  payments: Payment[];
}

export interface Invoice {
  id: string;
  number: string;
  kind: "invoice" | "credit_note";
  issuedAt: string;
  method: string | null;
  days: number | null;
  driverH: Halalas;
  vatH: Halalas;
  feeH: Halalas;
  totalH: Halalas;
  vatBp: number;
  feeBp: number;
  vatNumber: string | null;
  original: { number: string; issuedAt: string } | null;
  booking: {
    id: string;
    code: string;
    serviceType: ServiceType;
    legs: Legs;
    firstDate: string;
    lastDate: string;
    bookedDays: number;
    units: number;
    childrenCount: number;
    rateH: Halalas;
    surchargeH: Halalas;
    attendantFeeH: Halalas;
    lineH: Halalas;
    discountPct: number;
    discountH: Halalas;
    serviceName: string;
    children: string[];
  } | null;
  parent: { name: string | null; email: string | null; phone: string | null } | null;
  driver: { nameEn: string | null; nameAr: string | null } | null;
}

export interface Earnings {
  owedH: Halalas;
  paidOutH: Halalas;
  earnedToDateH: Halalas;
  grossH: Halalas;
  feeH: Halalas;
  payout: { bankName: string | null; accountHolder: string | null; ibanMasked: string | null };
  bookings: { id: string; code: string; status: BookingStatus; firstDate: string; lastDate: string; bookedDays: number; driverH: Halalas; refundedDriverH: Halalas; serviceName: string }[];
  payouts: { id: string; amountH: Halalas; status: string; createdAt: string }[];
}

export interface ConflictItem {
  bookingId: string;
  code: string;
  status: BookingStatus;
  children: string[] | null;
  parentName: string | null;
  dates: string[];
  count: number;
}

export interface ConflictReport {
  pending: ConflictItem[];
  confirmed: ConflictItem[];
  lastConfirmedDate: string | null;
  earliestDate: string;
}

export interface CalendarDay {
  date: string;
  runs: boolean;
  capacity: number;
  paid: number;
  held: number;
  closed: string | null;
  override: { seats: number | null; unavailable: boolean; reason: string | null } | null;
  pending: number;
}

export interface CalendarService {
  serviceId: string;
  serviceName: string;
  days: CalendarDay[];
}

export interface BlockedRange {
  id: string;
  startDate: string;
  endDate: string;
  reason: string | null;
}

export interface AppNotification {
  id: string;
  event: string;
  data: Record<string, unknown>;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface QueueItem {
  id: string;
  nameEn: string | null;
  nameAr: string | null;
  gender: "male" | "female" | null;
  city: string | null;
  status: DriverStatus;
  submittedAt: string | null;
  approvedAt: string | null;
  vehicleType: "car" | "bus" | null;
  vehicle: string | null;
  docsTotal: number;
  docsApproved: number;
  docsRejected: number;
}

export interface AdminOverview {
  drivers: Partial<Record<DriverStatus, number>>;
  bookings: Partial<Record<BookingStatus, number>>;
  parents: number;
  services: number;
  gmvH: Halalas;
  commissionH: Halalas;
  vatH: Halalas;
  refundsH: Halalas;
  driverOwedH: Halalas;
  paidOutH: Halalas;
  walletsH: Halalas;
  failedPayments: number;
  byMonth: { month: string; gmvH: Halalas; feeH: Halalas; bookings: number }[];
}

export interface PayoutRun {
  id: string;
  totalH: Halalas;
  count: number;
  createdAt?: string;
  rows?: { driverId: string; name: string; accountHolder: string | null; bankName: string | null; iban: string | null; amountH: Halalas; status: string }[];
}

export type SettingsMap = Record<string, unknown>;

export interface OpsBackend {
  driverApplication(): Promise<DriverApplication>;
  saveApplication(patch: ApplicationPatch): Promise<DriverApplication>;
  uploadDocument(kind: DocKind, file: Blob, expiry: string | null): Promise<DriverApplication>;
  updateDocumentExpiry(doc: DriverDoc, expiry: string | null): Promise<DriverApplication>;
  submitApplication(): Promise<DriverApplication>;
  fileUrl(doc: { bucket: string; path: string }): Promise<string | null>;
  mediaUrl(path: string | null | undefined): string | null;

  notifications(): Promise<AppNotification[]>;
  markNotificationsRead(): Promise<void>;

  driverServices(): Promise<ServiceRecord[]>;
  driverService(id: string): Promise<ServiceRecord>;
  saveService(input: ServiceInput, applyFrom?: string | null): Promise<ServiceRecord>;
  checkService(id: string, schedule: Schedule, applyFrom?: string | null): Promise<ConflictReport>;
  archiveService(id: string): Promise<void>;
  addDestination(input: { nameEn: string; nameAr: string; kind: string; city: string; lat: number; lng: number }): Promise<DestinationGeo>;
  listDestinationsGeo(): Promise<DestinationGeo[]>;
  listDistricts(): Promise<District[]>;
  checkHours(hours: HoursRow[], applyFrom?: string | null): Promise<ConflictReport>;
  saveHours(hours: HoursRow[], applyFrom?: string | null): Promise<DriverApplication>;
  blockedDates(): Promise<BlockedRange[]>;
  blockDates(start: string, end: string, reason: string, cancelConfirmed: boolean): Promise<BlockedRange[]>;
  unblock(id: string): Promise<BlockedRange[]>;
  setDay(serviceId: string, date: string, seats: number | null, unavailable: boolean, reason: string, cancelConfirmed: boolean): Promise<ServiceRecord>;
  driverCalendar(from: string, to: string): Promise<CalendarService[]>;

  searchServices(params?: { destinationId?: string }): Promise<SearchData>;
  getService(id: string): Promise<ServiceDetail>;
  quoteBooking(input: BookingInput): Promise<Quote>;
  createBooking(input: BookingInput): Promise<Booking>;
  getBooking(id: string): Promise<Booking>;
  myBookings(): Promise<BookingCard[]>;
  driverBookings(kind: "requests" | "active" | "past"): Promise<BookingCard[]>;
  respond(id: string, accept: boolean, reason?: string): Promise<Booking>;
  payBooking(input: PayInput): Promise<PayResult>;
  cancelPreview(id: string): Promise<CancelPreview>;
  cancelBooking(id: string, reason: string, refundTo: "wallet" | "card"): Promise<Booking>;
  wallet(): Promise<Wallet>;
  invoice(id: string): Promise<Invoice>;
  earnings(): Promise<Earnings>;

  adminOverview(): Promise<AdminOverview>;
  adminDriverQueue(): Promise<QueueItem[]>;
  adminDriver(id: string): Promise<DriverApplication>;
  reviewDocument(docId: string, approve: boolean, reason: string): Promise<DriverApplication>;
  decideDriver(id: string, decision: "approve" | "action_needed" | "suspend" | "under_review", note: string): Promise<DriverApplication>;
  adminBookings(): Promise<BookingCard[]>;
  adminSettings(): Promise<SettingsMap>;
  saveSettings(p: SettingsMap): Promise<SettingsMap>;
  payoutRun(): Promise<PayoutRun>;
  payoutRuns(): Promise<PayoutRun[]>;
}
