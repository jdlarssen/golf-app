'use client';

import { ComponentProps } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type LinkType = typeof Link;
type Props = ComponentProps<LinkType>;

/**
 * Drop-in replacement for `next/link` that triggers `router.prefetch(href)`
 * on touchstart (mobile) and mouseenter (desktop), in addition to Link's own
 * viewport-entry prefetch.
 *
 * What a prefetch actually buys under `cacheComponents`: only the prerendered
 * shell (static parts + `loading.js` UI) is fetched into the router cache.
 * Session-dependent holes are NOT prefetched — they take a server roundtrip
 * at navigation and stream into the shell (see
 * node_modules/next/dist/docs/01-app/02-guides/prefetching.md). So SmartLink
 * makes the destination's shell paint immediately on tap, but it does not
 * pre-load the user's data — don't reach for it as an offline strategy.
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
