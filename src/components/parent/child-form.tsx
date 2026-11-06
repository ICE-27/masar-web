"use client";

import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  Alert,
  Choice,
  Field,
  Input,
  Select,
  SubmitButton,
  Textarea,
  useDraft,
} from "@/components/form";
import { IconLock, IconPlus, IconTrash } from "@/components/icons";
import type { Child, Destination, Gender } from "@/lib/data";
import { errorText, num, t } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { AppMessages } from "@/lib/messages/app.en";
import { ageFrom, childSchema, fieldErrors, formatSaudiMobile, todayIso } from "@/lib/validation";

export const GRADE_CODES = [
  "kg1", "kg2", "kg3", "g1", "g2", "g3", "g4", "g5", "g6", "g7", "g8", "g9", "g10", "g11", "g12",
] as const;

type Form = {
  fullName: string;
  gender: Gender | "";
  dateOfBirth: string;
  schoolName: string;
  grade: string;
  driverNotes: string;
  medicalNotes: string;
  emergencyName: string;
  emergencyPhone: string;
  authorizedPickups: { name: string; phone: string; relation: string }[];
};

const EMPTY: Form = {
  fullName: "",
  gender: "",
  dateOfBirth: "",
  schoolName: "",
  grade: "",
  driverNotes: "",
  medicalNotes: "",
  emergencyName: "",
  emergencyPhone: "",
  authorizedPickups: [],
};

function fromChild(c: Child): Form {
  return {
    fullName: c.fullName,
    gender: c.gender,
    dateOfBirth: c.dateOfBirth,
    schoolName: c.schoolName ?? "",
    grade: c.grade ?? "",
    driverNotes: c.driverNotes ?? "",
    medicalNotes: c.medicalNotes ?? "",
    emergencyName: c.emergencyName ?? "",
    emergencyPhone: formatSaudiMobile(c.emergencyPhone),
    authorizedPickups: c.authorizedPickups.map((p) => ({ ...p, phone: formatSaudiMobile(p.phone) })),
  };
}

