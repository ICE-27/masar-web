import type { ReactNode } from "react";
import "./globals.css";

/**
 * Every route lives under /[locale], and that layout renders <html> with the
 * right lang and dir. This root layout only passes children through.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
