"use client";

import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "./ui";
import { IconAlert, IconCheck, IconInfo, IconSpinner, IconX } from "./icons";

export const controlClass =
  "block w-full min-h-12 rounded-xl border bg-[var(--card)] px-4 py-3 text-base text-[var(--ink)] placeholder:text-[var(--ink-muted)]/70 transition-colors duration-150 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 disabled:opacity-60";

const okBorder = "border-[var(--line)] hover:border-brand-300 dark:hover:border-brand-700";
const errBorder = "border-red-500 focus:border-red-500 focus:ring-red-500/15";

interface ControlProps {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  invalid: boolean;
}

export function Field({
  label,
  hint,
  error,
  optional,
  optionalText,
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
  optionalText?: string;
  className?: string;
  children: (props: ControlProps) => ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="flex items-baseline justify-between gap-2 text-sm font-medium">
        <span>{label}</span>
        {optional ? <span className="text-xs font-normal text-muted">{optionalText}</span> : null}
      </label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined, invalid: !!error })}
      {hint && !error ? (
        <p id={hintId} className="text-xs leading-relaxed text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errId} className="flex items-start gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
          <IconAlert width={14} height={14} className="mt-0.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean };

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(controlClass, invalid ? errBorder : okBorder, className)} {...props} />;
});

export function Textarea({
  invalid,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      rows={3}
      className={cn(controlClass, "min-h-24 resize-y leading-relaxed", invalid ? errBorder : okBorder, className)}
      {...props}
    />
  );
}

