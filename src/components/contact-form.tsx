"use client";

import { useState } from "react";
import { Button } from "./ui";
import type { Messages } from "@/lib/messages/en";

const field =
  "w-full rounded-xl border border-[var(--line)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)] transition-colors focus:border-brand-400 focus:outline-none";

export function ContactForm({ m }: { m: Messages }) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("sending");
    // Demo mode: nothing is sent. Milestone 2 wires this to the database.
    window.setTimeout(() => setState("sent"), 700);
  }

  if (state === "sent") {
    return (
      <div
        role="status"
        className="rounded-2xl border border-brand-200 bg-brand-50 p-8 text-center dark:border-brand-700 dark:bg-brand-900/30"
      >
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-500 text-white">
          <svg
            viewBox="0 0 24 24"
            aria-hidden
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
        </span>
        <p className="mt-4 text-sm font-medium">{m.contact.sent}</p>
        <p className="mt-2 text-xs text-muted">{m.contact.demoNote}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate={false}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="mb-1.5 block text-sm font-medium">
            {m.contact.name}
          </label>
          <input id="name" name="name" required className={field} />
        </div>
        <div>
          <label htmlFor="phone" className="mb-1.5 block text-sm font-medium">
            {m.contact.phone}
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            dir="ltr"
            placeholder="05XXXXXXXX"
            pattern="0[0-9]{9}"
            required
            className={field}
          />
        </div>
      </div>

      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
          {m.contact.email}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          dir="ltr"
          required
          className={field}
        />
      </div>

      <div>
        <label htmlFor="topic" className="mb-1.5 block text-sm font-medium">
          {m.contact.topic}
        </label>
        <select id="topic" name="topic" className={field} defaultValue="">
          <option value="" disabled>
            —
          </option>
          {m.contact.topics.map((topic) => (
            <option key={topic} value={topic}>
              {topic}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="message" className="mb-1.5 block text-sm font-medium">
          {m.contact.message}
        </label>
        <textarea
          id="message"
          name="message"
          rows={5}
          required
          className={`${field} resize-y`}
        />
      </div>

      <Button type="submit" size="lg" className="w-full sm:w-auto">
        {state === "sending" ? m.contact.sending : m.contact.send}
      </Button>

      <p className="text-xs text-muted">{m.contact.demoNote}</p>
    </form>
  );
}
