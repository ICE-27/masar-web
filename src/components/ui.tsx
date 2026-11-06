import { AppLink as Link } from "./link";
import type { ComponentProps, ReactNode } from "react";

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all duration-200 min-h-11 disabled:opacity-50 disabled:pointer-events-none";

const buttonVariants = {
  primary:
    "bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700 shadow-[0_8px_20px_-10px_rgba(0,151,103,0.9)] hover:shadow-[0_12px_28px_-10px_rgba(0,151,103,0.9)]",
  secondary:
    "bg-[var(--card)] text-[var(--ink)] border border-[var(--line)] hover:border-brand-400 hover:text-brand-600 dark:hover:text-brand-300",
  accent:
    "bg-accent-400 text-brand-950 hover:bg-accent-300 active:bg-accent-500 font-semibold",
  ghost:
    "text-[var(--ink)] hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-brand-900/40 dark:hover:text-brand-200",
} as const;

const buttonSizes = {
  sm: "text-sm px-4 py-2",
  md: "text-sm px-5 py-2.5",
  lg: "text-base px-7 py-3.5",
} as const;

type ButtonLinkProps = {
  variant?: keyof typeof buttonVariants;
  size?: keyof typeof buttonSizes;
} & ComponentProps<typeof Link>;

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      className={cn(
        buttonBase,
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    />
  );
}

type ButtonProps = {
  variant?: keyof typeof buttonVariants;
  size?: keyof typeof buttonSizes;
} & ComponentProps<"button">;

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        buttonBase,
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    />
  );
}

export function Section({
  children,
  className,
  subtle = false,
  id,
}: {
  children: ReactNode;
  className?: string;
  subtle?: boolean;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "py-16 sm:py-20 lg:py-28",
        subtle && "bg-subtle border-y border-[var(--line)]",
        className,
      )}
    >
      <div className="container-page">{children}</div>
    </section>
  );
}

export function SectionHead({
  eyebrow,
  title,
  subtitle,
  center = true,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  center?: boolean;
}) {
  return (
    <div className={cn("max-w-2xl", center && "mx-auto text-center")}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-balance">
        {title}
      </h2>
      {subtitle ? (
        <p className="mt-4 text-base sm:text-lg text-muted leading-relaxed text-pretty">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand-600 dark:text-brand-300">
      <span aria-hidden className="h-px w-6 bg-brand-400" />
      {children}
    </span>
  );
}

export function Card({
  children,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "li" | "article";
}) {
  return (
    <Tag
      className={cn(
        "bg-card border border-[var(--line)] rounded-2xl p-6 transition-all duration-200",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function Badge({
  children,
  tone = "brand",
}: {
  children: ReactNode;
  tone?: "brand" | "accent" | "neutral";
}) {
  const tones = {
    brand:
      "bg-brand-50 text-brand-700 border-brand-200 dark:bg-brand-900/50 dark:text-brand-200 dark:border-brand-700",
    accent:
      "bg-accent-50 text-accent-700 border-accent-200 dark:bg-accent-700/20 dark:text-accent-300 dark:border-accent-700/60",
    neutral:
      "bg-[var(--page-subtle)] text-muted border-[var(--line)]",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

/** A small check mark used in requirement and feature lists. */
export function Check({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden
      className={cn("h-5 w-5 shrink-0 text-brand-500", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="10" cy="10" r="8.25" className="opacity-25" />
      <path d="M6.2 10.4 8.8 13l5-5.6" />
    </svg>
  );
}
