import { NextRequest, NextResponse } from "next/server";

const LOCALES = ["ar", "en"];
const DEFAULT_LOCALE = "ar";

/**
 * Redirect bare `/` to `/ar` or `/en` based on Accept-Language.
 * Everything else passes through — the [locale] dynamic segment handles it.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only redirect the bare root
  if (pathname !== "/") return NextResponse.next();

  // Pick the best locale from the Accept-Language header
  const acceptLang = request.headers.get("accept-language") ?? "";
  const preferred = acceptLang
    .split(",")
    .map((part) => part.split(";")[0].trim().toLowerCase())
    .find((tag) => LOCALES.some((l) => tag === l || tag.startsWith(`${l}-`)));

  const locale = preferred
    ? LOCALES.find((l) => preferred === l || preferred.startsWith(`${l}-`))!
    : DEFAULT_LOCALE;

  const url = request.nextUrl.clone();
  url.pathname = `/${locale}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Run only on the root path — skip _next, api, static files
  matcher: ["/"],
};
