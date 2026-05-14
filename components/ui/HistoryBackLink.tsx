'use client';

import { useRouter } from 'next/navigation';

/**
 * Back link that prefers browser history (so users return to the page
 * they actually came from) and falls back to a static href when there
 * is no same-origin referrer — e.g. when the page was opened directly
 * via a deep link or shared URL.
 *
 * Visual style mirrors `BackLink` exactly so the two are interchangeable
 * inside `TopBar`.
 */
export function HistoryBackLink({
  fallbackHref,
  ariaLabel,
}: {
  fallbackHref: string;
  ariaLabel: string;
}) {
  const router = useRouter();

  function onClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    const ref = typeof document !== 'undefined' ? document.referrer : '';
    let sameOrigin = false;
    if (ref) {
      try {
        sameOrigin = new URL(ref).origin === window.location.origin;
      } catch {
        sameOrigin = false;
      }
    }
    if (sameOrigin) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="-ml-2 inline-flex h-8 w-8 items-center justify-center text-lg text-text"
    >
      ‹
    </button>
  );
}
