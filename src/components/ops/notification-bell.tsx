"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { IconBell } from "@/components/icons";
import { AppLink as Link } from "@/components/link";
import { cn } from "@/components/ui";
import type { AppNotification } from "@/lib/data";
import { formatDate } from "@/lib/domain/dates";
import { formatSar } from "@/lib/domain/money";
import { num, t } from "@/lib/format";
import { href, type Locale } from "@/lib/i18n";
import type { AppMessages } from "@/lib/messages/app.en";

/** Turn a stored event + data into a title and body in the reader's language. */
export function renderNotification(m: AppMessages, locale: Locale, n: AppNotification): { title: string; body: string } {
  const E = m.ops.notify.events as Record<string, { title: string; body: string }>;
  const d = n.data as Record<string, unknown>;
  const key = n.event === "booking_confirmed" && d.driverH != null ? "booking_confirmed_driver" : n.event;
  const tpl = E[key] ?? E.fallback;
  const reasons = m.ops.common.reasons as Record<string, string>;
  const ts = (v: unknown) =>
    typeof v === "string"
      ? new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-arab" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(v))
      : "";
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(d)) {
    if (v == null) continue;
    if (/H$/.test(k)) vars[k] = formatSar(Number(v), locale);
    else if (k === "firstDate" || k === "lastDate" || k === "endsOn") vars[k] = formatDate(String(v), locale, "weekday");
    else if (k === "expiresAt" || k === "dueAt") vars[k] = ts(v);
    else if (typeof v === "number") vars[k] = num(v, locale);
    else if (k === "reason") {
      const raw = String(v);
      const [code, ...rest] = raw.split(":");
      vars[k] = reasons[code.trim()] ? `${reasons[code.trim()]}${rest.length ? ` — ${rest.join(":").trim()}` : ""}` : raw;
    } else vars[k] = String(v);
  }
  if (locale === "ar" && d.driverAr) vars.driver = String(d.driverAr);
  return { title: t(tpl.title, vars), body: t(tpl.body, vars) };
}

export function NotificationBell({ m, locale }: { m: AppMessages; locale: Locale }) {
  const N = m.ops.notify;
  const { backend, status } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    if (status !== "signed-in") return;
    backend.notifications().then(setItems).catch(() => undefined);
  }, [backend, status]);

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  if (status !== "signed-in") return null;
  const unread = items.filter((i) => !i.readAt).length;

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`${N.open}${unread ? ` (${unread})` : ""}`}
        onClick={() => {
          setOpen((v) => !v);
          if (!open && unread) {
            void backend.markNotificationsRead().then(() => setTimeout(load, 400));
          }
        }}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--line)] text-[var(--ink)] hover:border-brand-300"
      >
        <IconBell width={19} height={19} />
        {unread ? (
          <span className="absolute -end-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-400 px-1 text-[0.65rem] font-bold text-brand-950">
            {num(Math.min(unread, 9), locale)}
            {unread > 9 ? "+" : ""}
          </span>
        ) : null}
      </button>
      {open ? (
        <div role="dialog" aria-label={N.title} className="absolute end-0 top-12 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-[var(--shadow-lift)]">
          <p className="border-b border-[var(--line)] px-4 py-3 font-semibold">{N.title}</p>
          {items.length ? (
            <ul className="max-h-[60vh] divide-y divide-[var(--line)] overflow-y-auto">
              {items.map((n) => {
                const r = renderNotification(m, locale, n);
                const inner = (
                  <div className={cn("px-4 py-3", !n.readAt && "bg-brand-50/60 dark:bg-brand-900/20")}>
                    <p className="text-sm font-semibold">{r.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted">{r.body}</p>
                    <p className="mt-1 text-[0.68rem] text-muted">
                      {new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-arab" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(n.createdAt))}
                    </p>
                  </div>
                );
                return (
                  <li key={n.id}>
                    {n.link ? (
                      <Link href={href(locale, n.link)} onClick={() => setOpen(false)} className="block hover:bg-[var(--page-subtle)]">
                        {inner}
                      </Link>
                    ) : (
                      inner
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-muted">{N.empty}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
