"use client";

import { useId, useState } from "react";
import { cn } from "./ui";

export type QA = { q: string; a: string };

export function Accordion({ items }: { items: readonly QA[] }) {
  const [open, setOpen] = useState<number | null>(0);
  const base = useId();

  return (
    <div className="divide-y divide-[var(--line)] overflow-hidden rounded-2xl border border-[var(--line)] bg-card">
      {items.map((item, i) => {
        const expanded = open === i;
        const panelId = `${base}-panel-${i}`;
        const buttonId = `${base}-button-${i}`;
        return (
          <div key={item.q}>
            <h3>
              <button
                type="button"
                id={buttonId}
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => setOpen(expanded ? null : i)}
                className="flex w-full items-start gap-4 px-5 py-5 text-start transition-colors hover:bg-brand-50/60 dark:hover:bg-brand-900/20 sm:px-6"
              >
                <span className="flex-1 text-base font-semibold leading-relaxed">
                  {item.q}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[var(--line)] transition-transform duration-200",
                    expanded && "rotate-45 border-brand-400 text-brand-600",
                  )}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </span>
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              hidden={!expanded}
              className="px-5 pb-6 sm:px-6"
            >
              <p className="max-w-3xl text-sm leading-relaxed text-muted sm:text-[0.95rem]">
                {item.a}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
