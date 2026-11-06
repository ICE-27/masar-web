"use client";

import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/components/auth-provider";
import { Alert, Skeleton } from "@/components/form";
import { IconLogout } from "@/components/icons";
import { AppLink as Link } from "@/components/link";
import { ButtonLink, cn } from "@/components/ui";
import type { Role } from "@/lib/data";
import { href, type Locale } from "@/lib/i18n";
import type { AppMessages } from "@/lib/messages/app.en";
import { useNavigate } from "@/lib/nav";

export interface AreaNavItem {
  key: string;
  path: string;
  label: string;
  icon: (p: { width: number; height: number }) => ReactNode;
  badge?: number;
  mobile?: boolean;
}

export function homeFor(role: Role | undefined): string {
  return role === "driver" ? "/driver" : role === "admin" ? "/admin" : "/account";
}

/**
 * Sidebar on desktop, bottom navigation on phones. Sends signed-out visitors
 * to sign in (and back), and people with another role to their own area.
 */
export function AreaShell({
  locale,
  m,
  items,
  active,
  roles,
  label,
  children,
  wide,
  here,
}: {
  locale: Locale;
  m: AppMessages;
  items: AreaNavItem[];
  active: string;
  roles: Role[];
  label: string;
  children: ReactNode;
  wide?: boolean;
  here: string;
}) {
  const { status, profile, backend } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (status === "signed-out") {
      navigate(`${href(locale, "/login")}?next=${encodeURIComponent(href(locale, here))}`, { replace: true });
    }
  }, [status, locale, here, navigate]);

  const allowed = profile ? roles.includes(profile.role) : false;
  const mobile = items.filter((i) => i.mobile !== false).slice(0, 5);

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-[var(--page-subtle)] pb-24 lg:pb-12">
      <div className={cn("container-page lg:grid lg:gap-10 lg:pt-10", wide ? "lg:grid-cols-[13rem_1fr]" : "lg:grid-cols-[15rem_1fr]")}>
        <aside className="hidden lg:block">
          <nav aria-label={label} className="sticky top-24 space-y-1">
            {items.map((n) => (
              <Link
                key={n.key}
                href={href(locale, n.path)}
                aria-current={n.key === active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors",
                  n.key === active
                    ? "bg-[var(--card)] text-brand-700 shadow-[var(--shadow-soft)] dark:text-brand-200"
                    : "text-muted hover:bg-[var(--card)] hover:text-[var(--ink)]",
                )}
              >
                {n.icon({ width: 20, height: 20 })}
                <span className="flex-1">{n.label}</span>
                {n.badge ? <span className="rounded-full bg-accent-400 px-2 text-xs font-bold text-brand-950">{n.badge}</span> : null}
              </Link>
            ))}
            <button
              type="button"
              onClick={async () => {
                await backend.signOut();
                navigate(href(locale), { replace: true });
              }}
              className="mt-4 flex min-h-11 w-full items-center gap-3 rounded-xl border-t border-[var(--line)] px-3.5 pt-4 text-sm font-medium text-muted hover:text-[var(--ink)]"
            >
              <IconLogout width={20} height={20} /> {m.common.signOut}
            </button>
          </nav>
        </aside>

        <div className="min-w-0 pt-6 lg:pt-0">
          {status !== "signed-in" || !profile ? (
            <div className="space-y-4">
              <Skeleton className="h-9 w-1/2" />
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="mt-6 h-40" />
            </div>
          ) : !allowed ? (
            <div className="mx-auto max-w-lg py-10">
              <Alert tone="info" title={label}>
                <p>{profile.role === "admin" ? m.ops.admin.notAdmin : m.ops.admin.notAdmin}</p>
              </Alert>
              <ButtonLink href={href(locale, homeFor(profile.role))} className="mt-4">
                {m.common.continue}
              </ButtonLink>
            </div>
          ) : (
            children
          )}
        </div>
      </div>

      {allowed ? (
        <nav
          aria-label={label}
          className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-[var(--page)]/95 backdrop-blur-md lg:hidden"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <ul className="mx-auto grid max-w-lg" style={{ gridTemplateColumns: `repeat(${mobile.length}, minmax(0, 1fr))` }}>
            {mobile.map((n) => (
              <li key={n.key}>
                <Link
                  href={href(locale, n.path)}
                  aria-current={n.key === active ? "page" : undefined}
                  className={cn(
                    "relative flex min-h-16 flex-col items-center justify-center gap-1 text-[0.68rem] font-medium",
                    n.key === active ? "text-brand-600 dark:text-brand-300" : "text-muted",
                  )}
                >
                  {n.icon({ width: 22, height: 22 })}
                  <span className="max-w-full truncate px-1">{n.label}</span>
                  {n.badge ? <span className="absolute end-[calc(50%-1.4rem)] top-2 h-2.5 w-2.5 rounded-full bg-accent-400" /> : null}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
