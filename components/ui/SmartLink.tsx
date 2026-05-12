'use client';

import { ComponentProps } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type LinkType = typeof Link;
type Props = ComponentProps<LinkType>;

/**
 * Drop-in replacement for `next/link` that triggers `router.prefetch(href)`
 * on touchstart (mobile) and mouseenter (desktop). The default Link only
 * prefetches when the link enters the viewport, and for dynamic routes it
 * doesn't prefetch the data — only the loading UI.
 *
 * Calling `router.prefetch()` explicitly causes Next.js to fetch the RSC
 * payload for the destination (rendered with the user's session), so by the
 * time the user lifts their finger the destination's data is already in the
 * router cache. Saves 100–400 ms of perceived latency on hot paths.
 *
 * Only string `href` values are prefetched — Link's UrlObject form isn't
 * supported by router.prefetch in App Router.
 */
export function SmartLink({
  onTouchStart,
  onMouseEnter,
  href,
  ...rest
}: Props) {
  const router = useRouter();
  const prefetch = () => {
    if (typeof href === 'string') {
      router.prefetch(href);
    }
  };
  return (
    <Link
      href={href}
      onTouchStart={(e) => {
        prefetch();
        onTouchStart?.(e);
      }}
      onMouseEnter={(e) => {
        prefetch();
        onMouseEnter?.(e);
      }}
      {...rest}
    />
  );
}
