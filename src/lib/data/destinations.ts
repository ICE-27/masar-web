import type { Destination } from "./types";

/**
 * The same list the SQL migration seeds into public.destinations. Used by the
 * in-browser demo backend. Parents can always type a school that isn't here.
 */
export const DESTINATIONS: Destination[] = [
  { id: "d-dhahran-ahliyya", nameEn: "Dhahran Ahliyya Schools", nameAr: "مدارس الظهران الأهلية", city: "Dhahran", kind: "school" },
  { id: "d-ips", nameEn: "International Programs School", nameAr: "مدارس البرامج العالمية", city: "Khobar", kind: "school" },
  { id: "d-bisak", nameEn: "British International School Al Khobar", nameAr: "المدرسة البريطانية العالمية بالخبر", city: "Khobar", kind: "school" },
  { id: "d-manarat", nameEn: "Manarat Al Sharqiya International Schools", nameAr: "مدارس منارات الشرقية العالمية", city: "Dammam", kind: "school" },
  { id: "d-iis-dammam", nameEn: "International Indian School Dammam", nameAr: "المدرسة الهندية العالمية بالدمام", city: "Dammam", kind: "school" },
  { id: "d-iis-jubail", nameEn: "International Indian School Jubail", nameAr: "المدرسة الهندية العالمية بالجبيل", city: "Jubail", kind: "school" },
];
