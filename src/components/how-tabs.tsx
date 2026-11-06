"use client";

import { useId, useState } from "react";
import { cn } from "./ui";

type Step = { title: string; body: string };

export function HowTabs({
  parentsLabel,
  driversLabel,
  parents,
  drivers,
  stepWord,
}: {
  parentsLabel: string;
  driversLabel: string;
  parents: readonly Step[];
  drivers: readonly Step[];
  stepWord: string;
}) {
  const [tab, setTab] = useState<0 | 1>(0);
  const base = useId();
  const steps = tab === 0 ? parents : drivers;
  const labels = [parentsLabel, driversLabel];

  return (
    <div className="mt-10">
      <div
        role="tablist"
        aria-label={parentsLabel + " / " + driversLabel}
        className="mx-auto flex w-full max-w-sm rounded-full border border-[var(--line)] bg-card p-1"
      >
        {labels.map((label, i) => (
          <button
            key={label}
            role="tab"
            id={`${base}-tab-${i}`}
            aria-selected={tab === i}
            aria-controls={`${base}-panel-${i}`}
            type="button"
            onClick={() => setTab(i as 0 | 1)}
            className={cn(
              "flex-1 rounded-full px-4 py-2.5 text-sm font-semibold transition-all duration-200",
              tab === i
                ? "bg-brand-500 text-white shadow-[0_6px_16px_-8px_rgba(0,151,103,0.9)]"
                : "text-muted hover:text-[var(--ink)]",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`${base}-panel-${tab}`}
        aria-labelledby={`${base}-tab-${tab}`}
        className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4"
      >
        {steps.map((step, i) => (
          <div
            key={step.title}
            className="relative animate-[fade-up_0.5s_cubic-bezier(0.16,1,0.3,1)_both]"
            style={{ animationDelay: `${i * 70}ms` }}
          >
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-500 text-sm font-bold text-white">
                {i + 1}
              </span>
              <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted">
                {stepWord} {i + 1}
              </span>
            </div>
            <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              {step.body}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
