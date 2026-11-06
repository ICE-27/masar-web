"use client";

import { useEffect, useState } from "react";
import type { Messages } from "@/lib/messages/en";

const KEY = "masar-demo-dismissed";

export function DemoRibbon({ m }: { m: Messages }) {
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    try {
      setHidden(localStorage.getItem(KEY) === "1");
    } catch {
      setHidden(false);
    }
  }, []);

  if (hidden) return null;

  return (
    <div className="no-print border-t border-[var(--line)] bg-accent-50 dark:bg-accent-700/15">
      <div className="container-page flex items-center gap-3 py-2.5 text-xs text-accent-700 dark:text-accent-200">
        <span className="shrink-0 rounded-full bg-accent-400 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-brand-950">
          {m.demo.label}
        </span>
        <p className="flex-1 leading-relaxed">{m.demo.text}</p>
        <button
          type="button"
          onClick={() => {
            setHidden(true);
            try {
              localStorage.setItem(KEY, "1");
            } catch {
              /* nothing to persist to — it stays hidden for this visit */
            }
          }}
          className="shrink-0 rounded-full p-1.5 transition-colors hover:bg-accent-400/30"
          aria-label={m.demo.dismiss}
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