export function Select({
  invalid,
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <select
      className={cn(
        controlClass,
        "appearance-none bg-no-repeat pe-10 [background-position:right_1rem_center] rtl:[background-position:left_1rem_center] [background-size:1rem]",
        "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%2364748b%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')]",
        invalid ? errBorder : okBorder,
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function PasswordInput({
  showLabel,
  hideLabel,
  ...props
}: InputProps & { showLabel: string; hideLabel: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={shown ? "text" : "password"} className="pe-20" dir="ltr" />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-pressed={shown}
        aria-label={shown ? hideLabel : showLabel}
        className="absolute inset-y-1.5 end-1.5 rounded-lg px-3 text-xs font-semibold text-brand-600 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-900/40"
      >
        {shown ? hideLabel : showLabel}
      </button>
    </div>
  );
}

/** Two-to-four big choices (boy/girl, language, address label) as real radios. */
export function Choice<T extends string>({
  name,
  value,
  onChange,
  options,
  legend,
  error,
  columns = 2,
}: {
  name: string;
  value: T | "";
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  legend: ReactNode;
  error?: string | null;
  columns?: 2 | 3 | 4;
}) {
  const errId = useId();
  return (
    <fieldset className="space-y-1.5" aria-describedby={error ? errId : undefined}>
      <legend className="mb-1.5 text-sm font-medium">{legend}</legend>
      <div className={cn("grid gap-2", columns === 2 ? "grid-cols-2" : columns === 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4")}>
        {options.map((o) => {
          const checked = value === o.value;
          return (
            <label
              key={o.value}
              className={cn(
                "relative flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all duration-150",
                "has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-brand-500/25",
                checked
                  ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200"
                  : error
                    ? "border-red-400 hover:border-red-500"
                    : "border-[var(--line)] hover:border-brand-300",
              )}
            >
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={checked}
                onChange={() => onChange(o.value)}
                className="sr-only"
              />
              {checked ? <IconCheck width={16} height={16} /> : null}
              {o.label}
            </label>
          );
        })}
      </div>
      {error ? (
        <p id={errId} className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
          <IconAlert width={14} height={14} />
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

export function Checkbox({
  checked,
  onChange,
  children,
  hint,
  error,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
  hint?: ReactNode;
  error?: string | null;
}) {
  const id = useId();
  return (
    <div>
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-e` : hint ? `${id}-h` : undefined}
          className={cn(
            "mt-0.5 h-6 w-6 shrink-0 cursor-pointer rounded-md accent-brand-500",
            error && "outline outline-2 outline-red-500",
          )}
        />
        <label htmlFor={id} className="cursor-pointer text-sm leading-relaxed">
          {children}
        </label>
      </div>
      {hint && !error ? (
        <p id={`${id}-h`} className="ms-9 mt-0.5 text-xs leading-relaxed text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-e`} className="ms-9 mt-1 text-xs font-medium text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: "info" | "error" | "success" | "warning";
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const tones = {
    info: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100",
    error: "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100",
    success:
      "border-brand-200 bg-brand-50 text-brand-900 dark:border-brand-800 dark:bg-brand-900/30 dark:text-brand-100",
    warning:
      "border-accent-200 bg-accent-50 text-accent-700 dark:border-accent-700/50 dark:bg-accent-700/15 dark:text-accent-200",
  } as const;
  const Icon = tone === "success" ? IconCheck : tone === "info" ? IconInfo : IconAlert;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-xl border px-4 py-3 text-sm leading-relaxed", tones[tone], className)}
    >
      <Icon className="mt-0.5 shrink-0" width={18} height={18} />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={title ? "mt-0.5" : ""}>{children}</div> : null}
      </div>
    </div>
  );
}

/** A primary submit button with a built-in busy state. */
export function SubmitButton({
  busy,
  children,
  busyText,
  className,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  busy?: boolean;
  busyText?: ReactNode;
  variant?: "primary" | "secondary" | "danger";
}) {
  const styles = {
    primary:
      "bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700 shadow-[0_8px_20px_-10px_rgba(0,151,103,0.9)]",
    secondary:
      "bg-[var(--card)] text-[var(--ink)] border border-[var(--line)] hover:border-brand-400 hover:text-brand-600 dark:hover:text-brand-300",
    danger: "bg-red-600 text-white hover:bg-red-700",
  } as const;
  return (
    <button
      type="submit"
      disabled={busy || props.disabled}
      aria-busy={busy || undefined}
      className={cn(
        "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 py-3 text-base font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60",
        styles[variant],
        className,
      )}
      {...props}
    >
      {busy ? <IconSpinner /> : null}
      {busy && busyText ? busyText : children}
    </button>
  );
}

/**
 * Accessible modal built on <dialog>: focus is trapped, Esc closes it, and
 * focus returns to the opener. Full-screen sheet on phones, centred card above.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  closeLabel,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  closeLabel: string;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      document.body.style.overflow = "hidden";
    }
    if (!open && d.open) d.close();
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={cn(
        "m-0 h-dvh max-h-dvh w-full max-w-none bg-[var(--page)] p-0 text-[var(--ink)] backdrop:bg-slate-950/50 backdrop:backdrop-blur-sm",
        "sm:m-auto sm:h-auto sm:max-h-[calc(100dvh-4rem)] sm:rounded-2xl sm:border sm:border-[var(--line)] sm:shadow-[var(--shadow-lift)]",
        wide ? "sm:max-w-3xl" : "sm:max-w-xl",
      )}
    >
      {open ? (
        <div className="flex h-full max-h-[inherit] flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3 sm:px-6">
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-[var(--page-subtle)]"
            >
              <IconX />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">{children}</div>
        </div>
      ) : null}
    </dialog>
  );
}

/** Remembers an in-progress form in this browser so a parent can leave and resume. */
export function useDraft<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void, () => void] {
  const [value, setValue] = useState<T>(initial);
  const loaded = useRef(false);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) setValue({ ...initial, ...JSON.parse(raw) });
    } catch {
      /* no draft */
    }
    loaded.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    if (!loaded.current) return;
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage blocked */
    }
  }, [key, value]);
  const clear = () => {
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  };
  return [value, setValue, clear];
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-[var(--line)]/60", className)} aria-hidden />;
}
