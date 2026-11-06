"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { IconPin, IconSearch, IconSpinner } from "@/components/icons";
import { cn } from "@/components/ui";
import { osmGeocoder, type PlaceResult } from "@/lib/geo";
import type { Locale } from "@/lib/i18n";
import type { AppMessages } from "@/lib/messages/app.en";

/** Address search as an ARIA combobox: type, arrow through results, Enter to pick. */
export function PlaceSearch({
  locale,
  m,
  onPick,
  placeholder,
  extra,
}: {
  locale: Locale;
  m: AppMessages;
  onPick: (r: PlaceResult) => void;
  placeholder?: string;
  /** Places to offer before the map search results (e.g. known schools). */
  extra?: (query: string) => PlaceResult[];
}) {
  const L = m.location;
  const id = useId();
  const listId = `${id}-list`;
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "empty" | "error">("idle");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 3) {
      setResults([]);
      setStatus("idle");
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setStatus("loading");
      try {
        const own = extra?.(query) ?? [];
        let r: PlaceResult[] = [];
        try {
          r = await osmGeocoder.search(query, locale, ctrl.signal);
        } catch (e) {
          if (!own.length) throw e;
        }
        r = [...own, ...r];
        setResults(r);
        setActive(-1);
        setStatus(r.length ? "idle" : "empty");
      } catch {
        if (!ctrl.signal.aborted) setStatus("error");
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q, locale]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function choose(r: PlaceResult) {
    setQ(r.title);
    setOpen(false);
    onPick(r);
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      if (open && active >= 0 && results[active]) {
        e.preventDefault();
        choose(results[active]);
      } else {
        e.preventDefault();
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showList = open && q.trim().length >= 3;

  return (
    <div ref={boxRef} className="relative">
      <label htmlFor={id} className="sr-only">
        {L.searchLabel}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-4 text-muted">
          {status === "loading" ? <IconSpinner width={18} height={18} /> : <IconSearch />}
        </span>
        <input
          id={id}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined}
          autoComplete="off"
          placeholder={placeholder ?? L.searchPlaceholder}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          className="block min-h-12 w-full rounded-xl border border-[var(--line)] bg-[var(--card)] py-3 pe-4 ps-11 text-base placeholder:text-[var(--ink-muted)]/70 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15"
        />
      </div>
      {showList ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={L.searchLabel}
          className="absolute inset-x-0 top-full z-[1100] mt-1.5 max-h-80 overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--card)] p-1.5 shadow-[var(--shadow-lift)]"
        >
          {status === "loading" && !results.length ? (
            <li className="px-3 py-3 text-sm text-muted">{L.searching}</li>
          ) : status === "empty" ? (
            <li className="px-3 py-3 text-sm text-muted">{L.noResults}</li>
          ) : status === "error" ? (
            <li className="px-3 py-3 text-sm text-muted">{L.searchUnavailable}</li>
          ) : (
            results.map((r, i) => (
              <li
                key={r.id}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(r)}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5",
                  i === active ? "bg-brand-50 dark:bg-brand-900/40" : "",
                )}
              >
                <IconPin width={18} height={18} className="mt-0.5 shrink-0 text-brand-500" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{r.title}</span>
                  {r.subtitle ? <span className="block truncate text-xs text-muted">{r.subtitle}</span> : null}
                </span>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
