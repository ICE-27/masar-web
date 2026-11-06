import { LogoMark } from "./logo";
import type { Locale } from "@/lib/i18n";

/**
 * A stylised preview of the live-tracking screen, used in the hero so the
 * landing page shows the product rather than only describing it.
 */
export function TripPreview({ locale }: { locale: Locale }) {
  const ar = locale === "ar";

  const t = {
    live: ar ? "مباشر" : "Live",
    driver: ar ? "أبو خالد" : "Abu Khalid",
    vehicle: ar ? "تويوتا كوستر · ٢٢ مقعدًا" : "Toyota Coaster · 22 seats",
    plate: ar ? "ر ن ب ٤٣٢١" : "4321 RNB",
    eta: ar ? "الوصول خلال ٦ دقائق" : "Arriving in 6 min",
    steps: ar
      ? ["انطلق السائق", "على بُعد ٥ دقائق", "وصل إلى بابك", "ركب سارة"]
      : ["Driver set off", "5 minutes away", "Arrived at your door", "Sara is on board"],
    times: ar ? ["٦:٣٠", "٦:٣٨", "٦:٤٢", "٦:٤٣"] : ["6:30", "6:38", "6:42", "6:43"],
    verified: ar ? "موثّق" : "Verified",
  };

  return (
    <div className="relative mx-auto w-full max-w-sm">
      {/* soft halo */}
      <div
        aria-hidden
        className="absolute -inset-6 rounded-[2.5rem] bg-brand-500/10 blur-2xl"
      />

      <div className="relative overflow-hidden rounded-[1.75rem] border border-[var(--line)] bg-card shadow-[var(--shadow-lift)]">
        {/* map area */}
        <div className="relative h-44 bg-brand-50 dark:bg-brand-900/40">
          <svg
            viewBox="0 0 320 176"
            className="absolute inset-0 h-full w-full"
            aria-hidden
          >
            {/* street grid */}
            <g stroke="currentColor" className="text-brand-500/15" strokeWidth="8">
              <path d="M-10 54h340M-10 126h340M78 -10v200M212 -10v200" />
            </g>
            {/* the route */}
            <path
              d="M40 140 C 90 140, 92 92, 140 88 S 210 70, 266 36"
              fill="none"
              stroke="var(--color-brand-500)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray="1 11"
            />
            {/* destination */}
            <circle cx="266" cy="36" r="7" fill="var(--color-accent-400)" />
            {/* vehicle */}
            <g>
              <circle
                cx="140"
                cy="88"
                r="15"
                fill="var(--color-brand-500)"
                opacity="0.25"
                className="animate-[pulse-live_2s_ease-in-out_infinite]"
                style={{ transformOrigin: "140px 88px" }}
              />
              <circle cx="140" cy="88" r="8" fill="var(--color-brand-500)" />
              <circle cx="140" cy="88" r="3" fill="#fff" />
            </g>
          </svg>

          <div className="absolute top-3 inline-flex items-center gap-1.5 rounded-full bg-[var(--card)]/95 px-2.5 py-1 text-[0.65rem] font-semibold shadow-sm ltr:left-3 rtl:right-3">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500 animate-[pulse-live_2s_ease-in-out_infinite]" />
            {t.live}
          </div>
          <div className="absolute bottom-3 rounded-full bg-[var(--card)]/95 px-3 py-1 text-[0.68rem] font-medium shadow-sm ltr:right-3 rtl:left-3">
            {t.eta}
          </div>
        </div>

        {/* driver row */}
        <div className="flex items-center gap-3 border-b border-[var(--line)] p-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-100 dark:bg-brand-800">
            <LogoMark className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-sm font-semibold">{t.driver}</p>
              <svg
                viewBox="0 0 20 20"
                aria-label={t.verified}
                className="h-4 w-4 shrink-0 text-brand-500"
                fill="currentColor"
              >
                <path d="M10 1.5 12 3l2.4-.4 1 2.2 2.2 1-.4 2.4 1.5 2-1.5 2 .4 2.4-2.2 1-1 2.2-2.4-.4-2 1.5-2-1.5-2.4.4-1-2.2-2.2-1 .4-2.4L1.3 10l1.5-2-.4-2.4 2.2-1 1-2.2L8 3Z" />
                <path
                  d="M6.6 10.2 8.9 12.5l4.5-4.8"
                  fill="none"
                  stroke="#fff"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <p className="truncate text-xs text-muted">{t.vehicle}</p>
          </div>
          <span className="shrink-0 rounded-md border border-[var(--line)] px-2 py-1 font-mono text-[0.65rem] tracking-wider">
            {t.plate}
          </span>
        </div>

        {/* timeline */}
        <ol className="space-y-0 p-4">
          {t.steps.map((step, i) => {
            const done = i < 3;
            const current = i === 3;
            return (
              <li key={step} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className={
                      done || current
                        ? "mt-1 grid h-4 w-4 place-items-center rounded-full bg-brand-500"
                        : "mt-1 h-4 w-4 rounded-full border-2 border-[var(--line)]"
                    }
                  >
                    {done || current ? (
                      <svg
                        viewBox="0 0 12 12"
                        className="h-2.5 w-2.5 text-white"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M2.5 6.2 5 8.6l4.5-5" />
                      </svg>
                    ) : null}
                  </span>
                  {i < t.steps.length - 1 ? (
                    <span className="my-0.5 w-0.5 flex-1 bg-brand-200 dark:bg-brand-700" />
                  ) : null}
                </div>
                <div className="flex flex-1 items-start justify-between gap-2 pb-3">
                  <p
                    className={
                      current
                        ? "text-sm font-semibold"
                        : "text-sm text-muted"
                    }
                  >
                    {step}
                  </p>
                  <span className="shrink-0 text-xs tabular-nums text-muted">
                    {t.times[i]}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
