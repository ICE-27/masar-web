"use client";

import NextLink from "next/link";
import type { ComponentProps } from "react";
import { resolveHref } from "@/lib/nav";

/**
 * Normally this is next/link, with prefetching and client-side transitions.
 *
 * For the shareable static preview (STATIC_EXPORT=1) it renders a plain <a>
 * instead, because that build can be served from any sub-path and Next's
 * client router would navigate to site-root URLs that do not exist there.
 * Links rendered in the browser are resolved against the preview's real root.
 * On Vercel the real next/link is used.
 */
const STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === "1";

type Props = ComponentProps<typeof NextLink>;

export function AppLink({ href, children, prefetch, ...rest }: Props) {
  if (STATIC) {
    const raw = typeof href === "string" ? href : "#";
    void prefetch;
    return (
      <a href={resolveHref(raw)} {...rest} suppressHydrationWarning>
        {children}
      </a>
    );
  }
  return (
    <NextLink href={href} prefetch={prefetch} {...rest}>
      {children}
    </NextLink>
  );
}
