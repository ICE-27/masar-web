"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === "1";

/**
 * In the static preview the site can live under any sub-path, so "/en/account"
 * must become ".../en/account/index.html" relative to wherever the site is.
 * The export injects self.__MASAR_BASE__ (the URL of the assets folder), which
 * tells us where the site root is. On Vercel, paths are returned unchanged.
 */
export function resolveHref(path: string): string {
  if (!STATIC || typeof window === "undefined" || !path.startsWith("/")) return path;
  const base = (self as unknown as { __MASAR_BASE__?: string }).__MASAR_BASE__;
  if (!base) return path;
  const root = base.replace(/(?:_next|next-assets)\/$/, "");
  const [beforeHash, hash] = path.split("#");
  const [pathname, query] = beforeHash.split("?");
  const clean = pathname.replace(/^\/+|\/+$/g, "");
  return `${root}${clean ? `${clean}/` : ""}index.html${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
}

export function useNavigate() {
  const router = useRouter();
  return useCallback(
    (path: string, opts: { replace?: boolean } = {}) => {
      if (STATIC) {
        const target = resolveHref(path);
        if (opts.replace) window.location.replace(target);
        else window.location.assign(target);
        return;
      }
      if (opts.replace) router.replace(path);
      else router.push(path);
    },
    [router],
  );
}

/** Read a query parameter without useSearchParams (keeps pages statically exportable). */
export function getQueryParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return new URLSearchParams(window.location.search).get(name);
  } catch {
    return null;
  }
}

/** Only allow in-site redirects like /en/account, never another domain. */
export function safeNext(value: string | null, fallback: string): string {
  if (value && /^\/(ar|en)(\/[\w\-/]*)?(\?[\w\-=&%.]*)?$/.test(value)) return value;
  return fallback;
}

/**
 * A query parameter, read after the page has mounted.
 *
 * During a client-side navigation the new page renders before the address
 * bar changes, so reading window.location while rendering can return the
 * previous page's query. Effects run after the URL is committed, so this is
 * reliable. `undefined` means "not read yet"; `null` means "not present".
 */
export function useQueryParam(name: string): string | null | undefined {
  const [value, setValue] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const read = () => setValue(getQueryParam(name));
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, [name]);
  return value;
}
