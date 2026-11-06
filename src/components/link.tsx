import NextLink from "next/link";
import type { ComponentProps } from "react";

/**
 * Normally this is next/link, with prefetching and client-side transitions.
 *
 * For the shareable static preview (STATIC_EXPORT=1) it renders a plain <a>
 * instead, because that build can be served from any sub-path and Next's
 * client router would navigate to site-root URLs that do not exist there.
 * On Vercel the real next/link is used.
 */
const STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === "1";

type Props = ComponentProps<typeof NextLink>;

export function AppLink({ href, children, ...rest }: Props) {
  if (STATIC) {
    return (
      <a href={typeof href === "string" ? href : "#"} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <NextLink href={href} {...rest}>
      {children}
    </NextLink>
  );
}
