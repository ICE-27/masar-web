"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { Input } from "@/components/form";
import { IconAlert, IconCheck, IconSpinner } from "@/components/icons";
import { cn } from "@/components/ui";
import type { DocKind, DriverApplication, DriverDoc } from "@/lib/data";
import { errorText } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { AppMessages } from "@/lib/messages/app.en";

const MAX_BYTES = 8 * 1024 * 1024;

/** Shrink a photo before upload: longest side 1600px, JPEG ~0.82. PDFs pass through. */
export async function compressImage(file: File, max = 1600, quality = 0.82): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

/**
 * One document: optional expiry date, camera or file, preview with replace,
 * and its review status. Uploads straight to private storage.
 */
export function DocUpload({
  m,
  kind,
  label,
  tip,
  doc,
  needsExpiry,
  capture = "environment",
  onSaved,
  compact,
}: {
  m: AppMessages;
  locale: Locale;
  kind: DocKind;
  label: string;
  tip?: string;
  doc: DriverDoc | undefined;
  needsExpiry?: boolean;
  capture?: "environment" | "user";
  onSaved: (app: DriverApplication) => void;
  compact?: boolean;
}) {
  const U = m.ops.dw.upload;
  const { backend } = useAuth();
  const id = useId();
  const camRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expiry, setExpiry] = useState(doc?.expiry ?? "");

  useEffect(() => setExpiry(doc?.expiry ?? ""), [doc?.expiry]);

  // Show what is stored (signed URL for private files)
  useEffect(() => {
    let alive = true;
    if (!doc) {
      setPreview(null);
      return;
    }
    setIsPdf(doc.path.endsWith(".pdf"));
    backend.fileUrl(doc).then((u) => alive && setPreview(u));
    return () => {
      alive = false;
    };
  }, [doc, backend]);

  async function pick(f: File | undefined) {
    if (!f) return;
    setError(null);
    if (needsExpiry && !expiry) {
      setError(U.expiryFirst);
      return;
    }
    if (!/^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/.test(f.type) && !f.type.startsWith("image/")) {
      setError(errorText(m, "file_type"));
      return;
    }
    setBusy(true);
    try {
      const blob = await compressImage(f);
      if (blob.size > MAX_BYTES) throw new Error("file_too_large");
      const local = URL.createObjectURL(blob);
      setIsPdf(blob.type === "application/pdf");
      setPreview(local);
      const app = await backend.uploadDocument(kind, blob, needsExpiry ? expiry : null);
      onSaved(app);
    } catch (e) {
      setError(e instanceof Error && e.message === "file_too_large" ? errorText(m, "file_too_large") : errorText(m, e));
    } finally {
      setBusy(false);
      if (camRef.current) camRef.current.value = "";
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function saveExpiry(v: string) {
    setExpiry(v);
    if (!doc || !v || v === doc.expiry) return;
    setBusy(true);
    setError(null);
    try {
      onSaved(await backend.updateDocumentExpiry(doc, v));
    } catch (e) {
      setError(errorText(m, e));
    } finally {
      setBusy(false);
    }
  }

  const status = doc?.status;
  return (
    <div className={cn("rounded-2xl border bg-[var(--card)] p-4", status === "rejected" ? "border-red-300 dark:border-red-900" : "border-[var(--line)]")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p id={`${id}-l`} className="text-sm font-semibold">{label}</p>
          {tip && !compact ? <p className="mt-0.5 text-xs text-muted">{tip}</p> : null}
        </div>
        {status ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.7rem] font-semibold",
              status === "approved"
                ? "bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200"
                : status === "rejected"
                  ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200"
                  : "bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-200",
            )}
          >
            {status === "approved" ? <IconCheck width={12} height={12} /> : null}
            {status === "approved" ? U.approved : status === "rejected" ? U.rejected : U.pending}
          </span>
        ) : (
          <span className="text-[0.7rem] font-medium text-muted">{U.required}</span>
        )}
      </div>
      {status === "rejected" && doc?.rejectReason ? (
        <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-red-700 dark:text-red-300">
          <IconAlert width={14} height={14} className="mt-0.5 shrink-0" /> {doc.rejectReason}
        </p>
      ) : null}

      {needsExpiry ? (
        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-medium text-muted">{m.ops.dw.vehicle.expiry}</span>
          <Input type="date" value={expiry} min={new Date().toISOString().slice(0, 10)} onChange={(e) => (doc ? void saveExpiry(e.target.value) : setExpiry(e.target.value))} className="min-h-11 py-2" />
        </label>
      ) : null}

      <div className="mt-3 flex items-center gap-3">
        {preview ? (
          isPdf ? (
            <a href={preview} target="_blank" rel="noreferrer" className="flex h-16 w-20 shrink-0 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--page-subtle)] text-xs font-bold text-muted">
              PDF
            </a>
          ) : (
            <a href={preview} target="_blank" rel="noreferrer" className="shrink-0" aria-label={U.view}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="" className="h-16 w-20 rounded-xl border border-[var(--line)] object-cover" />
            </a>
          )
        ) : null}
        <div className="flex flex-wrap gap-2">
          <input ref={camRef} type="file" accept="image/*" capture={capture} className="sr-only" aria-labelledby={`${id}-l`} onChange={(e) => pick(e.target.files?.[0])} />
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" aria-labelledby={`${id}-l`} onChange={(e) => pick(e.target.files?.[0])} />
          <button
            type="button"
            disabled={busy}
            onClick={() => camRef.current?.click()}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
          >
            {busy ? <IconSpinner /> : null}
            {busy ? U.uploading : doc ? U.retake : U.take}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="inline-flex min-h-11 items-center rounded-full border border-[var(--line)] px-4 text-sm font-medium hover:border-brand-400 disabled:opacity-60"
          >
            {U.choose}
          </button>
        </div>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