export function ChildForm({
  m,
  locale,
  initial,
  onSaved,
  submitLabel,
  draftKey,
  secondaryAction,
}: {
  m: AppMessages;
  locale: Locale;
  initial?: Child | null;
  onSaved: (c: Child) => void;
  submitLabel?: string;
  draftKey?: string;
  secondaryAction?: ReactNode;
}) {
  const C = m.child;
  const { backend } = useAuth();
  const listId = useId();
  const [plain, setPlain] = useState<Form>(initial ? fromChild(initial) : EMPTY);
  const [drafted, setDrafted, clearDraft] = useDraft<Form>(draftKey ?? "masar-draft-unused", EMPTY);
  const useStored = !!draftKey && !initial;
  const form = useStored ? drafted : plain;
  const setForm = useStored ? setDrafted : setPlain;

  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    backend.listDestinations().then(setDestinations).catch(() => setDestinations([]));
  }, [backend]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    // Clear the error once the parent starts fixing that field
    setErrors((e) => {
      const keys = Object.keys(e).filter((x) => x === k || x.startsWith(`${String(k)}.`));
      if (!keys.length) return e;
      const next = { ...e };
      keys.forEach((x) => delete next[x]);
      return next;
    });
  };
  const err = (k: string) => (errors[k] ? errorText(m, errors[k]) : null);
  const age = form.dateOfBirth ? ageFrom(form.dateOfBirth) : null;
  const destName = (d: Destination) => (locale === "ar" ? d.nameAr : d.nameEn);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    const parsed = childSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setSubmitError(errorText(m, "fixBelow"));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const d = parsed.data;
      const match = destinations.find(
        (x) => x.nameEn.toLowerCase() === d.schoolName.toLowerCase() || x.nameAr === d.schoolName,
      );
      const saved = await backend.saveChild({
        id: initial?.id,
        fullName: d.fullName,
        gender: d.gender,
        dateOfBirth: d.dateOfBirth,
        schoolName: d.schoolName || null,
        destinationId: match?.id ?? null,
        grade: d.grade || null,
        driverNotes: d.driverNotes || null,
        medicalNotes: d.medicalNotes || null,
        emergencyName: d.emergencyName || null,
        emergencyPhone: d.emergencyPhone,
        authorizedPickups: d.authorizedPickups,
      });
      if (useStored) {
        clearDraft();
        setDrafted(EMPTY);
      }
      onSaved(saved);
    } catch (err) {
      setSubmitError(errorText(m, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-8">
      <section className="space-y-4">
        <SectionTitle>{C.basics}</SectionTitle>
        <Field label={C.fullName} error={err("fullName")}>
          {(p) => (
            <Input {...p} invalid={p.invalid} value={form.fullName} onChange={(e) => set("fullName", e.target.value)} autoComplete="off" />
          )}
        </Field>
        <Choice<Gender>
          name="gender"
          legend={C.gender}
          value={form.gender}
          onChange={(v) => set("gender", v)}
          error={err("gender")}
          options={[
            { value: "boy", label: C.boy },
            { value: "girl", label: C.girl },
          ]}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={C.dob}
            error={err("dateOfBirth")}
            hint={age !== null && age >= 0 ? t(age > 10 ? C.ageMany : C.age, { n: num(age, locale) }) : undefined}
          >
            {(p) => (
              <Input
                {...p}
                invalid={p.invalid}
                type="date"
                max={todayIso()}
                min="2004-01-01"
                value={form.dateOfBirth}
                onChange={(e) => set("dateOfBirth", e.target.value)}
              />
            )}
          </Field>
          <Field label={C.grade} optional optionalText={m.common.optional} error={err("grade")}>
            {(p) => (
              <Select {...p} value={form.grade} onChange={(e) => set("grade", e.target.value)}>
                <option value="">{C.gradeNone}</option>
                {GRADE_CODES.map((g) => (
                  <option key={g} value={g}>
                    {C.grades[g]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label={C.school} hint={C.schoolHint} optional optionalText={m.common.optional} error={err("schoolName")}>
          {(p) => (
            <>
              <Input {...p} list={listId} value={form.schoolName} onChange={(e) => set("schoolName", e.target.value)} autoComplete="off" />
              <datalist id={listId}>
                {destinations.map((d) => (
                  <option key={d.id} value={destName(d)}>
                    {d.city}
                  </option>
                ))}
              </datalist>
            </>
          )}
        </Field>
      </section>

      <section className="space-y-4">
        <SectionTitle>{C.care}</SectionTitle>
        <Field label={C.driverNotes} hint={C.driverNotesHint} optional optionalText={m.common.optional} error={err("driverNotes")}>
          {(p) => <Textarea {...p} value={form.driverNotes} onChange={(e) => set("driverNotes", e.target.value)} />}
        </Field>
        <Field
          label={
            <span className="inline-flex items-center gap-1.5">
              <IconLock width={15} height={15} className="text-brand-500" />
              {C.medicalNotes}
            </span>
          }
          hint={C.medicalNotesHint}
          optional
          optionalText={m.common.optional}
          error={err("medicalNotes")}
        >
          {(p) => <Textarea {...p} value={form.medicalNotes} onChange={(e) => set("medicalNotes", e.target.value)} />}
        </Field>
      </section>

      <section className="space-y-4">
        <SectionTitle>{C.emergency}</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={C.emergencyName} optional optionalText={m.common.optional} error={err("emergencyName")}>
            {(p) => <Input {...p} value={form.emergencyName} onChange={(e) => set("emergencyName", e.target.value)} autoComplete="off" />}
          </Field>
          <Field label={C.emergencyPhone} optional optionalText={m.common.optional} error={err("emergencyPhone")}>
            {(p) => (
              <Input
                {...p}
                invalid={p.invalid}
                type="tel"
                inputMode="tel"
                dir="ltr"
                placeholder="05X XXX XXXX"
                className="rtl:text-right"
                value={form.emergencyPhone}
                onChange={(e) => set("emergencyPhone", e.target.value)}
              />
            )}
          </Field>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <SectionTitle>{C.pickups}</SectionTitle>
          <p className="mt-1 text-sm text-muted">{C.pickupsHint}</p>
        </div>
        {form.authorizedPickups.map((pk, i) => (
          <div key={i} className="rounded-2xl border border-[var(--line)] bg-[var(--page-subtle)] p-4">
            <div className="grid gap-3 sm:grid-cols-[1.2fr_1fr_1fr_auto] sm:items-start">
              <Field label={C.pickupName} error={err(`authorizedPickups.${i}.name`)}>
                {(p) => (
                  <Input
                    {...p}
                    invalid={p.invalid}
                    value={pk.name}
                    onChange={(e) =>
                      set("authorizedPickups", form.authorizedPickups.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                    }
                  />
                )}
              </Field>
              <Field label={C.pickupPhone} error={err(`authorizedPickups.${i}.phone`)}>
                {(p) => (
                  <Input
                    {...p}
                    invalid={p.invalid}
                    type="tel"
                    inputMode="tel"
                    dir="ltr"
                    className="rtl:text-right"
                    placeholder="05X XXX XXXX"
                    value={pk.phone}
                    onChange={(e) =>
                      set("authorizedPickups", form.authorizedPickups.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))
                    }
                  />
                )}
              </Field>
              <Field label={C.pickupRelation} optional optionalText={m.common.optional} error={err(`authorizedPickups.${i}.relation`)}>
                {(p) => (
                  <Input
                    {...p}
                    placeholder={C.pickupRelationHint}
                    value={pk.relation}
                    onChange={(e) =>
                      set("authorizedPickups", form.authorizedPickups.map((x, j) => (j === i ? { ...x, relation: e.target.value } : x)))
                    }
                  />
                )}
              </Field>
              <button
                type="button"
                onClick={() => set("authorizedPickups", form.authorizedPickups.filter((_, j) => j !== i))}
                aria-label={t(C.removePickup, { name: pk.name || String(i + 1) })}
                className="inline-flex h-12 w-12 items-center justify-center self-end justify-self-end rounded-xl text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
              >
                <IconTrash />
              </button>
            </div>
          </div>
        ))}
        {form.authorizedPickups.length < 5 ? (
          <button
            type="button"
            onClick={() => set("authorizedPickups", [...form.authorizedPickups, { name: "", phone: "", relation: "" }])}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-dashed border-brand-400 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 dark:text-brand-200 dark:hover:bg-brand-900/30"
          >
            <IconPlus width={18} height={18} />
            {C.addPickup}
          </button>
        ) : null}
      </section>

      {submitError ? <Alert tone="error">{submitError}</Alert> : null}

      <div className="flex flex-col-reverse gap-3 border-t border-[var(--line)] pt-5 sm:flex-row sm:items-center sm:justify-between">
        {secondaryAction ?? <span />}
        <SubmitButton busy={busy} busyText={m.common.saving} className="w-full sm:w-auto">
          {submitLabel ?? C.save}
        </SubmitButton>
      </div>
    </form>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-base font-semibold">{children}</h3>;
}
