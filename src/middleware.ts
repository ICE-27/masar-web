import { NextRequest, NextResponse } from "next/server";

/**
 * The bare domain opens in Arabic. Only a visitor who switched to English
 * before (remembered in the `masar-locale` cookie) is sent to /en.
 * Everything else passes through: the [locale] segment handles it.
 */
export function middleware(request: NextRequest) {
  const locale = request.cookies.get("masar-locale")?.value === "en" ? "en" : "ar";
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Only the bare root
  matcher: ["/"],
};
