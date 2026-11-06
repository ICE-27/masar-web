import { cn } from "./ui";

/**
 * The Masar mark: a map pin carrying a dotted path that ends in an amber dot.
 * Drawn as SVG so it stays crisp at every size and in both themes.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      aria-hidden
      className={cn("h-8 w-8", className)}
    >
      <path
        d="M32 3c-11.6 0-21 9.4-21 21 0 14.9 18.1 34.3 18.9 35.1a2.9 2.9 0 0 0 4.2 0C34.9 58.3 53 38.9 53 24c0-11.6-9.4-21-21-21Z"
        fill="var(--color-brand-500)"
      />
      {/* the path of dots, growing as it travels */}
      <circle cx="21.5" cy="34" r="4.6" fill="#ffffff" />
      <circle cx="29.5" cy="29.5" r="3.1" fill="#ffffff" />
      <circle cx="35.8" cy="25.6" r="2.2" fill="#ffffff" />
      <circle cx="40.6" cy="22.3" r="1.6" fill="#ffffff" />
      {/* the destination */}
      <circle cx="45.6" cy="18.2" r="4.1" fill="var(--color-accent-400)" />
    </svg>
  );
}

export function Logo({
  className,
  wordmark = true,
  locale = "en",
}: {
  className?: string;
  wordmark?: boolean;
  locale?: "ar" | "en";
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      {wordmark ? (
        <span className="flex flex-col leading-none">
          <span className="text-lg font-bold tracking-tight">
            {locale === "ar" ? "مسار" : "Masar"}
          </span>
          <span className="text-[0.62rem] font-medium text-muted tracking-wide">
            {locale === "ar" ? "Masar" : "مسار"}
          </span>
        </span>
      ) : null}
    </span>
  );
}
