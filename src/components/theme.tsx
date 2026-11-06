"use client";

import { useEffect, useState } from "react";
import { cn } from "./ui";

/**
 * Runs before paint so the page never flashes the wrong theme.
 * Browser storage can throw (private mode, blocked site data), so every
 * access is wrapped and the page still renders correctly without it.
 */
export const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem('masar-theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (stored === 'dark' || (stored !== 'light' && prefersDark)) {
      document.documentElement.classList.add('dark');
    }
  } catch (e) {}
})();
`;

export function ThemeToggle({ label }: { label: string }) {
  const [isDark, setIsDark] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
    setReady(true);
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("masar-theme", next ? "dark" : "light");
    } catch {
      /* storage unavailable — the toggle still works for this visit */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-full",
        "border border-[var(--line)] text-[var(--ink-muted)]",
        "transition-colors hover:text-brand-600 hover:border-brand-300",
        "dark:hover:text-brand-300",
      )}
    >
      {/* Render a stable icon until mounted so server and client agree */}
      {ready && isDark ? (
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          className="h-[18px] w-[18px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          className="h-[18px] w-[18px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20.5 14.3A8.5 8.5 0 1 1 9.7 3.5a7 7 0 0 0 10.8 10.8Z" />
        </svg>
      )}
    </button>
  );
}
