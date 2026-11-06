import { AppLink as Link } from "@/components/link";
import "@fontsource-variable/inter";
import "@fontsource/ibm-plex-sans-arabic/arabic-400.css";
import "@fontsource/ibm-plex-sans-arabic/arabic-600.css";

/**
 * The root layout only passes children through, so this page supplies its own
 * document. It catches anything outside /ar and /en.
 */
export default function RootNotFound() {
  return (
    <html lang="en" dir="ltr">
      <body className="min-h-dvh bg-page text-[var(--ink)] antialiased">
        <main className="container-page flex min-h-dvh flex-col items-center justify-center py-20 text-center">
          <svg viewBox="0 0 64 64" aria-hidden className="h-14 w-14">
            <path
              d="M32 3c-11.6 0-21 9.4-21 21 0 14.9 18.1 34.3 18.9 35.1a2.9 2.9 0 0 0 4.2 0C34.9 58.3 53 38.9 53 24c0-11.6-9.4-21-21-21Z"
              fill="var(--color-brand-500)"
            />
            <circle cx="21.5" cy="34" r="4.6" fill="#fff" />
            <circle cx="29.5" cy="29.5" r="3.1" fill="#fff" />
            <circle cx="45.6" cy="18.2" r="4.1" fill="var(--color-accent-400)" />
          </svg>
          <h1 className="mt-6 text-3xl font-bold tracking-tight">
            We could not find that page
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
            The link may be old, or the page may have moved.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/ar"
              className="inline-flex min-h-11 items-center rounded-full bg-brand-500 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-brand-600"
            >
              العربية
            </Link>
            <Link
              href="/en"
              className="inline-flex min-h-11 items-center rounded-full border border-[var(--line)] px-6 py-3 text-sm font-medium transition-colors hover:border-brand-400"
            >
              English
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}
